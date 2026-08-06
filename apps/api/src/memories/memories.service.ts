import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ritualTokens, momentPrompts, isUsableQuestion, isUsableAccountLine, safeRephrase,
} from '@priority/scoring-engine';
import { MOMENT_PROMPTS } from '@priority/ai-prompts';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class MemoriesService {
  constructor(
    private prisma: PrismaService,
    private game: GamificationService,
    private analytics: AnalyticsService,
    private ai: AiService,
  ) {}

  list(userId: string, filters: { person?: string; countKey?: string } = {}) {
    return this.prisma.memory.findMany({
      where: {
        userId,
        ...(filters.person
          ? { peoplePresent: { array_contains: filters.person } }
          : {}),
        ...(filters.countKey ? { countKey: filters.countKey } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  /** Memories from this calendar day in earlier years — the ritual prompt. */
  async onThisDay(userId: string) {
    const all = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
    });
    const now = new Date();
    return all.filter((m) => {
      const d = new Date(m.occurredAt);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() < now.getFullYear()
      );
    });
  }

  /**
   * The "lived" side of the counts — per ritual, not just how many but since
   * when, and with whom.
   *
   * This used to be a bare `groupBy` returning a number, which is why the
   * Time tab could print "~150 more treks at your current pace" over an
   * archive holding zero treks: a count alone cannot contradict a pace. The
   * dates let the engine measure what actually happens, and `people` is the
   * fact that was being thrown away entirely — the one logged Diwali knew it
   * was with Amma and Appa, and the card said "1 already in your archive".
   */
  async countsSummary(userId: string) {
    const rows = await this.prisma.memory.findMany({
      where: { userId, countKey: { not: null } },
      select: { countKey: true, occurredAt: true, peoplePresent: true },
      orderBy: { occurredAt: 'asc' },
    });

    const out: Record<string, {
      count: number;
      firstAt: string;
      lastAt: string;
      people: string[];
    }> = {};
    const tally: Record<string, Map<string, number>> = {};

    for (const r of rows) {
      const key = r.countKey as string;
      const at = r.occurredAt.toISOString();
      if (!out[key]) {
        out[key] = { count: 0, firstAt: at, lastAt: at, people: [] };
        tally[key] = new Map();
      }
      out[key].count += 1;
      out[key].lastAt = at; // rows are ascending, so the last write wins
      for (const name of (Array.isArray(r.peoplePresent) ? r.peoplePresent : []) as string[]) {
        if (typeof name === 'string' && name.trim()) {
          tally[key].set(name, (tally[key].get(name) ?? 0) + 1);
        }
      }
    }
    // Most-present first: whoever this ritual is really with leads the row.
    for (const key of Object.keys(out)) {
      out[key].people = [...tally[key].entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);
    }
    return out;
  }

  /**
   * Moments already in the archive that look like a ritual being counted, but
   * carry no key.
   *
   * The archive is where the evidence lives and most of it was never tagged —
   * someone logs "Went to trek", sees it, and creates a second countable
   * rather than connecting the two. Matching is deliberately offered and
   * never applied: a number nobody can explain is worse than a smaller one
   * they can, so this returns candidates and the user decides.
   */
  async countCandidates(userId: string) {
    const [answers, untagged] = await Promise.all([
      this.prisma.onboardingAnswer.findMany({ where: { userId, section: 'counts' } }),
      this.prisma.memory.findMany({
        where: { userId, countKey: null },
        select: { id: true, title: true, occurredAt: true, peoplePresent: true },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
    ]);

    const out: Record<string, Array<{ id: string; title: string; occurredAt: string }>> = {};
    for (const a of answers) {
      const label = (a.value as { label?: string })?.label;
      if (!label) continue;
      const wanted = new Set(ritualTokens(label));
      if (!wanted.size) continue;

      const hits = untagged
        .filter((m) => {
          const got = new Set(ritualTokens(m.title));
          // Every meaningful word of the ritual present in the title. Loose
          // enough to catch "Went to trek" for "treks", tight enough that
          // "dinner with Amma" never answers for "dinner with Arjun".
          return [...wanted].every((t) => got.has(t));
        })
        .slice(0, 8)
        .map((m) => ({ id: m.id, title: m.title, occurredAt: m.occurredAt.toISOString() }));

      if (hits.length) out[a.key] = hits;
    }
    return out;
  }

  /**
   * Words that keep recurring in untagged moments — things this person
   * evidently does and nothing is counting.
   *
   * A theme is a single meaningful word appearing in two or more untagged
   * titles, which is deliberately the crudest rule that still only fires on
   * repetition. Anything cleverer would invent rituals nobody has: the label
   * offered is the word itself, so the suggestion is always something they
   * literally wrote down, and they rename it when they accept it.
   */
  async archiveThemes(userId: string) {
    const [untagged, counted] = await Promise.all([
      this.prisma.memory.findMany({
        where: { userId, countKey: null },
        select: { title: true, peoplePresent: true },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      this.prisma.onboardingAnswer.findMany({ where: { userId, section: 'counts' } }),
    ]);

    const already = new Set(
      counted.flatMap((a) => ritualTokens((a.value as { label?: string })?.label ?? '')),
    );
    const seen = new Map<string, { count: number; people: Map<string, number> }>();

    for (const m of untagged) {
      const people = (Array.isArray(m.peoplePresent) ? m.peoplePresent : []) as string[];
      for (const token of ritualTokens(m.title)) {
        if (already.has(token) || token.length < 4) continue;
        const row = seen.get(token) ?? { count: 0, people: new Map<string, number>() };
        row.count += 1;
        for (const name of people) {
          if (typeof name === 'string' && name.trim()) {
            row.people.set(name, (row.people.get(name) ?? 0) + 1);
          }
        }
        seen.set(token, row);
      }
    }

    return [...seen.entries()]
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([token, v]) => ({
        // Plural, because a countable is always a plural in this card.
        label: token.endsWith('s') ? token : `${token}s`,
        count: v.count,
        people: [...v.people.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      }));
  }

  /** Fold chosen archive moments into a ritual's count. */
  async attachToCount(userId: string, countKey: string, memoryIds: string[]) {
    if (!countKey || !Array.isArray(memoryIds) || !memoryIds.length) return { attached: 0 };
    const { count } = await this.prisma.memory.updateMany({
      // Scoped to this user and to genuinely untagged rows, so a stale id or
      // a retried request can never re-file someone else's moment.
      where: { userId, countKey: null, id: { in: memoryIds } },
      data: { countKey },
    });
    return { attached: count };
  }

  /**
   * A mission has one kept moment, however many times it is saved.
   *
   * The Today banner offers "Save it" on a completed mission and goes on
   * offering it after the moment has been kept — so tapping it twice wrote
   * two rows with the same `missionId`, and the archive showed the same
   * evening twice under the same date. Worse quietly: `game.award` fired on
   * each one, so a duplicate paid twice for a thing that happened once.
   *
   * It is not only a double tap. Capture writes are `offlineFirst` and
   * resume from disk on the next launch (see `mutationDefaults`), so a write
   * that succeeded just as the process died could legitimately arrive twice
   * with no user error at all. The guard belongs here, where every path
   * meets, rather than on the button.
   *
   * A second save updates rather than being discarded: somebody who kept the
   * moment bare and came back to write down what they will remember must not
   * lose that sentence to an idempotency rule. Only fields the new payload
   * actually carries are written, so a stray re-post cannot blank a
   * reflection that is already there.
   */
  async create(userId: string, data: any) {
    const already = data.missionId
      ? await this.prisma.memory.findFirst({
        where: { userId, missionId: data.missionId },
      })
      : null;

    if (already) {
      const patch: Record<string, unknown> = {};
      for (const field of ['title', 'domainType', 'countKey', 'location', 'reflection', 'conversation', 'keepsake', 'relationshipId']) {
        const v = data[field];
        if (v !== undefined && v !== null && v !== '') patch[field] = v;
      }
      if (Array.isArray(data.peoplePresent) && data.peoplePresent.length) {
        patch.peoplePresent = data.peoplePresent;
      }
      const memory = Object.keys(patch).length
        ? await this.prisma.memory.update({ where: { id: already.id }, data: patch })
        : already;
      /* No XP. The moment was already paid for the first time it was kept. */
      return { ...memory, xp: null, alreadyKept: true };
    }

    /**
     * The hour the thing happened, when there is one.
     *
     * `new Date()` was the old answer, and it is the moment somebody pressed
     * Save rather than the moment they finished — measurably so: kept at
     * 07:05:51 against a mission completed at 07:04:57. Fifty-four seconds in
     * a test, and however long it takes a real person to put the phone down,
     * open the app and write something after a call that actually mattered.
     *
     * `mission.completedAt` is the moment the app was there for, and it has
     * been sitting on the row the whole time. Everything else — a moment
     * typed from nothing, a date chosen by hand — gets no claim to an hour at
     * all, and `timeKnown` is what carries that distinction to every surface
     * that might otherwise print one.
     */
    const fromMission = data.missionId
      ? await this.prisma.mission.findFirst({
        where: { id: data.missionId, userId },
        select: { completedAt: true },
      })
      : null;
    const knownAt = data.occurredAt ? null : fromMission?.completedAt ?? null;

    const memory = await this.prisma.memory.create({
      data: {
        userId,
        title: data.title,
        memoryType: data.memoryType ?? 'moment',
        domainType: data.domainType ?? null,
        relationshipId: data.relationshipId ?? null,
        missionId: data.missionId ?? null,
        countKey: data.countKey ?? null,
        peoplePresent: Array.isArray(data.peoplePresent) ? data.peoplePresent : [],
        location: data.location ?? null,
        reflection: data.reflection ?? null,
        conversation: data.conversation ?? null,
        keepsake: data.keepsake ?? null,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : (knownAt ?? new Date()),
        /* Only an hour the app watched. A date somebody typed is a date,
           and the time on it means nothing. */
        timeKnown: !!knownAt,
      },
    });
    const xp = await this.game.award(
      userId,
      'memory_logged',
      memory.domainType ?? 'reflection',
      memory.id,
    );
    /**
     * The act this whole product is arranged around, and it was the one act
     * nothing measured.
     *
     * Two things were tracked server-side — a mission completed and
     * onboarding finished — and the XP ledger has awarded `memory_logged`
     * since the beginning, so the name existed and simply never reached
     * analytics. Which left the funnel able to say how many people finished a
     * task and unable to say whether anybody ever kept one, when keeping is
     * the thing the Time tab counts toward and the archive exists for.
     *
     * The properties are the ones that answer a question later: whether a
     * moment came from a finished mission or was written from nothing, and
     * whether it was logged about today or about something years back —
     * because "people come here to record the past" and "people come here to
     * mark the present" are different products.
     */
    const daysBack = Math.round(
      (Date.now() - memory.occurredAt.getTime()) / 86_400_000,
    );
    await this.analytics.track(userId, 'memory_logged', {
      domainType: memory.domainType,
      fromMission: !!memory.missionId,
      withPeople: (memory.peoplePresent as unknown[] ?? []).length,
      /* Banded rather than exact: the question is "was this today, this week,
         or a long time ago", and a raw day count is a timestamp by another
         name. */
      age: daysBack <= 1 ? 'today' : daysBack <= 7 ? 'this-week' : daysBack <= 365 ? 'this-year' : 'older',
      hasAccount: !!memory.reflection,
      hasConversation: !!memory.conversation,
      hasKeepsake: !!memory.keepsake,
    });
    return { ...memory, xp };
  }

  /**
   * Correct a moment.
   *
   * Mostly this is a date. A memory typed today about a graduation in 2009
   * lands on today unless the person remembers to backdate it, and getting the
   * year wrong puts it on the wrong square of a grid meant to show their life
   * — worth being able to fix without deleting and retyping the whole thing.
   */
  async update(userId: string, id: string, data: any) {
    await this.assertOwned(userId, id);
    const patch: Record<string, unknown> = {};
    for (const field of ['title', 'memoryType', 'domainType', 'countKey', 'location', 'reflection', 'conversation', 'keepsake', 'relationshipId']) {
      if (data[field] !== undefined) patch[field] = data[field];
    }
    if (Array.isArray(data.peoplePresent)) patch.peoplePresent = data.peoplePresent;
    /**
     * A date set by hand gives up the hour, always.
     *
     * The edit form writes noon — `${occurredOn}T12:00:00.000Z` — because a
     * date input has no time in it. On a moment kept from a mission that would
     * have left `timeKnown` standing and printed "12:00 PM" over an evening
     * nobody described, which is precisely the invention the flag exists to
     * prevent. Correcting the year of a graduation must not manufacture a
     * lunchtime.
     */
    if (data.occurredAt) {
      patch.occurredAt = new Date(data.occurredAt);
      patch.timeKnown = false;
    }
    return this.prisma.memory.update({ where: { id }, data: patch });
  }

  /**
   * The four questions for one particular moment.
   *
   * "Back to this moment" used to ask everybody the same four, which is why
   * it read as a form rather than as somewhere to write. The engine composes
   * a set that fits this moment — who was there, what kind of thing it was,
   * how long ago it happened — and the model is allowed to sharpen the
   * wording and nothing else.
   *
   * What it is not allowed to do is fill anything in. The archive's rule has
   * not moved: the app writes the question, the person writes the answer. A
   * prompt that proposes what somebody might say about their own mother is
   * not a personalised form, it is the app keeping a diary about a life it
   * was not present for.
   */
  async prompts(userId: string, id: string) {
    const memory = await this.assertOwned(userId, id);

    /**
     * One name only where there is exactly one.
     *
     * `personName` is the snapshot kept for when the relationship row is
     * deleted, `relationship.name` is the live one, and `peoplePresent` is
     * the guest list. Naming one person out of four would be the app
     * deciding whose evening it was, so a gathering gets the plural.
     */
    const present = Array.isArray(memory.peoplePresent)
      ? (memory.peoplePresent as unknown[]).filter((n): n is string => typeof n === 'string' && !!n.trim())
      : [];
    const named = memory.personName?.trim()
      || (present.length === 1 ? present[0].trim() : '')
      || '';
    const peopleCount = Math.max(present.length, named ? 1 : 0);

    /* Whole days, floored, and never negative — a moment dated in the future
       is a typo, not a reason to ask what has stayed with them since. */
    const daysAgo = Math.max(
      0,
      Math.floor((Date.now() - new Date(memory.occurredAt).getTime()) / 86_400_000),
    );

    const engine = momentPrompts({
      title: memory.title,
      memoryType: memory.memoryType,
      personName: peopleCount > 1 ? null : named || null,
      peopleCount,
      daysAgo,
    });

    /**
     * The model sees the four questions and nothing else.
     *
     * No title, no date, no person, no account of what happened — there is
     * nothing here for it to misread because it has not been handed anything
     * to read. This is the same shape as the Reveal and the Now card, and it
     * is the shape because every version that passed facts instead produced
     * fluent sentences that were wrong about what a field meant.
     */
    /**
     * Deferred, because this one is opened by a tap and read immediately.
     *
     * The client composes the same engine questions locally, so the form is
     * never waiting on anything — it draws instantly with the wording below
     * and this call only decides whether a later opening gets a better one.
     * Blocking would be worse than pointless here: nine seconds in, the
     * reader is already typing, and swapping the question under their hands
     * is the one thing a prompt must not do.
     */
    const edited = await this.ai.generateOrDefer(
      userId,
      'moment_prompts',
      MOMENT_PROMPTS,
      {
        insight: engine.insight,
        account: engine.reflection,
        conversation: engine.conversation,
        keepsake: engine.keepsake,
      },
      { insight: '', account: '', conversation: '', keepsake: '' },
      /* Keyed on the moment and the parts of it the questions are built from,
         so reopening the same evening asks the same thing — and editing the
         title or the date earns a fresh set. */
      { cacheKey: `moment:${memory.id}:${memory.title}:${named}:${daysAgo}` },
    );

    /**
     * Each field falls back on its own.
     *
     * A model that spoils one question has not spoiled the other three, and
     * the engine's wording is not a degraded path — it is the version this
     * surface was designed around. `mustKeep` carries the name because a
     * warmer question about nobody in particular is the exact failure the
     * Reveal hit: nothing invented, nothing misread, the sentence simply
     * stopped being about anybody.
     */
    const question = (original: string, rewritten: string) => {
      const { sentence } = safeRephrase(original, rewritten, { mustKeep: [named || undefined] });
      return isUsableQuestion(sentence) ? sentence : original;
    };
    const { sentence: account } = safeRephrase(engine.reflection, edited.account, {
      mustKeep: [named || undefined],
    });

    return {
      insight: question(engine.insight, edited.insight),
      reflection: isUsableAccountLine(account) ? account : engine.reflection,
      conversation: question(engine.conversation, edited.conversation),
      keepsake: question(engine.keepsake, edited.keepsake),
    };
  }

  /** No XP is clawed back — it was true when it happened. */
  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.prisma.memory.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwned(userId: string, id: string) {
    const memory = await this.prisma.memory.findFirst({ where: { id, userId } });
    if (!memory) throw new NotFoundException('Memory not found');
    return memory;
  }
}
