/**
 * The judge — what a model is allowed to add to somebody's catalogs.
 *
 * Every AI path in this app so far has been the same shape: the engine decides
 * everything that could be got wrong, issues a slot, and the model rewrites two
 * strings inside it. That is a safe contract and it has a ceiling. "An hour a
 * week on what comes next" is right for everybody and specific to nobody, and
 * no amount of rewording turns 36 rhythms into a catalog that knows this
 * particular person cycles to work, is studying for a certification, and has
 * written three times about missing the long walks.
 *
 * So this inverts the contract. The model proposes whole candidates in engine
 * shape; this decides which of them are allowed to exist. Generation is cheap
 * and unreliable, judgement is the part that has to be right, and the judgement
 * is here: pure, offline, deterministic, and tested against the failures it
 * exists to stop.
 *
 * **Nothing here ranks anything.** A survivor joins the pool and is then sorted
 * by exactly the same deterministic scoring as a built-in. The house rule holds
 * — the LLM narrates, it never computes scores — and this file is the thing
 * that keeps a generated item from smuggling a score in as a suggestion.
 *
 * **Rejection is the normal case.** The prompt over-generates on purpose,
 * because a judge that has to accept what it is given is not a judge. An empty
 * verdict is a completely acceptable outcome: the built-in catalogs are still
 * there, they still work, and a person whose generation was rubbish sees
 * exactly what they saw before this file existed.
 *
 * What the rules below encode is not taste. Each one is a failure this codebase
 * has already had, or a promise made in a prompt that nothing enforced:
 * a homemaker told to reclaim a commute she does not make, a card whose title
 * lost its noun, a cadence nobody agreed to, and the tone rules in
 * `@priority/ai-prompts` — no death, no guilt, no exclamation marks — which
 * have until now been instructions to a model rather than properties of the
 * output.
 */

import type { LifeShape } from './lifeShape';
import { rhythmDomains, rhythmsFor, type Rhythm, type TimeOfDay } from './rhythms';
import { stackActions, type PersonRole, type Stack } from './timeStacking';
import type { Setting } from './setting';
import { detectCrisisLanguage } from './safety';

/**
 * The domains a generated item may claim.
 *
 * Taken from the engine's own catalog rather than from `@priority/types`,
 * which this package deliberately does not depend on — every other module here
 * treats a domain as a plain string. It also keeps the judge honest by
 * construction: a domain the catalog has never heard of is one nothing
 * downstream could colour, sort or file, so accepting it would produce an item
 * with nowhere to appear.
 */
const KNOWN_DOMAINS: string[] = rhythmDomains();

/** Every title the catalog ships, so a generation cannot restate one. */
function builtInRhythmTitles(): string[] {
  return KNOWN_DOMAINS.flatMap((d) => rhythmsFor(d).map((r) => r.title));
}

/* -------------------------------------------------------------------------
   What a model may hand back
   ---------------------------------------------------------------------- */

/**
 * Deliberately all-optional and all-unknown.
 *
 * This is parsed JSON from a free-tier model, not a typed value. Declaring it
 * with the fields it *should* have would let a `candidate.title.trim()` past
 * the compiler and into a crash on the one response that omitted it.
 */
export interface RhythmCandidate {
  key?: unknown;
  title?: unknown;
  domain?: unknown;
  perWeek?: unknown;
  minutes?: unknown;
  because?: unknown;
  when?: unknown;
  needs?: unknown;
  prefersWeekend?: unknown;
}

export interface StackCandidate {
  key?: unknown;
  action?: unknown;
  domains?: unknown;
  framing?: unknown;
  hosts?: unknown;
  setting?: unknown;
  needs?: unknown;
  role?: unknown;
}

/** A rhythm that came from a generation rather than the catalog. */
export interface PersonalRhythm extends Rhythm {
  domainType: string;
}

/** A stack that came from a generation. Same shape the catalog produces. */
export interface PersonalStack extends Stack {}

/**
 * Why something was thrown away.
 *
 * A closed set rather than free text, for two reasons. It can be counted —
 * "the model failed the person check 40% of the time" is a fact worth having
 * — and it holds no user content, so a rejection can be logged where the
 * candidate itself cannot.
 */
