import { describe, it, expect } from 'vitest';
import {
  evaluateDecision, weightsFor, decisionEngine, DecisionQuestion,
} from './decision';
import { EngineContext } from './contract';

const NOW = new Date('2026-07-28T09:00:00Z');

/** A real fork: a bigger salary that costs evenings, versus staying put. */
const jobChange: DecisionQuestion = {
  id: 'job-2026',
  question: 'whether to take the London offer',
  horizonYears: 10,
  options: [
    {
      id: 'take',
      label: 'Take the offer',
      reversible: false,
      scores: {
        valuesAlignment: 35,
        longTermHappiness: 45,
        financialImpact: 90,
        healthImpact: 30,
        relationshipImpact: 20,
        regretProbability: 60,
        opportunityCost: 70,
        risk: 65,
        stress: 80,
        energy: 35,
        timeCost: 85,
      },
    },
    {
      id: 'stay',
      label: 'Stay where you are',
      isStatusQuo: true,
      reversible: true,
      scores: {
        valuesAlignment: 70,
        longTermHappiness: 65,
        financialImpact: 45,
        healthImpact: 65,
        relationshipImpact: 80,
        regretProbability: 40,
        opportunityCost: 45,
        risk: 20,
        stress: 30,
        energy: 60,
        timeCost: 35,
      },
    },
  ],
};

describe('decision weighting', () => {
  it('weights values alignment and regret above money', () => {
    const w = weightsFor();
    expect(w.valuesAlignment).toBeGreaterThan(w.financialImpact);
    expect(w.regretProbability).toBeGreaterThan(w.financialImpact);
  });

  it('reshapes weights by the person’s own priority order', () => {
    const relationshipsFirst = weightsFor(['relationships', 'health', 'career', 'finances']);
    const financesFirst = weightsFor(['finances', 'career', 'health', 'relationships']);

    expect(relationshipsFirst.relationshipImpact)
      .toBeGreaterThan(financesFirst.relationshipImpact);
    expect(financesFirst.financialImpact)
      .toBeGreaterThan(relationshipsFirst.financialImpact);
  });

  it('gives two people with different values genuinely different answers', () => {
    // Same inputs, different priorities — this is the whole point of the engine.
    const forFamilyPerson = evaluateDecision({
      ...jobChange,
      valueRanking: ['relationships', 'health', 'purpose', 'career', 'finances'],
    });
    const forMoneyPerson = evaluateDecision({
      ...jobChange,
      valueRanking: ['finances', 'career', 'growth', 'health', 'relationships'],
    });

    const familyGap = forFamilyPerson.assessments.find((a) => a.optionId === 'stay')!.total
      - forFamilyPerson.assessments.find((a) => a.optionId === 'take')!.total;
    const moneyGap = forMoneyPerson.assessments.find((a) => a.optionId === 'stay')!.total
      - forMoneyPerson.assessments.find((a) => a.optionId === 'take')!.total;

    expect(familyGap).toBeGreaterThan(moneyGap);
  });
});

describe('cost factors', () => {
  it('treats high stress and risk as bad, not good', () => {
    const base = {
      valuesAlignment: 60, longTermHappiness: 60, financialImpact: 60,
      healthImpact: 60, relationshipImpact: 60, regretProbability: 50,
      opportunityCost: 50, energy: 60, timeCost: 50,
    };
    const r = evaluateDecision({
      id: 'q', question: 'q',
      options: [
        { id: 'calm', label: 'Calm', scores: { ...base, risk: 10, stress: 10 } },
        { id: 'chaos', label: 'Chaos', scores: { ...base, risk: 90, stress: 90 } },
      ],
    });
    expect(r.lean?.optionId).toBe('calm');
  });
});

describe('inaction is not free', () => {
  it('penalises the status quo, because omissions are regretted more', () => {
    const identical = {
      valuesAlignment: 50, longTermHappiness: 50, financialImpact: 50,
      healthImpact: 50, relationshipImpact: 50, regretProbability: 50,
      opportunityCost: 50, risk: 50, stress: 50, energy: 50, timeCost: 50,
    };
    const r = evaluateDecision({
      id: 'q', question: 'q',
      options: [
        { id: 'act', label: 'Act', scores: identical },
        { id: 'wait', label: 'Wait', scores: identical, isStatusQuo: true },
      ],
    });
    const act = r.assessments.find((a) => a.optionId === 'act')!;
    const wait = r.assessments.find((a) => a.optionId === 'wait')!;
    expect(act.total).toBeGreaterThan(wait.total);
  });
});

