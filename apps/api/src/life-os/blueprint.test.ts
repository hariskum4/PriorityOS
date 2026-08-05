/**
 * The blueprint, from the outside.
 *
 * The judging itself is tested in the engine, where it belongs and where it
 * needs no database. What is left to prove here is the wiring, and the wiring
 * is where the promises live:
 *
 *   a generated item reaches the pools, and competes there rather than
 *   arriving already at the top;
 *
 *   a person with no blueprint — no generation yet, AI switched off, the
 *   model down, or every candidate rejected — gets the app that shipped;
 *
 *   something the reader switched off stays off, including when the next
 *   generation proposes it again.
 */
import { describe, it, expect, vi } from 'vitest';
import { BlueprintService } from './blueprint.service';
import { RhythmsService } from './rhythms.service';
import { StacksService } from './stacks.service';

/* ---------- doubles ---------------------------------------------------- */

const USER = {
  profession: 'Designer', workType: 'office_9_5', workHoursPerWeek: 40,
  commuteMinutes: 30, city: 'Bengaluru', country: 'IN', maritalStatus: 'married',
  childrenCount: 1, dob: new Date('1990-01-01'), livesAwayFromParents: true,
  motivationStyle: 'balanced',
};

function fakePrisma(over: Record<string, unknown> = {}) {
  const rows: any[] = [];
  return {
    _rows: rows,
    personalCatalogItem: {
      findMany: vi.fn(async ({ where }: any) => rows.filter((r) =>
        (where.kind === undefined || r.kind === where.kind)
        && (where.isActive === undefined || r.isActive === where.isActive))),
      findFirst: vi.fn(async () => rows[0] ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = rows.filter((r) => r.key === where.key);
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const found = rows.find((r) => r.kind === where.userId_kind_key.kind
          && r.key === where.userId_kind_key.key);
        if (found) Object.assign(found, update);
        else rows.push({ ...create, isActive: true, createdAt: new Date() });
      }),
    },
    user: { findUnique: async () => USER },
    onboardingAnswer: { findMany: async () => [{ key: 'postponing', value: 'The guitar' }] },
    goal: { findMany: async () => [] },
    habit: { findMany: async () => [] },
    relationship: { findMany: async () => [{ name: 'Priya', relationType: 'mother' }] },
    ...over,
  } as any;
}

const fakeAi = (enabled: boolean, reply?: unknown) => ({
  enabled,
  generate: vi.fn(async (_u, _k, _t, _c, fallback) => (reply === undefined ? fallback : reply)),
}) as any;

/** A candidate that clears every rule the judge applies. */
const candidateRhythm = {
  key: 'gen.growth.guitar',
  title: 'Twenty minutes on the guitar',
  domain: 'growth',
  perWeek: 3,
  minutes: 20,
  /* Deliberately clear of the guilt rule. An earlier draft of this fixture
     read "the thing you never book time for", which the judge rejected as
     tone — correctly, and it is worth leaving a note that the rule bites on
     copy nobody meant as a reproach. */
  because: 'The thing you keep meaning to pick up is the first thing a week loses',
};

/* ---------- generating ------------------------------------------------- */