export type RejectionReason =
  | 'schema'
  | 'domain'
  | 'cadence'
  | 'duration'
  | 'too-long'
  | 'dangling'
  | 'errand'
  | 'invented-person'
  | 'not-this-life'
  | 'tone'
  | 'unsafe'
  /* Proposed something the literature has looked for and not found — see
     NO_EVIDENCE. Distinct from 'unsafe': this is not dangerous, it is just
     not true, and a catalog that prints grades cannot also print this. */
  | 'no-evidence'
  | 'duplicate';

export interface Rejection {
  /** The candidate's own key, or `?` when it did not supply a usable one. */
  key: string;
  reason: RejectionReason;
}

export interface BlueprintContext {
  /** What this life actually contains. Gates commutes, inboxes, desks. */
  shape: LifeShape;
  /**
   * Every name this person has recorded. The ONLY names that may appear.
   *
   * Not a courtesy. An invented person is the single failure that ends a
   * reader's trust in "it heard me", and it cannot be recovered from by a
   * later correct suggestion.
   */
  knownNames?: string[];
  /** Roles actually present, so a stack cannot invent a child. */
  roles?: PersonRole[];
  /**
   * Titles the person already holds, retired ones included.
   *
   * Same rule the catalog follows: something deliberately ended must not come
   * back with a new key on it. That would be the one honest rule in `rhythms.ts`
   * defeated by the layer that was supposed to enrich it.
   */
  takenTitles?: string[];
}

export interface BlueprintVerdict {
  rhythms: PersonalRhythm[];
  stacks: PersonalStack[];
  rejected: Rejection[];
}

/* -------------------------------------------------------------------------
   Bounds
   ---------------------------------------------------------------------- */

/** Matches `rhythms.service.ts`, which matches the prompt's own contract. */
const MAX_TITLE = 42;
const MAX_BECAUSE = 100;
const MAX_ACTION = 70;
const MAX_FRAMING = 90;

/**
 * A habit's target is an integer per week, so a rhythm's cadence is too.
 *
 * The ceiling is the real constraint. A model asked for "a standing
 * commitment" will happily return `perWeek: 14`, and the reader would have
 * agreed to twice a day by reading the word "daily" once. Seven is the most a
 * week can honestly hold.
 */
const MIN_PER_WEEK = 1;
const MAX_PER_WEEK = 7;

/** Under five minutes is not a rhythm; over four hours is not weekly. */
const MIN_MINUTES = 5;
const MAX_MINUTES = 240;

/** How many of each kind may survive one generation. */
const MAX_RHYTHMS = 12;
const MAX_STACKS = 12;

const SETTING_KEYS: Array<keyof Setting> = [
  'canSpeakFreely', 'canMove', 'hasScreen', 'isPrivate',
];
const SHAPE_KEYS: Array<keyof LifeShape> = [
  'hasCommute', 'hasDeskJob', 'employmentLike', 'selfDirectedWork', 'careWorkIsWork',
];
const TIME_OF_DAY: TimeOfDay[] = ['morning', 'midday', 'evening', 'work', 'any'];
const ROLES: PersonRole[] = ['parent', 'child', 'partner', 'friend'];

/* -------------------------------------------------------------------------
   The rules
   ---------------------------------------------------------------------- */

/**
 * Openings whose noun lives somewhere else on the page.
 *
 * The original bug that `rhythms.ts` was written to fix: "Give it a standing
 * hour" — give *what*? Read off a domain screen the page supplied the missing
 * noun; alone on a card it is nonsense. Guarded here so it cannot reappear by
 * way of a generation.
 */
const DANGLING = /^(give|do|make|put|keep|start|take|find) (it|them|this|that|one)\b/i;

/**
 * A rhythm is not an errand.
 *
 * The distinction the catalog holds by hand and a model reliably loses: a
 * rhythm is something you do every week from now on, so anything that could be
 * finished and ticked off forever is the wrong kind of thing. It would also
 * quietly break the streak model, which counts a target per week and has no
 * concept of done.
 */
