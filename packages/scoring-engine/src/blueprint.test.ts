import { describe, it, expect } from 'vitest';
import { judgeRhythm, judgeStack, judgeBlueprint, type BlueprintContext } from './blueprint';
import { lifeShape } from './lifeShape';
import { rhythmsFor } from './rhythms';
import { stackActions } from './timeStacking';

const office = lifeShape('office_9_5');
const homemaker = lifeShape('homemaker');

const ctx = (over: Partial<BlueprintContext> = {}): BlueprintContext => ({
  shape: office,
  knownNames: [],
  roles: [],
  takenTitles: [],
  ...over,
});

/** A candidate that passes everything, so each test can break one thing. */
const goodRhythm = () => ({
  key: 'gen.career.portfolio',
  title: 'Two hours on the portfolio',
  domain: 'career',
  perWeek: 2,
  minutes: 60,
  because: 'The work that gets you out is never the work that is due today.',
  when: 'morning',
  needs: ['hasScreen'],
});

const goodStack = () => ({
  key: 'gen.walkcall',
  action: 'Walk the long way home and call {who}',
  domains: ['health', 'family'],
  framing: 'One walk that keeps your legs moving and your mother in your week',
  setting: ['canMove', 'canSpeakFreely'],
});

const reasonOf = (v: ReturnType<typeof judgeRhythm>) => (v.ok ? 'ok' : v.reason);

describe('judgeRhythm — what survives', () => {
  it('accepts a candidate that breaks no rule', () => {
    const v = judgeRhythm(goodRhythm(), ctx());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.rhythm.title).toBe('Two hours on the portfolio');
    expect(v.rhythm.domainType).toBe('career');
    expect(v.rhythm.perWeek).toBe(2);
    expect(v.rhythm.needs).toEqual(['hasScreen']);
    expect(v.rhythm.when).toBe('morning');
  });

  it('keeps only setting keys it recognises, and drops the rest unread', () => {
    const v = judgeRhythm({ ...goodRhythm(), needs: ['hasScreen', 'needsWifi', 42] }, ctx());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.rhythm.needs).toEqual(['hasScreen']);
  });

  it('ignores a time of day it does not have a slot for', () => {
    const v = judgeRhythm({ ...goodRhythm(), when: 'dawn' }, ctx());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.rhythm.when).toBeUndefined();
  });
});

describe('judgeRhythm — the cadence nobody agreed to', () => {
  it('refuses more times a week than a week holds', () => {
    expect(reasonOf(judgeRhythm({ ...goodRhythm(), perWeek: 14 }, ctx()))).toBe('cadence');
  });

  it('refuses a fractional cadence, because a habit target is an integer', () => {
    expect(reasonOf(judgeRhythm({ ...goodRhythm(), perWeek: 0.5 }, ctx()))).toBe('cadence');
  });

  it('refuses zero — a rhythm that never happens is not a rhythm', () => {
    expect(reasonOf(judgeRhythm({ ...goodRhythm(), perWeek: 0 }, ctx()))).toBe('cadence');
  });

  it('refuses an occurrence longer than any week could hold weekly', () => {
    expect(reasonOf(judgeRhythm({ ...goodRhythm(), minutes: 480 }, ctx()))).toBe('duration');
  });
});

describe('judgeRhythm — a title that reads alone', () => {
  it('refuses the dangling opener the catalog was written to fix', () => {
    expect(reasonOf(judgeRhythm({ ...goodRhythm(), title: 'Give it a standing hour' }, ctx())))
      .toBe('dangling');
  });

  it('refuses a title too long for the card', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), title: 'A very long standing commitment to the portfolio and the plan' },
      ctx(),
    );
    expect(reasonOf(v)).toBe('too-long');
  });
});

