import { describe, it, expect } from 'vitest';
import { weeklyAllocation } from './allocation';
import {
  healthspan, energyBudget, costOfDelay, suggestSeason, classifyLever, leverTwinKey,
  type LeverKey,
} from './lifeStrategy';
import { rhythmForHabit } from './rhythms';
import { isPlaceable, isBoundary } from './rhythmPlan';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted/i;

// Time-stacking moved to its own suite when its ranking was rewritten to work
// in share points — see timeStacking.test.ts.

describe('weekly allocation', () => {
  const weights = [
    { domainType: 'family', importance: 90 },
    { domainType: 'health', importance: 70 },
    { domainType: 'career', importance: 40 },
    { domainType: 'growth', importance: 20 },
  ];

  it('distributes free hours by importance, most-valued domain leading', () => {
    const a = weeklyAllocation(42, weights);
    expect(a.allotments[0].domainType).toBe('family');
    expect(a.allotments[0].hours).toBeGreaterThan(a.allotments[3].hours);
  });

  it('never allots zero to a ranked domain (the floor)', () => {
    const a = weeklyAllocation(42, weights);
    for (const al of a.allotments) expect(al.hours).toBeGreaterThanOrEqual(0.5);
  });

  it('shares sum to about 100%', () => {
    const a = weeklyAllocation(42, weights);
    const sum = a.allotments.reduce((s, x) => s + x.share, 0);
    expect(sum).toBeGreaterThanOrEqual(97);
    expect(sum).toBeLessThanOrEqual(103);
  });

  it('handles no ranked domains gracefully', () => {
    const a = weeklyAllocation(42, []);
    expect(a.allotments).toEqual([]);
  });

  /**
   * The hours are what a ranking works out to. What somebody has actually
   * agreed to is a different number, usually a much smaller one, and the card
   * was showing only the first — 25h of health, against a catalog whose every
   * health rhythm combined comes to 3.3h. The old closing line conceded it
   * ("time-stacking lets one hour count twice, so this fits more easily than
   * it looks") rather than reporting it.
   */
  describe('against what is actually set up', () => {
    const commitments = [
      { domainType: 'health', perWeek: 3, minutes: 40 },   // 2h
      { domainType: 'health', perWeek: 1, minutes: 45 },   // 0.75h
      { domainType: 'family', perWeek: 1, minutes: 60 },   // 1h
    ];

    it('counts the hours a person has agreed to, per domain', () => {
      const a = weeklyAllocation(47, weights, commitments);
      const health = a.allotments.find((x) => x.domainType === 'health')!;
      expect(health.committedHours).toBe(3);   // 2 + 0.75, rounded to the half
      const career = a.allotments.find((x) => x.domainType === 'career')!;
      expect(career.committedHours).toBe(0);
    });

    it('totals them across the week', () => {
      expect(weeklyAllocation(47, weights, commitments).committedHours).toBe(4);
    });

    it('names the widest gap, not the biggest share', () => {
      // family leads on share; the gap the reader can act on may be elsewhere.
      const a = weeklyAllocation(47, weights, [
        { domainType: 'family', perWeek: 5, minutes: 240 },  // 20h — nearly met
      ]);
      expect(a.framing).toMatch(/health is the widest gap/i);
      expect(a.framing).not.toMatch(/fits more easily than it looks/);
    });

    it('stops calling the split a plan', () => {
      const a = weeklyAllocation(47, weights, commitments);
      expect(a.framing).toMatch(/not a schedule/);
    });

    it('says so when nothing has been committed', () => {
      const a = weeklyAllocation(47, weights, []);
      expect(a.allotments.every((x) => x.committedHours === 0)).toBe(true);
      // No commitments passed at all is "nothing knows", not "measured zero".
      expect(a.framing).toMatch(/sits below/);
    });

    it('distinguishes a measured zero from an unknown one', () => {
      const a = weeklyAllocation(47, weights, [
        { domainType: 'growth', perWeek: 2, minutes: null },
      ]);
      expect(a.framing).toMatch(/none of it is committed yet/i);
      const growth = a.allotments.find((x) => x.domainType === 'growth')!;
      expect(growth.unknownCommitments).toBe(1);
      expect(growth.committedHours).toBe(0);
    });

    /* A habit row has never carried a duration; the catalog resolves most by
       title, and one somebody wrote themselves cannot be. Inventing a length
       would put fiction into the only honest number here. */
    it('never guesses a length it does not know', () => {
      const a = weeklyAllocation(47, weights, [
        { domainType: 'health', perWeek: 3, minutes: null },
        { domainType: 'health', perWeek: 1, minutes: 60 },
      ]);
      const health = a.allotments.find((x) => x.domainType === 'health')!;
      expect(health.committedHours).toBe(1);
      expect(health.unknownCommitments).toBe(1);
    });

    it('ignores rubbish rather than counting it', () => {
      const a = weeklyAllocation(47, weights, [
        { domainType: 'health', perWeek: 0, minutes: 60 },
        { domainType: 'health', perWeek: -2, minutes: 60 },
        null as never,
      ]);
      expect(a.committedHours).toBe(0);
    });

    /**
     * A twenty-three hour hole with nothing offered against it reads as an
     * accusation. There are only two true answers and they are opposite: the
     * gap is partly closeable, or the share was never a plan and the ranking
     * is the lever.
     */
    describe('what can be done about the widest gap', () => {
      it('says so when the domain still has rhythms to give', () => {
        /* A claim the catalog can actually cover: a 4h share against health's
           ~3.3h of unheld rhythms on top of the half hour already held. */
        const a = weeklyAllocation(4, [{ domainType: 'health', importance: 100 }], [
          { domainType: 'health', perWeek: 1, minutes: 30 },
        ]);
        const health = a.allotments[0];
        expect(health.reachableHours).toBeGreaterThanOrEqual(health.hours);
        expect(a.moveText).toMatch(/within reach/);
      });

      it('says the ranking is the lever when no amount of doing would close it', () => {
        // Health's entire catalog is a little over three hours against 25.
        const a = weeklyAllocation(47, weights, [
          { domainType: 'health', perWeek: 3, minutes: 40 },
        ]);
        expect(a.moveText).toMatch(/what the ranking works out to/);
        expect(a.moveText).toMatch(/Move the order/);
      });

      it('does not blame the reader for a gap nothing could close', () => {
        const a = weeklyAllocation(47, weights, [
          { domainType: 'health', perWeek: 3, minutes: 40 },
        ]);
        expect(a.moveText).not.toMatch(/should|need to try|make time|discipline/i);
      });

      it('counts only what is still on offer, not what was retired', () => {
        const held = ['Move three times a week', 'One strength session a week'];
        const a = weeklyAllocation(47, weights, [
          { domainType: 'health', perWeek: 3, minutes: 40 },
        ], held);
        const health = a.allotments.find((x) => x.domainType === 'health')!;
        // Only "Lights out at the same hour" is left: 7 x 5min = ~0.5h.
        expect(health.reachableHours).toBe(2.5);
      });

      it('does not offer room for a lever already being kept under another name', () => {
        /* "Strength training twice a week" comes from the healthspan card and
           "One strength session a week" from the catalog. They are one
           commitment, and a title match cannot see it — so the catalog copy
           must not be counted as room this person still has. */
        const withLever = weeklyAllocation(47, weights, [
          { domainType: 'health', perWeek: 2, minutes: 45 },
        ], ['Strength training twice a week']);
        const withoutLever = weeklyAllocation(47, weights, [
          { domainType: 'health', perWeek: 2, minutes: 45 },
        ], []);

        const reach = (a: typeof withLever) =>
          a.allotments.find((x) => x.domainType === 'health')!.reachableHours;
        expect(reach(withLever)).toBeLessThan(reach(withoutLever));
      });

      it('says nothing at all when nothing is known about commitments', () => {
        expect(weeklyAllocation(47, weights).moveText).toBeNull();
      });

      it('says nothing when the widest gap is not a gap', () => {
        const a = weeklyAllocation(4, [{ domainType: 'health', importance: 100 }], [
          { domainType: 'health', perWeek: 4, minutes: 60 },
        ]);
        expect(a.moveText).toBeNull();
      });
    });

    /**
     * The app has two habit-creating surfaces and only one of them used to
     * say how long anything took. A life that had begun strength training
     * and a bedtime showed "+2 rhythms of its own length" and had its
     * committed total under-report what it had actually taken on.
     */
    describe('habits begun from the healthspan card', () => {
      it('resolves to the catalog rhythm that is the same promise', () => {
        expect(leverTwinKey('Strength training twice a week')).toBe('health.strength');
        expect(leverTwinKey('Zone-2 cardio, 150 min a week')).toBe('health.move');
        expect(leverTwinKey('Protecting 7–8 hours of sleep')).toBe('health.sleep');
      });

      it('has no twin for the one that is a state rather than an act', () => {
        expect(leverTwinKey('Staying socially connected')).toBeNull();
      });

      it('claims nothing about a title the app did not write', () => {
        expect(leverTwinKey('Move three times a week')).toBeNull();
        expect(leverTwinKey('')).toBeNull();
        expect(leverTwinKey(undefined as never)).toBeNull();
      });

      it('is not thrown by casing or stray whitespace', () => {
        expect(leverTwinKey('  strength training TWICE a week ')).toBe('health.strength');
      });

      /**
       * The bug this twin exists for: a bedtime rhythm was being placed at
       * half past five in the afternoon, because a habit begun from the
       * healthspan card carried no part-of-day at all.
       *
       * This test used to assert `evening` for the sleep one, and it passed,
       * and it was wrong — the fix it was written to prove moved a bedtime
       * from half five to seven o'clock, which is the same category error an
       * hour and a half later. A part-of-day is the wrong kind of answer for
       * something that marks where the day stops; see `TimeOfDay`.
       */
      it('gives a lever habit the hour its promise actually belongs to', () => {
        expect(rhythmForHabit('Protecting 7–8 hours of sleep')?.when).toBe('bedtime');
        expect(rhythmForHabit('Strength training twice a week')?.when).toBe('morning');
      });

      it('keeps a bedtime out of the hours somebody has left', () => {
        expect(isPlaceable(rhythmForHabit('Protecting 7–8 hours of sleep')?.when)).toBe(false);
        expect(isBoundary(rhythmForHabit('Protecting 7–8 hours of sleep')?.when)).toBe(true);
        expect(isPlaceable(rhythmForHabit('Strength training twice a week')?.when)).toBe(true);
      });

      it('gives it the room it needs, so it cannot be offered from a desk', () => {
        expect(rhythmForHabit('Strength training twice a week')?.needs).toContain('canMove');
      });

      it('gives it a length and a reason', () => {
        const r = rhythmForHabit('Strength training twice a week')!;
        expect(r.minutes).toBe(45);
        expect(r.because).toBeTruthy();
      });

      it('leaves a habit somebody wrote themselves unresolved', () => {
        // Honest rather than unfortunate: nothing here knows how long "sort
        // the garage" takes, and the two-way learning covers it from what
        // they actually do.
        expect(rhythmForHabit('Sort the garage out')).toBeNull();
      });

      /**
       * `classifyLever` matches "walk", which is right for reading somebody's
       * own wording and catastrophic here — it would hand a phone call a
       * morning anchor and a requirement to be on your feet.
       */
      it('does not resolve a title that merely mentions a lever word', () => {
        expect(rhythmForHabit('Call Mum on my walk home')).toBeNull();
        expect(leverTwinKey('Call Mum on my walk home')).toBeNull();
      });
    });

    it('acknowledges a week where every share is met', () => {
      const a = weeklyAllocation(4, [{ domainType: 'health', importance: 100 }], [
        { domainType: 'health', perWeek: 4, minutes: 60 },
      ]);
      expect(a.framing).toMatch(/meets every share you set/);
    });
  });
});