const ERRAND = new RegExp([
  /\b(finish|complete|submit|deliver|launch|ship|renew|cancel|register)\b/,
  /\b(book|buy|order|sign up for|apply for|enrol in|enroll in)\s+(the|a|an|your|my)\b/,
  /\b(deadline|due date|one[- ]off|once and for all|for good|by (mon|tues|wednes|thurs|fri|satur|sun)day)\b/,
  /\b(20\d\d|next (month|year)|this (month|quarter|year))\b/,
].map((r) => r.source).join('|'), 'i');

/**
 * The tone rules, finally enforced.
 *
 * Every one of these is already written in `@priority/ai-prompts` as an
 * instruction — never mention death or lifespan, never guilt-trip, no
 * exclamation marks in coaching copy. Instructions are what a model follows
 * most of the time. A person reading "before it's too late" on a card about
 * their mother is not reassured that it usually says something kinder.
 */
const TONE = new RegExp([
  /\b(die|dying|died|death|deathbed|dead|funeral|grave|mortality|lifespan|life expectancy)\b/,
  /\b(before (it'?s|it is) too late|running out of time|time is running out|while you still can)\b/,
  /\b(you (always|never) |you should have|you failed|stop making excuses|no excuses)\b/,
  /\b(guilty|ashamed|shame on)\b/,
].map((r) => r.source).join('|'), 'i');

/**
 * Words that turn a life app into one giving clinical or financial advice.
 *
 * Out of scope on purpose rather than out of caution: this product ranks
 * attention across parts of a life, and a suggestion phrased as treatment or
 * as a trade is a different product with different duties.
 */
const OUT_OF_SCOPE = new RegExp([
  /\b(diagnos(e|is|ed)|prescri(be|ption)|dosage|mg\b|symptom|therapy session|antidepressant)\b/,
  /\b(invest in|buy (stocks?|shares?|crypto|bitcoin)|portfolio allocation|trade options)\b/,
  /\b(fast(ing)? for \d|calorie deficit|lose \d+ ?(kg|kilos|pounds|lbs))\b/,
].map((r) => r.source).join('|'), 'i');

/**
 * Things the evidence went and looked for, and did not find.
 *
 * The judge already refuses lines that are unsafe, off-tone, out of scope, or
 * about a life this person does not lead. It had no opinion at all about
 * whether the thing being proposed works — so a generation could phrase a
 * piece of pseudoscience in somebody's own idiom, pass every structural
 * check, and land in their catalog beside strength training.
 *
 * Once the catalog started carrying receipts that stopped being tolerable.
 * An app that grades its own entries A through folk and then lets the model
 * append a detox week has not got a standard; it has a decoration.
 *
 * Each of these is here for a specific reason, not a general suspicion:
 *
 *   **Brain-training** for general cognition — large trials find transfer to
 *   the trained task and almost nothing beyond it.
 *   **Learning styles** — the matching hypothesis has failed every controlled
 *   test designed to find it.
 *   **"21 days"** — the number is a misquotation of a plastic-surgery
 *   observation; the measured median is around 66 days with enormous spread,
 *   and the app's own grace design already assumes that.
 *   **Detox and cleanses** — no mechanism, no outcome evidence, and a live
 *   route to disordered eating.
 *   **Manifesting and visualization-as-outcome** — visualizing the result
 *   rather than the process performs worse than doing neither.
 *   **Cold exposure as a mood treatment** — early, tiny, uncontrolled, and
 *   routinely sold as settled.
 *
 * Deliberately narrow. This is not a list of things the authors dislike: a
 * cold shower, a supplement, or a visualization habit is somebody's business
 * and can be typed in by hand at any time. What this refuses is the *app*
 * proposing them, which is a different act with a different duty.
 */
const NO_EVIDENCE = new RegExp([
  /\b(detox|cleanse|flush out toxins|toxin[- ]free)\b/,
  /\b(manifest(ing|ation)?|law of attraction|vision board|visuali[sz]e (the|your) (outcome|success|goal))\b/,
  /\b(brain[- ]?training|brain games|neuroplasticity app|lumosity)\b/,
  /\b(learning style|visual learner|auditory learner|kinaesthetic learner|kinesthetic learner)\b/,
  /\b(21[- ]day|21 days to|in just 21|30 days to (a )?new (you|habit))\b/,
  /\b(ice bath|cold plunge|cold shower)s?\b[^.]{0,40}\b(depress|anxiet|mood|mental health)/,
  /\b(supplement stack|nootropic|biohack(ing)?)\b/,
].map((r) => r.source).join('|'), 'i');

/**
 * What this life does not contain.
 *
 * The homemaker who was told to turn her commute into an audiobook. The
 * catalog learned this by declaring `needs` per entry; a generated line has no
 * such declaration, so the text itself has to be read for the assumption.
 */
const SHAPE_TRAPS: Array<{ has: keyof LifeShape; pattern: RegExp }> = [
  { has: 'hasCommute', pattern: /\b(commute|commuting|drive (in|to work)|on the (train|bus)|school run to work)\b/i },
  { has: 'hasDeskJob', pattern: /\b(inbox|email|stand[- ]?up|your desk|the office|slack|colleagues?|meetings?)\b/i },
  { has: 'employmentLike', pattern: /\b(your (boss|manager|team lead)|performance review|appraisal|annual leave|payslip)\b/i },
];

/**
 * Where a name would go.
 *
 * The model is told to write `{who}` and never a literal name, so this is
 * defence in depth rather than the first line of it. It looks for a
 * capitalised word in a position where only a person belongs — after a word
 * that takes a person as its object, or holding a possessive — which catches
 * the failure that matters ("Call Priya on Sunday" for someone with no Priya)
 * without rejecting the specificity this feature exists to add ("Practise
 * Spanish for twenty minutes" names a language, not a person).
 */
/* Both cases spelled out rather than an /i flag: the verb may start a title
   ("Call Priya on Sunday" is the commonest shape this catches), while the
   name half must stay case-SENSITIVE or `[A-Z]` would match anything. */
const PERSON_SLOT = /\b(?:[Ww]ith|[Cc]alls?|[Rr]ings?|[Tt]exts?|[Mm]essages?|[Vv]isits?|[Ss]ees?|[Mm]eets?|[Aa]sks?|[Tt]ells?|[Tt]hanks?|[Ii]nvites?|[Pp]hones?)\s+([A-Z][a-z]{1,20})\b/g;
const POSSESSIVE = /\b([A-Z][a-z]{1,20})'s\b/g;

/** Capitalised words that are never a person. */
const NOT_A_NAME = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'i', 'the', 'a', 'an', 'your', 'my', 'one', 'two', 'three', 'sunday',
]);