describe('judgeRhythm — a rhythm, not an errand', () => {
  it.each([
    ['Finish the certification', 'finish'],
    ['Book the dentist appointment', 'book the'],
    ['Ship the side project by Friday', 'deadline'],
    ['Sort the pension out in 2027', 'a year'],
  ])('refuses %s (%s)', (title) => {
    expect(reasonOf(judgeRhythm({ ...goodRhythm(), title }, ctx()))).toBe('errand');
  });

  it('lets a genuinely repeating commitment through', () => {
    const v = judgeRhythm({ ...goodRhythm(), title: 'Half an hour of Spanish' }, ctx());
    expect(v.ok).toBe(true);
  });
});

describe('judgeRhythm — nobody who does not exist', () => {
  it('refuses a name the person has never recorded', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'family', title: 'Call Priya on Sunday' },
      ctx(),
    );
    expect(reasonOf(v)).toBe('invented-person');
  });

  it('allows a name the person actually recorded', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'family', title: 'Call Priya on Sunday' },
      ctx({ knownNames: ['Priya'] }),
    );
    expect(v.ok).toBe(true);
  });

  it('catches an invented person hiding in a possessive', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), because: "Amma's garden is the thing she rings about." },
      ctx(),
    );
    expect(reasonOf(v)).toBe('invented-person');
  });

  it('does not mistake a language for a person', () => {
    // The specificity this feature exists to add must not trip the name check.
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'growth', title: 'Twenty minutes of Spanish' },
      ctx(),
    );
    expect(v.ok).toBe(true);
  });

  it('does not mistake a weekday for a person', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'reflection', title: 'A quiet hour on Sunday' },
      ctx(),
    );
    expect(v.ok).toBe(true);
  });
});

describe('judgeRhythm — a life this person does not lead', () => {
  it('refuses a commute to somebody who does not make one', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'growth', title: 'An audiobook on the commute' },
      ctx({ shape: homemaker }),
    );
    expect(reasonOf(v)).toBe('not-this-life');
  });

  it('allows the same line to somebody who does commute', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'growth', title: 'An audiobook on the commute' },
      ctx({ shape: office }),
    );
    expect(v.ok).toBe(true);
  });

  it('refuses an inbox to somebody with no desk job', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), title: 'Half an hour before the inbox' },
      ctx({ shape: homemaker }),
    );
    expect(reasonOf(v)).toBe('not-this-life');
  });
});

describe('judgeRhythm — the tone rules, finally enforced', () => {
  it('refuses the mortality framing every prompt already forbids', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), because: 'Call her before it is too late.' },
      ctx(),
    );
    expect(reasonOf(v)).toBe('tone');
  });

  it('refuses guilt', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), because: 'You never make time for this and you should have.' },
      ctx(),
    );
    expect(reasonOf(v)).toBe('tone');
  });

  it('refuses an exclamation mark in coaching copy', () => {
    const v = judgeRhythm({ ...goodRhythm(), title: 'Move three times a week!' }, ctx());
    expect(reasonOf(v)).toBe('tone');
  });

  it('refuses crisis language outright', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), because: 'Because some weeks you want to die.' },
      ctx(),
    );
    expect(reasonOf(v)).toBe('unsafe');
  });

  it('refuses to become a clinician', () => {
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'health', title: 'A calorie deficit every weekday' },
      ctx(),
    );
    expect(reasonOf(v)).toBe('unsafe');
  });
});

describe('judgeRhythm — nothing the catalog already says', () => {
  it('refuses a restated built-in', () => {
    const builtIn = rhythmsFor('health')[0];
    const v = judgeRhythm(
      { ...goodRhythm(), domain: 'health', title: builtIn.title },
      ctx(),
    );
    expect(reasonOf(v)).toBe('duplicate');
  });

  it('refuses something the person already holds', () => {
    const v = judgeRhythm(goodRhythm(), ctx({ takenTitles: ['two hours on the portfolio'] }));
    expect(reasonOf(v)).toBe('duplicate');
  });

  it('refuses a rhythm the person deliberately retired', () => {
    // Retired titles arrive in takenTitles for exactly this reason: something
    // ended must not come back wearing a new key.
    const v = judgeRhythm(goodRhythm(), ctx({ takenTitles: ['Two hours on the portfolio'] }));
    expect(reasonOf(v)).toBe('duplicate');
  });
});