describe('healthspan', () => {
  it('shows healthy years (horizon minus the frail tail) and the widen-able window', () => {
    const h = healthspan(35); // horizon 65 → healthy ~55
    expect(h.healthyYearsLeft).toBe(55);
    expect(h.potentialYearsGained).toBe(10);
    expect(h.levers.length).toBe(4);
  });

  it('floors healthy years and never uses doom vocabulary', () => {
    const h = healthspan(85);
    expect(h.healthyYearsLeft).toBeGreaterThanOrEqual(2);
    expect(h.framingText).not.toMatch(FORBIDDEN);
    expect(h.framingText).toMatch(/widening a window/);
  });
});

/**
 * Once all four levers were started the card kept showing four green "added
 * to your habits" lines forever. That is a receipt. The question had already
 * moved from *will you start* to *is it holding*, and nothing on the card had
 * noticed — so it had no reason to be opened again.
 */
describe('what the card is for once everything is started', () => {
  const sig = (key: LeverKey, kept: boolean, ageDays = 60) =>
    ({ key, target: 3, actual: kept ? 3 : 0, ageDays });
  const all = (kept: boolean) =>
    (['strength', 'cardio', 'sleep', 'social'] as LeverKey[]).map((k) => sig(k, kept));

  it('is a menu while anything is unstarted', () => {
    expect(healthspan(35, [sig('strength', true)]).mode).toBe('inviting');
  });

  it('becomes a report once nothing is left to start', () => {
    expect(healthspan(35, all(true)).mode).toBe('holding');
    expect(healthspan(35, all(false)).mode).toBe('holding');
  });

  it('reads slipping first, then unstarted, then new, then kept', () => {
    const h = healthspan(35, [
      sig('strength', true),                                  // held
      { key: 'cardio', target: 3, actual: 0, ageDays: 1 },     // new
      { key: 'sleep', target: 3, actual: 0, ageDays: 90 },     // slipping
      // social left out entirely — open
    ]);
    expect(h.levers.map((l) => l.state)).toEqual(['slipping', 'open', 'new', 'held']);
  });

  it('names the one that is slipping when that is all that is left to do', () => {
    const h = healthspan(35, [
      sig('strength', true), sig('cardio', true), sig('social', true),
      { key: 'sleep', target: 5, actual: 0, ageDays: 40, label: 'Lights out by 11' },
    ]);
    expect(h.mode).toBe('holding');
    expect(h.summaryText).toMatch(/Lights out by 11 is the one slipping/);
    expect(h.summaryText).toMatch(/still asking anything of you/);
  });

  it('credits a named lever with its own years, not everyone else\'s', () => {
    /**
     * Caught live: two levers slipping, and the sentence named one of them
     * while quoting the combined figure — "the walk is the one slipping,
     * worth ~5 of the ~10" when the walk is worth 3.
     */
    const one = healthspan(35, [
      sig('strength', true), sig('cardio', true), sig('social', true),
      { key: 'sleep', target: 5, actual: 0, ageDays: 40 }, // sleep is worth 2
    ]);
    expect(one.yearsSlipping).toBe(2);
    expect(one.summaryText).toMatch(/worth ~2 of the ~10/);
    // A lowered label opening a sentence reads as a typo, and did.
    expect(one.summaryText).not.toMatch(/hard part\. [a-z]/);
  });

  it('says how many are slipping when it is more than one', () => {
    const h = healthspan(35, [
      sig('strength', true), sig('sleep', true),
      { key: 'cardio', target: 4, actual: 0, ageDays: 90, label: '20-minute walk' },
      { key: 'social', target: 7, actual: 4, ageDays: 90, label: '4 of 7 people you track' },
    ]);
    expect(h.yearsSlipping).toBe(5);
    expect(h.summaryText).toMatch(/20-minute walk and staying socially connected are slipping/);
    expect(h.summaryText).toMatch(/~5 of the ~10 years between them/);
  });

  it('never reads a person count back as if it were a habit name', () => {
    const h = healthspan(35, [
      sig('strength', true), sig('sleep', true), sig('cardio', true),
      { key: 'social', target: 7, actual: 1, ageDays: 90, label: '1 of 7 people you track' },
    ]);
    expect(h.summaryText).not.toMatch(/1 of 7 people you track is/);
    expect(h.summaryText).toMatch(/Staying socially connected is the one slipping/);
  });

  it('stops selling entirely when all four are being kept', () => {
    const h = healthspan(35, all(true));
    expect(h.summaryText).toMatch(/nothing here left to start/);
    expect(h.summaryText).not.toMatch(/Start|start big/);
  });

  it('credits what is already held while it is still inviting', () => {
    const h = healthspan(35, [sig('strength', true)]);
    expect(h.summaryText).toMatch(/~3 of the ~10 years in these rhythms are already yours/);
  });

  it('opens with an invitation to someone who has started nothing', () => {
    const h = healthspan(35, []);
    expect(h.mode).toBe('inviting');
    expect(h.summaryText).toMatch(/one a week counts/);
  });

  it('never uses doom vocabulary in any state', () => {
    for (const signals of [[], all(true), all(false), [sig('strength', true)]]) {
      expect(healthspan(35, signals).summaryText).not.toMatch(FORBIDDEN);
    }
  });
});