/* -------------------------------------------------------------------------
   Small readers
   ---------------------------------------------------------------------- */

/** One line, trimmed, or nothing at all. */
function line(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function isInt(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
}

/** Keep only the members of an allowed set; drop the rest unread. */
function keepKnown<T extends string>(v: unknown, allowed: T[]): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const hit = v.filter((x): x is T => typeof x === 'string' && (allowed as string[]).includes(x));
  return hit.length ? Array.from(new Set(hit)) : undefined;
}

/**
 * Does this text name somebody who does not exist?
 *
 * An empty `knownNames` means the person has recorded nobody, which is not the
 * same as having nobody — but it does mean the app has no name it is entitled
 * to use, so any name in a person slot is invented as far as this can tell.
 */
function namesAStranger(text: string, knownNames: string[]): boolean {
  const known = new Set(knownNames.map(norm).filter(Boolean));
  for (const re of [PERSON_SLOT, POSSESSIVE]) {
    /* Fresh lastIndex each call: these are /g and module-level, so a shared
       cursor would make the second call on the same text skip its first hit. */
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const word = norm(m[1]);
      if (NOT_A_NAME.has(word)) continue;
      if (!known.has(word)) return true;
    }
  }
  return false;
}

/** Does this text assume a life this person does not lead? */
function assumesWrongLife(text: string, shape: LifeShape): boolean {
  return SHAPE_TRAPS.some((t) => !shape[t.has] && t.pattern.test(text));
}

/**
 * Everything that applies to any generated line, whatever kind it is.
 *
 * Returns the reason rather than a boolean so the caller can report it, and
 * checks in order of how badly the app would have behaved: unsafe content
 * before an exclamation mark.
 */
