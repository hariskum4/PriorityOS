import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DOMAINS, Domain, focusPlan, type FocusPlan, type ClosingWindow,
} from '@priority/life-os';
import { DOMAIN_TO_LIFE } from '@priority/types';
import { weeklyAllocation, lifeWindows } from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { LifeOsService } from './life-os.service';

/** A season nobody set an end for is the thing this feature exists to prevent. */
const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const DAY_MS = 86_400_000;

const toNumber = (v: unknown) => (v == null ? 0 : Number(v));

/**
 * Choosing a season, and being told what it costs before agreeing to it.
 *
 * The kernel does the reasoning (`focusPlan`); this owns persistence and the
 * two guards that keep the feature honest: a focus must be a real domain, and
 * it must have an end date. Everything else — what gets quietened, what is
 * exempt, what it trades away — is computed from the graph and the time
 * engine's closing windows, so the answer moves when the life does.
 */
@Injectable()
export class FocusService {
  constructor(
    private prisma: PrismaService,
    private lifeOs: LifeOsService,
  ) {}

  /** The current season with its full plan, or null when none is running. */
  async current(userId: string, now = new Date()): Promise<FocusPlan | null> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        focusDomain: true, focusUntil: true, focusStartedAt: true, focusReason: true,
        workHoursPerWeek: true, dob: true,
      },
    });
    if (!user.focusDomain || !user.focusUntil) return null;
    const domain = user.focusDomain as Domain;
    if (!DOMAINS.includes(domain)) return null;

    return this.planFor(userId, {
      domain,
      startedAt: user.focusStartedAt ?? user.focusUntil,
      until: user.focusUntil,
      reason: user.focusReason ?? undefined,
    }, now);
  }

  /**
   * What choosing this domain *would* cost, without choosing it.
   *
   * The whole point of the preview: the trade is stated in the person's own
   * hours before they agree, rather than discovered six weeks later when a
   * friendship has gone quiet.
   */
  async preview(userId: string, domain: Domain, days = DEFAULT_DAYS, now = new Date()) {
    this.assertDomain(domain);
    const until = new Date(now.getTime() + this.assertDays(days) * DAY_MS);
    return this.planFor(userId, { domain, startedAt: now, until }, now);
  }

  async choose(
    userId: string,
    input: { domain: Domain; days?: number; reason?: string },
    now = new Date(),
  ) {
    this.assertDomain(input.domain);
    const days = this.assertDays(input.days ?? DEFAULT_DAYS);
    const until = new Date(now.getTime() + days * DAY_MS);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        focusDomain: input.domain,
        focusUntil: until,
        focusStartedAt: now,
        focusReason: input.reason?.trim() || null,
      },
    });
    return this.planFor(userId, { domain: input.domain, startedAt: now, until, reason: input.reason }, now);
  }

  /** Ending one early is as legitimate as letting it run out. */
  async end(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { focusDomain: null, focusUntil: null, focusStartedAt: null, focusReason: null },
    });
    return { ended: true };
  }

  // -------------------------------------------------------------------------

  private assertDomain(domain: Domain) {
    if (!DOMAINS.includes(domain)) {
      throw new BadRequestException(`focus must be one of: ${DOMAINS.join(', ')}`);
    }
  }

  private assertDays(days: number): number {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 7 || n > MAX_DAYS) {
      throw new BadRequestException(`a season runs between 7 and ${MAX_DAYS} days`);
    }
    return Math.round(n);
  }

  /**
   * Assemble the plan from what the rest of the system already knows.
   *
   * The closing windows come from the engine context rather than being
   * recomputed here, so the floor a focus cannot postpone is the same list the
   * Time engine surfaces on its own. Two implementations of "who is not
   * waiting" would eventually disagree in front of the user.
   */
  private async planFor(
    userId: string,
    focus: { domain: Domain; startedAt: Date; until: Date; reason?: string },
    now: Date,
  ): Promise<FocusPlan> {
    const [ctx, user, domainRows] = await Promise.all([
      this.lifeOs.buildContext(userId, now),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId }, select: { dob: true, workHoursPerWeek: true, workType: true },
      }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
    ]);
    /* From the context already built, not a second assembly of the same life. */
    const graph = this.lifeOs.graphFromContext(ctx);

    const closingWindows =
      (ctx.data.time as { closingWindows?: ClosingWindow[] } | undefined)?.closingWindows ?? [];

    /* Hours as they stand today, so the trade reads in this person's own week
       rather than in percentages nobody can picture. Twelve app domains fold
       onto the kernel's eight, and the hours fold with them. */
    const age = user.dob
      ? Math.floor((now.getTime() - user.dob.getTime()) / (365.25 * DAY_MS))
      : null;
    const freeHours = age != null
      ? lifeWindows({ age, workHoursPerWeek: user.workHoursPerWeek ?? 45, workType: user.workType }).freeTime.freeHoursPerWeek
      : 0;
    const currentHours: Partial<Record<Domain, number>> = {};
    if (freeHours > 0) {
      const alloc = weeklyAllocation(
        freeHours,
        domainRows
          .filter((d) => toNumber(d.importanceScore) > 0)
          .map((d) => ({ domainType: d.domainType, importance: toNumber(d.importanceScore) })),
      );
      for (const a of alloc.allotments) {
        const kernel = (DOMAIN_TO_LIFE as Record<string, Domain>)[a.domainType];
        if (!kernel) continue;
        currentHours[kernel] = (currentHours[kernel] ?? 0) + a.hours;
      }
    }

    return focusPlan({
      focus: { domain: focus.domain, startedAt: focus.startedAt, until: focus.until, reason: focus.reason },
      now,
      domains: ctx.domains.map((d) => d.domain),
      currentHours,
      closingWindows,
      graph,
    });
  }
}

/**
 * The app's twelve domains this kernel domain covers — for the client's dimming.
 *
 * Derived from `DOMAIN_TO_LIFE` rather than from `LIFE_TO_DOMAIN`, which is
 * one-to-one and would name a single representative: dimming "relationships"
 * has to reach family, partner, children *and* friends, not just whichever one
 * the reverse map happens to pick.
 */
export function appDomainsFor(domain: Domain): string[] {
  return Object.entries(DOMAIN_TO_LIFE as Record<string, Domain>)
    .filter(([, kernel]) => kernel === domain)
    .map(([appDomain]) => appDomain);
}
