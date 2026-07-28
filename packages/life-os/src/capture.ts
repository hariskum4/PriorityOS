/**
 * Capture — a spoken note becomes structured life.
 *
 * The app's real bottleneck is not intelligence, it is input. People will not
 * type a paragraph about a phone call, which is why onboarding answers ended up
 * as goal titles. They will happily say two sentences while walking home.
 *
 * This module is the deterministic half of that: given a transcript and the
 * people the system already knows about, work out who it was about, which part
 * of life it belongs to, what kind of act it was, and a short title. No model
 * involved — the project's rule is that the LLM narrates and never computes, and
 * capture has to work with `AI_ENABLED=false`. An AI pass may improve the title
 * afterwards, fire-and-forget; it may never be required for the note to land.
 *
 * ── What this deliberately does not do ────────────────────────────────────
 *
 * It does not transcribe, and it never sees audio. Recording another person is
 * illegal without consent in all-party-consent jurisdictions, blocked outright
 * for calls on iOS, and an archive of someone's private conversations is the
 * highest-liability data a product could hold. The design is: the person speaks
 * *their own* account, the device transcribes, the audio is discarded, and only
 * the transcript reaches this function.
 */

import { Domain } from './contract';

export type CaptureKind =
  | 'call'        // spoke to someone remotely
  | 'visit'       // saw someone
  | 'message'     // wrote to someone
  | 'meeting'     // work conversation
  | 'moment'      // something worth keeping
  | 'reflection'; // thinking out loud, about themselves

/** A person the system already knows, for name matching. */
export interface KnownPerson {
  id: string;
  name: string;
  relationType: string;
}

export interface CaptureInput {
  transcript: string;
  people: KnownPerson[];
  /** Optional hint from the UI ("I just called someone"), trusted over inference. */
  kindHint?: CaptureKind | null;
}

export interface CaptureResult {
  /** One line, suitable as a record title. */
  title: string;
  /** The full transcript, untouched. Always kept — it is what they actually said. */
  body: string;
  kind: CaptureKind;
  domain: Domain | null;
  /** Ids of known people the note mentions, in the order they appear. */
  peopleIds: string[];
  /** Names matched, for showing back "logged with Amma" without a second lookup. */
  peopleNames: string[];
  /** Which signals fired, so the UI can explain its guess and let it be corrected. */
  because: string[];
  /** False when nothing matched and the caller should ask rather than assume. */
  confident: boolean;
  /**
   * Spoken names that matched more than one person. The first was used; the UI
   * should offer to change it rather than silently pick.
   */
  ambiguousNames: string[];
}

/* ── signals ─────────────────────────────────────────────────────────────── */

/**
 * Kind detection. Ordered most-specific first, because "called in to the
 * meeting" is a meeting, not a call.
 */
