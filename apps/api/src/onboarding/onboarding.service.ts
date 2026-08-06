import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { InsightsService } from '../insights/insights.service';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { BlueprintService } from '../life-os/blueprint.service';
import { LIFE_REVEAL, VALUES_EXTRACTION } from '@priority/ai-prompts';
import {
  deriveGoalTitle, namesAThing, suggestCountables, countKeyOf,
  detectCrisisLanguage,
} from '@priority/scoring-engine';
import { ALL_DOMAINS, domainForRelationType } from '@priority/types';

/** The names people and integrations use for domains, mapped to the slugs the rows use. */
const DOMAIN_ALIASES: Record<string, string> = {
  finances: 'finance', money: 'finance',
  friendships: 'friends', friendship: 'friends', friend: 'friends',
  personal_growth: 'growth', learning: 'growth',
  spirituality: 'reflection', inner_life: 'reflection', mindfulness: 'reflection',
  recreation: 'experiences', fun: 'experiences', travel: 'experiences',
  community: 'impact', giving_back: 'impact', environment: 'impact', volunteering: 'impact',
  creative: 'purpose', creative_work: 'purpose', work: 'career', job: 'career',
  parents: 'family', kids: 'children', child: 'children', spouse: 'partner',
};

export function normalizeDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const canonical = new Set<string>(ALL_DOMAINS);
  const out: string[] = [];
  for (const raw of value) {
    const key = String(raw).trim().toLowerCase().replace(/[\s/-]+/g, '_');
    const slug = canonical.has(key) ? key : DOMAIN_ALIASES[key];
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * How long onboarding will wait on a model before using its own words.
 *
 * The mobile client aborts any request at 15 seconds and shows "That took too
 * long — Priority couldn't be reached." `AiService` defaults to 25 seconds per
 * call, which is longer than the client's patience for the whole request — so
 * one slow generation could strand somebody on the last screen of sign-up
 * while the server carried on and finished successfully. That is exactly what
 * happened in production on 2026-08-06: three `onboarding_completed` events,
 * three red errors, one person pressing the button again.
 *
 * Both calls here have deterministic fallbacks written to be worth reading on
 * their own, so waiting longer buys polish at the cost of the whole screen.
 * The budget belongs to the caller, and this caller has a person watching a
 * spinner.
 */
const ONBOARDING_AI_BUDGET_MS = 6_000;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private insights: InsightsService,
    private ai: AiService,
    private analytics: AnalyticsService,
    private blueprint: BlueprintService,
  ) {}

  /**
   * Quote someone without appearing to misquote them.
   *
   * A hard `slice` inside quotation marks ended the reader's own sentence
   * mid-word and closed the quote as if that were all they had written:
   * `"Visit Amma for a full week and actually stay long enough that leaving "`.
   * Cutting at the last word boundary and marking the cut says plainly that
   * there is more, which is the difference between an excerpt and a mistake.
   */
  /**
   * The three first missions offered at the end of the Reveal.
   *
   * These used to be `One meaningful action in ${domain}` — three times, for
   * every person who ever signed up. Somebody would type "Visit Amma for a
   * full week and actually stay long enough that leaving hurts", name their
   * mother, rate family 2/5, and the app's reply was "One meaningful action in
   * family". That is the single screen whose whole job is to prove the app
   * read what was written, and it proved the opposite — while the seeded demo
   * account, which nobody signs up for, got "Call Amma this evening".
   *
   * So: use their words. The person they named, the thing they said they keep
   * postponing, their own drift score. The generic line survives only as the
   * last resort for someone who genuinely gave us nothing, and never fills all
   * three slots when even one real detail exists.
   *
   * Each string becomes a real mission title verbatim, so each is phrased as
   * one small action, not a theme.
   *
   * **Each option carries its own domain, and this is not decoration.** The
   * client used to derive one with `title.split(' ').pop()` — the last word
   * of the sentence — which worked only because every option used to end in
   * a domain name ("One meaningful action in family"). The moment these
   * became personal, the last words became "enough", "times" and "1/5", the
   * POST failed validation, and a silent catch left every new account with
   * no first mission at all. Copy is not a data channel. The domain travels
   * as a field.
   */
  /**
   * The countable life, started from what they already told us.
   *
   * "~75 Diwalis at home", "~150 movie nights with the kids" — the most
   * affecting thing this app produces, and on day one the section was empty
   * for everybody, because a count only exists once somebody opens the Time
   * tab, finds the ritual card and taps a suggestion. The strongest ones were
   * sitting in the answers already: `meaningfulMomentTypes` is the reader's
   * own phrase for what matters with a particular person — "long calls" with
   * Vikram, "temple visits" with Amma — collected during onboarding and, as
   * the Time tab's own comment says, never read until the card was opened.
   *
   * Except no screen in this app has ever asked for that field. Onboarding
   * does not collect it and neither does the People tab; the only writers are
   * the test harnesses. So seeding from it alone would be a feature that never
   * fires, and the sources that do exist are the next ones down: a person the
   * reader said they want more time with, which onboarding asks about plainly.
   * "days out with Ines" is the app's phrasing rather than theirs — but it is
   * about a named person they named for a reason they gave, and the card shows
   * that reason back.
   *
   * The `domain` source stays out. "Long walks outdoors, because you rate
   * health 60" is inferred from a slider and attached to nobody; good enough
   * to offer on a card, not good enough to write into a life unasked.
   *
   * A count is not a commitment — it asks for nothing and claims no hour. That
   * is what makes seeding one defensible where seeding a habit would not be.
   * Every row written here is an ordinary count: editable, removable, and
   * identical to one added by hand, because it is the same record under the
   * same key.
   */
  /**
   * The two reads this used to make are now passed in.
   *
   * Both were already being fetched by `complete` a few lines later — the
   * relationships for the Reveal, the answers to read the ranking out of — so
   * making them again cost two more round trips inside a request somebody is
   * watching a spinner for. The seeding logic is unchanged; only where its
   * inputs come from is.
   */
  private async seedCountablesFromTheirWords(
    userId: string,
    people: Array<{
      id: string; name: string; relationType: string;
      closenessScore?: number | null; wantsMoreTime?: boolean | null;
      desiredCallFrequency?: string | null; locationType?: string | null;
      meaningfulMomentTypes?: unknown;
    }>,
    /** Every answer this account has; the counts section is filtered out here. */
    answers: Array<{ section: string; key: string }>,
  ): Promise<void> {
    const existing = answers.filter((a) => a.section === 'counts');

    const suggestions = suggestCountables({
      existing: existing.map((a) => ({ key: a.key, label: a.key })),
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        relationType: p.relationType,
        closenessScore: p.closenessScore ?? undefined,
        wantsMoreTime: p.wantsMoreTime ?? undefined,
        desiredCallFrequency: p.desiredCallFrequency ?? undefined,
        locationType: p.locationType ?? undefined,
        meaningfulMomentTypes: (p.meaningfulMomentTypes ?? []) as string[],
      })),
      domains: [],
      archiveThemes: [],
      // Three is the card's own shape. More would be a list to manage rather
      // than a life to look at.
      limit: 3,
    }).filter((s) => s.source === 'moment-type' || s.source === 'person');

    /* Deduplicated first, then written together. The `taken` set is what
       stops two suggestions colliding on one key, so it has to be settled
       before anything is sent — after that the writes are independent. */
    const taken = new Set(existing.map((a) => a.key));
    const fresh: Array<{ key: string; label: string; perYear: number; peopleIds?: string[] }> = [];
    for (const s of suggestions) {
      const key = countKeyOf(s.label);
      if (taken.has(key)) continue;
      taken.add(key);
      fresh.push({ key, label: s.label, perYear: s.perYear, peopleIds: s.peopleIds });
    }
    await Promise.all(fresh.map((f) => this.prisma.onboardingAnswer.upsert({
      where: { userId_section_key: { userId, section: 'counts', key: f.key } },
      create: {
        userId, section: 'counts', key: f.key,
        value: { label: f.label, perYear: f.perYear, people: f.peopleIds },
      },
      update: {},
    })));
  }

  private firstWeekOptions(opts: {
    top3: string[];
    person?: string | null;
    personDomain?: string | null;
    personId?: string | null;
    personAge?: number | null;
    personLocation?: string | null;
    personRelation?: string | null;
    postponing: string;
    postponingDomain?: string | null;
    postponingGoalId?: string | null;
    neglected: string[];
    currentReality: Record<string, number>;
  }): Array<{ title: string; domainType: string; relationshipId?: string; goalId?: string }> {
    const {
      top3, person, personDomain, personId, personAge, personLocation,
      personRelation, postponing, postponingDomain,
      postponingGoalId, neglected, currentReality,
    } = opts;
    const fallback = top3[0] ?? 'family';
    const out: Array<{ title: string; domainType: string; relationshipId?: string; goalId?: string }> = [];

    if (person) {
      out.push({
        title: this.reachOutTo(person, personAge, personLocation, personRelation),
        domainType: personDomain ?? 'family',
        /* Linked, not merely named. An unlinked mission about Vikram is
           invisible to everything that reasons about Vikram — which is how
           the day came to ask for him twice, in contradictory words. */
        ...(personId ? { relationshipId: personId } : {}),
      });
    }

    /* Only when the answer names a thing. "Everything. I do not know where
       to start any more." is not a goal, it is being underwater — and this
       option handed that sentence back as a mission title with a checkbox
       next to it. The drift option below is the honest offer for that
       person: one named domain, one hour, chosen from their own numbers. */
    const goal = namesAThing(postponing) ? deriveGoalTitle(postponing).title : '';
    if (goal) {
      // Their sentence, reduced to a title, offered as a first step rather
      // than as the whole mountain — the postponing answer is by definition
      // the thing that feels too big to start.
      out.push({
        title: `One small step toward: ${goal}`,
        domainType: postponingDomain ?? fallback,
        ...(postponingGoalId ? { goalId: postponingGoalId } : {}),
      });
    }

    // The domain they rated lowest, named with the number they gave it, so the
    // suggestion is visibly derived from their own answer.
    const drifting = neglected[0] ?? top3.find((d) => (currentReality[d] ?? 5) <= 2) ?? null;
    if (drifting) {
      const score = currentReality[drifting];
      out.push({
        title: typeof score === 'number'
          ? `Give ${drifting} one hour this week — you rated it ${score}/5`
          : `Give ${drifting} one deliberate hour this week`,
        domainType: drifting,
      });
    }

    for (const d of top3) {
      if (out.length >= 3) break;
      if (!out.some((o) => o.title.includes(d))) {
        out.push({ title: `One meaningful action in ${d}`, domainType: d });
      }
    }

    return out.slice(0, 3);
  }

  /**
   * How you actually reach this particular person.
   *
   * "Reach out to Zoe this week — one message is enough" was the first
   * mission handed to a father whose Zoe is four years old, and to another
   * whose nine-year-old sleeps down the hall. You do not text a four-year-old
   * and you do not reach out to somebody in your own kitchen. It is the
   * opening move of the whole product, and it proved the app had not read the
   * age and the address it had just been given.
   *
   * "One message is enough" was never about messages — it is a low bar, put
   * there so the first thing asked of somebody is small enough to actually
   * happen. So the bar stays low and the currency changes: for a small child,
   * and for anybody under the same roof, the cheap version of contact is a
   * quarter of an hour, not a text.
   *
   * Thirteen is where a phone stops being a novelty, and an unknown age is
   * treated as young only when the person is filed as a child — an adult
   * child in another city is exactly who a message suits best.
   */
  private reachOutTo(
    name: string,
    age?: number | null,
    locationType?: string | null,
    relationType?: string | null,
  ): string {
    const isChild = ['child', 'son', 'daughter'].includes((relationType ?? '').toLowerCase());
    const small = typeof age === 'number' ? age < 13 : isChild && locationType === 'same_home';
    if (small) return `Fifteen minutes with ${name} this week, doing what they pick`;
    if (locationType === 'same_home') return `Fifteen minutes with ${name} this week, phones away`;
    return `Reach out to ${name} this week — one message is enough`;
  }

  private quoteFragment(text: string, max: number): string {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    // A single word longer than the limit has no boundary to fall back on.
    const body = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
    return `${body.replace(/[,;:.\s]+$/, '')}…`;
  }

  async saveAnswers(
    userId: string,
    answers: { section: string; key: string; value: unknown }[],
  ) {
    /* One round trip per answer, in single file, was the shape of the save
       that runs on every onboarding step. Independent rows; send them at once. */
    await Promise.all(answers.map((a) => this.prisma.onboardingAnswer.upsert({
      where: {
        userId_section_key: { userId, section: a.section, key: a.key },
      },
      create: { userId, section: a.section, key: a.key, value: a.value as object },
      update: { value: a.value as object },
    })));
    /**
     * Onboarding is where the heaviest thing anybody types often lands.
     *
     * Crisis detection ran on journal entries and nowhere else, which quietly
     * assumed the first honest disclosure comes after somebody has settled
     * into the app. It does not. "What keeps sliding" and "what would you
     * regret" are asked on day one, of a stranger, and they are exactly the
     * questions that get answered truthfully — the journal is the *second*
     * place this happens, not the first.
     *
     * Same contract as the journal path: local, deterministic, never blocks
     * the save, and the flag is a boolean. What somebody wrote is not stored
     * as evidence of anything, not logged, and not sent anywhere.
     */
    const supportSuggested = detectCrisisLanguage(
      ...answers.map((a) => (typeof a.value === 'string' ? a.value : null)),
    );
    return { saved: answers.length, supportSuggested };
  }

  getAnswers(userId: string) {
    return this.prisma.onboardingAnswer.findMany({ where: { userId } });
  }

  /**
   * Materializes onboarding answers into domain ranks/flags, recalculates
   * scores, generates opportunity insights and the AI Life Reveal.
   */
  async complete(userId: string) {
    /**
     * Everything this method reads, read at once.
     *
     * These four were spread across the method in the order the code happened
     * to need them — answers at the top, the domains a few lines down, the
     * relationships and the goal two hundred lines later — and awaited one at
     * a time. On a laptop that costs nothing. In production the API is in
     * Oregon and the database behind the pooler in ap-south-1, and a round
     * trip measures about 1.2 seconds; sequencing seven of them put this
     * request at nineteen seconds against a client that gives up at fifteen.
     * The last screen of sign-up then read "That took too long", over an
     * account the server was still busy finishing.
     *
     * None of the four depends on another. Together they cost one round trip.
     */
    const [answers, currentDomains, relationships, postponingGoal] = await Promise.all([
      this.getAnswers(userId),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.relationship.findMany({
        where: { userId },
        select: {
          id: true, name: true, relationType: true, wantsMoreTime: true,
          priorityScore: true, age: true, locationType: true,
          /* The countable seeding below reads these three; it used to fetch
             the same rows a second time to get them. */
          closenessScore: true, desiredCallFrequency: true, meaningfulMomentTypes: true,
        },
        /**
         * The person the Reveal names is `relationships[0]`, and this had no
         * order at all — so which one it was came back to whatever Postgres
         * happened to return. Two runs of the same onboarding named different
         * people. `priorityScore` was already being selected and never read;
         * ordering by it makes the headline the person they said mattered
         * most, with creation order as the tie-break so it is at least stable.
         */
        orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.goal.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, domainType: true },
      }),
    ]);
    const get = (section: string, key: string) =>
      answers.find((a) => a.section === section && a.key === key)?.value as any;

    // 1. Domain ranks + flags
    //
    // Matching was exact-string against the canonical slugs, so a caller
    // saying "finances" or "friendships" — perfectly reasonable names for the
    // same domains — had those ranks silently dropped: the reveal echoed the
    // list back while the rows underneath kept priorityRank NULL. Normalise
    // the common variants; a name that still doesn't resolve is skipped, but
    // it no longer takes its neighbours' semantics down with it.
    const ranked: string[] = normalizeDomains(get('values', 'priorityRanking'));
    const neglected: string[] = normalizeDomains(get('values', 'neglectedDomains'));
    const regrets: string[] = normalizeDomains(get('values', 'regretRisks'));

    /**
     * What the twelve rows are about to become, computed rather than read back.
     *
     * The old code wrote the updates, then fetched the same rows again to hand
     * them to the Reveal — a round trip to learn a value it had just chosen.
     * These are the exact objects the writes below persist, so the screen and
     * the database cannot disagree about them.
     */
    const domains = currentDomains.map((domain) => {
      const rank = ranked.indexOf(domain.domainType);
      return {
        ...domain,
        priorityRank: rank >= 0 ? rank + 1 : null,
        flaggedAsNeglected: neglected.includes(domain.domainType),
        regretRiskFlagged: regrets.includes(domain.domainType),
      };
    });
    const top3 = ranked.slice(0, 3);

    // Personalized deterministic fallback: their #1 domain, their self-rated
    // reality, the thing they keep postponing, the person they named, and
    // how they said they want to feel — their own onboarding, played back.
    const currentReality = (get('values', 'currentReality') ?? {}) as Record<string, number>;
    const postponing = String(get('reflection', 'postponing') ?? '').trim();
    const feeling = String(get('values', 'firstWeekFeeling') ?? '').trim();
    /**
     * The person for the plan is the one they are missing, not the one they
     * are with.
     *
     * `relationships[0]` alone is ranked by closeness, and closeness is the
     * wrong axis: a full-time carer's closest person is the mother she is
     * with every waking hour and said she does NOT want more time with — and
     * the reveal answered "Fifteen minutes with Halima this week", while
     * Mona, marked wantsMoreTime and slipping from monthly toward never, went
     * unmentioned. `wantsMoreTime` is the field that literally says who is
     * being postponed, so it decides; closeness only orders within it.
     */
    const focusPerson = relationships.find((r) => r.wantsMoreTime) ?? relationships[0];
    const person = focusPerson?.name;
    /* The goal written from their postponing answer already carries a domain
       they chose. Reading it back is more honest than guessing one from the
       sentence, and it is what the mission should be filed under. */
    const postponingGoalDomain = postponingGoal?.domainType ?? null;
    const topDomain = top3[0] ?? 'family';
    const topReality = currentReality[topDomain];

    /**
     * The opening line has to match the number it quotes.
     *
     * It used to say "that distance is the whole story" for every score,
     * so someone who rated their top domain 5/5 was told their perfect
     * score was a distance — two lines above a drift warning naming the
     * same domain. A 5 is not a gap, and saying so is how the reader
     * learns the app is reading their answers rather than reciting.
     */
    const narrativeParts: string[] = [];
    narrativeParts.push(
      typeof topReality !== 'number'
        ? `You put ${topDomain} first. Priority's job is to make your weeks agree with that.`
        : topReality <= 2
          ? `You put ${topDomain} first — and rated yourself ${topReality}/5 on actually living it. That distance is the whole story, and it's closable.`
          : topReality >= 4
            ? `You put ${topDomain} first, and you are already living it ${topReality}/5. That is worth protecting rather than fixing — the work is holding it there while the rest catches up.`
            : `You put ${topDomain} first and rated it ${topReality}/5 — the honest middle, where most weeks sit. Priority's job is to move it.`,
    );
    if (postponing && namesAThing(postponing)) {
      narrativeParts.push(`You told us what keeps sliding: "${this.quoteFragment(postponing, 70)}". Not someday — this week, one small step.`);
    } else if (postponing) {
      /* They answered "everything". Quoting that back with "one small step"
         attached reads as the app not having heard them. Overwhelm is met by
         narrowing, and narrowing is literally what this product does. */
      narrativeParts.push('You said it feels like everything at once. That is exactly what Priority is for — it picks the one small thing, so you never have to choose from the whole pile.');
    }
    if (person) {
      narrativeParts.push(`And ${person} is in this plan by name.`);
    }
    if (feeling) {
      narrativeParts.push(`Seven days from now, you said you want to feel ${feeling}. That's the finish line we're building toward.`);
    }

    // The 10x moment: extract values from the future-self + eulogy words.
    // Deterministic fallback keeps it meaningful with AI off; lights up fully
    // the instant AI_ENABLED=true with a key.
    const futureSelf = get('reflection', 'futureSelf');
    const eulogy = get('reflection', 'eulogy');
    /**
     * Started here, awaited alongside the Reveal.
     *
     * Two independent model calls that were made one after the other, so their
     * waits added up inside a request somebody is watching a spinner for.
     * Nothing in the Reveal reads what this produces — they only meet in the
     * response object — so they run together and cost the longer of the two
     * instead of the sum. Both are bounded by `ONBOARDING_AI_BUDGET_MS`; a
     * model that misses it leaves the engine's version on screen.
     */
    let extractedValues: Promise<{ values: string[]; reflection: string }> | null = null;
    if (futureSelf || eulogy) {
      // Fallback mirrors a fragment of THEIR words back — the difference
      // between "an app" and "it heard me", even with the LLM off.
      const fragment = this.quoteFragment(String(eulogy || futureSelf || ''), 90);
      extractedValues = this.ai.generate(
        userId,
        'values_extraction',
        VALUES_EXTRACTION,
        { futureSelf, eulogy },
        {
          values: ranked.slice(0, 5),
          reflection: fragment
            ? `"${fragment}" — hold onto that. Everything Priority asks of you is in service of that person.`
            : 'You described a life measured in people and presence, not achievements. That is what Priority will help you protect.',
        },
        { timeoutMs: ONBOARDING_AI_BUDGET_MS },
      );
    }

    /**
     * Everything this method writes, written at once — and underneath the
     * model calls rather than in front of them.
     *
     * Twelve domain updates, the countable seeding and the flag that ends
     * onboarding are independent of each other and of the narrative above, so
     * they are one round trip that costs nothing: it finishes long before the
     * model does. The reader waits for the slower of the two, not the sum.
     *
     * Seeding is inside the batch rather than deferred because it is the one
     * piece here with a contract somebody can observe — completing onboarding
     * twice must not seed a second copy of the same ritual, and there is a
     * test that rightly asserts the caller can know it is done when the call
     * returns. Its failures are caught: a ritual that did not get written is
     * not worth failing a sign-up over.
     */
    const written = Promise.all([
      Promise.all(domains.map((d) => this.prisma.lifeDomain.update({
        where: { id: d.id },
        data: {
          priorityRank: d.priorityRank,
          flaggedAsNeglected: d.flaggedAsNeglected,
          regretRiskFlagged: d.regretRiskFlagged,
        },
      }))),
      this.prisma.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      }),
      this.seedCountablesFromTheirWords(userId, relationships, answers)
        .catch((err) => this.logger.error(`seedCountables failed for ${userId}`, err as Error)),
    ]);

    const revealing = this.ai.generate(
      userId,
      'life_reveal',
      LIFE_REVEAL,
      { domains, relationships, ranked, neglected, regrets, postponing, feeling },
      {
        headline: person ? `A plan with ${person} in it` : 'What you said, next to what you do',
        narrative: narrativeParts.join(' '),
        topPriorities: top3,
        // "You flagged X" described a screen that no longer exists: drift is
        // derived from the 1-5 scores now, so the warning quotes the number
        // they actually gave. A domain they named without ranking has no
        // score to quote, and is described as what it was — named.
        driftWarning: neglected.length
          ? typeof currentReality[neglected[0]] === 'number'
            ? `You rated ${neglected[0]} ${currentReality[neglected[0]]}/5 — that's the gap that compounds quietly. It gets first attention.`
            : `You named ${neglected[0]} as slipping — that's the gap that compounds quietly. It gets first attention.`
          /**
           * Day one has no drift DATA — which is not the same as no drift.
           * The old fallback ("nothing is drifting — rare, and worth
           * protecting") congratulated a person the app had never watched,
           * two lines under bars showing say-90/do-0, and it said the same
           * thing to someone who had answered nothing at all.
           */
          : 'Drift shows up in how real weeks get spent, and Priority has not watched one of yours yet. A few ordinary days will show where it lives.',
        firstWeekFocus: this.firstWeekOptions({
          top3,
          person,
          personDomain: focusPerson
            ? domainForRelationType(focusPerson.relationType)
            : null,
          personId: focusPerson?.id ?? null,
          personAge: focusPerson?.age ?? null,
          personLocation: focusPerson?.locationType ?? null,
          personRelation: focusPerson?.relationType ?? null,
          postponing,
          postponingDomain: postponingGoalDomain,
          postponingGoalId: postponingGoal?.id ?? null,
          neglected,
          currentReality,
        }),
      },
      { timeoutMs: ONBOARDING_AI_BUDGET_MS },
    );

    /* The account is finished when the writes land; the narrative is what the
       reader is actually waiting to read. */
    const [reveal] = await Promise.all([revealing, written]);

    /**
     * The enrichment, started only now.
     *
     * These were already understood to be enrichment — insight generation once
     * threw on one unusable number and the exception propagated out of this
     * method, so `onboardingCompleted` was never set and the account was
     * stranded on the last screen of sign-up with no way forward. Both are
     * wrapped so a failure cannot strand anybody, and neither is awaited: on
     * production they make roughly eighteen round trips in order, for numbers
     * the Reveal does not read. `recalcUserDomains` on a brand-new account
     * reads missions, habits and journal entries that do not exist yet and
     * computes attention scores of zero.
     *
     * What is new is *when*. They used to start before the ranks were written,
     * so `recalcUserDomains` could read a set of domains that still had no
     * priority at all and persist scores computed from it. Chaining them
     * behind `written` costs the reader nothing — the response has already
     * gone — and means they see the account as the reader left it.
     *
     * Render runs a persistent process, so a promise left running after the
     * response survives to finish. Errors are logged and go nowhere near the
     * reader.
     */
    const enrich = (name: string, run: () => Promise<unknown>) => {
      void Promise.resolve()
        .then(run)
        .catch((err) => this.logger.error(`${name} failed for ${userId}`, err as Error));
    };
    enrich('recalcUserDomains', () => this.scoring.recalcUserDomains(userId));
    enrich('regenerateForUser', () => this.insights.regenerateForUser(userId));
    /* Telemetry is not something a reader waits on. It was the last round trip
       in the request and its result is read by nobody. */
    enrich('onboarding_completed event', () => this.analytics.track(userId, 'onboarding_completed', {
      rankedCount: ranked.length,
      hasEulogy: !!eulogy,
    }));

    /**
     * Write this person's catalog, and do not wait for it.
     *
     * The Reveal is the one moment the app knows the most it will ever know
     * before it has watched a single week, so it is the right time to ask.
     * It is also a screen somebody is sitting in front of, and a blueprint
     * asks for two dozen candidates — far too slow to hold a screen open for.
     *
     * So it runs behind the response. The Time tab reads the catalogs on its
     * own next fetch and will show built-ins until this lands, which is the
     * correct behaviour for a person whose generation is slow, has failed, or
     * was rejected outright.
     *
     * Started inside a resolved promise rather than called directly, so that
     * a synchronous throw is caught too. `refresh` handles its own failures,
     * but the point of this line is that NOTHING about a blueprint can cost
     * somebody their Reveal — and a `.catch()` on a call that throws before
     * returning a promise would not have held that.
     */
    void Promise.resolve()
      .then(() => this.blueprint.refresh(userId))
      .catch(() => undefined);

    return {
      onboardingCompleted: true,
      reveal: extractedValues ? { ...reveal, extractedValues: await extractedValues } : reveal,
    };
  }
}
