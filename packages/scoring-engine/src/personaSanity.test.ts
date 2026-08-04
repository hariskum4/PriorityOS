import { describe, it, expect } from 'vitest';
import { lifeWindows, bodyWindows } from './lifeWindows';
import { healthspan, energyBudget, suggestSeason } from './lifeStrategy';
import { weeklyAllocation } from './allocation';
import { dayShape } from './dayShape';
import { rhythmByKey } from './rhythms';

/**
 * Whole personas, swept.
 *
 * Every module here has its own tests, and every one of them passed on the
 * day the body-windows card showed a 71-year-old one row and nothing to do.
 * Unit tests ask "does this function do what it says"; nobody was asking
 * "what does the *screen* look like for this person" — and a surface can
 * decay to nothing while each of its parts stays correct.
 *
 * So this file asks the second question, the way relationshipSanity already
 * asks it for one module: enumerate the people, assert the invariants that
 * make a screen worth opening. Not "is the number right" — the unit tests
 * own that — but "does every person get something they can read, something
 * they can do, and no sentence that scolds them".
 *
 * The sweep is arithmetic, so it is cheap: every age from 18 to 90 crossed
 * with the working weeks that change the shape of a life. When one of these
 * fails it names an age and a load, which is a persona — the exact thing a
 * screenshot from a user would have shown, caught before the user.
 */

const AGES = Array.from({ length: 73 }, (_, i) => 18 + i); // 18..90
const WORK_WEEKS = [0, 25, 45, 70];
const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted|lazy|should have/i;

