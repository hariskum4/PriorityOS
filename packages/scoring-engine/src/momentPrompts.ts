/**
 * The questions a particular moment deserves, and never one it has already
 * been answered.
 *
 * ## What this is for
 *
 * "Back to this moment" asked everybody the same four things. A fixed
 * question is a form field, and a form field is what people stop filling in.
 * Worse, it can be redundant: a moment whose account already reads *"Forty
 * minutes. We talked about her sister, then about nothing."* was still being
 * asked, in the very next box, *"What did you and Divya actually talk
 * about?"* — the app asking for something it had been given, one line up.
 *
 * ## Why probing facets is the right shape, and not just tidier
 *
 * Conway and Pleydell-Pearce's self-memory system holds autobiographical
 * knowledge at three levels: lifetime periods, general events, and
 * event-specific knowledge — the perceptual, sensory layer. A title and a
 * paragraph capture the top two. The bottom one is what makes a memory feel
 * like being there rather than knowing about, and it is the layer that goes
 * first. Nobody volunteers it into an empty box; it comes out when something
 * asks for it.
 *
 * What asks for it well is already known. The cognitive interview's context
 * reinstatement raises accurate recall across seven separable categories —
 * who, what was said, what was done, where, when, how, why — and Madore and
 * Schacter's episodic specificity induction shows that a few minutes of
 * exactly this kind of structured probing selectively increases *internal*
 * (episodic) detail, with the effect carrying beyond the task into imagining
 * the future and solving problems.
 *
 * Two consequences, and both are the whole design:
 *
 *   **Probing a facet twice is a wasted probe.** That is the bug above.
 *   **Leaving one unprobed loses the detail nobody volunteers.** That is the
 *   bug underneath it, and it was costing more.
 *
 * So every question below is tagged with the facet it opens, everything the
 * person has already written is scanned for which facets are taken, and each
 * slot asks for ground that is still empty.
 *
 * ## The line this file will not cross
 *
 * The app writes the question. The person writes the answer.
 *
 * That was inherited from `journalVoice` as a matter of taste, and the
 * memory literature turns out to make it a safety rule. Retrieving an
 * autobiographical memory returns it to a labile state in which it can be
 * rewritten; Loftus's misinformation work is fifty years of evidence that
 * details supplied around a retrieval get absorbed and later reported as
 * one's own, and imagination inflation shows that merely picturing a
 * suggested detail raises confidence it happened. A box pre-filled with a
 * plausible sentence about somebody's evening with their mother is not a
 * convenience. It is a suggestion delivered at the exact moment the memory
 * is open for editing.
 *
 * A question cannot do that. It supplies no content to absorb — which is why
 * personalising the ask is safe and personalising the answer is not, and why
 * none of the strings below contain a fact about anybody.
 *
 * Note how narrow the escape hatch is: a question is one word away from a
 * suggestion. *What did she say?* is a question. *What did she say that
 * surprised you?* has already decided that something did.
 */

import { stablePick } from './journalVoice';

/** The kinds the archive stores. Anything else falls to the plain wording. */
export type MomentKind =
  | 'relationship' | 'experience' | 'achievement' | 'reflection' | 'gratitude' | 'moment';

/**
 * The separable things a question can ask for.
 *
 * Six of the cognitive interview's seven categories, plus `open` for the
 * questions that ask for something which cannot already be on the page —
 * what you would want somebody to know, what you want to keep. Those can
 * never be crossed off, which is what makes them the safe end of every
 * chain: there is always a question left to ask.
 */
export type Facet = 'said' | 'did' | 'where' | 'when' | 'who' | 'sensory' | 'why' | 'open';

/** A question, and the ground it opens. */
interface Ask {
  q: string;
  facet: Facet;
  /** Three or four words for the disclosure link, where one names this box. */
  label?: string;
}