describe('energy budget', () => {
  it('reports weekly peak hours and a horizon count', () => {
    const e = energyBudget({ workHoursPerWeek: 45, plannedWorkYearsMore: 20 });
    expect(e.peakHoursPerWeek).toBe(21);
    expect(e.peakHoursToHorizon).toBeGreaterThan(0);
  });

  it('labels the daily figure as a population number, not a measurement', () => {
    const e = energyBudget({ workHoursPerWeek: 45 });
    expect(e.assumptions[0]).toMatch(/population figure/);
    expect(e.assumptions[0]).toMatch(/not a measurement of you/);
  });

  /**
   * The card sat directly under one that lists career among the domains
   * somebody ranked and allots hours to it, and described the same working
   * week as the thing taking hours away from their choices. A reader who
   * ranked career first was told the hours they most wanted were the ones
   * being subtracted.
   */
  it('does not claim the working week is outside what they chose', () => {
    const e = energyBudget({ workHoursPerWeek: 45 });
    expect(e.framingText).toMatch(/outside it/);
    expect(e.framingText).not.toMatch(/everything you actually chose/);
    expect(e.framingText).not.toMatch(/Nothing you chose/);
  });

  /**
   * `peakHoursYours` is floored at one, so past a certain working week the
   * number stops measuring and becomes the floor. It used to go on printing
   * "roughly 1 is left over" as though 1 had been computed.
   */
  describe('when the working week claims effectively all of them', () => {
    it('says so at the point the floor actually starts binding', () => {
      const e = energyBudget({ workHoursPerWeek: 60 });
      expect(e.workClaimsAll).toBe(true);
      expect(e.framingText).toMatch(/does not round to a usable number/);
    });

    it('does not say so while the number is still real', () => {
      const e = energyBudget({ workHoursPerWeek: 45 });
      expect(e.workClaimsAll).toBe(false);
      expect(e.framingText).toMatch(/leaves about 6 outside it/);
    });

    it('is never true for somebody with no working week', () => {
      expect(energyBudget({ workHoursPerWeek: 0 }).workClaimsAll).toBe(false);
    });
  });
});