describe('judgeRhythm — rubbish', () => {
  it.each([
    [{}, 'schema'],
    [{ key: 'k' }, 'schema'],
    [{ ...goodRhythm(), title: null }, 'schema'],
    [{ ...goodRhythm(), domain: 'productivity' }, 'domain'],
    [{ ...goodRhythm(), perWeek: '3' }, 'cadence'],
    [{ ...goodRhythm(), minutes: null }, 'duration'],
  ])('rejects %j as %s', (candidate, reason) => {
    expect(reasonOf(judgeRhythm(candidate as never, ctx()))).toBe(reason);
  });

  it('survives a null candidate without throwing', () => {
    expect(() => judgeRhythm(null as never, ctx())).not.toThrow();
  });
});

describe('judgeStack', () => {
  const reason = (v: ReturnType<typeof judgeStack>) => (v.ok ? 'ok' : v.reason);

  it('accepts a stack that serves two parts of a life', () => {
    const v = judgeStack(goodStack(), ctx());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.stack.domains).toEqual(['health', 'family']);
  });

  it('refuses a stack that serves only one thing', () => {
    expect(reason(judgeStack({ ...goodStack(), domains: ['health'] }, ctx()))).toBe('domain');
  });

  it('refuses a stack claiming four domains at once', () => {
    const v = judgeStack(
      { ...goodStack(), domains: ['health', 'family', 'growth', 'career'] },
      ctx(),
    );
    expect(reason(v)).toBe('domain');
  });

  it('drops a host that is not one of the domains', () => {
    const v = judgeStack({ ...goodStack(), hosts: ['career'] }, ctx());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.stack.hosts).toBeUndefined();
  });

  it('refuses a stack where every domain merely hosts', () => {
    // Nothing would be fed, so the ranker would offer an hour that helps nothing.
    const v = judgeStack({ ...goodStack(), hosts: ['health', 'family'] }, ctx());
    expect(reason(v)).toBe('domain');
  });

  it('refuses to name a child to somebody who has recorded none', () => {
    const v = judgeStack({ ...goodStack(), role: 'child' }, ctx({ roles: ['partner'] }));
    expect(reason(v)).toBe('not-this-life');
  });

  it('allows the role when the person actually has one', () => {
    const v = judgeStack({ ...goodStack(), role: 'child' }, ctx({ roles: ['child'] }));
    expect(v.ok).toBe(true);
  });

  it('does not read the {who} placeholder as an invented person', () => {
    const v = judgeStack(goodStack(), ctx({ knownNames: [] }));
    expect(v.ok).toBe(true);
  });

  it('refuses a restated catalog action', () => {
    const v = judgeStack({ ...goodStack(), action: stackActions()[0] }, ctx());
    expect(reason(v)).toBe('duplicate');
  });
});