export interface MomentContext {
  /** The moment's own title — the line the person wrote at the top. */
  title: string;
  /** What kind of thing they filed it as. */
  memoryType?: string | null;
  /**
   * The one person it was with.
   *
   * Only when there is exactly one. A gathering gets "you all" — naming one
   * of four people would be the app deciding whose evening it was.
   */
  personName?: string | null;
  /** How many people were there at all, so a crowd reads as a crowd. */
  peopleCount?: number | null;
  /**
   * Whole days between the moment and now.
   *
   * Null when it is not known, which is treated as recent — the cautious
   * direction, since asking "what has stayed with you since?" about this
   * afternoon is the app pretending time has passed.
   */
  daysAgo?: number | null;
  /**
   * What is already on the page.
   *
   * The account, the talk and the keepsake, in whatever state they are in.
   * This is the input that stops the form asking for what it has been given.
   */
  written?: {
    reflection?: string | null;
    conversation?: string | null;
    keepsake?: string | null;
  } | null;
  /**
   * True while `written` is a box being typed into rather than a saved
   * record. Only the composer sets it, and it buys the questions below a few
   * characters of hysteresis so they settle once instead of flickering on
   * the keystroke that completes a marker word.
   */
  composing?: boolean;
}

export interface MomentPrompts {
  /** The open question at the top of the form, in amber. */
  insight: string;
  /** Placeholder over the account of what happened. */
  reflection: string;
  /** Placeholder over the middle beat — the facet probe. */
  conversation: string;
  /** Placeholder over the part that stayed. */
  keepsake: string;
  /** The words on the link that opens the last two boxes in the composer. */
  disclosure: string;
  /**
   * Three or four words naming what the middle box is asking for.
   *
   * The archive's "Write more about this" says nothing about what is
   * missing, so every unfinished moment looks equally unfinished. Naming the
   * gap turns a generic link into a specific invitation, and it is the same
   * choice the box itself made, so the two cannot disagree.
   */
  probeLabel: string;
  /**
   * A line for an account that has stayed general, and null the rest of the
   * time — which is most of the time.
   *
   * Overgeneral memory (Williams) is a maintaining factor in depression, and
   * memory specificity training — practising the retrieval of one concrete
   * episode — reduces symptoms in controlled trials. A journal that accepts
   * "it was one of those ones" and never asks for the particular is
   * rehearsing the pattern the training exists to break.
   *
   * Shown only when somebody has written something and it names nothing:
   * no place, no words spoken, nothing seen or done. A blank moment gets
   * silence, because nagging an empty box is not an intervention.
   */
  specificity: string | null;
}

/* ------------------------------------------------------------------ facets */

/**
 * How each facet reads when somebody has already written it down.
 *
 * Tuned deliberately loose. The two errors are not symmetric: a false
 * positive costs a different good question, and a false negative costs the
 * app asking for something it was handed one line up — which is the failure
 * that made this file. So these lean toward saying "covered".
 *
 * Whole words throughout, and no attempt at grammar. A regex cannot tell
 * whether a conversation was described well; it can tell that the person
 * reached for the vocabulary of one, and that is the entire question being
 * asked here.
 */