describe('it recommends without ordering', () => {
  it('always surfaces the strongest argument against its own lean', () => {
    const r = evaluateDecision({ ...jobChange, valueRanking: ['relationships', 'health'] });
    expect(r.lean).not.toBeNull();
    expect(r.strongestObjection).not.toBeNull();
    expect(r.strongestObjection!.note.length).toBeGreaterThan(10);
  });

  it('refuses to lean when the options are genuinely close, and says so', () => {
    const nearly = {
      valuesAlignment: 50, longTermHappiness: 50, financialImpact: 50,
      healthImpact: 50, relationshipImpact: 50, regretProbability: 50,
      opportunityCost: 50, risk: 50, stress: 50, energy: 50, timeCost: 50,
      reversibility: 50,
    };
    const r = evaluateDecision({
      id: 'q', question: 'whether to move',
      options: [
        { id: 'a', label: 'A', scores: nearly },
        { id: 'b', label: 'B', scores: { ...nearly, valuesAlignment: 52 } },
      ],
    });
    expect(r.lean).toBeNull();
    expect(r.margin).toBeLessThan(4);
    expect(r.reflectionPrompt).toMatch(/afraid/i);
  });

  it('asks a question rather than issuing an instruction', () => {
    const r = evaluateDecision(jobChange);
    expect(r.reflectionPrompt).toContain('?');
    expect(r.reflectionPrompt).not.toMatch(/you should|you must|take the/i);
  });
});

describe('uncertainty is mandatory', () => {
  it('reports low confidence when most factors have no data', () => {
    const r = evaluateDecision({
      id: 'q', question: 'q',
      options: [
        { id: 'a', label: 'A', scores: { valuesAlignment: 80 } },
        { id: 'b', label: 'B', scores: { valuesAlignment: 20 } },
      ],
    });
    expect(r.uncertainty.level).toBe('high');
    expect(r.uncertainty.assumptions.length).toBeGreaterThanOrEqual(3);
  });

  it('never treats a missing factor as a zero', () => {
    const full = {
      valuesAlignment: 80, longTermHappiness: 80, financialImpact: 80,
      healthImpact: 80, relationshipImpact: 80, regretProbability: 20,
      opportunityCost: 20, risk: 20, stress: 20, energy: 80, timeCost: 20,
    };
    const complete = evaluateDecision({
      id: 'q', question: 'q', options: [{ id: 'a', label: 'A', scores: full }],
    });
    const sparse = evaluateDecision({
      id: 'q', question: 'q',
      options: [{ id: 'a', label: 'A', scores: { valuesAlignment: 80 } }],
    });
    // Both are strong options; the sparse one is just less well evidenced.
    expect(sparse.assessments[0].total).toBeGreaterThan(50);
    expect(sparse.assessments[0].coverage)
      .toBeLessThan(complete.assessments[0].coverage);
  });

  it('states the horizon and the weighting basis as assumptions', () => {
    const r = evaluateDecision({ ...jobChange, valueRanking: ['relationships'] });
    expect(r.uncertainty.assumptions.join(' ')).toMatch(/10-year/);
    expect(r.uncertainty.assumptions.join(' ')).toMatch(/your own priority order/i);
  });
});

describe('horizon', () => {
  it('a longer horizon favours values over short-run comfort', () => {
    const q: DecisionQuestion = {
      id: 'q', question: 'q',
      options: [
        {
          id: 'meaningful',
          label: 'The harder, truer thing',
          scores: { valuesAlignment: 90, stress: 70, timeCost: 70, regretProbability: 15 },
        },
        {
          id: 'comfortable',
          label: 'The easy thing',
          scores: { valuesAlignment: 40, stress: 15, timeCost: 15, regretProbability: 55 },
        },
      ],
    };
    const shortTerm = evaluateDecision({ ...q, horizonYears: 1 });
    const longTerm = evaluateDecision({ ...q, horizonYears: 20 });

    const gapAt = (r: ReturnType<typeof evaluateDecision>) =>
      r.assessments.find((a) => a.optionId === 'meaningful')!.total
      - r.assessments.find((a) => a.optionId === 'comfortable')!.total;

    expect(gapAt(longTerm)).toBeGreaterThan(gapAt(shortTerm));
  });
});

describe('as a kernel engine', () => {
  const ctx = (data: unknown): EngineContext => ({
    userId: 'u1', now: NOW, age: 34, domains: [],
    personalization: {
      insightIntensity: 'gentle', motivationStyle: 'balanced', declinedTopics: [],
    },
    priorObservations: [],
    data: { decision: data } as EngineContext['data'],
  });

  it('stays silent when there is no open decision', () => {
    const out = decisionEngine.run(ctx(undefined));
    expect(out.observations).toEqual([]);
    expect(out.proposals).toEqual([]);
  });

  it('emits a grounded observation and a proposal that only asks for thought', () => {
    const out = decisionEngine.run(ctx({ open: [jobChange] }));
    expect(out.observations).toHaveLength(1);
    expect(out.observations[0].uncertainty).toBeDefined();
    expect(out.observations[0].evidence.length).toBe(2);

    const p = out.proposals[0];
    expect(p.addresses).toContain(out.observations[0].id);
    // It never proposes *taking* an option — the person decides.
    expect(p.action).not.toMatch(/take the offer/i);
    expect(p.effortMinutes).toBeLessThanOrEqual(15);
    expect(p.dismissible).toBe(true);
  });

  it('keeps a close call quiet rather than nudging', () => {
    const close = {
      valuesAlignment: 50, longTermHappiness: 50, regretProbability: 50,
    };
    const out = decisionEngine.run(ctx({
      open: [{
        id: 'c', question: 'a close one',
        options: [
          { id: 'a', label: 'A', scores: close },
          { id: 'b', label: 'B', scores: close },
        ],
      }],
    }));
    expect(out.observations[0].pressure).toBe('whisper');
  });
});