function commonFaults(
  text: string,
  ctx: BlueprintContext,
): RejectionReason | null {
  if (detectCrisisLanguage(text)) return 'unsafe';
  if (OUT_OF_SCOPE.test(text)) return 'unsafe';
  /* Before tone, because a well-phrased detox week is still a detox week and
     the app should not be judging its manners. */
  if (NO_EVIDENCE.test(text)) return 'no-evidence';
  if (TONE.test(text) || text.includes('!')) return 'tone';
  if (namesAStranger(text, ctx.knownNames ?? [])) return 'invented-person';
  if (assumesWrongLife(text, ctx.shape)) return 'not-this-life';
  if (ERRAND.test(text)) return 'errand';
  return null;
}

/* -------------------------------------------------------------------------
   The judge
   ---------------------------------------------------------------------- */

/**
 * One rhythm, judged.
 *
 * `seen` carries titles already accepted in this pass, so two candidates that
 * say the same thing in the same words cannot both survive.
 */
export function judgeRhythm(
  candidate: RhythmCandidate,
  ctx: BlueprintContext,
  seen: Set<string> = new Set(),
): { ok: true; rhythm: PersonalRhythm } | { ok: false; reason: RejectionReason } {
  const key = line(candidate?.key);
  const title = line(candidate?.title);
  const because = line(candidate?.because);
  const domain = norm(line(candidate?.domain));

  if (!key || !title || !because) return { ok: false, reason: 'schema' };
  if (!KNOWN_DOMAINS.includes(domain)) return { ok: false, reason: 'domain' };
  if (!isInt(candidate?.perWeek, MIN_PER_WEEK, MAX_PER_WEEK)) {
    return { ok: false, reason: 'cadence' };
  }
  if (!isInt(candidate?.minutes, MIN_MINUTES, MAX_MINUTES)) {
    return { ok: false, reason: 'duration' };
  }
  if (title.length > MAX_TITLE || because.length > MAX_BECAUSE) {
    return { ok: false, reason: 'too-long' };
  }
  if (DANGLING.test(title)) return { ok: false, reason: 'dangling' };

  const fault = commonFaults(`${title}\n${because}`, ctx);
  if (fault) return { ok: false, reason: fault };

  /* A title somebody already holds — or deliberately ended — is not a new
     rhythm however new its key is. The catalog's own titles are folded in
     here rather than asked of the caller: a generation that restates a
     built-in is the commonest way this feature produces nothing of value,
     and it should not be possible to forget to check for it. */
  const taken = new Set([
    ...(ctx.takenTitles ?? []).map(norm),
    ...builtInRhythmTitles().map(norm),
    ...seen,
  ]);
  if (taken.has(norm(title))) return { ok: false, reason: 'duplicate' };

  const when = TIME_OF_DAY.includes(line(candidate?.when) as TimeOfDay)
    ? (line(candidate?.when) as TimeOfDay)
    : undefined;

  return {
    ok: true,
    rhythm: {
      key,
      title,
      because,
      domainType: domain,
      perWeek: candidate.perWeek as number,
      minutes: candidate.minutes as number,
      ...(when ? { when } : {}),
      ...(keepKnown(candidate?.needs, SETTING_KEYS)
        ? { needs: keepKnown(candidate?.needs, SETTING_KEYS) }
        : {}),
      ...(candidate?.prefersWeekend === true ? { prefersWeekend: true } : {}),
    },
  };
}

