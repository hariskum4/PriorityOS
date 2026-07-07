import { describe, it, expect } from 'vitest';
import {
  calculateImportanceScore,
  calculateAttentionScore,
  calculateNeglectRiskScore,
  calculateDomainScore,
  calculateRelationshipPriorityScore,
  rankMissions,
  decay,
  EVENT_WEIGHTS,
} from './index';
import { estimateVisitsRemaining, estimateCallDelta, cadenceToPerYear } from './opportunity';
import { advanceStreak, levelForXp, xpProgress } from './streaks';

describe('importance', () => {
  it('top-ranked domain with goals and flags scores near 100', () => {
    const s = calculateImportanceScore({
      priorityRank: 1,
      totalRanked: 5,
      activeGoalCount: 3,
      flaggedAsNeglected: true,
      regretRiskFlagged: true,
    });
    expect(s).toBeGreaterThan(90);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('unranked domain with nothing scores 0', () => {
    expect(
      calculateImportanceScore({
        totalRanked: 5,
        activeGoalCount: 0,
        flaggedAsNeglected: false,
        regretRiskFlagged: false,
      }),
    ).toBe(0);
  });

  it('is monotonic in rank', () => {
    const at = (rank: number) =>
      calculateImportanceScore({
        priorityRank: rank,
        totalRanked: 5,
        activeGoalCount: 0,
        flaggedAsNeglected: false,
        regretRiskFlagged: false,
      });
    expect(at(1)).toBeGreaterThan(at(3));
    expect(at(3)).toBeGreaterThan(at(5));
  });
});

describe('attention', () => {
  it('recent activity scores much higher than old activity', () => {
    const recent = calculateAttentionScore([
      { ageDays: 1, weight: EVENT_WEIGHTS.missionCompleted },
      { ageDays: 2, weight: EVENT_WEIGHTS.habitCompleted },
    ]);
    const old = calculateAttentionScore([
      { ageDays: 40, weight: EVENT_WEIGHTS.missionCompleted },
      { ageDays: 45, weight: EVENT_WEIGHTS.habitCompleted },
    ]);
    expect(recent).toBeGreaterThan(old * 3);
  });

  it('caps at 100', () => {
    const events = Array.from({ length: 50 }, () => ({
      ageDays: 0,
      weight: 10,
    }));
    expect(calculateAttentionScore(events)).toBe(100);
  });

  it('decay halves at half-life', () => {
    expect(decay(10, 10)).toBeCloseTo(0.5);
    expect(decay(0, 10)).toBe(1);
  });
});

describe('neglect risk', () => {
  it('high importance + zero attention + long staleness = high risk', () => {
    const s = calculateNeglectRiskScore({
      importance: 95,
      attention: 5,
      daysSinceLastMeaningfulAction: 45,
      snoozeCount: 4,
    });
    expect(s).toBeGreaterThan(70);
  });

  it('unimportant domain cannot have high neglect risk', () => {
    const s = calculateNeglectRiskScore({
      importance: 10,
      attention: 0,
      daysSinceLastMeaningfulAction: 60,
      snoozeCount: 5,
    });
    expect(s).toBeLessThan(15);
  });

  it('over-attention produces no gap risk', () => {
    const s = calculateNeglectRiskScore({
      importance: 50,
      attention: 90,
      daysSinceLastMeaningfulAction: 0,
      snoozeCount: 0,
    });
    expect(s).toBe(0);
  });
});

describe('domain score', () => {
  it('detects upward trend', () => {
    const r = calculateDomainScore({
      attention: 70,
      neglectRisk: 20,
      previousAttention: 40,
    });
    expect(r.trend).toBe('up');
    expect(r.health).toBeGreaterThan(60);
  });

  it('detects downward trend', () => {
    const r = calculateDomainScore({
      attention: 20,
      neglectRisk: 70,
      previousAttention: 60,
    });
    expect(r.trend).toBe('down');
  });
});

describe('relationship priority', () => {
  it('overdue close elderly parent outranks on-schedule acquaintance', () => {
    const parent = calculateRelationshipPriorityScore({
      closenessScore: 10,
      wantsMoreTime: true,
      desiredContactCadence: 'weekly',
      daysSinceLastContact: 21,
      age: 68,
    });
    const acquaintance = calculateRelationshipPriorityScore({
      closenessScore: 4,
      wantsMoreTime: false,
      desiredContactCadence: 'monthly',
      daysSinceLastContact: 10,
      age: 30,
    });
    expect(parent).toBeGreaterThan(acquaintance + 30);
  });

  it('never-contacted person is treated as overdue', () => {
    const s = calculateRelationshipPriorityScore({
      closenessScore: 8,
      wantsMoreTime: true,
      desiredContactCadence: 'weekly',
      daysSinceLastContact: null,
      age: null,
    });
    expect(s).toBeGreaterThan(50);
  });
});

describe('mission ranking', () => {
  it('surfaces neglected relationship mission over routine task', () => {
    const ranked = rankMissions([
      {
        id: 'routine',
        domainNeglectRisk: 10,
        domainImportance: 40,
        dueInDays: 3,
        estimatedMinutes: 60,
        snoozeCount: 0,
      },
      {
        id: 'call-mom',
        domainNeglectRisk: 80,
        domainImportance: 90,
        relationshipPriority: 85,
        dueInDays: 0,
        estimatedMinutes: 15,
        snoozeCount: 2,
      },
    ]);
    expect(ranked[0].id).toBe('call-mom');
  });
});

describe('opportunity estimates', () => {
  it('visits estimate is pace * horizon and carries assumptions', () => {
    const e = estimateVisitsRemaining({
      visitsPerYear: 3,
      horizonYears: 10,
      personLabel: 'your parents',
    });
    expect(e.estimate).toBe(30);
    expect(e.assumptions.length).toBeGreaterThanOrEqual(3);
    expect(e.uplift?.newEstimate).toBe(50);
  });

  it('call delta computes yearly difference', () => {
    expect(cadenceToPerYear('weekly')).toBe(52);
    const d = estimateCallDelta({
      currentCadence: 'monthly',
      proposedCadence: 'weekly',
      personLabel: 'Dad',
    });
    expect(d.estimate).toBe(52 - 12);
  });
});

describe('streaks + xp', () => {
  it('missed period consumes grace instead of resetting', () => {
    let s = { current: 6, best: 6, graceRemaining: 1 };
    s = advanceStreak(s, { targetCompletions: 3, actualCompletions: 1 });
    expect(s.current).toBe(6);
    expect(s.graceRemaining).toBe(0);
    s = advanceStreak(s, { targetCompletions: 3, actualCompletions: 0 });
    expect(s.current).toBe(0);
  });

  it('hitting target extends streak and best', () => {
    let s = { current: 2, best: 2, graceRemaining: 1 };
    s = advanceStreak(s, { targetCompletions: 3, actualCompletions: 3 });
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
  });

  it('level curve is monotonic', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(150)).toBeGreaterThanOrEqual(2);
    const p = xpProgress(350);
    expect(p.intoLevel).toBeGreaterThanOrEqual(0);
    expect(p.neededForNext).toBeGreaterThan(0);
  });
});
