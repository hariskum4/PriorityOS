/**
 * The Life OS host.
 *
 * `@priority/life-os` is deliberately pure — no database, no clock, no model.
 * This service is the impure half: it gathers a person's whole life into one
 * `EngineContext`, hands it to the kernel, and persists the small amount of
 * state the kernel cannot hold for itself.
 *
 * The division matters. Everything that decides *what to say* is in the kernel
 * and unit-testable; everything here is plumbing. If a rule about what a person
 * should see ever appears in this file, it is in the wrong place.
 *
 * Reads happen in one parallel batch, once per cycle. Writes happen only after
 * the user acts, which is why running a cycle is safe to do speculatively.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Domain, DOMAINS, EngineContext, EngineRegistry, CycleResult,
  runCycleWith, cycleUsedProfound,
  decisionEngine, regretEngine, goalEngine, predictionEngine, knowledgeEngine,
  relationshipEngine, habitEngine, timeEngine,
  domainGraph, personalGraph, LifeGraph, evaluateDecision, classifyCapture,
  overdueRatio as relationshipOverdue, focusPlan, focusScore,
  type RelationshipRecord, type HabitRecord, type ClosingWindow, type FocusPlan,
} from '@priority/life-os';
import {
  DomainType, LifeDomain, DOMAIN_TO_LIFE, LIFE_TO_DOMAIN, domainForRelationType,
} from '@priority/types';
import {
  estimateTimeReality, lifeWindows, weeklyAllocation, countryFromTimezone, cadenceDays,
  type HealthStatus, type LocationType,
} from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { weekOf } from '../common/time';

/** Re-exported: this module owned it before it found its proper home. */
export { weekOf };

/**
 * Twelve app domains → the kernel's eight. Imported rather than declared: the
 * mobile client filters proposals with the same map, and a private copy here is
 * exactly how a filter silently stops matching.
 */
const DOMAIN_MAP = DOMAIN_TO_LIFE as Record<string, Domain>;

/** How many delivered observation ids to remember. Bounded on purpose. */
const SEEN_WINDOW = 400;
/** Trailing window for a rhythm's rate. Matches HabitsService exactly. */
const RATE_WINDOW_DAYS = 28;
/** Weeks of history handed to the trend engines. */
const HISTORY_WEEKS = 16;

const DAY_MS = 86_400_000;

function toNumber(v: unknown): number {
  if (v == null) return 0;
  // Prisma Decimal → number without pulling in the Decimal type here.
  return typeof v === 'number' ? v : Number(v.toString());
}


/**
 * Force stored decision options into the shape the engine requires.
 *
 * `options` is a Json column and `createDecision` stored whatever it was
 * handed, so an option written without a `scores` object made the engine throw
 * on `option.scores[factor]`. Inside a cycle that was swallowed into
 * `result.failures` — the decision engine silently stopped working, every day,
 * with nothing shown to the person; opening the decision directly returned a
 * 500. Found by the first integration test that seeded a decision the way the
 * API actually accepts one.
 *
 * An empty `scores` is deliberately fine: the engine treats an absent factor as
 * no signal rather than as zero, so an option nobody has rated yet is scored on
 * whatever else is known instead of being dragged to the bottom.
 */
export function normalizeDecisionOptions(raw: unknown): Array<{
  id: string;
  label: string;
  scores: Record<string, number>;
  isStatusQuo?: boolean;
  reversible?: boolean;
}> {
  if (!Array.isArray(raw)) return [];

  const rows = raw.filter(
    (o): o is Record<string, unknown> => !!o && typeof o === 'object',
  );

  // Ids the person's own data already claims. A generated fallback must not
  // collide with one of these: two options sharing an id makes `chosenOptionId`
  // ambiguous, and the record of what they actually chose is the whole point.
  const taken = new Set(
    rows.map((o) => o.id).filter((id): id is string => typeof id === 'string' && !!id),
  );

  return rows.map((o, i) => {
    const scores: Record<string, number> = {};
    const given = o.scores;
    if (given && typeof given === 'object') {
      for (const [factor, value] of Object.entries(given as Record<string, unknown>)) {
        // Only a real number counts. `Number(null)`, `Number('')`,
        // `Number(false)` and `Number([])` are all 0, and 0 on a cost factor
        // inverts to 100 — the most favourable value there is — so blanket
        // coercion would let an unanswered question decide the fork. An
        // unrated factor must stay absent. A numeric string is still a
        // rating someone gave, so that one is read.
        const n =
          typeof value === 'number' ? value
            : typeof value === 'string' && value.trim() !== '' ? Number(value)
              : NaN;
        if (Number.isFinite(n)) scores[factor] = n;
      }
    }

    let id = typeof o.id === 'string' && o.id ? o.id : '';
    if (!id) {
      let n = i + 1;
      while (taken.has(`option-${n}`)) n++;
      id = `option-${n}`;
      taken.add(id);
    }

    return {
      id,
      label: String(o.label ?? o.title ?? `Option ${i + 1}`),
      scores,
      ...(typeof o.isStatusQuo === 'boolean' ? { isStatusQuo: o.isStatusQuo } : {}),
      ...(typeof o.reversible === 'boolean' ? { reversible: o.reversible } : {}),
    };
  });
}

@Injectable()
export class LifeOsService {
  private readonly log = new Logger(LifeOsService.name);