/**
 * What turns this card from a fact into a decision.
 *
 * On its own the sharp-hours figure is a population constant with a
 * working-hours dial on it: true, unfalsifiable, and identical for everyone
 * with the same working week. Against what somebody has actually agreed to it
 * can say the one useful thing — that they have promised more focused work
 * than there are clear hours to hold it.
 */
describe('focused rhythms against the hours that can hold them', () => {
  const week = { workHoursPerWeek: 45 }; // 6 sharp hours are theirs

  it('says nothing at all when nothing focused is committed', () => {
    expect(energyBudget(week).loadText).toBeNull();
    expect(energyBudget(week).committedSharpHours).toBe(0);
  });

  it('reports what is left when the commitments fit', () => {
    const e = energyBudget({ ...week, committedSharpHours: 4, committedSharpCount: 2 });
    expect(e.overCommitted).toBe(false);
    expect(e.sharpHoursFree).toBe(2);
    expect(e.loadText).toMatch(/2 focused rhythms ask for ~4h/);
    expect(e.loadText).toMatch(/~2h of clear time/);
  });

  it('names the overrun when they do not', () => {
    const e = energyBudget({ ...week, committedSharpHours: 8.5, committedSharpCount: 4 });
    expect(e.overCommitted).toBe(true);
    expect(e.sharpHoursFree).toBe(-2.5);
    expect(e.loadText).toMatch(/~2\.5h more than the week holds/);
  });

  it('does not blame the reader for the overrun', () => {
    const e = energyBudget({ ...week, committedSharpHours: 9, committedSharpCount: 4 });
    expect(e.loadText).toMatch(/not a failure of effort/);
    expect(e.loadText).not.toMatch(FORBIDDEN);
  });

  it('does not tell them which one to drop', () => {
    // Which commitment gives is the reader's call. An app that answers "you
    // have promised more than fits" with its own pick has skipped the part
    // that belonged to them.
    const e = energyBudget({ ...week, committedSharpHours: 9, committedSharpCount: 4 });
    expect(e.loadText).not.toMatch(/drop|stop doing|remove|instead of/i);
  });

  it('handles the exact fit without claiming there is room', () => {
    const e = energyBudget({ ...week, committedSharpHours: 6, committedSharpCount: 3 });
    expect(e.overCommitted).toBe(false);
    expect(e.loadText).toMatch(/exactly what you have/);
  });

  it('makes subject and verb agree for a single rhythm', () => {
    const e = energyBudget({ ...week, committedSharpHours: 1, committedSharpCount: 1 });
    expect(e.loadText).toMatch(/^One focused rhythm asks for/);
    expect(e.loadText).not.toMatch(/rhythm ask /);
    expect(e.loadText).not.toMatch(/rhythms/);
  });

  it('keeps the plural for more than one', () => {
    const e = energyBudget({ ...week, committedSharpHours: 4, committedSharpCount: 3 });
    expect(e.loadText).toMatch(/^Your 3 focused rhythms ask for/);
  });

  it('ignores rubbish rather than reporting it', () => {
    const e = energyBudget({ ...week, committedSharpHours: -5, committedSharpCount: 2 });
    expect(e.committedSharpHours).toBe(0);
    expect(e.loadText).toBeNull();
  });
});

