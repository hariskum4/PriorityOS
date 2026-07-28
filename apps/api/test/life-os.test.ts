/**
 * The cycle, against a real life in a real database.
 *
 * This is the part that decides what a person is told. The kernel's own tests
 * prove the rules hold for hand-written contexts; these prove the context the
 * host actually assembles reaches those rules intact. That gap has bitten this
 * codebase before — `declinedTopics` was passed as a hardcoded empty array for
 * weeks, so Retreat silently did nothing while every kernel test for it passed.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { testPrisma, truncateAll } from './db';
import { LifeOsService } from '../src/life-os/life-os.service';
import { seedLife, SeededLife } from './fixtures';

const NOW = new Date('2026-07-28T09:00:00Z');

let prisma: PrismaService;
let lifeOs: LifeOsService;
let life: SeededLife;

beforeAll(async () => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
  prisma = await testPrisma();
  lifeOs = new LifeOsService(prisma);
});

beforeEach(async () => {
  await truncateAll(prisma);
  life = await seedLife(prisma, NOW);
});

afterAll(() => prisma.$disconnect());

describe('assembling the context', () => {
  it('gathers a whole life out of the database', async () => {
    const ctx = await lifeOs.buildContext(life.userId, NOW);

    expect(ctx.userId).toBe(life.userId);
    expect(ctx.age).toBe(28);
    expect(ctx.domains.length).toBeGreaterThan(0);
    expect(ctx.data.goal.goals.length).toBe(2);
    expect(ctx.data.decision.open.length).toBe(1);
    expect(ctx.data.knowledge.items.length).toBe(2);
  });

  it('folds the twelve app domains into the kernel’s eight', async () => {
    const ctx = await lifeOs.buildContext(life.userId, NOW);
    // family, partner and friends all live under relationships.
    const names = ctx.domains.map((d) => d.domain);
    expect(names).toContain('relationships');
    expect(names).not.toContain('family');
    expect(new Set(names).size).toBe(names.length);
  });

  it('carries the say/do gap through rather than flattening it', async () => {
    const ctx = await lifeOs.buildContext(life.userId, NOW);
    const health = ctx.domains.find((d) => d.domain === 'health');
    expect(health).toBeTruthy();
    expect(health!.importance).toBeGreaterThan(health!.attention);
  });

  it('reads the person’s own intensity setting, not a default', async () => {
    const ctx = await lifeOs.buildContext(life.userId, NOW);
    expect(ctx.personalization.insightIntensity).toBe('direct');
  });
});

describe('running a cycle', () => {
  it('produces proposals from a life that has something wrong in it', async () => {
    const result = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.failures).toHaveLength(0);
  });

  it('reduces many findings to a few — the whole point of the orchestrator', async () => {
    const result = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    expect(result.observations.length).toBeGreaterThanOrEqual(result.proposals.length);
    expect(result.proposals.length).toBeLessThanOrEqual(5);
  });

  it('every proposal explains itself', async () => {
    const result = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    for (const p of result.proposals) {
      expect(p.because?.length ?? 0).toBeGreaterThan(0);
      expect(p.engine).toBeTruthy();
    }
  });

  it('a dry run leaves no trace', async () => {
    await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    expect(await prisma.lifeOsState.findUnique({ where: { userId: life.userId } })).toBeNull();
  });

  it('a real run records what was delivered', async () => {
    await lifeOs.runToday(life.userId, { now: NOW });
    const state = await prisma.lifeOsState.findUnique({ where: { userId: life.userId } });
    expect(state).toBeTruthy();
    expect(state!.lastCycleAt).toBeTruthy();
    expect((state!.seenObservationIds as string[]).length).toBeGreaterThan(0);
  });

  it('does not repeat itself the next morning', async () => {
    /**
     * Delivered findings are marked seen so the same sentence does not arrive
     * every day until it stops meaning anything.
     */
    const first = await lifeOs.runToday(life.userId, { now: NOW });
    const second = await lifeOs.runToday(life.userId, {
      now: new Date(NOW.getTime() + 86_400_000),
    });

    const firstIds = new Set(first.proposals.flatMap((p) => p.addresses));
    const repeated = second.proposals
      .flatMap((p) => p.addresses)
      .filter((id) => firstIds.has(id));
    expect(repeated).toHaveLength(0);
  });

  it('survives a life with nothing in it', async () => {
    const empty = await prisma.user.create({
      data: { email: `empty-${Math.random()}@example.com`, fullName: 'New', timezone: 'UTC' },
    });
    const result = await lifeOs.runToday(empty.id, { now: NOW, persist: false });
    expect(result.failures).toHaveLength(0);
    expect(Array.isArray(result.proposals)).toBe(true);
  });
});

describe('Retreat', () => {
  it('never raises a topic again once it is declined forever', async () => {
    /**
     * The regression this exists for: declinedTopics was read from the
     * database, then dropped on the floor before the kernel saw it. Every
     * kernel test passed. The feature did nothing.
     */
    const before = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    const topic = before.proposals[0]?.domain;
    expect(topic).toBeTruthy();

    await lifeOs.dismissProposal(life.userId, before.proposals[0].id, {
      forever: true,
      domain: topic,
    });

    const after = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    expect(after.proposals.map((p) => p.domain)).not.toContain(topic);
  });

  it('reaches the kernel through the context, not just the database', async () => {
    await lifeOs.dismissProposal(life.userId, 'anything', { forever: true, domain: 'health' });
    const ctx = await lifeOs.buildContext(life.userId, NOW);
    expect(ctx.personalization.declinedTopics).toContain('health');
  });

  it('dismissing once does not silence the topic', async () => {
    const before = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    const topic = before.proposals[0].domain;
    await lifeOs.dismissProposal(life.userId, before.proposals[0].id, { domain: topic });
    expect(await lifeOs.declinedTopics(life.userId)).toHaveLength(0);
  });

  it('can be undone, and only deliberately', async () => {
    await lifeOs.dismissProposal(life.userId, 'x', { forever: true, domain: 'career' });
    expect(await lifeOs.declinedTopics(life.userId)).toEqual(['career']);

    await lifeOs.restoreTopic(life.userId, 'career');
    expect(await lifeOs.declinedTopics(life.userId)).toEqual([]);
  });
});