const KIND_PATTERNS: Array<[CaptureKind, RegExp]> = [
  ['meeting', /\b(meeting|standup|stand-up|review|interview|1:1|one on one|sprint|sync|presentation|client)\b/i],
  ['visit', /\b(visited|went to see|saw|dropped by|stopped by|came over|met up|lunch with|dinner with)\b/i],
  ['call', /\b(called|call with|phone|rang|spoke to|talked to|facetime|video call|zoom)\b/i],
  ['message', /\b(texted|messaged|wrote to|whatsapp|emailed|dm'?d)\b/i],
  ['moment', /\b(first time|never forget|remember this|birthday|anniversary|graduat|wedding|celebrat)\b/i],
];

/**
 * Domain keywords, scored rather than first-match.
 *
 * Two lessons are baked in here, both learned by getting it wrong:
 *
 *   1. **Count matches, don't take the first.** With first-match-wins, list
 *      order silently becomes precedence, so "moved the tax savings before the
 *      deadline" filed as career on the strength of one word while finances had
 *      two. Scoring makes the strongest signal win instead of the luckiest.
 *
 *   2. **Exercise verbs collide with idiom.** A bare `ran` matches "the standup
 *      ran long", "ran late", "ran out of time". Motion words therefore carry a
 *      negative lookahead for the words that make them figurative.
 *
 * Every pattern is `g`-flagged because the score is how many distinct hits it
 * makes, not whether it matched at all.
 */
const MOTION_NOT_LITERAL = '(?!\\s+(long|late|over|out|into|by|through|up|down))';

const DOMAIN_WORDS: Array<[Domain, RegExp]> = [
  ['health', new RegExp(
    '\\b(gym|workout|yoga|weights|physio|doctor|checkup|hospital|sick|slept|sleep|tired|steps)\\b'
    + `|\\b(ran|run|jog|jogged|walk|walked|cycled|swam)\\b${MOTION_NOT_LITERAL}`,
    'gi',
  )],
  ['career', /\b(work|job|boss|client|deadline|project|promotion|interview|meeting|standup|manager|deploy|ship|colleague)\b/gi],
  ['finances', /\b(money|budget|invest|savings|rent|loan|tax|taxes|salary|spend|expense|insurance)\b/gi],
  ['growth', /\b(learn|learned|course|book|read|reading|study|studied|practis|practic|skill|class)\w*/gi],
  ['experiences', /\b(trip|travel|holiday|beach|hike|concert|festival|flight|abroad)\b/gi],
  ['mindfulness', /\b(meditat|breath|calm|anxious|anxiety|overwhelm|journal|quiet|still)\w*/gi],
  ['purpose', /\b(purpose|meaning|legacy|volunteer|mentor)\w*/gi],
  ['relationships', /\b(mum|mom|amma|dad|appa|father|mother|wife|husband|partner|son|daughter|friend|brother|sister|family)\b/gi],
];

/** How many distinct keyword hits a domain makes in the transcript. */
function domainScores(transcript: string): Array<{ domain: Domain; hits: number }> {
  return DOMAIN_WORDS
    .map(([domain, re]) => {
      // Fresh regex per call: a shared /g/ lastIndex across calls is a classic
      // source of results that change on the second run.
      const matches = transcript.match(new RegExp(re.source, re.flags));
      return { domain, hits: matches ? matches.length : 0 };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

/** Relationship types that are family rather than friends, for domain mapping. */
function domainForPerson(relationType: string): Domain {
  void relationType; // every person, whatever the tie, lands in relationships
  return 'relationships';
}

/**
 * Match known people by name.
 *
 * Word-boundary matching on the first name only, because people say "Amma" and
 * "called Priya", never the full name they typed into onboarding. Longest names
 * are tried first so "Anna" inside "Annapurna" cannot steal the match.
 *
 * Crucially, results are deduped **by the name that was spoken**, not by person
 * id. Contact lists really do contain several people with the same first name —
 * and matching by id logged one mention of "Amma" against three different Amma
 * records at once, creating three contact logs from one sentence. When a name is
 * ambiguous, the first candidate in the caller's order wins (the caller sorts by
 * priority) and the name is reported in `ambiguousNames` so the UI can ask.
 */
function findPeople(
  transcript: string,
  people: KnownPerson[],
): { matched: KnownPerson[]; ambiguousNames: string[] } {
  const hay = transcript.toLowerCase();
  /** token → every person whose first name is that token, in caller order. */
  const byToken = new Map<string, { at: number; people: KnownPerson[] }>();

  // Longest first, so a longer name claims its span before a shorter one.
  const candidates = [...people].sort((a, b) => b.name.length - a.name.length);
  for (const person of candidates) {
    const token = person.name.trim().split(/\s+/)[0].toLowerCase();
    if (token.length < 2) continue;
    const at = hay.search(new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i'));
    if (at < 0) continue;
    const bucket = byToken.get(token);
    if (bucket) bucket.people.push(person);
    else byToken.set(token, { at, people: [person] });
  }

  const ordered = [...byToken.entries()].sort((a, b) => a[1].at - b[1].at);
  return {
    // One person per spoken name — never a fan-out across duplicates.
    matched: ordered.map(([, b]) => b.people[0]),
    ambiguousNames: ordered.filter(([, b]) => b.people.length > 1).map(([token]) => token),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * First sentence, trimmed to something that reads as a title.
 *
 * Reuses the same instinct as goal titles: a record's title is an identifier,
 * not the whole account. The full transcript is always kept in `body`, so
 * nothing a person said is ever discarded by shortening.
 */
function deriveTitle(transcript: string): string {
  const flat = transcript.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const firstStop = flat.search(/[.!?](\s|$)/);
  const clause = firstStop > 0 ? flat.slice(0, firstStop) : flat;
  if (clause.length <= 70) return clause;
  const cut = clause.slice(0, 70);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 42 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, '')}…`;
}

/* ── the classifier ──────────────────────────────────────────────────────── */

export function classifyCapture(input: CaptureInput): CaptureResult {
  const transcript = (input.transcript ?? '').trim();
  const because: string[] = [];

  const { matched: people, ambiguousNames } = findPeople(transcript, input.people ?? []);
  if (people.length) {
    because.push(`mentions ${people.map((p) => p.name).join(' and ')}`);
  }

  // ---- kind -----------------------------------------------------------
  let kind: CaptureKind;
  if (input.kindHint) {
    kind = input.kindHint;
    because.push(`you said this was a ${input.kindHint}`);
  } else {
    const matched = KIND_PATTERNS.find(([, re]) => re.test(transcript));
    if (matched) {
      kind = matched[0];
      because.push(`sounds like a ${matched[0]}`);
    } else if (people.length) {
      // A named person with no verb is still about that person.
      kind = 'call';
      because.push('about someone, so filed as contact');
    } else {
      kind = 'reflection';
      because.push('no one named, so filed as a reflection');
    }
  }

  // ---- domain ---------------------------------------------------------
  // A named person wins: a note about your mother is about relationships even
  // if it also mentions work.
  let domain: Domain | null = null;
  if (people.length) {
    domain = domainForPerson(people[0].relationType);
    because.push('someone you care about is in it');
  } else {
    const scored = domainScores(transcript);
    if (scored.length) {
      domain = scored[0].domain;
      because.push(`words that point at ${scored[0].domain}`);
    }
  }
  // A work meeting with no one known is career, whatever else it says.
  if (!domain && kind === 'meeting') {
    domain = 'career';
    because.push('a meeting, so filed under career');
  }

  return {
    title: deriveTitle(transcript),
    body: transcript,
    kind,
    domain,
    peopleIds: people.map((p) => p.id),
    peopleNames: people.map((p) => p.name),
    because,
    // Honest about guessing: with no person and no domain signal, the caller
    // should ask rather than file it somewhere arbitrary.
    confident: Boolean(people.length || domain),
    ambiguousNames,
  };
}