/**
 * The old card told a 20-hour week and a 70-hour week the same 21 hours,
 * which is the same as telling neither of them anything.
 */
describe('sharp hours against a real working week', () => {
  it('leaves a short week most of its sharp hours', () => {
    const e = energyBudget({ workHoursPerWeek: 20 });
    expect(e.peakHoursAtWork).toBe(7);
    expect(e.peakHoursYours).toBe(14);
  });

  it('leaves a long week almost none', () => {
    const e = energyBudget({ workHoursPerWeek: 60 });
    expect(e.peakHoursAtWork).toBe(20);
    expect(e.peakHoursYours).toBe(1);
  });

  it('moves between two people, which was the whole point', () => {
    const light = energyBudget({ workHoursPerWeek: 25 });
    const heavy = energyBudget({ workHoursPerWeek: 55 });
    expect(light.peakHoursYours).toBeGreaterThan(heavy.peakHoursYours);
  });

  it('never reports zero hours of your own, however long the week', () => {
    for (const w of [70, 90, 120, 168]) {
      const e = energyBudget({ workHoursPerWeek: w });
      expect(e.peakHoursYours).toBeGreaterThanOrEqual(1);
      expect(e.framingText).not.toMatch(FORBIDDEN);
    }
  });

  it('claims nothing when someone is not working', () => {
    const e = energyBudget({ workHoursPerWeek: 0 });
    expect(e.peakHoursAtWork).toBe(0);
    expect(e.peakHoursYours).toBe(21);
    // The one-in-three assumption is about a working week; with none, it lies.
    expect(e.assumptions).toHaveLength(1);
  });

  it('names their actual hours back to them', () => {
    expect(energyBudget({ workHoursPerWeek: 38 }).framingText).toMatch(/38-hour working week/);
  });

  it('falls back to a stated 45 rather than inventing a personal number', () => {
    expect(energyBudget().framingText).toMatch(/45-hour working week/);
  });
});