  /**
   * Engines are registered once, here. This list *is* the deployment's engine
   * set — enabling the next engine is one line, which was the point of the
   * contract.
   */
  private readonly registry = new EngineRegistry()
    .register(regretEngine)
    /* The moat, and for most of this product's life an empty slot: the
       relationship graph is the one thing no competitor holds and no engine
       was reading it. A job seeker with a friend two streets away was told to
       mentor a stranger. */
    .register(relationshipEngine)
    .register(timeEngine)
    .register(goalEngine)
    .register(habitEngine)
    .register(predictionEngine)
    .register(knowledgeEngine)
    .register(decisionEngine);

  constructor(private prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Context assembly
  // -------------------------------------------------------------------------

  /**
   * Gather everything the engines may see.
   *
   * One parallel batch: the expensive work happens once, deterministically,
   * before any engine runs. `now` is a parameter so a cycle can be replayed for
   * any moment — the same property the kernel's tests rely on.
   */
  async buildContext(userId: string, now = new Date()): Promise<EngineContext> {
    const historyFrom = new Date(now.getTime() - HISTORY_WEEKS * 7 * DAY_MS);

    const [
      user, prefs, domainRows, samples, goals, relationships,
      journal, knowledge, decisions, habits, answers, state,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.userPreferences.findUnique({ where: { userId } }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.domainAttentionSample.findMany({
        where: { userId, weekOf: { gte: historyFrom } },
        orderBy: { weekOf: 'asc' },
      }),
      this.prisma.goal.findMany({
        where: { userId, status: 'active' },
        // Every mission, not just the completed ones — the total is the
        // denominator. Fetching only completions makes each goal look finished.
        include: { missions: { select: { status: true, completedAt: true } } },
      }),
      this.prisma.relationship.findMany({
        where: { userId },
        include: { contactLogs: { orderBy: { occurredAt: 'asc' }, select: { occurredAt: true } } },
      }),
      this.prisma.journalEntry.findMany({
        where: { userId, whatIAvoided: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      this.prisma.knowledgeItem.findMany({ where: { userId } }),
      this.prisma.decision.findMany({ where: { userId, status: 'open' } }),
      /* Rhythms, with the trailing window the habit engine measures against.
         The scoring engine has always known a habit's rate; the life model
         never did, so it could see health starving and not notice that the
         walk meant to feed it stopped three weeks ago. */
      this.prisma.habit.findMany({
        where: { userId, isActive: true },
        include: {
          logs: {
            where: { completedAt: { gte: new Date(now.getTime() - RATE_WINDOW_DAYS * DAY_MS) } },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          },
        },
      }),
      this.prisma.onboardingAnswer.findMany({
        where: { userId, key: 'priorityRanking' },
      }),
      this.prisma.lifeOsState.findUnique({ where: { userId } }),
    ]);

    // ---- domain state, collapsed onto the kernel's eight -----------------
    const collapsed = new Map<Domain, { importance: number[]; attention: number[]; risk: number[] }>();
    for (const row of domainRows) {
      const domain = DOMAIN_MAP[row.domainType];
      if (!domain) continue;
      const bucket = collapsed.get(domain) ?? { importance: [], attention: [], risk: [] };
      bucket.importance.push(toNumber(row.importanceScore));
      bucket.attention.push(toNumber(row.attentionScore));
      bucket.risk.push(toNumber(row.neglectRiskScore));
      collapsed.set(domain, bucket);
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const domains = [...collapsed.entries()].map(([domain, b]) => ({
      domain,
      importance: Math.round(avg(b.importance)),
      attention: Math.round(avg(b.attention)),
      neglectRisk: Math.round(avg(b.risk)),
    }));

    // ---- weekly history, also collapsed ---------------------------------
    const perDomainWeeks = new Map<Domain, Map<number, number[]>>();
    const energyWeeks = new Map<number, number[]>();
    for (const s of samples) {
      const domain = DOMAIN_MAP[s.domainType];
      if (!domain) continue;
      const week = s.weekOf.getTime();
      const weeks = perDomainWeeks.get(domain) ?? new Map<number, number[]>();
      weeks.set(week, [...(weeks.get(week) ?? []), toNumber(s.attention)]);
      perDomainWeeks.set(domain, weeks);
      if (s.energy != null) {
        energyWeeks.set(week, [...(energyWeeks.get(week) ?? []), toNumber(s.energy)]);
      }
    }
    const attentionHistory = [...perDomainWeeks.entries()].map(([domain, weeks]) => ({
      domain,
      weekly: [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, vs]) => avg(vs)),
    }));
    const energyWeekly = [...energyWeeks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, vs]) => avg(vs));

    // ---- value ranking, collapsed and de-duplicated ---------------------
    const rawRanking = (answers[0]?.value as string[] | undefined) ?? [];
    const valueRanking = rawRanking
      .map((d) => DOMAIN_MAP[d])
      .filter((d): d is Domain => !!d)
      .filter((d, i, arr) => arr.indexOf(d) === i);

    // ---- relationships --------------------------------------------------
    const contacts = relationships.map((r) => {
      const last = r.contactLogs.length
        ? r.contactLogs[r.contactLogs.length - 1].occurredAt
        : r.lastContactAt;
      return {
        id: r.id,
        name: r.name,
        relationType: r.relationType,
        daysSinceContact: last ? Math.floor((now.getTime() - last.getTime()) / DAY_MS) : null,
        desiredGapDays: cadenceDays(r.desiredCallFrequency),
      };
    });

    /** Gaps between successive contacts — the raw material for drift. */
    const contactGaps = relationships
      .map((r) => {
        const times = r.contactLogs.map((c) => c.occurredAt.getTime());
        const gapsDays: number[] = [];
        for (let i = 1; i < times.length; i++) {
          gapsDays.push((times[i] - times[i - 1]) / DAY_MS);
        }
        return {
          id: r.id,
          name: r.name,
          gapsDays,
          desiredGapDays: cadenceDays(r.desiredCallFrequency),
        };
      })
      .filter((g) => g.gapsDays.length > 0);

    // ---- things left unsaid, from the journal's own "what did I avoid?" --
    const unsaid = journal
      .filter((j) => (j.whatIAvoided ?? '').trim().length > 0)
      .map((j) => ({
        id: j.id,
        note: (j.whatIAvoided ?? '').trim(),
        ageDays: Math.floor((now.getTime() - j.createdAt.getTime()) / DAY_MS),
      }));

    // ---- the people, as the relationship engine reads them ---------------
    const age = user.dob
      ? Math.floor((now.getTime() - user.dob.getTime()) / (365.25 * DAY_MS))
      : null;

    const relationshipRecords: RelationshipRecord[] = relationships.map((r) => {
      const last = r.contactLogs.length
        ? r.contactLogs[r.contactLogs.length - 1].occurredAt
        : r.lastContactAt;
      /* Quality years, from the same engine the Time tab quotes, so the two
         surfaces can never name different numbers for the same person. */
      const window = r.age != null
        ? estimateTimeReality({
          personAge: r.age,
          personLabel: r.name,
          personHealthStatus: (r.healthStatus as HealthStatus) ?? undefined,
          personLocationType: (r.locationType as LocationType) ?? undefined,
          // Shared time has two ends; the shorter window is the real one.
          userAge: age ?? undefined,
          userWorkHoursPerWeek: user.workHoursPerWeek ?? undefined,
          currentVisitsPerYear: 1,
          /* Accounts older than the registration stamp have no country row;
             their device timezone still names one where it can. */
          region: user.country ?? countryFromTimezone(user.timezone) ?? undefined,
        }).qualityYears
        : null;
      return {
        id: r.id,
        name: r.name,
        relationType: r.relationType,
        domain: DOMAIN_MAP[domainForRelationType(r.relationType)] ?? 'relationships',
        closeness: Number(r.closenessScore ?? 5),
        desiredCadence: r.desiredCallFrequency,
        lastContactAt: last ?? null,
        wantsMoreTime: r.wantsMoreTime,
        windowYears: window,
        healthConcern: r.healthStatus != null && r.healthStatus !== 'good',
        momentsRecent: r.contactLogs.length,
        /* Already selected for the time window above; the engine needs it
           for a different reason — an outing cannot be proposed to somebody
           who would need a flight to attend it. */
        locationType: r.locationType,
      };
    });

    // ---- rhythms ---------------------------------------------------------
    const habitRecords: HabitRecord[] = habits.map((h) => {
      const last = h.logs[0]?.completedAt ?? null;
      return {
        id: h.id,
        title: h.title,
        domain: DOMAIN_MAP[h.domainType] ?? 'health',
        targetPerWeek: h.targetPerWeek,
        perWeek: Math.round((h.logs.length / (RATE_WINDOW_DAYS / 7)) * 10) / 10,
        windowDays: RATE_WINDOW_DAYS,
        daysSinceKept: last ? Math.floor((now.getTime() - last.getTime()) / DAY_MS) : null,
        createdAt: h.createdAt,
      };
    });

    // ---- the week's budget, and what closes on its own schedule ----------
    const freeHours = age != null
      ? lifeWindows({ age, workHoursPerWeek: user.workHoursPerWeek ?? 45, workType: user.workType, country: user.country }).freeTime.freeHoursPerWeek
      : 0;
    /* What the person's own ranking would need if every domain got its share.
       Compared against the hours that exist, never against an ideal. */
    const claimedHours = freeHours > 0
      ? weeklyAllocation(
        freeHours,
        domainRows
          .filter((d) => toNumber(d.importanceScore) > 0)
          .map((d) => ({ domainType: d.domainType, importance: toNumber(d.importanceScore) })),
      ).allotments.reduce((sum, a) => sum + a.hours, 0)
      : 0;

    /**
     * The windows a season of focus is not allowed to postpone.
     *
     * Only people the app can actually say something about: an age it was
     * given, and a window short enough to matter. Silence where it does not
     * know, rather than a guess dressed as a warning.
     */
    const closingWindows: ClosingWindow[] = relationshipRecords
      .filter((r) => r.windowYears != null)
      .map((r) => ({
        subjectId: `person:${r.id}`,
        label: r.name,
        domain: r.domain,
        qualityYears: r.windowYears!,
        because: r.healthConcern
          ? `You told us their health has been a worry.`
          : `Their age, and the pace you currently see them at.`,
      }));

    // ---- goals ----------------------------------------------------------
    // Completed missions attached to a goal are its progress events; that is
    // already how the app records "something moved".
    const goalRecords = goals.map((g) => {
      const completed = g.missions.filter((m) => m.status === 'completed');
      return {
        id: g.id,
        title: g.title,
        domain: DOMAIN_MAP[g.domainType] ?? 'growth',
        purpose: g.description ?? undefined,
        // A goal with no missions yet is one step from nothing, not zero of zero.
        milestonesTotal: Math.max(1, g.missions.length),
        milestonesDone: completed.length,
        progressAt: completed
          .map((m) => m.completedAt)
          .filter((d): d is Date => d != null)
          .sort((a, b) => a.getTime() - b.getTime()),
        targetDate: g.targetDate,
        createdAt: g.createdAt,
        status: 'active' as const,
      };
    });

    // ---- knowledge ------------------------------------------------------
    const items = knowledge.map((k) => ({
      id: k.id,
      kind: k.kind as 'book' | 'article' | 'podcast' | 'video' | 'note' | 'course',
      title: k.title,
      topics: (k.topics as string[]) ?? [],
      status: k.status as 'queued' | 'active' | 'finished' | 'released',
      domain: k.domainType ? DOMAIN_MAP[k.domainType] : undefined,
      progress: k.progress != null ? toNumber(k.progress) : undefined,
      lastTouchedAt: k.lastTouchedAt,
      takeaway: k.takeaway ?? undefined,
    }));

    // Knowledge only speaks for things that need help: stalled goals and open
    // decisions. A relevant book aimed at someone doing fine is just noise.
    const targets = [
      ...goalRecords.map((g) => ({
        id: g.id,
        kind: 'goal' as const,
        label: g.title,
        topics: g.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
        domain: g.domain,
        needsHelp: g.progressAt.length === 0
          || (now.getTime() - g.progressAt[g.progressAt.length - 1].getTime()) / DAY_MS > 21,
      })),
      ...decisions.map((d) => ({
        id: d.id,
        kind: 'decision' as const,
        label: d.question,
        topics: d.question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
        needsHelp: true,
      })),
    ];

    return {
      userId,
      now,
      age: user.dob
        ? Math.floor((now.getTime() - user.dob.getTime()) / (365.25 * DAY_MS))
        : null,
      domains,
      personalization: {
        insightIntensity: (prefs?.insightIntensity as 'off' | 'gentle' | 'direct') ?? 'gentle',
        motivationStyle: (user.motivationStyle as 'balanced' | 'gentle' | 'push') ?? 'balanced',
        // Retreat, enforced: anything declined forever never comes back, and is
        // never followed by a survey asking why.
        declinedTopics: (state?.declinedTopics as string[]) ?? [],
      },
      priorObservations: [],
      data: {
        regret: { attentionHistory, contacts, unsaid, valueRanking },
        relationship: { relationships: relationshipRecords },
        habit: { habits: habitRecords },
        time: {
          freeHoursPerWeek: freeHours,
          claimedHoursPerWeek: claimedHours,
          closingWindows,
        },
        goal: { goals: goalRecords },
        prediction: { attentionHistory, energyWeekly, contactGaps },
        knowledge: { items, targets },
        decision: {
          open: decisions.map((d) => ({
            id: d.id,
            question: d.question,
            horizonYears: d.horizonYears,
            valueRanking,
            options: normalizeDecisionOptions(d.options),
          })),
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Running a cycle
  // -------------------------------------------------------------------------

  /**
   * Run today's cycle.
   *
   * `persist: false` makes this a dry run — same output, no ration clock
   * advanced and nothing marked seen. Useful for previews and for debugging a
   * person's day without consuming their one profound truth for the week.
   */
  async runToday(userId: string, opts: { persist?: boolean; now?: Date } = {}) {
    const now = opts.now ?? new Date();
    const persist = opts.persist ?? true;

    const [context, state, claimed] = await Promise.all([
      this.buildContext(userId, now),
      this.prisma.lifeOsState.findUnique({ where: { userId } }),
      /**
       * Who today already has a mission about.
       *
       * The kernel's one-nudge-per-person rule could only see its own cycle,
       * and missions come from surfaces it never runs — the end of onboarding
       * most of all. A new account that picked "Reach out to Vikram this week
       * — one message is enough" met the kernel's "Call Vikram — not a text"
       * directly beneath it: one screen, one person, two instructions, the
       * second contradicting the first. Anything already on the plate now
       * counts as addressed.
       */
      this.prisma.mission.findMany({
        where: { userId, status: 'pending' },
        select: { relationshipId: true, goalId: true, title: true },
      }),
    ]);

    const result = runCycleWith(this.registry, {
      context,
      lastProfoundAt: state?.lastProfoundAt ?? null,
      seenObservationIds: (state?.seenObservationIds as string[]) ?? [],
      // `person:<id>` is how the relationship engine tags a subject; goals tag
      // themselves by bare id. The orchestrator normalises both to the bare id
      // now, so either spelling collides there and this stays a lookup rather
      // than a second convention.
      addressedSubjects: claimed.flatMap((m) => [
        ...(m.relationshipId ? [`person:${m.relationshipId}`] : []),
        ...(m.goalId ? [m.goalId] : []),
      ]),
      /* And the standing wording, for the errands that have no person or goal
         on them at all — a pending "Book the checkup you have moved three
         times" is invisible to the subject rule above. */
      addressedActions: claimed.map((m) => m.title),
    });

    /**
     * The declared season, applied.
     *
     * Reordering rather than filtering, and after the orchestrator rather than
     * inside it: a season changes which of today's true things is said first,
     * and is not allowed to change what is true or to suppress anything. A
     * quietened domain holding something genuinely urgent still surfaces —
     * `focusScore` narrows the odds, it does not close the door.
     */
    const plan = await this.focusPlanFor(userId, context, now);
    if (plan && !plan.expired) {
      const rank = (domain: Domain | null, i: number) =>
        -focusScore(1000 - i, domain, plan);
      result.proposals = [...result.proposals]
        .map((p, i) => ({ p, k: rank(p.domain, i) }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.p);
      result.observations = [...result.observations]
        .map((o, i) => ({ o, k: rank(o.domain, i) }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.o);
    }

    // A broken engine must never take down someone's morning, but it must not
    // pass unnoticed either.
    for (const failure of result.failures) {
      this.log.error(`engine ${failure.engine} failed for ${userId}: ${failure.error}`);
    }

    if (persist) await this.persist(userId, result, state?.seenObservationIds as string[] | undefined);
    return result;
  }

  /**
   * Advance the ration clock and remember what was delivered.
   *
   * Only ids that actually reached the person are marked seen — suppressed
   * findings must be free to return tomorrow, or a busy day would silently
   * bury a truth forever.
   */
  /**
   * Record what the reader was actually shown.
   *
   * Split out of the GET, which used to do this as a side effect of being
   * read. A GET is defined as safe, and everything downstream of that
   * definition assumes it: a retried timeout, a proxy revalidating, an uptime
   * probe on a real route, a client refetching on focus, or somebody running
   * `curl` to see what the endpoint says. Any one of them silently spent a
   * person's day — I did it myself with a test script, twice, and spent
   * several hours believing the cold start was broken.
   *
   * The write itself was never the problem. `seenObservationIds` is what
   * stops the same proposal arriving every morning, and losing it would be a
   * worse product than the bug. So it moved rather than went: the screen asks
   * for the day, and tells the server what it put in front of somebody.
   *
   * `usedProfound` is the client's word for whether one of the rationed
   * findings was among them, which it can see — the engine is `regret` or
   * `time`. Trusting it is deliberate and the blast radius is one account's
   * own setting: a caller who lies either burns their own weekly truth early
   * or hears one more than they were due. That is not a boundary worth an
   * extra cycle run to defend.
   */
  async markTodaySeen(userId: string, observationIds: string[], usedProfound: boolean) {
    const state = await this.prisma.lifeOsState.findUnique({ where: { userId } });
    const previous = (state?.seenObservationIds as string[] | undefined) ?? [];
    const seen = [...new Set([...previous, ...observationIds])].slice(-SEEN_WINDOW);
    const at = new Date();

    await this.prisma.lifeOsState.upsert({
      where: { userId },
      create: {
        userId,
        seenObservationIds: seen,
        lastCycleAt: at,
        lastProfoundAt: usedProfound ? at : null,
      },
      update: {
        seenObservationIds: seen,
        lastCycleAt: at,
        ...(usedProfound ? { lastProfoundAt: at } : {}),
      },
    });
    return { seen: observationIds.length, at: at.toISOString() };
  }

  private async persist(userId: string, result: CycleResult, previousSeen?: string[]) {
    const delivered = result.proposals.flatMap((p) => p.addresses);
    const seen = [...new Set([...(previousSeen ?? []), ...delivered])].slice(-SEEN_WINDOW);

    await this.prisma.lifeOsState.upsert({
      where: { userId },
      create: {
        userId,
        seenObservationIds: seen,
        lastCycleAt: result.ranAt,
        lastProfoundAt: cycleUsedProfound(result) ? result.ranAt : null,
      },
      update: {
        seenObservationIds: seen,
        lastCycleAt: result.ranAt,
        // Only touch the clock when a profound truth was actually spent.
        ...(cycleUsedProfound(result) ? { lastProfoundAt: result.ranAt } : {}),
      },
    });
  }

  // -------------------------------------------------------------------------
  // The graph
  // -------------------------------------------------------------------------

  /**
   * This person's graph — the people and rhythms in it, not only the domains.
   *
   * It used to return `domainGraph`: eight abstractions with the same fifteen
   * edges for every user, which could say "career is reaching relationships"
   * but never "the reason it reaches you is Amma, who is 66 and four months
   * unheard-from". The second sentence is the product.
   */
  async graphFor(userId: string): Promise<LifeGraph> {
    return this.graphFromContext(await this.buildContext(userId));
  }

  /**
   * The same graph, from a context already assembled.
   *
   * Split out because the cycle needs both and `buildContext` is the expensive
   * call — running it twice to draw one graph was a real cost on the hot path.
   */
  graphFromContext(ctx: EngineContext): LifeGraph {
    const present = new Set(ctx.domains.map((d) => d.domain));
    const states = DOMAINS
      .filter((d) => present.has(d))
      .map((domain) => ({
        domain,
        // Standing is "how well fed", i.e. attention against what was declared.
        state: (() => {
          const s = ctx.domains.find((x) => x.domain === domain)!;
          return s.importance > 0
            ? Math.round(Math.min(100, (s.attention / s.importance) * 100))
            : s.attention;
        })(),
      }));

    const rels = (ctx.data.relationship as { relationships: RelationshipRecord[] } | undefined)
      ?.relationships ?? [];
    const habitData = (ctx.data.habit as { habits: HabitRecord[] } | undefined)?.habits ?? [];
    const goalData = (ctx.data.goal as { goals: Array<{ id: string; title: string; domain: Domain }> } | undefined)
      ?.goals ?? [];

    return personalGraph({
      domains: states,
      people: rels.map((r) => ({
        id: r.id,
        name: r.name,
        domain: r.domain,
        closeness: r.closeness,
        overdueRatio: relationshipOverdue(r, ctx.now),
        windowYears: r.windowYears,
      })),
      habits: habitData.map((h) => ({
        id: h.id,
        title: h.title,
        domain: h.domain,
        keptRate: h.targetPerWeek > 0
          ? Math.round(Math.min(h.perWeek / h.targetPerWeek, 1.5) * 100)
          : 100,
      })),
      goals: goalData.map((g) => ({
        id: g.id, title: g.title, domain: g.domain, momentum: 50,
      })),
    });
  }

  /**
   * The season this person declared, as a plan — or null when none is running.
   *
   * Lives here rather than only in FocusService so the cycle can reorder
   * without a second full context build, and so both callers get the same
   * floor: what a focus may not postpone is read off the Time engine's own
   * closing windows, never recomputed alongside it.
   */
  async focusPlanFor(
    userId: string,
    ctx: EngineContext,
    now: Date,
  ): Promise<FocusPlan | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { focusDomain: true, focusUntil: true, focusStartedAt: true, focusReason: true },
    });
    if (!user?.focusDomain || !user.focusUntil) return null;
    const domain = user.focusDomain as Domain;
    if (!DOMAINS.includes(domain)) return null;

    const closingWindows =
      (ctx.data.time as { closingWindows?: ClosingWindow[] } | undefined)?.closingWindows ?? [];

    return focusPlan({
      focus: {
        domain,
        startedAt: user.focusStartedAt ?? now,
        until: user.focusUntil,
        reason: user.focusReason ?? undefined,
      },
      now,
      domains: ctx.domains.map((d) => d.domain),
      closingWindows,
      graph: this.graphFromContext(ctx),
    });
  }

  /**
   * Why one part of a life is reaching another, in the person's terms.
   * The sentences come off the graph's edges — never generated.
   */
  async explainInfluence(userId: string, from: Domain, to: Domain) {
    const graph = await this.graphFor(userId);
    const path = graph.explain(from, to);
    if (!path) return null;
    return {
      from,
      to,
      strength: Math.round(path.strength * 100) / 100,
      /** Read top to bottom, this is the explanation. */
      because: path.hops.map((h) => h.rationale),
      hops: path.hops.map((h) => ({ from: h.from, to: h.to, weight: h.weight })),
    };
  }

  // -------------------------------------------------------------------------
  // Weekly snapshot
  // -------------------------------------------------------------------------

  /**
   * Record this week's standing for every domain.
   *
   * Idempotent per (user, domain, week), so running it twice in a week is
   * harmless — which matters because the trend engines refuse to speak below
   * six samples and a duplicated week would be a lie about elapsed time.
   */
  async snapshotWeek(userId: string, now = new Date()): Promise<number> {
    // The week is the person's, not the datacentre's. Read the zone rather
    // than assume it: the weekly job runs at a fixed UTC hour, so for half the
    // world it fires on what is locally still the day before.
    const [user, rows] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
    ]);
    const week = weekOf(now, user?.timezone);

    await Promise.all(rows.map((row) =>
      this.prisma.domainAttentionSample.upsert({
        where: { userId_domainType_weekOf: { userId, domainType: row.domainType, weekOf: week } },
        create: {
          userId,
          domainType: row.domainType,
          weekOf: week,
          importance: row.importanceScore,
          attention: row.attentionScore,
        },
        update: {
          importance: row.importanceScore,
          attention: row.attentionScore,
        },
      })));

    return rows.length;
  }

  // -------------------------------------------------------------------------
  // Capture — a spoken note becomes structured life
  // -------------------------------------------------------------------------

  /**
   * Route a transcript into the records it actually belongs in.
   *
   * The classifier is pure and lives in the kernel; this is the write half.
   * Deliberately deterministic end to end — capture must work with
   * `AI_ENABLED=false`, because a note the person just spoke and cannot save is
   * worse than no capture feature at all.
   *
   * **Audio never reaches this method.** The device transcribes and discards it.
   * Recording another person is illegal without consent in many jurisdictions
   * and impossible for calls on iOS, so the design is: your own account of what
   * happened, in your words, transcribed locally.
   *
   * One note can produce several records, because one sentence often is several
   * things — "called Amma, she sounded better" is a contact log *and* worth
   * keeping. Everything created is returned so the UI can say what it filed.
   */
  async capture(userId: string, body: any) {
    const transcript = String(body.transcript ?? '').trim();
    if (!transcript) return { created: [], classified: null };

    const people = await this.prisma.relationship.findMany({
      where: { userId },
      select: { id: true, name: true, relationType: true },
    });

    const result = classifyCapture({
      transcript,
      people,
      kindHint: body.kind ?? null,
    });

    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    const created: Array<{ type: string; id: string }> = [];

    // ---- contact, when it was about someone ----------------------------
    // ContactLog is what the Relationship engine and the drift predictions read,
    // so this is the record that actually teaches the system something.
    if (result.peopleIds.length && ['call', 'visit', 'message'].includes(result.kind)) {
      for (const relationshipId of result.peopleIds) {
        const log = await this.prisma.contactLog.create({
          data: {
            relationshipId,
            kind: result.kind as 'call' | 'visit' | 'message',
            note: result.title || null,
            occurredAt,
          },
        });
        created.push({ type: 'contact', id: log.id });
      }
      await this.prisma.relationship.updateMany({
        where: { id: { in: result.peopleIds }, userId },
        data: { lastContactAt: occurredAt },
      });
    }

    // ---- a moment worth keeping ----------------------------------------
    if (result.kind === 'moment') {
      const memory = await this.prisma.memory.create({
        data: {
          userId,
          title: result.title,
          memoryType: result.peopleIds.length ? 'relationship' : 'moment',
          domainType: result.domain ? LIFE_TO_DOMAIN[result.domain] : null,
          relationshipId: result.peopleIds[0] ?? null,
          peoplePresent: result.peopleNames,
          // Their own words, kept whole. The title is only an identifier.
          reflection: result.body,
          occurredAt,
        },
      });
      created.push({ type: 'memory', id: memory.id });
    }

    // ---- everything else is thinking out loud --------------------------
    // Journal is where the Regret engine finds "things left unsaid", so a
    // reflection here is not a dead end — it feeds a real detector.
    if (result.kind === 'reflection' || result.kind === 'meeting') {
      const entry = await this.prisma.journalEntry.create({
        data: {
          userId,
          whatMattered: result.body,
          domainTags: result.domain ? [LIFE_TO_DOMAIN[result.domain]] : [],
          createdAt: occurredAt,
        },
      });
      created.push({ type: 'reflection', id: entry.id });
    }

    await this.prisma.analyticsEvent.create({
      data: {
        userId,
        name: 'life_os_captured',
        props: {
          kind: result.kind,
          domain: result.domain,
          people: result.peopleIds.length,
          words: transcript.split(/\s+/).length,
          created: created.length,
        },
      },
    });

    return {
      created,
      classified: {
        title: result.title,
        kind: result.kind,
        domain: result.domain,
        peopleNames: result.peopleNames,
        /** Shown to the person so the guess is correctable, not magic. */
        because: result.because,
        confident: result.confident,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Acting on a proposal
  // -------------------------------------------------------------------------

  /**
   * The person took the door — so it becomes a real mission.
   *
   * This is what closes the learning loop. A proposal that only logged an
   * "accepted" event would teach the system nothing: attention scores, contact
   * logs and XP all key off *missions*, so a proposal that never becomes one is
   * a promise the engines never see kept. Routing it through the mission table
   * means completing it feeds the same machinery as everything else, and next
   * week's trends reflect what actually happened.
   *
   * Idempotent by title, because a proposal reappearing across cycles must not
   * pile up duplicate missions — that bug previously jammed the adaptive loop's
   * `pending >= 2` guard and silenced next-mission suggestions entirely.
   */
  async acceptProposal(userId: string, proposalId: string, body: any = {}) {
    const title: string = String(body.action ?? '').trim().slice(0, 200);
    const lifeDomain = (body.domain ?? null) as LifeDomain | null;

    // A proposal about a named person belongs to that person's own domain,
    // which is finer than the eight→twelve fallback.
    let relationshipId: string | null = null;
    let domainType: DomainType = lifeDomain ? LIFE_TO_DOMAIN[lifeDomain] : 'growth';

    /**
     * Subjects arrive in either spelling, and only one of them is an id.
     *
     * The relationship and time engines tag people as `person:<id>`; the
     * client posts those subjects back verbatim on accept. This lookup asked
     * for them as bare ids, so it matched nothing, and every mission accepted
     * from a relationship proposal was written with `relationshipId` null —
     * losing its person on the way in.
     *
     * That is what made the suppression above unreachable for the exact case
     * it was built for. `claimed` reads `relationshipId`, so a mission that
     * never recorded one is a mission the next cycle cannot see is standing:
     * the reader accepts "Reach out to Vikram", and tomorrow the kernel
     * proposes Vikram again, having been told nothing.
     */
    const subjects: string[] = (Array.isArray(body.subjects) ? body.subjects : [])
      .map((s: unknown) => String(s).replace(/^person:/, ''));
    if (subjects.length) {
      const person = await this.prisma.relationship.findFirst({
        where: { userId, id: { in: subjects } },
      });
      if (person) {
        relationshipId = person.id;
        domainType = domainForRelationType(person.relationType);
      }
    }

    const existing = title
      ? await this.prisma.mission.findFirst({
        where: { userId, title, status: 'pending' },
      })
      : null;

    const mission = existing ?? (title
      ? await this.prisma.mission.create({
        data: {
          userId,
          relationshipId,
          domainType,
          missionType: relationshipId ? 'relationship' : 'one_time',
          title,
          // The engine's own reason, kept verbatim — it is better than anything
          // we would regenerate, and it is what made the person say yes.
          description: body.tinyStep ?? body.because ?? null,
          estimatedMinutes: Number(body.effortMinutes) || null,
          xpReward: 10,
          status: 'pending',
          sourceType: 'AI',
        },
      })
      : null);

    await this.prisma.analyticsEvent.create({
      data: {
        userId,
        name: 'life_os_proposal_accepted',
        props: {
          proposalId,
          engine: body.engine ?? null,
          domain: lifeDomain,
          action: title || null,
          missionId: mission?.id ?? null,
          reused: Boolean(existing),
        },
      },
    });

    return { accepted: proposalId, mission };
  }

  /**
   * Not this.
   *
   * `forever: true` is the Retreat principle in one call — the domain joins
   * `declinedTopics` and the orchestrator drops everything from it from the next
   * cycle onward, silently and permanently. No confirmation, no "are you sure",
   * no survey. Reversible only from settings, deliberately not from here.
   */
  async dismissProposal(userId: string, proposalId: string, body: any = {}) {
    const forever = body.forever === true || body.forever === 'true';
    const topic = typeof body.domain === 'string' ? body.domain : null;

    const state = await this.prisma.lifeOsState.findUnique({ where: { userId } });
    const declined = new Set((state?.declinedTopics as string[]) ?? []);
    if (forever && topic) declined.add(topic);

    await Promise.all([
      this.prisma.lifeOsState.upsert({
        where: { userId },
        create: { userId, declinedTopics: [...declined] },
        update: { declinedTopics: [...declined] },
      }),
      this.prisma.analyticsEvent.create({
        data: {
          userId,
          name: 'life_os_proposal_dismissed',
          props: { proposalId, domain: topic, forever },
        },
      }),
    ]);

    return { dismissed: proposalId, declinedTopics: [...declined] };
  }

  /** What they've asked us to stop bringing up. Readable, and undoable. */
  async declinedTopics(userId: string): Promise<string[]> {
    const state = await this.prisma.lifeOsState.findUnique({ where: { userId } });
    return (state?.declinedTopics as string[]) ?? [];
  }

  /** Let a topic back in. The only way out of Retreat, and it is explicit. */
  async restoreTopic(userId: string, topic: string) {
    const current = await this.declinedTopics(userId);
    const next = current.filter((t) => t !== topic);
    await this.prisma.lifeOsState.upsert({
      where: { userId },
      create: { userId, declinedTopics: next },
      update: { declinedTopics: next },
    });
    return { declinedTopics: next };
  }

  // -------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------

  listDecisions(userId: string) {
    return this.prisma.decision.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  createDecision(userId: string, body: any) {
    /**
     * Stored as the person wrote it, and normalised only on the way out.
     *
     * Normalising on write looked safer and was worse: anything the normaliser
     * did not recognise — options sent as a JSON string, keyed by id, or
     * carrying fields it does not whitelist — was silently reduced to `[]` or
     * stripped, with a 201 handed back as if nothing had happened. Nothing
     * updates this column afterwards, so that loss is permanent, and the person
     * is left with a fork in their life the engine calls "genuinely close".
     * Better to refuse a shape we cannot read than to quietly discard it.
     */
    const options = body.options ?? [];
    if (!Array.isArray(options)) {
      throw new BadRequestException(
        'options must be an array of { label, scores } — send it as JSON, not as a string.',
      );
    }

    return this.prisma.decision.create({
      data: {
        userId,
        question: String(body.question ?? '').slice(0, 200),
        options,
        horizonYears: Number(body.horizonYears) || 5,
      },
    });
  }

  /**
   * The full assessment for one decision.
   *
   * Runs the pure engine directly rather than through a cycle: a person opening
   * a decision wants the whole picture — every factor, the lean, and the
   * argument against it — not the one-line version the daily reduction would
   * leave them with.
   */
  async assessDecision(userId: string, id: string) {
    const decision = await this.prisma.decision.findFirstOrThrow({
      where: { id, userId },
    });
    const answers = await this.prisma.onboardingAnswer.findFirst({
      where: { userId, key: 'priorityRanking' },
    });
    const valueRanking = (((answers?.value as string[]) ?? [])
      .map((d) => DOMAIN_MAP[d])
      .filter((d): d is Domain => !!d)
      .filter((d, i, arr) => arr.indexOf(d) === i));

    const assessment = evaluateDecision({
      id: decision.id,
      question: decision.question,
      horizonYears: decision.horizonYears,
      valueRanking,
      options: normalizeDecisionOptions(decision.options),
    });

    return { decision, assessment };
  }

  async decide(userId: string, id: string, body: any) {
    await this.prisma.decision.findFirstOrThrow({ where: { id, userId } });
    return this.prisma.decision.update({
      where: { id },
      data: {
        status: body.status ?? 'decided',
        chosenOptionId: body.chosenOptionId ?? null,
        decidedAt: new Date(),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Knowledge
  // -------------------------------------------------------------------------

  listKnowledge(userId: string) {
    return this.prisma.knowledgeItem.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  addKnowledge(userId: string, body: any) {
    return this.prisma.knowledgeItem.create({
      data: {
        userId,
        kind: body.kind ?? 'book',
        title: String(body.title ?? '').slice(0, 300),
        // Normalised on the way in, so topic joins never depend on casing.
        topics: normaliseTopics(body.topics),
        status: body.status ?? 'queued',
        domainType: body.domainType ?? null,
        lastTouchedAt: body.status === 'active' ? new Date() : null,
      },
    });
  }

  async updateKnowledge(userId: string, id: string, body: any) {
    await this.prisma.knowledgeItem.findFirstOrThrow({ where: { id, userId } });
    const data: Record<string, unknown> = {};
    if (body.status != null) data.status = body.status;
    if (body.progress != null) data.progress = Number(body.progress);
    if (body.takeaway != null) data.takeaway = String(body.takeaway);
    if (body.topics != null) data.topics = normaliseTopics(body.topics);
    // Any progress at all counts as touching it — that is what release keys on.
    if (body.progress != null || body.status === 'active') data.lastTouchedAt = new Date();
    return this.prisma.knowledgeItem.update({ where: { id }, data });
  }
}

/** Lowercase, trimmed, de-duplicated. The topic join key. */
function normaliseTopics(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(
    input
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0),
  )];
}
