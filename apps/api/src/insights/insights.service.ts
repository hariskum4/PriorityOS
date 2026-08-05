import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  estimateVisitsRemaining,
  estimateCallDelta,
  estimateTimeReality,
  estimateChildhoodWindows,
  cadenceToPerYear,
  Cadence,
  HealthStatus,
  LocationType,
} from '@priority/scoring-engine';

@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const prefs = await this.prisma.userPreferences.findUnique({ where: { userId } });
    // PRD §10.5: users can turn opportunity/mortality-adjacent framing off entirely.
    if (prefs?.insightIntensity === 'off') return [];
    return this.prisma.opportunityInsight.findMany({
      where: { userId, dismissed: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async dismiss(userId: string, id: string) {
    await this.prisma.opportunityInsight.updateMany({
      where: { id, userId },
      data: { dismissed: true },
    });
    return { dismissed: true };
  }

  /**
   * Regenerate opportunity insights from relationship pace data.
   * Deliberately sparse: max one insight per relationship — research on
   * mortality-salience apps shows daily repetition desensitizes users fast.
   */
  /**
   * An insight is worth skipping, never worth crashing for.
   *
   * `estimate` is a Float column, and a NaN reaching it makes Prisma throw —
   * which took down the whole of `/onboarding/complete`, so a single unusable
   * number left a new account permanently stuck before the Life Reveal. The
   * arithmetic is guarded at its source now; this is the second lock, because
   * the cost of a missing insight is one missing card and the cost of a throw
   * here is somebody who cannot finish signing up.
   */
  private usable(est: { estimate: number; headline: string }): boolean {
    return Number.isFinite(est.estimate) && !/NaN|Infinity|undefined/.test(est.headline);
  }

  async regenerateForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const rels = await this.prisma.relationship.findMany({ where: { userId } });
    for (const rel of rels) {
      /**
       * One missing field used to cost a person every insight they had.
       *
       * `if (!rel.inPersonFrequency) continue` sat at the top of this loop and
       * skipped the whole body — but only the visits estimate needs a visit
       * cadence. Childhood windows need an age, and the call-cadence uplift
       * needs the two call cadences. The field is optional on the DTO, so
       * anybody added through the People tab rather than onboarding arrived
       * with no insights at all: a seven-year-old daughter with no countdown,
       * a friend you call monthly and meant to call weekly with nothing said
       * about it. Each estimate now guards only on what it actually reads.
       */
      const visitsPerYear = rel.inPersonFrequency
        ? cadenceToPerYear(rel.inPersonFrequency as Cadence)
        : null;
      // Visits insight is for people the user wants more time with and sees infrequently.
      if (visitsPerYear != null && rel.wantsMoreTime && visitsPerYear <= 12) {
        // Full Time Reality engine when we know the person's age; otherwise
        // the simple pace estimator (10-year planning horizon).
        const est = rel.age
          ? (() => {
              const tr = estimateTimeReality({
                personAge: rel.age,
                personLabel: rel.name,
                personHealthStatus: (rel.healthStatus as HealthStatus) ?? undefined,
                personLocationType: (rel.locationType as LocationType) ?? undefined,
                /* A visit needs both people. Without this an 87-year-old was
                   told "~14 meaningful visits ahead" with his 58-year-old
                   son — the son's window, assuming the father reaches 101. */
                userAge: user?.dob
                  ? Math.floor((Date.now() - user.dob.getTime()) / (365.25 * 86_400_000))
                  : undefined,
                userWorkHoursPerWeek: user?.workHoursPerWeek ?? undefined,
                currentVisitsPerYear: visitsPerYear,
                region: user?.country ?? (user?.timezone?.startsWith('Asia/') ? 'IN' : undefined),
              });
              return {
                kind: 'visits_remaining' as const,
                headline: `${tr.display} meaningful visits ahead with ${rel.name}.`,
                detail: tr.framingText,
                assumptions: tr.assumptions,
                estimate: tr.currentTrajectory,
                unit: 'visits',
                /**
                 * The span this number actually covers, and what one change
                 * makes of it — both of which the engine knew and this row
                 * used to drop.
                 *
                 * The horizon here is the quality-year window, not the ten
                 * years the simpler estimator below uses. A reader that
                 * assumes ten will describe the number wrongly and, if it
                 * recomputes an uplift on that assumption, will contradict it.
                 *
                 * `visitsAddedPerYear` is zero when location and working hours
                 * already cap the pace, and then there is no uplift to offer:
                 * a promise of more visits to someone who cannot make more is
                 * not encouragement, it is a reproach.
                 */
                horizonYears: tr.qualityYears,
                uplift: tr.visitsAddedPerYear > 0
                  ? {
                      change: `Adding just ${tr.visitsAddedPerYear} visit${tr.visitsAddedPerYear === 1 ? '' : 's'} a year`,
                      newEstimate: tr.improvedTrajectory,
                    }
                  : undefined,
              };
            })()
          : estimateVisitsRemaining({
              visitsPerYear,
              horizonYears: 10,
              personLabel: rel.name,
            });
        if (this.usable(est)) {
          await this.prisma.opportunityInsight.create({
            data: {
              userId,
              relationshipId: rel.id,
              domainType: relDomain(rel.relationType),
              kind: est.kind,
              headline: est.headline,
              detail: est.detail,
              assumptions: est.assumptions,
              estimate: est.estimate,
              unit: est.unit,
              horizonYears: est.horizonYears,
              // Only when it survived the same finiteness bar as the estimate.
              // An uplift is offered as a reason to act, and a NaN dressed up
              // as encouragement is worse than no encouragement.
              ...(est.uplift && Number.isFinite(est.uplift.newEstimate)
                ? {
                    upliftEstimate: est.uplift.newEstimate,
                    upliftLabel: est.uplift.change,
                  }
                : {}),
            },
          });
        }
      }
      // Childhood windows: ordinary units (weekends, dinners) for kids under
      // 18 — deliberately NOT the "18 summers" meme, which guilt-trips
      // working parents (documented backlash); corrective framing built in.
      if (
        ['child', 'son', 'daughter'].includes(rel.relationType) &&
        rel.age != null &&
        rel.age < 18
      ) {
        const cw = estimateChildhoodWindows({ childAge: rel.age });
        await this.prisma.opportunityInsight.create({
          data: {
            userId,
            relationshipId: rel.id,
            domainType: 'children',
            kind: 'childhood_windows',
            headline: `~${cw.weekendsAhead} free weekends with ${rel.name} before they turn 18.`,
            detail: cw.framingText,
            assumptions: cw.assumptions,
            estimate: cw.weekendsAhead,
            unit: 'weekends',
          },
        });
      }

      // Uplift insight: what one cadence change adds.
      if (
        rel.callFrequency &&
        rel.desiredCallFrequency &&
        rel.callFrequency !== rel.desiredCallFrequency
      ) {
        const delta = estimateCallDelta({
          currentCadence: rel.callFrequency as Cadence,
          proposedCadence: rel.desiredCallFrequency as Cadence,
          personLabel: rel.name,
        });
        if (delta.estimate > 0) {
          await this.prisma.opportunityInsight.create({
            data: {
              userId,
              relationshipId: rel.id,
              domainType: relDomain(rel.relationType),
              kind: delta.kind,
              headline: delta.headline,
              detail: delta.detail,
              assumptions: delta.assumptions,
              estimate: delta.estimate,
              unit: delta.unit,
            },
          });
        }
      }
    }
  }
}

function relDomain(relationType: string): string {
  if (['mother', 'father', 'parent', 'sibling'].includes(relationType)) return 'family';
  if (['spouse', 'partner'].includes(relationType)) return 'partner';
  if (['son', 'daughter', 'child'].includes(relationType)) return 'children';
  return 'friends';
}