/**
 * The card used to tell everyone "under-rest is quietly shrinking this
 * number" having never once asked anybody about sleep.
 */
describe('what the card is allowed to say about sleep', () => {
  it('admits it does not know when no sleep rhythm exists', () => {
    const e = energyBudget({ workHoursPerWeek: 45 });
    expect(e.sleepBasis).toBe('unknown');
    expect(e.sleepText).toMatch(/never been asked about you/);
    expect(e.sleepText).not.toMatch(/slipping/);
  });

  it('credits a rhythm being kept, in their own words', () => {
    const e = energyBudget({ workHoursPerWeek: 45, sleep: 'held', sleepLabel: 'Lights out by 11' });
    expect(e.sleepBasis).toBe('kept');
    expect(e.sleepText).toMatch(/Lights out by 11/);
  });

  it('says the number is optimistic only when a rhythm is actually slipping', () => {
    const e = energyBudget({ workHoursPerWeek: 45, sleep: 'slipping' });
    expect(e.sleepBasis).toBe('slipping');
    expect(e.sleepText).toMatch(/below this one/);
  });

  it('does not grade a rhythm that just began', () => {
    const e = energyBudget({ workHoursPerWeek: 45, sleep: 'new' });
    expect(e.sleepBasis).toBe('starting');
    expect(e.sleepText).toMatch(/just started/);
    expect(e.sleepText).not.toMatch(/slipping|below/);
  });

  it('keeps the number itself out of it — direction is known, size is not', () => {
    const hours = (sleep: 'held' | 'slipping' | 'new' | 'open') =>
      energyBudget({ workHoursPerWeek: 45, sleep }).peakHoursYours;
    expect(new Set([hours('held'), hours('slipping'), hours('new'), hours('open')]).size).toBe(1);
  });
});

describe('cost of delay', () => {
  it('gives each domain a compounding metaphor, not just money', () => {
    expect(costOfDelay('health', 10).framingText).toMatch(/compound/i);
    expect(costOfDelay('growth', 10).framingText).toMatch(/interest/);
    expect(costOfDelay('friends', 10).framingText).toMatch(/presence/);
  });

  it('falls back gracefully for domains without a bespoke metaphor', () => {
    expect(costOfDelay('impact', 10).framingText).toMatch(/compounds/);
  });
});

