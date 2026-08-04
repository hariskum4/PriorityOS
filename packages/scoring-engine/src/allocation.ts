/**
 * Weekly allocation — the synthesis that turns 12 countdowns into a plan.
 *
 * The research is blunt: people trying to balance every life area just feel
 * overwhelmed and freeze. The fix is not another countdown — it is a single
 * budget of the ~42 free hours across the domains they said matter, so a
 * whole week can "touch everything" without any domain sitting at zero.
 *
 * Philosophy (from the project's own Harvard-study grounding): optimize for
 * "touches everything + protects the irreplaceable", not raw output. So every
 * ranked domain gets a floor — nothing important is ever allotted zero.
 */

export interface DomainWeight {
  domainType: string;
  importance: number; // 0..100 from onboarding ranking
}

/**
 * A standing rhythm somebody has actually agreed to.
 *
 * `minutes` is nullable and that is the point. A habit row carries a title, a
 * domain and a target per week — it has never carried a duration. The catalog
 * knows how long its own rhythms take, so most can be resolved by title; one
 * somebody wrote themselves, or a title a model reworded, cannot be. Guessing
 * would put invented hours into the only honest number on this card, so an
 * unknown length is reported as unknown and counted separately.
 */
export interface Commitment {
  domainType: string;
  perWeek: number;
  minutes: number | null;
}

export interface Allotment {
  domainType: string;
  /**
   * What the ranking implies — NOT a plan, and never was.
   *
   * This is the share of free time a domain's importance works out to. It is
   * arithmetic about a stated preference, which is worth seeing and is not
   * the same kind of thing as a commitment. The card must not present it as
   * one: nobody can keep or miss 25 hours of health.
   */
  hours: number;      // rounded to 0.5
  share: number;      // % of the free-time budget
  /** Hours actually agreed to, from the rhythms they hold. */
  committedHours: number;
  /** Of those rhythms, how many have no known length. */
  unknownCommitments: number;
  /**
   * The most this domain could hold if they took every rhythm it has left.
   *
   * The difference between a gap somebody could close and one nobody could.
   * A 25-hour health share against a catalog whose entire health offering
   * comes to about three hours is not a person falling short of a plan — it
   * is a share that was never a plan, and a card that shows the gap without
   * saying so invites the reader to take it as a personal failure.
   */
  reachableHours: number;
}

export interface WeeklyAllocation {
  freeHours: number;
  allotments: Allotment[];
  /** Everything committed across every domain, in hours. */
  committedHours: number;
  framing: string;
  /**
   * What to do about the widest gap, when there is something to say.
   *
   * Null when nothing is short, or when nothing is known about what has been
   * committed — the card says less rather than guessing.
   */
  moveText: string | null;
}

import { availableRhythms } from './rhythms';

const MIN_HOURS = 0.5; // the "nothing at zero" floor

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * Distribute free hours across ranked domains, importance-weighted, with a
 * floor so nothing important is starved. Domains the user never ranked
 * (importance 0) are excluded — a plan is about what you chose.
 */
export function weeklyAllocation(
  freeHours: number,
  weights: DomainWeight[],
  /**
   * What they have actually set up. Absent means none of it is known, which
   * the framing says out loud rather than reporting a committed zero as if
   * it were measured.
   */
  commitments: Commitment[] = [],
  /**
   * Titles already held, retired ones included — the same list `rhythmFor`
   * takes. Used only to work out what a domain has left to offer.
   */
  takenTitles: string[] = [],
): WeeklyAllocation {
  const active = weights.filter((w) => w.importance > 0);
  if (!active.length || freeHours <= 0) {
    return {
      freeHours: Math.max(freeHours, 0),
      allotments: [],
      committedHours: 0,
      framing: 'Rank what matters in onboarding to see your week take shape.',
      moveText: null,
    };
  }

  // Reserve the floors first, distribute the remainder by importance weight.
  const floorTotal = MIN_HOURS * active.length;
  const remainder = Math.max(freeHours - floorTotal, 0);
  const weightSum = active.reduce((s, w) => s + w.importance, 0);

  const held = new Map<string, { hours: number; unknown: number }>();
  for (const c of commitments) {
    if (!c || !(c.perWeek > 0)) continue;
    const row = held.get(c.domainType) ?? { hours: 0, unknown: 0 };
    if (typeof c.minutes === 'number' && c.minutes > 0) {
      row.hours += (c.perWeek * c.minutes) / 60;
    } else {
      row.unknown += 1;
    }
    held.set(c.domainType, row);
  }

  let allotments: Allotment[] = active
    .map((w) => {
      const hours = roundHalf(MIN_HOURS + (remainder * w.importance) / weightSum);
      const mine = held.get(w.domainType);
      const committedHours = roundHalf(mine?.hours ?? 0);
      /* Everything the catalog still has for this domain, on top of what is
         already held. Nothing about the person's willingness — only what the
         app is in a position to offer them. */
      /* The same "what is left" the offering itself uses, so the card can
         never promise room that nothing would actually offer — including the
         case where a lever is already being kept under a different name. */
      const spare = availableRhythms(w.domainType, takenTitles)
        .reduce((s, r) => s + (r.perWeek * r.minutes) / 60, 0);
      return {
        domainType: w.domainType,
        hours,
        share: 0,
        committedHours,
        unknownCommitments: mine?.unknown ?? 0,
        reachableHours: roundHalf(committedHours + spare),
      };
    })
    .sort((a, b) => b.hours - a.hours);

  const total = allotments.reduce((s, a) => s + a.hours, 0) || 1;
  allotments = allotments.map((a) => ({ ...a, share: Math.round((a.hours / total) * 100) }));

  const committedHours = roundHalf(
    allotments.reduce((s, a) => s + a.committedHours, 0),
  );

  return {
    freeHours,
    allotments,
    committedHours,
    framing: framingFor({
      freeHours,
      allotments,
      committedHours,
      knowsCommitments: commitments.length > 0,
    }),
    moveText: commitments.length > 0 ? moveTextFor(allotments) : null,
  };
}

