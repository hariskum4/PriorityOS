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

export interface Allotment {
  domainType: string;
  hours: number;      // rounded to 0.5
  share: number;      // % of the free-time budget
}

export interface WeeklyAllocation {
  freeHours: number;
  allotments: Allotment[];
  framing: string;
}

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
): WeeklyAllocation {
  const active = weights.filter((w) => w.importance > 0);
  if (!active.length || freeHours <= 0) {
    return { freeHours: Math.max(freeHours, 0), allotments: [], framing: 'Rank what matters in onboarding to see your week take shape.' };
  }

  // Reserve the floors first, distribute the remainder by importance weight.
  const floorTotal = MIN_HOURS * active.length;
  const remainder = Math.max(freeHours - floorTotal, 0);
  const weightSum = active.reduce((s, w) => s + w.importance, 0);

  let allotments: Allotment[] = active
    .map((w) => {
      const hours = roundHalf(MIN_HOURS + (remainder * w.importance) / weightSum);
      return { domainType: w.domainType, hours, share: 0 };
    })
    .sort((a, b) => b.hours - a.hours);

  const total = allotments.reduce((s, a) => s + a.hours, 0) || 1;
  allotments = allotments.map((a) => ({ ...a, share: Math.round((a.hours / total) * 100) }));

  const top = allotments[0];
  return {
    freeHours,
    allotments,
    framing:
      `Your ~${Math.round(freeHours)} free hours, spread so every area you value gets a real slice — ` +
      `${top.domainType} leads at ~${top.hours}h. None of them sits at zero. ` +
      `Time-stacking lets one hour count twice, so this fits more easily than it looks.`,
  };
}