describe('seasons', () => {
  it('picks the season by what is most at risk, not what scores highest', () => {
    const s = suggestSeason([
      { domainType: 'family', importance: 90, neglectRisk: 20 },
      { domainType: 'health', importance: 40, neglectRisk: 75 },
    ]);
    expect(s.focusDomain).toBe('health'); // at-risk beats high-importance
    expect(s.atRiskDomains).toContain('health');
    expect(s.framingText).toMatch(/why most people quit/);
  });

  it('when nothing is at risk and nothing knows shares, falls back to importance', () => {
    const s = suggestSeason([
      { domainType: 'family', importance: 90, neglectRisk: 10 },
      { domainType: 'health', importance: 60, neglectRisk: 15 },
    ]);
    expect(s.atRiskDomains).toEqual([]);
    expect(s.reason).toBe('deepen');
    expect(s.focusDomain).toBe('family');
  });

  /**
   * The bug this branch was carrying.
   *
   * "Deepen rather than rescue" picked the highest-importance domain — which
   * is very often the one already being over-served. A reader whose health
   * was getting more attention than they had asked for was told to spend
   * ninety more days on health, while the areas quietly running under their
   * claim went unmentioned.
   */
  describe('deepening where there is actually room', () => {
    it('does not pick the domain already over-served', () => {
      const s = suggestSeason([
        // Ranked first, and getting more than its claim already.
        { domainType: 'health', importance: 70, neglectRisk: 10, shortfall: -12 },
        { domainType: 'family', importance: 40, neglectRisk: 20, shortfall: 7 },
        { domainType: 'career', importance: 20, neglectRisk: 25, shortfall: 5 },
      ]);
      expect(s.focusDomain).not.toBe('health');
      expect(s.focusDomain).toBe('family');
      expect(s.reason).toBe('deepen');
    });

    it('capitalises a domain that opens a sentence', () => {
      const s = suggestSeason([
        { domainType: 'health', importance: 70, neglectRisk: 10, shortfall: 9 },
      ]);
      // The assertion is the capital letter, not the sentence around it.
      expect(s.framingText).toMatch(/\. Health /);
      expect(s.framingText).not.toMatch(/\. health /);
    });

    it('still lets a rescue outrank any amount of room', () => {
      const s = suggestSeason([
        { domainType: 'family', importance: 40, neglectRisk: 20, shortfall: 30 },
        { domainType: 'career', importance: 20, neglectRisk: 80, shortfall: 2 },
      ]);
      expect(s.focusDomain).toBe('career');
      expect(s.reason).toBe('rescue');
    });

    it('breaks a tie on room by what was ranked higher', () => {
      const s = suggestSeason([
        { domainType: 'career', importance: 20, neglectRisk: 10, shortfall: 6 },
        { domainType: 'family', importance: 40, neglectRisk: 10, shortfall: 6 },
      ]);
      expect(s.focusDomain).toBe('family');
    });

    it('hands the question back when nothing is short at all', () => {
      const s = suggestSeason([
        { domainType: 'health', importance: 70, neglectRisk: 10, shortfall: -5 },
        { domainType: 'family', importance: 40, neglectRisk: 10, shortfall: -2 },
      ]);
      expect(s.reason).toBe('settled');
      // No domain can be deepened without funding it from another, so the
      // card must not crown one as though it could.
      expect(s.framingText).toMatch(/whether the ranking itself still fits/);
      expect(s.framingText).not.toMatch(FORBIDDEN);
    });

    it('never uses doom vocabulary in any branch', () => {
      const cases = [
        [{ domainType: 'health', importance: 70, neglectRisk: 90, shortfall: 4 }],
        [{ domainType: 'health', importance: 70, neglectRisk: 10, shortfall: 4 }],
        [{ domainType: 'health', importance: 70, neglectRisk: 10, shortfall: -4 }],
      ];
      for (const c of cases) expect(suggestSeason(c).framingText).not.toMatch(FORBIDDEN);
    });
  });
});

/**
 * The healthspan levers, once they know anything about the reader.
 *
 * The card used to offer all four to everyone, forever, and sum their years
 * into "up to ~10 more good years" — the same sentence at twenty-five and at
 * seventy, for someone doing all four and someone doing none. It could not
 * tell those two people apart, and it never once credited a rhythm actually
 * being kept.
 *
 * The years themselves stay population figures. What is personal is which of
 * them someone is already holding.
 */