/**
 * What can actually be done about the widest gap.
 *
 * The card was showing a person a twenty-three hour hole and offering them
 * nothing to do about it, which reads as an accusation. There are only two
 * true answers and they are opposite.
 *
 * If the domain still has rhythms to give, the gap is partly theirs to close
 * and the card should say what is on offer.
 *
 * If taking every rhythm it has left would still not come near the share,
 * then the share was never a plan — it is what a ranking works out to — and
 * the honest lever is the ranking, not more effort. Saying that out loud is
 * the difference between a card that explains an empty bar and one that
 * quietly blames the reader for it.
 */
function moveTextFor(allotments: Allotment[]): string | null {
  const widest = [...allotments]
    .sort((a, b) => (b.hours - b.committedHours) - (a.hours - a.committedHours))[0];
  if (!widest || widest.hours - widest.committedHours <= 0) return null;

  const name = sentenceCase(widest.domainType);
  const spare = roundHalf(widest.reachableHours - widest.committedHours);

  if (widest.reachableHours >= widest.hours) {
    return `${name}'s share is within reach — the rhythms it still has to offer would add about ${spare}h.`;
  }
  if (spare > 0) {
    return `Every ${widest.domainType} rhythm left would add about ${spare}h, reaching ~${widest.reachableHours}h of the ~${widest.hours}h implied. `
      + `The rest of that gap is not something to do — it is what the ranking works out to. Move the order if it no longer fits.`;
  }
  return `${name} has no rhythm left to offer, so nothing here closes that gap by being done. `
    + `What the share says is where ${widest.domainType} sits in your ranking, and that is the part you can move.`;
}

/**
 * What the card says underneath the bars.
 *
 * The line this replaces described the split and then apologised for it —
 * "time-stacking lets one hour count twice, so this fits more easily than it
 * looks" — which was the copy quietly conceding that the hours above it were
 * not a week anybody could live. They were not meant to be. They are what a
 * ranking works out to, and the honest thing is to say that and then say what
 * has actually been set up against it, because that gap is the only part a
 * reader can do anything about.
 */
function framingFor(x: {
  freeHours: number;
  allotments: Allotment[];
  committedHours: number;
  knowsCommitments: boolean;
}): string {
  const free = Math.round(x.freeHours);
  const opening = `Your ~${free} free hours, divided the way you ranked them — this is what your answers work out to, not a schedule.`;

  if (!x.knowsCommitments) {
    return `${opening} What you have actually set up sits below.`;
  }
  if (x.committedHours <= 0) {
    return `${opening} None of it is committed yet: no standing rhythm has a claim on any of these hours.`;
  }

  /* Name the domain with the widest gap rather than the largest share. The
     largest share is the least surprising fact on the card. */
  const widest = [...x.allotments]
    .sort((a, b) => (b.hours - b.committedHours) - (a.hours - a.committedHours))[0];
  const gap = roundHalf(widest.hours - widest.committedHours);

  if (gap <= 0) {
    return `${opening} You have committed ~${x.committedHours}h of standing rhythms, which meets every share you set.`;
  }
  return `${opening} You have committed ~${x.committedHours}h of it to standing rhythms. `
    + `${sentenceCase(widest.domainType)} is the widest gap — ~${widest.hours}h implied, ~${widest.committedHours}h set up.`;
}

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