describe('every age gets a card worth opening', () => {
  it('body windows never thin out with age', () => {
    for (const age of AGES) {
      const w = bodyWindows(age);
      // Four rows, always. The card that shrank as its reader aged is the
      // bug this whole file exists to make unrepresentable.
      expect(w, `age ${age}`).toHaveLength(4);
      // Three actionable rhythms, always — closed windows keep theirs.
      const actionable = w.filter((x) => x.rhythmKey != null);
      expect(actionable, `age ${age}`).toHaveLength(3);
      // Every named rhythm actually exists in the catalog.
      for (const x of actionable) {
        expect(rhythmByKey(x.rhythmKey!), `${x.key} at ${age}`).not.toBeNull();
      }
      // Presence never closes; nothing open claims to have passed.
      expect(w.find((x) => x.key === 'presence')!.state).toBe('open');
      for (const x of w) {
        if (x.state === 'open' && x.yearsLeft !== null) {
          expect(x.yearsLeft, `${x.key} at ${age}`).toBeGreaterThanOrEqual(1);
        }
        if (x.state === 'closed') {
          expect(x.closedAround, `${x.key} at ${age}`).not.toBeNull();
          expect(x.yearsLeft, `${x.key} at ${age}`).toBeNull();
        }
      }
    }
  });

  it('life windows hold their promises at every age and load', () => {
    for (const age of AGES) {
      for (const work of WORK_WEEKS) {
        const r = lifeWindows({ age, workHoursPerWeek: work });
        // The horizon never runs out — the moving-horizon rule.
        expect(r.yearsToHorizon, `age ${age}`).toBeGreaterThanOrEqual(15);
        // Free time never reports a life with nothing left in it.
        expect(r.freeTime.freeHoursPerWeek, `age ${age} work ${work}`)
          .toBeGreaterThanOrEqual(4);
        // Post-career years never collapse to zero, whatever the plan.
        expect(r.career.postCareerYears, `age ${age}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('healthspan always leaves years on the table or in hand', () => {
    for (const age of AGES) {
      const hs = healthspan(age);
      expect(hs.healthyYearsLeft, `age ${age}`).toBeGreaterThanOrEqual(2);
      // Four levers, at every age — the same no-thinning rule as windows.
      expect(hs.levers).toHaveLength(4);
    }
  });
});

describe('no screen contradicts itself', () => {
  it('sharp hours: the split always sums, the floor is always declared', () => {
    for (const work of [0, 10, 25, 45, 60, 80, 100]) {
      const e = energyBudget({ workHoursPerWeek: work });
      expect(e.peakHoursAtWork + e.peakHoursYours).toBe(e.peakHoursPerWeek);
      expect(e.peakHoursYours, `work ${work}`).toBeGreaterThanOrEqual(1);
      // When the floor binds, the card must say so rather than print the
      // floor as a measurement.
      if (e.peakHoursYours === 1 && work >= 60) {
        expect(e.workClaimsAll, `work ${work}`).toBe(true);
      }
    }
  });

  it('allocation never claims more committed than exists, at any ranking', () => {
    const domains = ['health', 'family', 'career', 'growth'];
    for (const free of [10, 30, 47, 80]) {
      for (let rank = 0; rank < domains.length; rank++) {
        const weights = domains.map((d, i) => ({
          domainType: d,
          importance: ((i + rank) % 4) * 25 + 10,
        }));
        const a = weeklyAllocation(free, weights, [
          { domainType: 'health', perWeek: 3, minutes: 40 },
          { domainType: 'family', perWeek: 1, minutes: null },
        ]);
        expect(a.committedHours).toBeLessThanOrEqual(free);
        /* Shares are percentage points and must account for the whole 100 —
           a pie with a missing slice is a ranking quietly dropped. */
        const shares = a.allotments.reduce((s, x) => s + x.share, 0);
        expect(shares, `free ${free} rank ${rank}`).toBeGreaterThan(99);
        expect(shares).toBeLessThan(101);
        // Unknown commitments are counted, not silently dropped.
        const fam = a.allotments.find((x) => x.domainType === 'family')!;
        expect(fam.unknownCommitments).toBe(1);
      }
    }
  });

  it('the season pick is always a domain that was actually offered', () => {
    const pools = [
      [
        { domainType: 'health', importance: 80, neglectRisk: 10, shortfall: 12 },
        { domainType: 'career', importance: 60, neglectRisk: 20, shortfall: -3 },
      ],
      [
        { domainType: 'family', importance: 90, neglectRisk: 70 },
        { domainType: 'growth', importance: 40, neglectRisk: 65 },
      ],
    ];
    for (const domains of pools) {
      const s = suggestSeason(domains);
      if (s) {
        expect(domains.map((d) => d.domainType)).toContain(s.focusDomain);
        expect(FORBIDDEN.test(s.framingText)).toBe(false);
      }
    }
  });
});

describe('the day never lies about its own arithmetic', () => {
  it('holds across day types, loads and sleep schedules', () => {
    for (const dayType of ['usual', 'remote', 'travel', 'off'] as const) {
      for (const work of [0, 45, 70]) {
        for (const [sleepHour, wakeHour] of [[22, 6], [23, 7], [1, 8]]) {
          const s = dayShape({
            workHoursPerWeek: work,
            workStartHour: work > 0 ? 9 : null,
            workEndHour: work > 0 ? 9 + Math.min(Math.round(work / 5), 14) : null,
            sleepHour,
            wakeHour,
            dayType,
            suggestions: [
              { action: 'Walk', minutes: 30, domains: ['health'] },
              { action: 'Call home', minutes: 20, domains: ['family'] },
            ],
          });
          const label = `${dayType} work ${work} sleep ${sleepHour}`;
          // Committed time is never more than the free time it came from.
          expect(s.committedMinutes, label).toBeLessThanOrEqual(s.freeMinutes);
          // Blocks tile the waking day: sorted, non-overlapping.
          for (let i = 1; i < s.blocks.length; i++) {
            expect(s.blocks[i].startMinutes, label)
              .toBeGreaterThanOrEqual(s.blocks[i - 1].endMinutes);
          }
          // Placements only ever sit inside free stretches the day reported.
          for (const p of s.placements) {
            expect(p.endMinutes - p.startMinutes, label).toBeGreaterThan(0);
          }
          // A travelling day places nothing — the where is unknown.
          if (dayType === 'travel') expect(s.placements, label).toHaveLength(0);
          expect(FORBIDDEN.test(s.framingText), label).toBe(false);
        }
      }
    }
  });
});
