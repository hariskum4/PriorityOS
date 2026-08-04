import { describe, it, expect } from 'vitest';
import { weekEcho, driftEcho, somedayEcho, revealLedger } from './microReveals';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted|lazy|should have|last chance/i;

const LABELS: Record<string, string> = {
  family: 'Family / Parents', health: 'Health', career: 'Career', friends: 'Friends',
};
const labelOf = (d: string) => LABELS[d] ?? d;

describe('weekEcho', () => {
  it('hands an office worker their real free-hours number', () => {
    const echo = weekEcho({ workHoursPerWeek: 45, workType: 'office_9_5' });
    expect(echo?.stat?.value).toBe(47); // 168 − 52.5 sleep − 45 work − 24 overhead
    expect(echo?.line).toContain('45 working hours');
  });

  it('a homemaker hears the household named, not a job', () => {
    const echo = weekEcho({ workHoursPerWeek: 45, workType: 'homemaker' });
    expect(echo?.stat?.value).toBe(63); // careWork overhead is 8, not 24
    expect(echo?.line).toContain('household');
    expect(echo?.line).not.toMatch(/working hours|employer/);
  });

  it('a student hears class and study, not an employer', () => {
    const echo = weekEcho({ workHoursPerWeek: 35, workType: 'student' });
    expect(echo?.stat?.value).toBe(57);
    expect(echo?.line).toMatch(/class/);
  });

  it('a retiree with zero hours gets the widest-budget framing', () => {
    const echo = weekEcho({ workHoursPerWeek: 0, workType: 'retired' });
    expect(echo?.stat?.value).toBe(92);
    expect(echo?.line).toContain('No employer on the clock');
  });

  it('is silent until both halves of the answer exist', () => {
    expect(weekEcho({ workHoursPerWeek: 45, workType: '' })).toBeNull();
    expect(weekEcho({ workHoursPerWeek: null, workType: 'office_9_5' })).toBeNull();
  });

  it('never uses mortality or guilt words, for any life', () => {
    for (const [workType, hours] of [
      ['office_9_5', 45], ['homemaker', 45], ['student', 35], ['retired', 0],
      ['between_jobs', 0], ['freelance', 55],
    ] as const) {
      const echo = weekEcho({ workHoursPerWeek: hours, workType });
      expect(echo?.line).not.toMatch(FORBIDDEN);
    }
  });
});

describe('driftEcho', () => {
  it('names the said-versus-lived gap, citing the score they just gave', () => {
    const echo = driftEcho({
      ranking: ['family', 'health', 'career'],
      neglected: ['health'],
      reality: { family: 4, health: 2, career: 3 },
      labelOf,
    });
    expect(echo?.line).toContain('Health');
    expect(echo?.line).toContain('#2');
    expect(echo?.line).toContain('2/5');
  });

  it('still reads without the scores to hand', () => {
    const echo = driftEcho({
      ranking: ['family', 'health'], neglected: ['health'], labelOf,
    });
    expect(echo?.line).toContain('#2');
    expect(echo?.line).not.toContain('/5');
  });

  it('receives an unranked drift quietly, with a next step', () => {
    const echo = driftEcho({ ranking: ['family'], neglected: ['friends'], labelOf });
    expect(echo?.line).toContain('first small step');
    expect(echo?.line).not.toContain('#');
  });

  it('says nothing when nothing is drifting', () => {
    expect(driftEcho({ ranking: ['family'], neglected: [] })).toBeNull();
  });

  it('never guilt-trips the admission', () => {
    for (const neglected of [['family'], ['friends'], ['family', 'health', 'career', 'friends']]) {
      const echo = driftEcho({ ranking: ['family', 'health'], neglected, labelOf });
      expect(echo?.line).not.toMatch(FORBIDDEN);
    }
  });
});

describe('somedayEcho', () => {
  it('mirrors the postponed thing under its derived goal name', () => {
    const echo = somedayEcho(
      'Visit Amma for a full week. I keep meaning to but work always gets in the way.',
    );
    expect(echo?.quote).toBe('Visit Amma for a full week');
    expect(echo?.line).toContain('first real goal');
  });

  it('is silent for an empty answer', () => {
    expect(somedayEcho('   ')).toBeNull();
  });
});

describe('revealLedger', () => {
  it('lists every fact a full lane produced, in giving order', () => {
    const ledger = revealLedger({
      freeHoursPerWeek: 47,
      ranking: ['family', 'health', 'career'],
      neglectedCount: 2,
      personName: 'Amma',
      goalTitle: 'Visit Amma for a full week',
      feeling: 'closer to Amma',
      labelOf,
    });
    expect(ledger?.lines).toHaveLength(6);
    expect(ledger?.lines[0]).toContain('~47 hours');
    expect(ledger?.lines[1]).toContain('Family / Parents first');
    expect(ledger?.lines[2]).toBe('Two drifting areas, named out loud.');
    expect(ledger?.lines[3]).toContain("Amma's time");
    expect(ledger?.promise).toContain('Sunday Session');
  });

  it('a fast lane lists only what it actually gave', () => {
    const ledger = revealLedger({
      ranking: ['family', 'health', 'career'], personName: 'Amma', labelOf,
    });
    expect(ledger?.lines).toHaveLength(2);
  });

  it('returns nothing rather than an empty receipt', () => {
    expect(revealLedger({})).toBeNull();
  });

  it('keeps the tone rules on every line', () => {
    const ledger = revealLedger({
      freeHoursPerWeek: 63, ranking: ['family'], neglectedCount: 1,
      personName: 'Manu', goalTitle: 'Start the book', feeling: 'lighter', labelOf,
    });
    for (const line of [...(ledger?.lines ?? []), ledger?.intro ?? '', ledger?.promise ?? '']) {
      expect(line).not.toMatch(FORBIDDEN);
      expect(line).not.toContain('!');
    }
  });
});
