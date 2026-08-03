/**
 * What a model is allowed to change about a standing commitment.
 *
 * Two strings, and these tests are the enforcement. A rhythm is something a
 * person agrees to do every week from now on, so the fields a generation must
 * never touch are the ones that decide what was agreed to: which domain it
 * belongs to, and how often it happens. A model that could quietly move
 * `perWeek` from 1 to 7 would have someone agreeing to seven times what they
 * read on the card.
 *
 * The catalog is also the whole fallback. Every test here that asserts
 * "changes nothing" is asserting that the app is fully usable with the model
 * switched off, broken, or hostile — which is its normal state whenever the
 * key is missing.
 */
import { describe, it, expect } from 'vitest';
import { RhythmsService } from './rhythms.service';

type Habit = { title: string; domainType: string; isActive?: boolean };

function fakePrisma(over: { habits?: Habit[]; domains?: Array<[string, number, number]> } = {}) {
  const domains = (over.domains ?? [
    ['purpose', 60, 0], ['friends', 40, 5], ['career', 50, 30], ['health', 70, 65],
  ]).map(([domainType, importanceScore, attentionScore]) => ({
    domainType, importanceScore, attentionScore,
  }));

  return {
    lifeDomain: { findMany: async () => domains },
    habit: { findMany: async () => over.habits ?? [] },
    user: {
      findUnique: async () => ({
        profession: 'Designer', workType: 'onsite', workHoursPerWeek: 40,
        city: 'Bengaluru', country: 'IN', maritalStatus: 'married', childrenCount: 1,
        dob: new Date('1990-01-01'), livesAwayFromParents: true, motivationStyle: 'balanced',
      }),
    },
    onboardingAnswer: {
      findMany: async () => [
        { key: 'postponing', value: 'Getting out of this job' },
        { key: 'futureSelf', value: 'Still building things I care about' },
      ],
    },
    goal: { findMany: async () => [{ title: 'Leave the agency', domainType: 'career' }] },
  } as any;
}

/** An AI layer that returns exactly what a test hands it. */
function fakeAi(reply: any) {
  return { generate: async () => reply } as any;
}

const svc = (reply: any, prismaOver = {}) =>
  new RhythmsService(fakePrisma(prismaOver), fakeAi(reply));

describe('the engine picks, the model only writes', () => {
  it('offers a rhythm for every domain that has none, worst gap first', async () => {
    const out = await svc({ rhythms: [] }).forUser('u1');
    expect(out.rhythms.map((r) => r.domainType)).toEqual([
      'purpose', 'friends', 'career', 'health',
    ]);
    expect(out.source).toBe('catalog');
  });

  it('skips a domain that already holds an active rhythm', async () => {
    const out = await svc({ rhythms: [] }, {
      habits: [{ title: 'Anything at all', domainType: 'purpose', isActive: true }],
    }).forUser('u1');
    expect(out.rhythms.map((r) => r.domainType)).not.toContain('purpose');
  });

  /**
   * A rhythm someone deliberately ended must not come back reworded. That
   * would be the catalog's one honest rule defeated by the layer that was
   * only ever supposed to rephrase it.
   */
  it('never hands back a rhythm that was retired', async () => {
    const first = 'A standing hour on the project';
    const out = await svc({ rhythms: [] }, {
      habits: [{ title: first, domainType: 'purpose', isActive: false }],
    }).forUser('u1');
    const purpose = out.rhythms.find((r) => r.domainType === 'purpose')!;
    expect(purpose.title).not.toBe(first);
  });

  it('says nothing when every domain is already served', async () => {
    const out = await svc({ rhythms: [] }, {
      habits: [
        { title: 'x', domainType: 'purpose' }, { title: 'y', domainType: 'friends' },
        { title: 'z', domainType: 'career' }, { title: 'w', domainType: 'health' },
      ],
    }).forUser('u1');
    expect(out.rhythms).toHaveLength(0);
  });

  it('ignores domains nobody said mattered', async () => {
    const out = await svc({ rhythms: [] }, {
      domains: [['purpose', 0, 0], ['career', 50, 10]] as Array<[string, number, number]>,
    }).forUser('u1');
    expect(out.rhythms.map((r) => r.domainType)).toEqual(['career']);
  });
});