/** One stack, judged. Same rules, plus the ones only a stack can break. */
export function judgeStack(
  candidate: StackCandidate,
  ctx: BlueprintContext,
  seen: Set<string> = new Set(),
): { ok: true; stack: PersonalStack } | { ok: false; reason: RejectionReason } {
  const key = line(candidate?.key);
  const action = line(candidate?.action);
  const framing = line(candidate?.framing);

  if (!key || !action || !framing) return { ok: false, reason: 'schema' };
  if (action.length > MAX_ACTION || framing.length > MAX_FRAMING) {
    return { ok: false, reason: 'too-long' };
  }

  /* The whole point of a stack is that one hour serves more than one part of
     a life. One domain is a rhythm wearing the wrong shape; four is a claim
     no single action supports. */
  const domains = keepKnown(candidate?.domains, KNOWN_DOMAINS) ?? [];
  if (domains.length < 2 || domains.length > 3) return { ok: false, reason: 'domain' };

  /* A host lends the hour rather than gaining one, so it has to be a domain
     the stack actually touches — otherwise the ranker would discount a
     domain that was never in play. */
  const hosts = keepKnown(candidate?.hosts, KNOWN_DOMAINS)?.filter((d) => domains.includes(d));
  if (hosts && hosts.length >= domains.length) return { ok: false, reason: 'domain' };

  /* A stack naming a child is not a suggestion to somebody who has recorded
     none — it is the app describing a life they do not have. */
  const role = ROLES.includes(line(candidate?.role) as PersonRole)
    ? (line(candidate?.role) as PersonRole)
    : undefined;
  if (role && ctx.roles && !ctx.roles.includes(role)) {
    return { ok: false, reason: 'not-this-life' };
  }

  /* `{who}` is the catalog's own placeholder and is filled with a real name
     later, so it must not be read as an invented one. */
  const fault = commonFaults(`${action}\n${framing}`.replace(/\{who\}/g, 'someone'), ctx);
  if (fault) return { ok: false, reason: fault };

  const taken = new Set([...stackActions().map(norm), ...seen]);
  if (taken.has(norm(action))) return { ok: false, reason: 'duplicate' };

  return {
    ok: true,
    stack: {
      key,
      action,
      framing,
      domains,
      ...(hosts?.length ? { hosts } : {}),
      ...(role ? { role } : {}),
      ...(keepKnown(candidate?.setting, SETTING_KEYS)
        ? { setting: keepKnown(candidate?.setting, SETTING_KEYS) }
        : {}),
      ...(keepKnown(candidate?.needs, SHAPE_KEYS)
        ? { needs: keepKnown(candidate?.needs, SHAPE_KEYS) }
        : {}),
    },
  };
}

/**
 * A whole generation, judged.
 *
 * Survivors keep the order they were proposed in, which is not a ranking and
 * must not be read as one — the pools sort everything deterministically once
 * these join them.
 */
export function judgeBlueprint(
  proposal: { rhythms?: unknown; stacks?: unknown } | null | undefined,
  ctx: BlueprintContext,
): BlueprintVerdict {
  const rejected: Rejection[] = [];
  const rhythms: PersonalRhythm[] = [];
  const stacks: PersonalStack[] = [];

  const seenTitles = new Set<string>();
  const seenKeys = new Set<string>();

  for (const raw of asArray(proposal?.rhythms)) {
    if (rhythms.length >= MAX_RHYTHMS) break;
    const c = raw as RhythmCandidate;
    const verdict = judgeRhythm(c, ctx, seenTitles);
    if (!verdict.ok) {
      rejected.push({ key: line(c?.key) || '?', reason: verdict.reason });
      continue;
    }
    /* Two survivors cannot share a key either — they become rows, and a
       duplicate key would make "which one did they keep" unanswerable. */
    if (seenKeys.has(verdict.rhythm.key)) {
      rejected.push({ key: verdict.rhythm.key, reason: 'duplicate' });
      continue;
    }
    seenKeys.add(verdict.rhythm.key);
    seenTitles.add(norm(verdict.rhythm.title));
    rhythms.push(verdict.rhythm);
  }

  const seenActions = new Set<string>();
  for (const raw of asArray(proposal?.stacks)) {
    if (stacks.length >= MAX_STACKS) break;
    const c = raw as StackCandidate;
    const verdict = judgeStack(c, ctx, seenActions);
    if (!verdict.ok) {
      rejected.push({ key: line(c?.key) || '?', reason: verdict.reason });
      continue;
    }
    if (seenKeys.has(verdict.stack.key)) {
      rejected.push({ key: verdict.stack.key, reason: 'duplicate' });
      continue;
    }
    seenKeys.add(verdict.stack.key);
    seenActions.add(norm(verdict.stack.action));
    stacks.push(verdict.stack);
  }

  return { rhythms, stacks, rejected };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
