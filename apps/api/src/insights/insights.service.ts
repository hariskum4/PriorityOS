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
  async regenerateForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const rels = await this.prisma.relationship.findMany({ where: { userId } });
    for (const rel of rels) {
      if (!rel.inPersonFrequency) continue;
      const visitsPerYear = cadenceToPerYear(rel.inPersonFrequency as Cadence);
      // Visits insight is for people the user wants more time with and sees infrequently.
      if (rel.wantsMoreTime && visitsPerYear <= 12) {
        // Full Time Reality engine when we know the person's age; otherwise
        // the simple pace estimator (10-year planning horizon).
        const est = rel.age
          ? (() => {
              const tr = estimateTimeReality({
                personAge: rel.age,
                personLabel: rel.name,
                personHealthStatus: (rel.healthStatus as HealthStatus) ?? undefined,
                personLocationType: (rel.locationType as LocationType) ?? undefined,
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
              };
            })()
          : estimateVisitsRemaining({
              visitsPerYear,
              horizonYears: 10,
              personLabel: rel.name,
            });
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
          },
        });
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
