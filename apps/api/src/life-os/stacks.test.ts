/**
 * What a model is allowed to change about someone's week.
 *
 * The answer is two strings, and these tests are the enforcement. Every other
 * property of a suggestion — which domains it serves, who it names, why the
 * engine chose it, how many there are — is decided by arithmetic and must
 * survive any generation, including a hostile or broken one.
 *
 * Worth being strict about: a dull sentence from a model is a dull sentence,
 * but a suggestion that quietly serves the wrong domain, or names the wrong
 * person, is the app lying about a life it claims to be keeping.
 */
import { describe, it, expect, vi } from 'vitest';
import { StacksService } from './stacks.service';

const DAY = 86_400_000;

/** A life with several domains genuinely short, and people to name. */
function fakePrisma(over: Partial<{ pending: string[]; done: string[]; people: any[] }> = {}) {
  const domains = [
    ['friends', 18, 5.5], ['family', 50, 100], ['purpose', 12, 0], ['reflection', 44, 42.9],
    ['finance', 62, 64.2], ['partner', 6, 100], ['health', 68, 100], ['career', 48, 100],
  ].map(([domainType, importanceScore, attentionScore]) => ({
    domainType, importanceScore, attentionScore,
  }));

  const people = over.people ?? [
    { id: 'p1', name: 'Amma', relationType: 'mother', lastContactAt: new Date(Date.now() - 40 * DAY), desiredCallFrequency: 'weekly' },
    { id: 'p2', name: 'Arjun', relationType: 'friend', lastContactAt: new Date(Date.now() - 60 * DAY), desiredCallFrequency: 'monthly' },
    { id: 'p3', name: 'Priya', relationType: 'spouse', lastContactAt: new Date(Date.now() - 1 * DAY), desiredCallFrequency: 'daily' },
  ];

  return {
    lifeDomain: { findMany: async () => domains },
    relationship: { findMany: async () => people },
    mission: {
      findMany: async ({ where }: any) =>
        (where?.status === 'pending' ? over.pending ?? [] : over.done ?? []).map((title) => ({ title })),
    },
    user: {
      findUnique: async () => ({
        profession: 'Engineer', workType: 'hybrid', workHoursPerWeek: 35,
        city: 'Bengaluru', country: 'IN', maritalStatus: 'married', childrenCount: 1,
        dob: new Date('2001-01-01'), livesAwayFromParents: true, motivationStyle: 'balanced',
      }),
    },
  } as any;
}

/** An AiService stand-in that returns whatever a test wants, or the fallback. */
function fakeAi(reply?: unknown) {
  return {
    generate: vi.fn(async (_u: string, _k: string, _t: unknown, _c: unknown, fallback: unknown) =>
      (reply === undefined ? fallback : reply)),
  } as any;
}

/** No personal catalog — the state these tests describe. */
const fakeBlueprint = (stacks: any[] = []) => ({ stacksFor: async () => stacks } as any);

const svc = (prisma: any, ai: any, personal: any[] = []) =>
  new StacksService(prisma, ai, fakeBlueprint(personal));