describe('accepting a proposal', () => {
  it('creates a real mission — the loop that makes the system learn', async () => {
    const result = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    const proposal = result.proposals[0];

    const { mission } = await lifeOs.acceptProposal(life.userId, proposal.id, {
      action: proposal.action,
      domain: proposal.domain,
      because: proposal.because,
      engine: proposal.engine,
    });

    expect(mission).toBeTruthy();
    expect(mission!.status).toBe('pending');
    expect(mission!.sourceType).toBe('AI');
    // The engine's own words, kept rather than regenerated.
    expect(mission!.description).toBe(proposal.because);
  });

  it('files a proposal about a person under that person', async () => {
    const { mission } = await lifeOs.acceptProposal(life.userId, 'p1', {
      action: 'Call Amma this evening',
      domain: 'relationships',
      subjects: [life.ammaId],
    });
    expect(mission!.relationshipId).toBe(life.ammaId);
    expect(mission!.domainType).toBe('family');
    expect(mission!.missionType).toBe('relationship');
  });

  it('does not create a second mission for the same thing', async () => {
    const body = { action: 'Call Amma this evening', domain: 'relationships' };
    const first = await lifeOs.acceptProposal(life.userId, 'p1', body);
    const second = await lifeOs.acceptProposal(life.userId, 'p2', body);

    expect(second.mission!.id).toBe(first.mission!.id);
    expect(await prisma.mission.count({ where: { userId: life.userId } })).toBe(1);
  });

  it('records the acceptance so the system can learn from it', async () => {
    await lifeOs.acceptProposal(life.userId, 'p1', {
      action: 'Run tomorrow morning',
      domain: 'health',
      engine: 'goal',
    });
    const event = await prisma.analyticsEvent.findFirst({
      where: { userId: life.userId, name: 'life_os_proposal_accepted' },
    });
    expect(event).toBeTruthy();
    expect((event!.props as { engine: string }).engine).toBe('goal');
  });
});

describe('decision options that were never scored', () => {
  it('does not crash the engine — the whole engine used to fall over silently', async () => {
    /**
     * The options column is free-form JSON and `createDecision` stored whatever
     * it was given. An option without a `scores` object made the engine throw
     * on every cycle; the failure was caught into result.failures and logged,
     * so decisions quietly stopped being evaluated and nobody was told.
     */
    await prisma.decision.create({
      data: {
        userId: life.userId,
        question: 'Should I take the job in Pune?',
        horizonYears: 5,
        status: 'open',
        options: [{ label: 'Take it' }, { label: 'Stay' }],
      },
    });

    const result = await lifeOs.runToday(life.userId, { now: NOW, persist: false });
    expect(result.failures).toHaveLength(0);
  });

  it('still assesses a decision whose options carry no scores', async () => {
    const decision = await prisma.decision.create({
      data: {
        userId: life.userId,
        question: 'Should I take the job in Pune?',
        horizonYears: 5,
        status: 'open',
        options: [{ label: 'Take it' }, { label: 'Stay', isStatusQuo: true }],
      },
    });

    const { assessment } = await lifeOs.assessDecision(life.userId, decision.id);
    expect(assessment.assessments).toHaveLength(2);
    expect(assessment.assessments.map((o) => o.label)).toContain('Take it');
  });

  it('gives every option an id so the engine can refer to it', async () => {
    const decision = await prisma.decision.create({
      data: {
        userId: life.userId,
        question: 'Anything',
        options: [{ label: 'One' }, { label: 'Two' }],
      },
    });
    const { assessment } = await lifeOs.assessDecision(life.userId, decision.id);
    const ids = assessment.assessments.map((o) => o.optionId);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every(Boolean)).toBe(true);
  });

  it('keeps the scores it is given', async () => {
    const decision = await prisma.decision.create({
      data: {
        userId: life.userId,
        question: 'Weighted',
        horizonYears: 10,
        options: [
          { id: 'a', label: 'Move back', scores: { valuesAlignment: 90, financialImpact: 30 } },
          { id: 'b', label: 'Stay', scores: { valuesAlignment: 20, financialImpact: 85 } },
        ],
      },
    });
    const { assessment } = await lifeOs.assessDecision(life.userId, decision.id);
    const moveBack = assessment.assessments.find((o) => o.optionId === 'a')!;
    const stay = assessment.assessments.find((o) => o.optionId === 'b')!;
    // Values alignment outweighs money by design over a ten-year horizon.
    expect(moveBack.total).toBeGreaterThan(stay.total);
  });
});

describe('the weekly snapshot', () => {
  it('writes one sample per domain and is safe to run twice', async () => {
    const written = await lifeOs.snapshotWeek(life.userId, NOW);
    expect(written).toBeGreaterThan(0);

    const countAfterFirst = await prisma.domainAttentionSample.count({
      where: { userId: life.userId },
    });
    await lifeOs.snapshotWeek(life.userId, NOW);
    expect(await prisma.domainAttentionSample.count({ where: { userId: life.userId } }))
      .toBe(countAfterFirst);
  });
});