describe('what a generation may and may not do', () => {
  const base = () => svc({
    rhythms: [{
      key: 'purpose.hour',
      title: 'An hour on the novel, every Sunday',
      because: 'The manuscript does not advance on the weeks you meant to open it.',
    }],
  });

  it('takes the wording when it is sound', async () => {
    const out = await base().forUser('u1');
    const p = out.rhythms.find((r) => r.key === 'purpose.hour')!;
    expect(p.title).toBe('An hour on the novel, every Sunday');
    expect(p.because).toMatch(/manuscript/);
    expect(out.source).toBe('ai');
  });

  it('keeps the cadence the engine set, whatever comes back', async () => {
    const out = await svc({
      rhythms: [{ key: 'purpose.hour', title: 'Write daily', because: 'x', perWeek: 7 } as any],
    }).forUser('u1');
    expect(out.rhythms.find((r) => r.key === 'purpose.hour')!.perWeek).toBe(1);
  });

  it('keeps the domain the engine chose', async () => {
    const out = await svc({
      rhythms: [{ key: 'purpose.hour', title: 'Go for a run', because: 'x', domainType: 'health' } as any],
    }).forUser('u1');
    expect(out.rhythms.find((r) => r.key === 'purpose.hour')!.domainType).toBe('purpose');
  });

  it('cannot add a rhythm the engine did not issue', async () => {
    const out = await svc({
      rhythms: [
        { key: 'purpose.hour', title: 'An hour on the novel', because: 'Fine' },
        { key: 'finance.review', title: 'Check the accounts', because: 'Invented' },
      ],
    }).forUser('u1');
    expect(out.rhythms.map((r) => r.key)).not.toContain('finance.review');
  });

  it('cannot drop one either — a missing slot keeps the catalog line', async () => {
    const out = await svc({ rhythms: [{ key: 'purpose.hour', title: 'Kept', because: 'Fine' }] })
      .forUser('u1');
    expect(out.rhythms).toHaveLength(4);
    expect(out.rhythms.find((r) => r.domainType === 'friends')!.title)
      .toBe('Message one friend a week, whoever');
  });

  /**
   * The exact defect the rhythm catalog was written to fix, guarded against
   * arriving back by way of a generation. "Give it a standing hour" — give
   * *what*? — reads as nonsense on a card that has nothing else on it.
   */
  it('rejects a title whose subject is missing', async () => {
    for (const title of ['Give it a standing hour', 'Do it every week', 'Keep it up weekly']) {
      const out = await svc({ rhythms: [{ key: 'purpose.hour', title, because: 'x' }] })
        .forUser('u1');
      expect(out.rhythms.find((r) => r.key === 'purpose.hour')!.title)
        .toBe('A standing hour on the project');
    }
  });

  it('rejects a title too long to be one line', async () => {
    const out = await svc({
      rhythms: [{ key: 'purpose.hour', title: 'A'.repeat(60), because: 'x' }],
    }).forUser('u1');
    expect(out.rhythms.find((r) => r.key === 'purpose.hour')!.title)
      .toBe('A standing hour on the project');
  });

  it('keeps the catalog reason when only the reason is unusable', async () => {
    const out = await svc({
      rhythms: [{ key: 'purpose.hour', title: 'An hour on the novel', because: 'B'.repeat(300) }],
    }).forUser('u1');
    const p = out.rhythms.find((r) => r.key === 'purpose.hour')!;
    expect(p.title).toBe('An hour on the novel');
    expect(p.because).toBe('Creative work does not wait for a free weekend. It waits for a fixed hour.');
  });
});

describe('the app is whole with the model switched off', () => {
  it('an empty response changes nothing', async () => {
    const out = await svc({ rhythms: [] }).forUser('u1');
    expect(out.source).toBe('catalog');
    expect(out.rhythms).toHaveLength(4);
  });

  it('so does no response at all', async () => {
    for (const reply of [null, undefined, {}, { rhythms: null }, 'nonsense']) {
      const out = await svc(reply).forUser('u1');
      expect(out.rhythms).toHaveLength(4);
      expect(out.source).toBe('catalog');
    }
  });

  it('so does garbage in every field', async () => {
    const out = await svc({
      rhythms: [
        { key: 42, title: 'x', because: 'y' },
        { key: 'purpose.hour', title: null, because: 5 },
        null,
      ],
    } as any).forUser('u1');
    expect(out.rhythms.find((r) => r.key === 'purpose.hour')!.title)
      .toBe('A standing hour on the project');
    expect(out.source).toBe('catalog');
  });

  it('every rhythm handed out is one a person could actually keep', async () => {
    const out = await svc({ rhythms: [] }).forUser('u1');
    for (const r of out.rhythms) {
      expect(Number.isInteger(r.perWeek)).toBe(true);
      expect(r.perWeek).toBeGreaterThanOrEqual(1);
      expect(r.perWeek).toBeLessThanOrEqual(7);
      expect(r.because.length).toBeGreaterThan(0);
    }
  });
});