describe('writing a blueprint', () => {
  it('keeps what the judge allows', async () => {
    const prisma = fakePrisma();
    const svc = new BlueprintService(prisma, fakeAi(true, { rhythms: [candidateRhythm] }));

    const out = await svc.refresh('u1');

    expect(out.added).toBe(1);
    expect(prisma._rows).toHaveLength(1);
    expect(prisma._rows[0].payload.title).toBe('Twenty minutes on the guitar');
    expect(prisma._rows[0].domainType).toBe('growth');
  });

  it('writes nothing at all when the whole generation is rubbish', async () => {
    const prisma = fakePrisma();
    const svc = new BlueprintService(prisma, fakeAi(true, {
      rhythms: [
        { ...candidateRhythm, perWeek: 21 },
        { ...candidateRhythm, key: 'b', title: 'Call Meera on Thursday', domain: 'family' },
        { ...candidateRhythm, key: 'c', title: 'Move three times a week' },
      ],
    }));

    const out = await svc.refresh('u1');

    expect(out.added).toBe(0);
    expect(prisma._rows).toHaveLength(0);
    expect(out.rejected.map((r) => r.reason)).toEqual(['cadence', 'invented-person', 'duplicate']);
  });

  it('does not call a model that is switched off', async () => {
    const ai = fakeAi(false);
    const out = await new BlueprintService(fakePrisma(), ai).refresh('u1');
    expect(out.skipped).toBe('ai-disabled');
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('will not rewrite a catalog that is still fresh', async () => {
    const prisma = fakePrisma();
    prisma._rows.push({ kind: 'rhythm', key: 'x', createdAt: new Date(), isActive: true });
    const ai = fakeAi(true, { rhythms: [candidateRhythm] });

    const out = await new BlueprintService(prisma, ai).refresh('u1');

    expect(out.skipped).toBe('not-due');
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('rewrites one that has aged out', async () => {
    const prisma = fakePrisma();
    prisma._rows.push({
      kind: 'rhythm', key: 'x', isActive: true,
      createdAt: new Date(Date.now() - 8 * 86_400_000),
    });
    const ai = fakeAi(true, { rhythms: [candidateRhythm] });

    await new BlueprintService(prisma, ai).refresh('u1');

    expect(ai.generate).toHaveBeenCalled();
  });

  it('never throws, whatever the database does', async () => {
    const prisma = fakePrisma({
      personalCatalogItem: {
        findFirst: async () => { throw new Error('db gone'); },
        findMany: async () => [],
      },
    });
    await expect(new BlueprintService(prisma, fakeAi(true)).refresh('u1'))
      .resolves.toEqual({ added: 0, rejected: [], skipped: 'error' });
  });

  it('sends roles rather than names to the model', async () => {
    const ai = fakeAi(true, { rhythms: [] });
    await new BlueprintService(fakePrisma(), ai).refresh('u1');

    const context = ai.generate.mock.calls[0][3];
    expect(context.peopleRoles).toEqual(['mother']);
    expect(JSON.stringify(context)).not.toContain('Priya');
  });
});

/* ---------- when the table is not there --------------------------------- */

describe('a database without the blueprint table', () => {
  /*
   * Not hypothetical: the API container boots with
   * `migrate:deploy || echo 'migrate skipped'`, so a deploy whose migration
   * failed comes up with no such table. These reads sit inside the Promise.all
   * that builds the rhythms and stacks endpoints, so throwing here would take
   * both down for every account — an outage caused by a feature nobody had yet.
   */
  const broken = () => fakePrisma({
    personalCatalogItem: {
      findMany: async () => { throw new Error('relation "PersonalCatalogItem" does not exist'); },
    },
  });

  it('reads as an empty catalog rather than an error', async () => {
    const svc = new BlueprintService(broken(), fakeAi(true));
    await expect(svc.rhythmsFor('u1')).resolves.toEqual([]);
    await expect(svc.stacksFor('u1')).resolves.toEqual([]);
  });

  it('leaves the rhythms endpoint fully working', async () => {
    const svc = new BlueprintService(broken(), fakeAi(true));
    const out = await new RhythmsService(
      {
        lifeDomain: { findMany: async () => [{ domainType: 'purpose', importanceScore: 60, attentionScore: 0 }] },
        habit: { findMany: async () => [] },
        user: { findUnique: async () => USER },
        onboardingAnswer: { findMany: async () => [] },
        goal: { findMany: async () => [] },
        relationship: { findMany: async () => [] },
      } as any,
      fakeAi(true, { rhythms: [] }),
      svc,
    ).forUser('u1');

    expect(out.rhythms).toHaveLength(1);
    expect(out.rhythms[0].key).toBe('purpose.hour');
  });
});

/* ---------- switching one off ------------------------------------------ */

describe('something the reader turned off', () => {
  it('is deactivated rather than deleted', async () => {
    const prisma = fakePrisma();
    prisma._rows.push({ kind: 'rhythm', key: 'gen.a', isActive: true, createdAt: new Date() });

    expect(await new BlueprintService(prisma, fakeAi(true)).retire('u1', 'gen.a')).toBe(true);
    expect(prisma._rows[0].isActive).toBe(false);
  });

  it('stays off when the next generation proposes it again', async () => {
    const prisma = fakePrisma();
    prisma._rows.push({
      kind: 'rhythm', key: candidateRhythm.key, isActive: false, generation: 1,
      payload: { title: 'something else' },
      createdAt: new Date(Date.now() - 30 * 86_400_000),
    });

    await new BlueprintService(prisma, fakeAi(true, { rhythms: [candidateRhythm] }))
      .refresh('u1');

    // Re-proposed, so the payload is refreshed — but a person said no to this
    // and an upsert must not quietly undo that.
    expect(prisma._rows[0].isActive).toBe(false);
  });
});

/* ---------- reaching the pools ----------------------------------------- */

describe('a personal rhythm in the pool', () => {
  const personal = [{
    key: 'gen.purpose.write',
    title: 'A page before anyone is awake',
    domainType: 'purpose',
    perWeek: 3,
    minutes: 25,
    because: 'The work that is yours is the work nobody will ask you for',
  }];

  function rhythmsPrisma() {
    return {
      lifeDomain: {
        findMany: async () => [
          { domainType: 'purpose', importanceScore: 60, attentionScore: 0 },
          { domainType: 'career', importanceScore: 50, attentionScore: 30 },
        ],
      },
      habit: { findMany: async () => [] },
      user: { findUnique: async () => USER },
      onboardingAnswer: { findMany: async () => [] },
      goal: { findMany: async () => [] },
      relationship: { findMany: async () => [] },
    } as any;
  }

  it('is offered ahead of the catalog for its own domain', async () => {
    const svc = new RhythmsService(
      rhythmsPrisma(),
      fakeAi(true, { rhythms: [] }),
      { rhythmsFor: async () => personal } as any,
    );

    const out = await svc.forUser('u1');
    const purpose = out.rhythms.find((r) => r.domainType === 'purpose');
    expect(purpose?.title).toBe('A page before anyone is awake');
  });

  it('leaves every other domain on the catalog', async () => {
    const svc = new RhythmsService(
      rhythmsPrisma(),
      fakeAi(true, { rhythms: [] }),
      { rhythmsFor: async () => personal } as any,
    );

    const out = await svc.forUser('u1');
    const career = out.rhythms.find((r) => r.domainType === 'career');
    expect(career?.key).toBe('career.next');
  });

  it('is not handed back to the rewording pass', async () => {
    // That pass checks length and dangling openers only. A title the blueprint
    // judge cleared must not be rewritten by a weaker check.
    const ai = fakeAi(true, { rhythms: [] });
    await new RhythmsService(rhythmsPrisma(), ai, { rhythmsFor: async () => personal } as any)
      .forUser('u1');

    const slots = ai.generate.mock.calls[0][3].slots as Array<{ key: string }>;
    expect(slots.map((s) => s.key)).not.toContain('gen.purpose.write');
    expect(slots.map((s) => s.key)).toContain('career.next');
  });

  it('changes nothing for somebody who has none', async () => {
    const svc = new RhythmsService(
      rhythmsPrisma(),
      fakeAi(true, { rhythms: [] }),
      { rhythmsFor: async () => [] } as any,
    );

    const out = await svc.forUser('u1');
    expect(out.rhythms.map((r) => r.key)).toEqual(['purpose.hour', 'career.next']);
  });
});

describe('a personal stack in the pool', () => {
  function stacksPrisma() {
    return {
      lifeDomain: {
        findMany: async () => [
          { domainType: 'purpose', importanceScore: 60, attentionScore: 0 },
          { domainType: 'health', importanceScore: 40, attentionScore: 35 },
        ],
      },
      relationship: { findMany: async () => [] },
      mission: { findMany: async () => [] },
      user: { findUnique: async () => USER },
    } as any;
  }

  it('competes on the same shortfall arithmetic as the catalog', async () => {
    const personal = [{
      key: 'gen.stack.walkthink',
      action: 'Walk the block and talk out the next chapter',
      domains: ['purpose', 'health'],
      framing: 'The thinking happens better on your feet, and your legs get the hour',
      setting: ['canMove'],
    }];

    const out = await new StacksService(
      stacksPrisma(), fakeAi(true), { stacksFor: async () => personal } as any,
    ).forUser('u1', 3);

    // Purpose is the starving domain, so a stack feeding it should lead.
    expect(out.stacks[0].key).toBe('gen.stack.walkthink');
  });

  it('does not win when it feeds nothing that is short', async () => {
    const personal = [{
      key: 'gen.stack.idle',
      action: 'Read something unrelated for twenty minutes',
      domains: ['experiences', 'reflection'],
      framing: 'Neither of these is short, which is the point of this test',
    }];

    const out = await new StacksService(
      stacksPrisma(), fakeAi(true), { stacksFor: async () => personal } as any,
    ).forUser('u1', 3);

    expect(out.stacks[0].key).not.toBe('gen.stack.idle');
  });
});