describe('steal the time, with a model in the loop', () => {
  it('serves the catalog wording when AI is off', async () => {
    // `AiService.generate` hands back the fallback when disabled; nothing here
    // may depend on a model being reachable.
    const out = await svc(fakePrisma(), fakeAi()).forUser('u1');
    expect(out.stacks.length).toBe(3);
    expect(out.source).toBe('catalog');
    for (const s of out.stacks) {
      expect(s.action.length).toBeGreaterThan(8);
      expect(s.domains.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('takes the wording when the model returns something usable', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    const reply = {
      stacks: engine.stacks.map((s) => ({
        key: s.key,
        action: s.person ? `Cycle to the lake with ${s.person}` : 'Cycle to the lake before work',
        framing: 'Bengaluru mornings are the only quiet hour you get',
      })),
    };
    const out = await svc(fakePrisma(), fakeAi(reply)).forUser('u1');
    expect(out.source).toBe('ai');
    expect(out.stacks.every((s) => s.action.startsWith('Cycle to the lake'))).toBe(true);
  });

  it('never lets a generation change which domains a suggestion serves', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    const reply = {
      stacks: engine.stacks.map((s) => ({
        key: s.key,
        action: s.person ? `Something with ${s.person}` : 'Something else entirely',
        framing: 'x',
        // Everything below is ignored — the merge reads two fields.
        domains: ['career', 'finance', 'growth'],
        covers: ['career'],
        reason: 'career is getting 0% of your attention — you asked for 90%',
        person: 'Someone Invented',
        personId: 'nope',
      })),
    };
    const out = await svc(fakePrisma(), fakeAi(reply)).forUser('u1');

    for (const [i, s] of out.stacks.entries()) {
      expect(s.domains).toEqual(engine.stacks[i].domains);
      expect(s.covers).toEqual(engine.stacks[i].covers);
      expect(s.reason).toBe(engine.stacks[i].reason);
      expect(s.person).toBe(engine.stacks[i].person);
      expect(s.personId).toBe(engine.stacks[i].personId);
    }
  });

  it('drops wording that stops naming the person the slot is about', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    expect(engine.stacks.some((s) => s.person)).toBe(true); // the fixture must exercise this

    const reply = {
      stacks: engine.stacks.map((s) => ({ key: s.key, action: 'Call someone about the trip', framing: 'x' })),
    };
    const out = await svc(fakePrisma(), fakeAi(reply)).forUser('u1');
    for (const [i, s] of out.stacks.entries()) {
      // A slot about Amma may not come back about nobody.
      if (engine.stacks[i].person) expect(s.action).toBe(engine.stacks[i].action);
    }
  });

  it('never lets an hour be reassigned to a different person', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    const reply = {
      stacks: engine.stacks.map((s) => ({
        key: s.key,
        // Arjun's name, in every slot — including the ones about Amma, and
        // the ones about nobody at all.
        action: 'Take the long walk with Arjun on Sunday',
        framing: 'x',
      })),
    };
    const out = await svc(fakePrisma(), fakeAi(reply)).forUser('u1');

    for (const [i, s] of out.stacks.entries()) {
      const was = engine.stacks[i];
      if (was.person === 'Arjun') expect(s.action).toBe('Take the long walk with Arjun on Sunday');
      else expect(s.action).toBe(was.action); // Amma's slot, and the unnamed ones, stand
    }
  });

  it('matches a name as a word, not as a fragment', async () => {
    const people = [
      { id: 'p1', name: 'Ravi', relationType: 'friend', lastContactAt: new Date(Date.now() - 60 * DAY), desiredCallFrequency: 'monthly' },
    ];
    const engine = await svc(fakePrisma({ people }), fakeAi()).forUser('u1');
    const unnamed = engine.stacks.findIndex((s) => !s.person);
    expect(unnamed).toBeGreaterThanOrEqual(0);

    // "ravioli" contains "Ravi" and is not about Ravi.
    const reply = {
      stacks: [{ key: engine.stacks[unnamed].key, action: 'Make ravioli from scratch on Sunday', framing: 'x' }],
    };
    const out = await svc(fakePrisma({ people }), fakeAi(reply)).forUser('u1');
    expect(out.stacks[unnamed].action).toBe('Make ravioli from scratch on Sunday');
  });

  it('ignores slots the engine never issued', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    const reply = {
      stacks: [
        { key: 'not_a_real_key', action: 'Buy a boat', framing: 'x' },
        { key: 'another_invention', action: 'Move to Lisbon', framing: 'x' },
      ],
    };
    const out = await svc(fakePrisma(), fakeAi(reply)).forUser('u1');
    expect(out.stacks.map((s) => s.action)).toEqual(engine.stacks.map((s) => s.action));
    expect(out.stacks.map((s) => s.key)).toEqual(engine.stacks.map((s) => s.key));
  });

  it('keeps the count the engine chose, however many the model sends', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    for (const reply of [
      { stacks: [] },
      { stacks: [{ key: engine.stacks[0].key, action: 'One good thing', framing: 'x' }] },
      { stacks: [...Array(20)].map((_, i) => ({ key: `k${i}`, action: 'Noise', framing: 'x' })) },
    ]) {
      const out = await svc(fakePrisma(), fakeAi(reply)).forUser('u1');
      expect(out.stacks).toHaveLength(engine.stacks.length);
    }
  });

  it('refuses wording that is empty, absurd, or the wrong type', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    for (const action of ['', '   ', 'x'.repeat(400), null, 42, undefined, {}]) {
      const reply = { stacks: engine.stacks.map((s) => ({ key: s.key, action, framing: 'x' })) };
      const out = await svc(fakePrisma(), fakeAi(reply as any)).forUser('u1');
      expect(out.stacks.map((s) => s.action)).toEqual(engine.stacks.map((s) => s.action));
    }
  });

  it('survives a reply that is not the shape it asked for', async () => {
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    for (const reply of [null, undefined, 'sorry, I cannot help', { stacks: 'nope' }, { wrong: [] }, []]) {
      const out = await svc(fakePrisma(), fakeAi(reply as any)).forUser('u1');
      expect(out.stacks.map((s) => s.key)).toEqual(engine.stacks.map((s) => s.key));
      expect(out.source).toBe('catalog');
    }
  });

  it('sends the model no score it could recompute, and no unrelated name', async () => {
    const ai = fakeAi();
    await svc(fakePrisma(), ai).forUser('u1');
    const [, kind, , context] = ai.generate.mock.calls[0];
    expect(kind).toBe('stack_craft');

    const ctx = context as any;
    expect(Array.isArray(ctx.slots)).toBe(true);
    for (const slot of ctx.slots) {
      // A slot carries its decision, not the arithmetic behind it.
      expect(Object.keys(slot).sort())
        .toEqual(['baseAction', 'baseFraming', 'domains', 'key', 'person', 'why'].sort());
    }
    // Every name sent belongs to someone actually in this record — the model
    // is never handed a person to write about who is not theirs.
    const theirPeople = new Set(['Amma', 'Arjun', 'Priya']);
    for (const slot of ctx.slots) {
      if (slot.person) expect(theirPeople.has(slot.person)).toBe(true);
    }
    /**
     * No score travels with them. `why` is a finished sentence the wording may
     * lean on ("finance is getting 13% of your attention — you asked for 20%");
     * what is withheld is the arithmetic behind it, so there is no number in
     * the payload a model could add up, re-rank, or contradict.
     */
    for (const slot of ctx.slots) {
      for (const [field, value] of Object.entries(slot)) {
        expect(typeof value === 'number', `${field} is a raw number`).toBe(false);
      }
      expect(typeof slot.why === 'string' || slot.why === '').toBe(true);
    }
  });

  it('rewrites only when the shape of the need changes', async () => {
    const ai = fakeAi();
    await svc(fakePrisma(), ai).forUser('u1');
    const first = ai.generate.mock.calls[0][5].cacheKey;

    // Same life, same key — the day cache in AiService then serves it.
    const ai2 = fakeAi();
    await svc(fakePrisma(), ai2).forUser('u1');
    expect(ai2.generate.mock.calls[0][5].cacheKey).toBe(first);

    // Plan one of them and the engine re-plans, so the wording must too.
    const engine = await svc(fakePrisma(), fakeAi()).forUser('u1');
    const ai3 = fakeAi();
    await svc(fakePrisma({ pending: [engine.stacks[0].action] }), ai3).forUser('u1');
    expect(ai3.generate.mock.calls[0][5].cacheKey).not.toBe(first);
  });

  it('says nothing at all rather than something invented, on an empty life', async () => {
    const bare = {
      lifeDomain: { findMany: async () => [] },
      relationship: { findMany: async () => [] },
      mission: { findMany: async () => [] },
      user: { findUnique: async () => null },
    } as any;
    const ai = fakeAi();
    const out = await svc(bare, ai).forUser('u1');
    expect(out.shortDomains).toEqual([]);
    // No domains declared means nothing to be short of — and no reason to ask
    // a model to write about a life it has not been told anything about.
    if (!out.stacks.length) expect(ai.generate).not.toHaveBeenCalled();
  });
});