const MARKERS: Record<Exclude<Facet, 'open'>, RegExp> = {
  said: /\b(talk|talks|talked|talking|spoke|spoken|speaking|said|says|saying|tell|tells|told|telling|ask|asks|asked|asking|mention|mentions|mentioned|discuss|discussed|discussing|conversation|chat|chats|chatted|argue|argued|argument|admitted|explained|confessed|joked|apologised|apologized|promised|caught up)\b/i,
  did: /\b(cooked|cooking|drove|driving|walked|walking|ran|running|built|building|made|making|carried|cleaned|packed|played|playing|danced|sang|singing|worked|working|fixed|fixing|wrote|writing|read|watched|watching|ate|eating|drank|sat|sitting|stood|standing|helped|helping|rode|riding|swam|climbed|cycled|baked|planted)\b/i,
  where: /\b(kitchen|bedroom|room|house|home|flat|office|desk|car|street|road|beach|park|garden|terrace|balcony|rooftop|restaurant|cafe|café|bar|table|hospital|clinic|station|airport|platform|temple|church|mosque|school|gym|shop|market|outside|upstairs|downstairs|hotel|village|at (his|her|their|my|our) place|on the (way|train|bus|road))\b/i,
  when: /\b(finally|at last|first time|last time|after (months|weeks|years|days|hours|so long)|it had been|overdue|kept meaning|been meaning|put(ting)? (it|this|that) off|morning|afternoon|evening|midnight|dawn|dusk|o'?clock|birthday|anniversary|new year)\b/i,
  who: /\b(everyone|everybody|the others|the rest of|we all|the whole (family|lot|house)|(his|her|their|my|our) (sister|brother|mother|father|mum|mom|dad|son|daughter|husband|wife|friend|cousin|uncle|aunt|neighbour|neighbor|boss|team))\b/i,
  sensory: /\b(saw|seen|seeing|looked|looking|looks|sounded|sound|sounds|heard|hearing|smell|smelled|smelt|tasted|touch|quiet|silent|loud|noisy|dark|bright|warm|cold|rain|raining|sun|sunny|face|faces|smile|smiled|smiling|laugh|laughed|laughing|cried|crying|tears|colou?r|light|shadow)\b/i,
  /**
   * Causal and insight language — Pennebaker's markers, near enough.
   *
   * Bare "why" is deliberately absent. A title like *"Why I keep moving the
   * checkup"* poses the question and does not answer it, and reading it as
   * meaning already made cost that moment the one probe that fitted it. The
   * word only counts behind a verb of understanding, where it reports an
   * answer rather than asks for one.
   */
  why: /\b(because|realis(e|ed|es|ing)|realiz(e|ed|es|ing)|change[ds]?|changing|made me|makes me|making me|since then|meant|understood|learnt|learned|taught me|reminded me|the reason|figured out|(know|knew|understand|understood|see|saw|realised|realized)\s+why)\b/i,
};

/**
 * Which facets the person has already written about.
 *
 * Everything on the moment counts, the title included — "Told Amma about the
 * job" has said what was said, and it does not stop counting because it is
 * short.
 *
 * The length floor is the one piece of hysteresis in here. In the composer
 * this runs against a box somebody is mid-sentence in, and without a floor
 * the question below would flip the instant the word "talked" completed and
 * flip back on a backspace. Twelve characters is roughly where a fragment
 * becomes a clause.
 */
export function facetsCovered(
  texts: Array<string | null | undefined>,
  /**
   * Ignore fragments shorter than this. Zero for anything already saved.
   *
   * The floor is typing hysteresis and nothing else, and applying it to
   * stored text meant a short but complete answer counted for nothing: a
   * saved conversation of "He said no" is ten characters, so `said` never
   * registered and the form asked what was talked about all over again — the
   * exact duplication this module exists to prevent, on words the person had
   * already given it. Only the composer, which runs this against a box
   * somebody is mid-sentence in, passes a floor.
   */
  minLength = 0,
): Set<Facet> {
  const covered = new Set<Facet>();
  const body = texts
    .map((t) => (t ?? '').trim())
    .filter((t) => t.length >= minLength)
    .join(' — ');
  if (!body) return covered;
  for (const [facet, re] of Object.entries(MARKERS)) {
    if (re.test(body)) covered.add(facet as Facet);
  }
  return covered;
}

/**
 * The first question in the chain whose ground is still empty.
 *
 * Stable within the surviving candidates rather than across the whole pool:
 * the seed decides which of the *available* questions gets asked, so the
 * same moment is asked the same thing every time it is opened — the property
 * that stops a question feeling generated — while a moment that has since
 * been written about moves on to a question it has not answered.
 *
 * Every chain ends in an `open` question, so this cannot return nothing.
 */
function choose(pool: Ask[], seed: string, covered: Set<Facet>): Ask {
  const free = pool.filter((a) => !covered.has(a.facet));
  return stablePick(free.length ? free : pool.filter((a) => a.facet === 'open'), seed)
    ?? pool[pool.length - 1];
}

/* --------------------------------------------------------------- the pools */

/**
 * The question at the top, per kind of moment.
 *
 * Three each. The meaning-shaped ones are tagged `why` and step aside when
 * the person has already done that work themselves — asking "what did that
 * change?" of somebody who has just written two sentences about what it
 * changed is the same insult as asking what they talked about.
 *
 * At least one in every pool is `open`, and those are the ones that ask for
 * something which cannot be on the page: what you would want them to know,
 * what the version of you who started would say. Nothing already written can
 * cross those off, which is what makes them the floor.
 *
 * `%s` is the person, and appears only in pools reached when there is one.
 */
const INSIGHT_WITH_PERSON: Record<string, Ask[]> = {
  default: [
    { q: 'What did that change between you and %s?', facet: 'why' },
    { q: 'Why did that turn out to be the day for %s?', facet: 'when' },
    { q: 'What would you say to %s about it now?', facet: 'open' },
  ],
  achievement: [
    /* Not "what did %s see that day" — the middle box's sensory probe is
       "What do you still see when you picture it?", and two questions built
       on the same verb read as one question asked twice however different
       their facets are on paper. */
    { q: 'What would %s say it took?', facet: 'who' },
    { q: 'What did getting there cost you?', facet: 'did' },
    { q: 'What would you say to %s about it now?', facet: 'open' },
  ],
  gratitude: [
    { q: 'What would %s be surprised to hear you say?', facet: 'open' },
    { q: 'What did %s do that you have not thanked them for?', facet: 'did' },
    { q: 'What did that change between you and %s?', facet: 'why' },
  ],
};

const INSIGHT_ALONE: Record<string, Ask[]> = {
  default: [
    { q: 'What did that change?', facet: 'why' },
    { q: 'What made that the day for it?', facet: 'when' },
    { q: 'What would you tell yourself a year ago about it?', facet: 'open' },
  ],
  achievement: [
    { q: 'What did that take that nobody saw?', facet: 'did' },
    { q: 'What did you learn on the way to it?', facet: 'why' },
    { q: 'What would the version of you who started say?', facet: 'open' },
  ],
  experience: [
    { q: 'What did that change about how you see it?', facet: 'why' },
    { q: 'What would you tell someone who was not there?', facet: 'open' },
    { q: 'What would you go back for?', facet: 'open' },
  ],
  reflection: [
    /* Causal rather than temporal, despite the "when": this asks what
       brought the thought on, which is the same ground as the middle box's
       "What set the thought off?" — and the two must not both be spent. */
    { q: 'What made the thought arrive when it did?', facet: 'why' },
    { q: 'What follows from it, if it is true?', facet: 'open' },
    { q: 'What would have to change for you to act on it?', facet: 'open' },
  ],
  gratitude: [
    { q: 'What would be missing without it?', facet: 'open' },
    { q: 'Why does this one register and others do not?', facet: 'open' },
    { q: 'What did that change?', facet: 'why' },
  ],
};

/**
 * The account, shaped by what kind of thing is being recounted.
 *
 * Not a question, because this box sits directly under the title and the
 * title has already asked what happened. It says which longer version is
 * wanted — the failure it replaces is two boxes asking the same thing, which
 * is how somebody types their whole evening into the one-line name.
 */
const ACCOUNT: Record<string, string> = {
  default: 'The longer version — how it actually went',
  achievement: 'The longer version — how you actually got there',
  experience: 'The longer version — what it was actually like',
  reflection: 'The longer version — where the thought actually came from',
  gratitude: 'The longer version — what actually happened',
};

/**
 * The middle box: the facet probe, and the slot the whole file turns on.
 *
 * Ordered by yield rather than by taste. With somebody there, what was said
 * is the richest thing a person can still recover and the first thing they
 * lose, so it leads. When it is already written down the chain falls through
 * to the event-specific layer — where you were, what you can still see —
 * which is the part of a memory that decays fastest and the part no empty
 * box has ever been given.
 *
 * The last entry in every chain is `open`, and is a question no amount of
 * writing can answer in advance.
 */
const MIDDLE_WITH_PERSON: Ask[] = [
  { q: 'What did you and %s actually talk about?', facet: 'said', label: 'what you talked about' },
  { q: 'What did you notice about %s?', facet: 'who', label: 'what you noticed' },
  { q: 'Where were you both?', facet: 'where', label: 'where you were' },
  { q: 'What do you see when you picture it?', facet: 'sensory', label: 'what you see' },
  { q: 'What was the part you did not expect?', facet: 'open', label: 'the part you did not expect' },
];

const MIDDLE_WITH_CROWD: Ask[] = [
  { q: 'What did you all actually talk about?', facet: 'said', label: 'what you talked about' },
  { q: 'Who did you end up spending most of it with?', facet: 'who', label: 'who you spent it with' },
  { q: 'Where was everybody?', facet: 'where', label: 'where everybody was' },
  { q: 'What do you see when you picture it?', facet: 'sensory', label: 'what you see' },
  { q: 'What was the part you did not expect?', facet: 'open', label: 'the part you did not expect' },
];

/** Alone: the kind-specific probe first, then the same fall-through. */
const MIDDLE_ALONE_TAIL: Ask[] = [
  { q: 'Where were you?', facet: 'where', label: 'where you were' },
  { q: 'What do you see when you picture it?', facet: 'sensory', label: 'what you see' },
  { q: 'What was the part you did not expect?', facet: 'open', label: 'the part you did not expect' },
];

const MIDDLE_ALONE_HEAD: Record<string, Ask[]> = {
  default: [],
  achievement: [{ q: 'What did it take to get there?', facet: 'did', label: 'what it took' }],
  experience: [{ q: 'What was going on around you?', facet: 'sensory', label: 'what was going on' }],
  reflection: [{ q: 'What set the thought off?', facet: 'why', label: 'what set it off' }],
  gratitude: [{ q: 'Who or what made it possible?', facet: 'who', label: 'who made it possible' }],
};

/**
 * Difficulty, in the person's own words — never inferred about their life.
 *
 * This does not change what the app says about a moment, and it must not:
 * "that sounds hard" is the app grading somebody's evening. It changes only
 * which question gets asked, and only for something a year old or more.
 *
 * McAdams found that narrators who locate meaning in difficulty report
 * higher well-being — a *descriptive* finding about people who arrive
 * there, and not a licence to ask anybody for a silver lining. A demanded
 * redemption is worse than none, so neither question in `HARD_AND_OLD`
 * presupposes that anything good came of it. They ask what the person knows
 * now. "Nothing" remains a complete and acceptable answer.
 */
const HARD = /\b(hard|hardest|difficult|awful|terrible|worst|painful|pain|hurt|cried|crying|tears|angry|anger|furious|scared|afraid|frightened|ashamed|shame|failed|failure|broke|broken|argued|argument|fight|fought|ill|illness|hospital|funeral|died|death|grief|grieving|lonely|exhausted|overwhelmed|guilty|regret|gave up|fell apart)\b/i;

/**
 * Asked only of something old enough to have been thought about since.
 *
 * The window matters. Reconsolidation makes a freshly retrieved memory
 * pliable, and asking somebody what they know now about something that
 * happened on Tuesday is asking them to conclude before they have had time
 * to. A year is late enough that the question meets a view they already
 * hold rather than manufacturing one.
 */
const HARD_AND_OLD: Ask[] = [
  { q: 'What do you know now that you did not then?', facet: 'open' },
  { q: 'What would you say to yourself back then?', facet: 'open' },
];

/** A year is the point where "want to remember" has already been decided. */
const LONG_AGO_DAYS = 365;
/** Far enough back that the feeling has had time to settle into something. */
const A_WHILE_DAYS = 30;

function kindOf(memoryType?: string | null): string {
  const k = (memoryType ?? '').trim().toLowerCase();
  /* `relationship` and `moment` have no wording of their own — the person,
     not the label, is what makes those two specific. */
  return k === 'relationship' || k === 'moment' ? 'default' : k;
}

function pooled<T>(pools: Record<string, T>, kind: string): T {
  return pools[kind] ?? pools.default;
}

/**
 * Four questions and a link, for one moment.
 *
 * Pure, deterministic, and complete on its own — this is what the form shows
 * before any model has been asked anything, and what it keeps showing if the
 * answer never comes. A rewrite is an improvement on a good question, never
 * the difference between a question and an empty box.
 */
export function momentPrompts(ctx: MomentContext): MomentPrompts {
  const kind = kindOf(ctx.memoryType);
  const crowd = (ctx.peopleCount ?? 0) > 1;
  /* One name is a link; several is a gathering, and the row can only point
     at one — so a crowd drops the name rather than picking a favourite. */
  const person = crowd ? '' : (ctx.personName?.trim() || '');
  const seed = ctx.title ?? '';

  const prose = [ctx.written?.reflection, ctx.written?.conversation, ctx.written?.keepsake];
  const floor = ctx.composing ? 12 : 0;
  const covered = facetsCovered([ctx.title, ...prose], floor);
  const days = ctx.daysAgo ?? 0;

  const named = (s: string) => (person ? s.replace(/%s/g, person) : s);

  /**
   * A hard thing, a year later, gets a different question at the top.
   *
   * The pools ask what an evening changed or why it was the day for it.
   * Neither is the question worth asking about the week somebody's father
   * went into hospital, and "what did that change between you and Amma?"
   * over that is close to glib. This asks the only thing that is genuinely
   * open a year on, and asks nothing about whether it turned out fine.
   */
  const hard = HARD.test(prose.filter(Boolean).join(' — '));
  const insightAsk = hard && days >= LONG_AGO_DAYS
    ? stablePick(HARD_AND_OLD, seed)
    : choose(pooled(person ? INSIGHT_WITH_PERSON : INSIGHT_ALONE, kind), seed, covered);

  const account = pooled(ACCOUNT, kind);
  const reflection = person ? `${account} with ${person}` : account;

  let middlePool: Ask[];
  if (person) middlePool = MIDDLE_WITH_PERSON;
  else if (crowd) middlePool = MIDDLE_WITH_CROWD;
  else middlePool = [...pooled(MIDDLE_ALONE_HEAD, kind), ...MIDDLE_ALONE_TAIL];
  /**
   * The question at the top has just spent a facet, and the box below must
   * not spend it again.
   *
   * This is the reported bug in its other form. A solo achievement was asked
   * "What did that take that nobody saw?" and then, one box down, "What did
   * it take to get there?" — nothing was written yet, so no scan could catch
   * it. Two of the form's four slots on one facet is the same waste whether
   * the duplicate came from the page or from the form itself.
   *
   * `open` is exempt: it is the floor rather than a facet, and excluding it
   * would leave chains with nothing to fall back to.
   */
  const spent = insightAsk.facet === 'open' ? covered : new Set([...covered, insightAsk.facet]);
  /* Ordered, not seeded: this chain is a priority list, and the first
     untaken facet is the answer. Seeding it would trade the reason the order
     exists for variety nobody asked for. */
  const middle = middlePool.find((a) => !spent.has(a.facet)) ?? middlePool[middlePool.length - 1];

  const keepsake = days >= LONG_AGO_DAYS
    ? 'What still stays with you about it?'
    : days >= A_WHILE_DAYS
      ? 'What has stayed with you since?'
      : 'What do you want to remember about it?';

  /**
   * Something written, and none of it particular.
   *
   * Measured over the prose alone, not over `covered`, which includes the
   * title. "A good evening" names a time of day and so counts as `when` for
   * choosing questions — reasonably, since the form should not then ask when
   * it was. It is not somebody having written a specific, and letting a
   * three-word title suppress the nudge put it out of reach of exactly the
   * accounts it exists for.
   */
  const written = prose.map((t) => (t ?? '').trim()).filter(Boolean).join(' ');
  const overgeneral = written.length >= 12 && facetsCovered(prose, floor).size === 0;

  const probeLabel = middle.label ?? 'the rest of it';
  return {
    insight: named(insightAsk.q),
    reflection,
    conversation: named(middle.q),
    keepsake,
    /* The link and the box it opens come from the same choice, so they
       cannot disagree — it used to promise a conversation to somebody who
       had spent the evening on their own. */
    disclosure: `${probeLabel}, what you want to remember`,
    probeLabel,
    specificity: overgeneral
      ? 'One specific — a thing said, a thing seen — is what you will still recognise in ten years.'
      : null,
  };
}

/**
 * A stored moment, as this module wants to see one.
 *
 * Loose about its input on purpose: `peoplePresent` is a Json column on the
 * server and a plain array on the client, `occurredAt` arrives as a Date from
 * Prisma and as a string over the wire, and the columns are all nullable.
 * Everything narrow happens here so no caller has to be careful.
 */
export interface StoredMoment {
  title: string;
  memoryType?: string | null;
  personName?: string | null;
  peoplePresent?: unknown;
  occurredAt?: Date | string | null;
  reflection?: string | null;
  conversation?: string | null;
  keepsake?: string | null;
}

/**
 * One mapping from a stored moment to a context, for every caller.
 *
 * There were two — one on the server for `/memories/:id/prompts`, one on the
 * client so the form could draw before that request came back. Two hand-rolled
 * copies of a rule that has to agree, and they did not: the server trimmed the
 * name and fell through an empty one with `||`, the client kept it with `??`.
 * A `personName` of a single space resolved to a person on one side and to
 * nobody on the other, so the form asked a question about somebody and then
 * silently swapped it for a solitary one when the response landed — the exact
 * flicker the surrounding code goes to some length to prevent.
 *
 * `now` is injectable so the day arithmetic can be tested without the clock.
 */
export function momentContextOf(m: StoredMoment, now: number = Date.now()): MomentContext {
  /* Only real names. A Json column can hold anything, and a blank string is
     not a guest. */
  const present = Array.isArray(m.peoplePresent)
    ? (m.peoplePresent as unknown[])
      .filter((n): n is string => typeof n === 'string' && !!n.trim())
      .map((n) => n.trim())
    : [];
  /* `||` rather than `??`: a name of "" or "   " is an absent name, not a
     present one, and must fall through to the guest list. */
  const named = m.personName?.trim() || (present.length === 1 ? present[0] : '') || '';
  const peopleCount = Math.max(present.length, named ? 1 : 0);

  /* Whole days, floored, never negative — a moment dated in the future is a
     typo, not a reason to ask what has stayed with them since. An absent date
     is today rather than NaN, which would silently fail every comparison. */
  const at = m.occurredAt ? new Date(m.occurredAt).getTime() : now;
  const daysAgo = Number.isFinite(at)
    ? Math.max(0, Math.floor((now - at) / 86_400_000))
    : 0;

  return {
    title: m.title,
    memoryType: m.memoryType,
    /* One name is a link; several is a gathering, and naming one of them
       would be the app deciding whose evening it was. */
    personName: peopleCount > 1 ? null : named || null,
    peopleCount,
    daysAgo,
    written: {
      reflection: m.reflection,
      conversation: m.conversation,
      keepsake: m.keepsake,
    },
  };
}

/**
 * How much of a moment is still missing, from 0 to 1.
 *
 * 0 is a moment written across every facet that applies to it; 1 is a title
 * and nothing else. Used to decide which of several moments is most worth
 * reopening, which is a different question from which is most important —
 * this measures the record, never the life.
 *
 * `said` and `who` only count against a moment somebody else was at. A
 * evening spent alone is not thin for having no dialogue in it, and scoring
 * it that way would make every solitary moment look like a gap.
 */
export function momentThinness(ctx: MomentContext): number {
  const withSomebody = !!ctx.personName?.trim() || (ctx.peopleCount ?? 0) > 0;
  const applicable: Facet[] = withSomebody
    ? ['said', 'did', 'where', 'when', 'who', 'sensory', 'why']
    : ['did', 'where', 'when', 'sensory', 'why'];
  const covered = facetsCovered([
    ctx.title, ctx.written?.reflection, ctx.written?.conversation, ctx.written?.keepsake,
  ], ctx.composing ? 12 : 0);
  const hit = applicable.filter((f) => covered.has(f)).length;
  return 1 - hit / applicable.length;
}

/**
 * Openers that end a question before it starts.
 *
 * A yes/no question gets a yes, and a yes is not writing. The engine never
 * produces one; this exists because a model asked to "warm up" a question
 * reaches for *Did you enjoy it?* with some regularity, and a rewrite that
 * closes the question has made the surface worse in the one way that matters.
 */
const CLOSED_OPENER = /^(did|was|were|is|are|do|does|have|has|had|can|could|would|will|should|shall|am)\b/i;

/**
 * "How did that feel?" — the question this whole surface is built to avoid.
 *
 * Not because feeling does not matter, but because naming one is a
 * one-adjective task that ends the writing. Pennebaker's trials found the
 * benefit tracked causal and insight language rather than emotion words: the
 * useful question pulls for a *because*. The engine asks for one; a rewrite
 * is not allowed to trade it for a mood.
 */
const FEELING_QUESTION = /\b(how (did|does|do) (that|it|this|you|they)\b.*\bfeel|feel about|how you felt|make you feel)\b/i;

/**
 * Whether a rewritten question may be shown in place of the engine's.
 *
 * Deliberately narrow: `safeRephrase` already guards the facts — invented
 * names, numbers, units, a dropped person. This guards the only thing left,
 * which is whether the sentence is still doing the job of a question. Both
 * checks have to pass, and either one failing shows the engine's wording,
 * which was never bad.
 */
export function isUsableQuestion(text: string | null | undefined): boolean {
  const clean = (text ?? '').trim();
  if (!clean) return false;
  if (!clean.endsWith('?')) return false;
  /* Two questions stacked in one box is an interrogation, not a prompt. */
  if ((clean.match(/\?/g) ?? []).length > 1) return false;
  if (clean.length > 90) return false;
  if (CLOSED_OPENER.test(clean)) return false;
  if (FEELING_QUESTION.test(clean)) return false;
  return true;
}

/**
 * Whether a rewrite is still asking the same *kind* of thing.
 *
 * Caught by running the real model rather than a fixture. The engine asked
 * "Where were you?" — a `where` probe, chosen because place was the one facet
 * still empty — and the model returned "Who else was there?". Both guards
 * passed: nothing was invented, and it is still an open question. But it is a
 * different question, and two things break behind it.
 *
 * The disclosure label comes from the engine's own choice and is never
 * model-edited, so the link promised "where you were" over a box asking who
 * else was there. And the facet the engine picked is the whole mechanism for
 * not repeating a question the person has already answered — a `where` probe
 * silently becoming a `who` probe can reintroduce exactly the duplication
 * this module exists to prevent.
 *
 * The interrogative is the cheapest honest test of "same question". A rewrite
 * may sharpen What into What; turning Where into Who is not an edit, it is a
 * substitution.
 */
export function sameInterrogative(original: string, rewritten: string): boolean {
  const wordOf = (q: string) => q.trim().toLowerCase().match(/^(what|where|who|why|when|how|which)\b/)?.[1] ?? null;
  const a = wordOf(original);
  /* An original that does not open with a question word constrains nothing —
     there is no interrogative to preserve. */
  if (!a) return true;
  return wordOf(rewritten) === a;
}

/**
 * The account line is the one of the four that is not a question.
 *
 * It sits inside a text box as guidance, so it must not grow into a sentence
 * somebody reads as content, and must not turn into a question either — that
 * would put three questions in a row above one box.
 */
export function isUsableAccountLine(text: string | null | undefined): boolean {
  const clean = (text ?? '').trim();
  if (!clean) return false;
  if (clean.includes('?')) return false;
  if (clean.length > 70) return false;
  return true;
}

/**
 * Scaffolding — the words a question is built out of rather than about.
 *
 * `want` and `would` are in here because they are doing modal work, not
 * carrying the ask: "What would you *want* them to know" and "What do you
 * *want* to remember" share a word and no subject. Everything outside this
 * list is treated as load-bearing, which is what makes the check below
 * strict enough to be worth running.
 */
const SCAFFOLD = new Set([
  'what', 'did', 'do', 'does', 'you', 'your', 'that', 'it', 'the', 'a', 'an', 'to', 'of', 'for',
  'in', 'on', 'and', 'is', 'was', 'were', 'be', 'been', 'about', 'with', 'would', 'will', 'want',
  'not', 'they', 'them', 'their', 'there', 'here', 'this', 'these', 'those', 'who', 'when',
  'where', 'why', 'how', 'i', 'me', 'my', 'we', 'us', 'from', 'at', 'by', 'as', 'if', 'or',
  'but', 'so', 'up', 'out', 'am', 'are', 'has', 'have', 'had', 'one', 'no', 'most', 'ever',
]);

/** The load-bearing words of a question, with the person's name removed. */
function askOf(question: string, personName?: string | null): Set<string> {
  const name = (personName ?? '').trim().toLowerCase();
  return new Set(
    question.toLowerCase()
      .replace(/[?.,'’]/g, '')
      .split(/\s+/)
      .filter((w) => w && !SCAFFOLD.has(w) && w !== name),
  );
}

/**
 * Whether two questions are asking a reader for the same thing.
 *
 * Facet tags are the engine's model of that, and they are not enough on
 * their own: *"What did that take that nobody saw?"* is tagged `did` and
 * *"What did it take to get there?"* is tagged `did`, which the tags catch —
 * but *"What did %s see that day?"* was tagged `who` against a `sensory`
 * probe of *"What do you still see when you picture it?"*, and those two
 * read as one question asked twice. So does *"Why has this one stayed with
 * you?"* over *"What has stayed with you since?"*, which is the same
 * question in the same words.
 *
 * A shared load-bearing word is a coarse test and the right one: a reader
 * does not perceive facets, they perceive being asked about seeing twice.
 * The person's name is excluded because a name is never the ask — two
 * questions about Amma are allowed to both say Amma.
 *
 * This exists to be asserted over the pools rather than called at runtime.
 * Dropping a question mid-render could empty a chain; catching an overlap
 * when it is added costs nothing and cannot fail in front of anybody.
 */
export function asksTheSameAs(a: string, b: string, personName?: string | null): boolean {
  const left = askOf(a, personName);
  for (const word of askOf(b, personName)) if (left.has(word)) return true;
  return false;
}