describe('judgeBlueprint', () => {
  it('keeps the good and reports why the rest went', () => {
    const verdict = judgeBlueprint(
      {
        rhythms: [
          goodRhythm(),
          { ...goodRhythm(), key: 'b', title: 'Give it an hour' },
          { ...goodRhythm(), key: 'c', title: 'Ring Meera on Tuesday', domain: 'family' },
        ],
        stacks: [goodStack()],
      },
      ctx(),
    );
    expect(verdict.rhythms).toHaveLength(1);
    expect(verdict.stacks).toHaveLength(1);
    expect(verdict.rejected).toEqual([
      { key: 'b', reason: 'dangling' },
      { key: 'c', reason: 'invented-person' },
    ]);
  });

  it('refuses two candidates that say the same thing', () => {
    const verdict = judgeBlueprint(
      { rhythms: [goodRhythm(), { ...goodRhythm(), key: 'other' }] },
      ctx(),
    );
    expect(verdict.rhythms).toHaveLength(1);
    expect(verdict.rejected).toEqual([{ key: 'other', reason: 'duplicate' }]);
  });

  it('refuses two candidates sharing one key', () => {
    const verdict = judgeBlueprint(
      {
        rhythms: [
          goodRhythm(),
          { ...goodRhythm(), title: 'A different standing hour', domain: 'growth' },
        ],
      },
      ctx(),
    );
    expect(verdict.rhythms).toHaveLength(1);
    expect(verdict.rejected).toEqual([
      { key: 'gen.career.portfolio', reason: 'duplicate' },
    ]);
  });

  it('an empty verdict is a normal outcome, not an error', () => {
    const verdict = judgeBlueprint({ rhythms: [{ title: 'nonsense' }] }, ctx());
    expect(verdict).toEqual({
      rhythms: [],
      stacks: [],
      rejected: [{ key: '?', reason: 'schema' }],
    });
  });

  it('survives everything a broken generation could hand back', () => {
    for (const junk of [null, undefined, {}, { rhythms: 'no' }, { rhythms: [null, 7, 'x'] }]) {
      expect(() => judgeBlueprint(junk as never, ctx())).not.toThrow();
    }
  });

  it('caps how much one generation may add', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...goodRhythm(),
      key: `gen.${i}`,
      title: `A standing hour number ${i}`,
    }));
    const verdict = judgeBlueprint({ rhythms: many }, ctx());
    expect(verdict.rhythms.length).toBeLessThanOrEqual(12);
  });
});

/**
 * The judge had every opinion except whether the thing works. Once the
 * catalog started carrying graded receipts that stopped being tolerable: an
 * app that grades its own entries A through folk and then lets a generation
 * append a detox week has not got a standard, it has a decoration.
 */
describe('what the literature went and looked for, and did not find', () => {
  const here = ctx();
  const rhythm = (title: string, because = 'A reason that is fine on its own.') => ({
    key: 'p.test', title, domain: 'health', perWeek: 3, minutes: 20, because,
  });

  it.each([
    ['A three-day detox to reset', 'detox'],
    ['Manifest the year you want', 'manifesting'],
    ['Ten minutes of brain-training', 'brain games'],
    ['Study in your visual learner style', 'learning styles'],
    ['21 days to a new morning', '21-day framing'],
    ['A cold plunge for your low mood', 'cold-as-treatment'],
    ['Dial in your supplement stack', 'supplement stacks'],
  ])('refuses "%s" (%s)', (title) => {
    const v = judgeRhythm(rhythm(title), here);
    expect(v.ok).toBe(false);
    expect((v as { reason: string }).reason).toBe('no-evidence');
  });

  it('reads the reason as well as the title', () => {
    const v = judgeRhythm(rhythm('An honest morning', 'Manifest the outcome you want.'), here);
    expect((v as { reason: string }).reason).toBe('no-evidence');
  });

  /* Narrow on purpose. This refuses the *app* proposing these; somebody who
     wants a cold shower can type one in whenever they like. */
  it('leaves an ordinary cold shower alone', () => {
    expect(judgeRhythm(rhythm('A cold shower before work'), here).ok).toBe(true);
  });

  it('does not refuse the things that do have receipts', () => {
    for (const t of ['Yoga on Tuesday and Friday', 'Two hours somewhere green', 'A walk after lunch']) {
      expect(judgeRhythm(rhythm(t), here).ok, t).toBe(true);
    }
  });

  it('gates the stack path through the same door', () => {
    const v = judgeStack({
      key: 'p.s', action: 'Do a cleanse with your partner',
      domains: ['health', 'partner'], framing: 'Two parts of the week, one hour.',
    }, here);
    expect((v as { reason: string }).reason).toBe('no-evidence');
  });
});