describe('healthspan levers against a real life', () => {
  const at = (key: any, target: number, actual: number, label?: string) =>
    ({ key, target, actual, label });
  const lever = (h: any, key: string) => h.levers.find((l: any) => l.key === key);

  it('credits a rhythm being kept instead of offering it', () => {
    const h = healthspan(30, [at('cardio', 4, 4, '20-minute walk')]);
    expect(lever(h, 'cardio').state).toBe('held');
    expect(lever(h, 'cardio').habitLabel).toBe('20-minute walk');
    expect(h.yearsHeld).toBe(3);
  });

  it('separates a rhythm being missed from one never started', () => {
    // Set four walks a week, doing one and a half. That is not "open" — it is
    // the most useful thing the card can say, and it needs its own state.
    const h = healthspan(30, [at('cardio', 4, 1.5)]);
    expect(lever(h, 'cardio').state).toBe('slipping');
    expect(lever(h, 'strength').state).toBe('open');
    expect(h.yearsSlipping).toBe(3);
    expect(h.yearsHeld).toBe(0);
  });

  it('is forgiving at the edge, the way the streaks are', () => {
    // Three walks out of four is a kept rhythm. A card that calls that a
    // failure is not telling the truth about a life either.
    expect(lever(healthspan(30, [at('cardio', 4, 3.2)]), 'cardio').state).toBe('held');
    expect(lever(healthspan(30, [at('cardio', 4, 3)]), 'cardio').state).toBe('slipping');
  });

  it('says nothing about levers it has no signal for', () => {
    const h = healthspan(30, [at('cardio', 4, 4)]);
    for (const key of ['strength', 'sleep', 'social']) {
      expect(lever(h, key).state).toBe('open');
      expect(lever(h, key).target).toBeUndefined();
    }
    expect(h.yearsOpen).toBe(7);
  });

  it('accounts for every lever exactly once', () => {
    const h = healthspan(30, [at('cardio', 4, 4), at('strength', 2, 1)]);
    expect(h.yearsHeld + h.yearsSlipping + h.yearsOpen).toBe(h.potentialYearsGained);
  });

  it('behaves as it always did when it knows nothing', () => {
    const h = healthspan(35);
    expect(h.healthyYearsLeft).toBe(55);
    expect(h.yearsOpen).toBe(10);
    expect(h.yearsHeld).toBe(0);
    expect(h.levers.every((l: any) => l.state === 'open')).toBe(true);
  });

  it('no longer calls a planning horizon a guarantee of being able-bodied', () => {
    // "65 fully able years" for a 25-year-old is a health claim. The horizon
    // is a lens for deciding; the copy now says which it is.
    const h = healthspan(25);
    expect(h.framingText).toMatch(/planning horizon/);
    expect(h.framingText).not.toMatch(/fully able/);
    expect(h.framingText).not.toMatch(FORBIDDEN);
  });
});

describe('reading a habit as a lever', () => {
  it('recognises the rhythms people actually write down', () => {
    expect(classifyLever('20-minute walk')).toBe('cardio');
    expect(classifyLever('Morning run')).toBe('cardio');
    expect(classifyLever('Gym twice a week')).toBe('strength');
    expect(classifyLever('Push-ups before shower')).toBe('strength');
    expect(classifyLever('Lights out by 11')).toBe('sleep');
  });

  it('would rather recognise nothing than the wrong thing', () => {
    // An unrecognised habit leaves the lever open and offers to start one,
    // which is recoverable. Filing "Sunday call with parents" under cardio
    // because it mentions a walk to the phone is not.
    expect(classifyLever('Sunday call with parents')).toBeNull();
    expect(classifyLever('Read for 20 minutes')).toBeNull();
    expect(classifyLever('Journal at night')).toBeNull();
  });
});

describe('a rhythm just agreed to', () => {
  const at = (key: any, target: number, actual: number, ageDays?: number) =>
    ({ key, target, actual, ageDays });
  const lever = (h: any, key: string) => h.levers.find((l: any) => l.key === key);

  it('is not called failing before a week of it has passed', () => {
    // Agree to strength training, look at the card five seconds later, and be
    // told the rhythm is slipping. The app must not do that to anyone.
    const h = healthspan(30, [at('strength', 2, 0, 0)]);
    expect(lever(h, 'strength').state).toBe('new');
    expect(h.yearsSlipping).toBe(0);
    expect(h.yearsNew).toBe(3);
  });

  it('does not credit years that have not been earned either', () => {
    const h = healthspan(30, [at('strength', 2, 0, 0)]);
    expect(h.yearsHeld).toBe(0);
  });

  it('grades it once it has had its week', () => {
    expect(lever(healthspan(30, [at('strength', 2, 0, 8)]), 'strength').state).toBe('slipping');
  });

  it('credits a new rhythm immediately if it is already being kept', () => {
    // Grace delays the failing verdict, never the crediting one.
    expect(lever(healthspan(30, [at('strength', 2, 2, 1)]), 'strength').state).toBe('held');
  });

  it('still accounts for every lever exactly once', () => {
    const h = healthspan(30, [at('strength', 2, 0, 0), at('cardio', 4, 4, 90)]);
    expect(h.yearsHeld + h.yearsSlipping + h.yearsNew + h.yearsOpen)
      .toBe(h.potentialYearsGained);
  });
});
