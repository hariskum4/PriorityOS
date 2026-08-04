/**
 * Reordering what matters.
 *
 * Two promises are worth this much test surface.
 *
 * **It cannot lose a domain.** A ranking is the answer somebody gave to the
 * hardest question this app asks, and the accommodating version of this
 * endpoint — rank what you recognise, leave the rest — would drop one out of
 * their plan on a client bug and look like it had worked.
 *
 * **It moves the rank, not the weight.** `importanceScore` is derived and is
 * recomputed on every habit tick, so a version that wrote the weight would
 * pass a naive test, ship, and then revert the first time the reader ticked
 * anything.
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { RankingService } from './ranking.service';

function fakePrisma(rows: Array<{ domainType: string; priorityRank: number | null }>) {
  const state = rows.map((r, i) => ({ id: `d${i}`, importanceScore: 0, ...r }));
  const updates: Array<{ id: string; rank: number }> = [];
  return {
    _state: state,
    _updates: updates,
    lifeDomain: {
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        let out = state.filter((d) => (where?.priorityRank?.not === null
          ? d.priorityRank !== null
          : true));
        if (orderBy?.priorityRank === 'asc') {
          out = [...out].sort((a, b) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99));
        }
        return out;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.find((d) => d.id === where.id)!;
        row.priorityRank = data.priorityRank;
        updates.push({ id: where.id, rank: data.priorityRank });
        return row;
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as any;
}

const fakeScoring = () => ({ recalcUserDomains: vi.fn(async () => {}) }) as any;

const threeRanked = () => fakePrisma([
  { domainType: 'health', priorityRank: 1 },
  { domainType: 'family', priorityRank: 2 },
  { domainType: 'career', priorityRank: 3 },
]);

describe('reordering a ranking', () => {
  it('writes the new positions in the order given', async () => {
    const prisma = threeRanked();
    await new RankingService(prisma, fakeScoring()).setOrder('u1', ['career', 'health', 'family']);

    const byDomain = Object.fromEntries(prisma._state.map((d: any) => [d.domainType, d.priorityRank]));
    expect(byDomain).toEqual({ career: 1, health: 2, family: 3 });
  });

  it('moves the rank and never the score', async () => {
    // The score is derived and recomputed constantly; writing it here would
    // hold until the reader next ticked a habit and then vanish.
    const prisma = threeRanked();
    await new RankingService(prisma, fakeScoring()).setOrder('u1', ['career', 'health', 'family']);

    const written = prisma.lifeDomain.update.mock.calls.map((c: any) => Object.keys(c[0].data));
    for (const keys of written) expect(keys).toEqual(['priorityRank']);
  });

  it('recalculates before answering, so the bars match the new order', async () => {
    const scoring = fakeScoring();
    await new RankingService(threeRanked(), scoring).setOrder('u1', ['family', 'health', 'career']);
    expect(scoring.recalcUserDomains).toHaveBeenCalledWith('u1');
  });

  it('hands back the ranking it actually stored', async () => {
    const out = await new RankingService(threeRanked(), fakeScoring())
      .setOrder('u1', ['career', 'family', 'health']);
    expect(out.ranking.map((r) => r.domainType)).toEqual(['career', 'family', 'health']);
    expect(out.ranking.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('writes every position in one transaction', async () => {
    const prisma = threeRanked();
    await new RankingService(prisma, fakeScoring()).setOrder('u1', ['career', 'health', 'family']);
    // A half-applied reorder would leave two domains sharing a rank.
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe('what it refuses', () => {
  const svc = (prisma = threeRanked()) => new RankingService(prisma, fakeScoring());

  it('refuses a partial order rather than dropping a domain', async () => {
    await expect(svc().setOrder('u1', ['career', 'health']))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a domain the person has not ranked', async () => {
    await expect(svc().setOrder('u1', ['career', 'health', 'family', 'finance']))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses the same domain twice', async () => {
    await expect(svc().setOrder('u1', ['career', 'career', 'health']))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a swap for an unrelated domain', async () => {
    await expect(svc().setOrder('u1', ['career', 'health', 'growth']))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('says something useful when nothing is ranked at all', async () => {
    const prisma = fakePrisma([{ domainType: 'health', priorityRank: null }]);
    await expect(svc(prisma).setOrder('u1', ['health']))
      .rejects.toThrow(/finish onboarding/i);
  });

  it('writes nothing when it refuses', async () => {
    const prisma = threeRanked();
    await expect(svc(prisma).setOrder('u1', ['career'])).rejects.toThrow();
    expect(prisma._updates).toEqual([]);
    expect(prisma.lifeDomain.update).not.toHaveBeenCalled();
  });

  it('does not recalculate when it refuses', async () => {
    const scoring = fakeScoring();
    await expect(new RankingService(threeRanked(), scoring).setOrder('u1', ['career']))
      .rejects.toThrow();
    expect(scoring.recalcUserDomains).not.toHaveBeenCalled();
  });

  it('tolerates casing and stray whitespace from a client', async () => {
    const prisma = threeRanked();
    await svc(prisma).setOrder('u1', [' Career ', 'HEALTH', 'family']);
    const byDomain = Object.fromEntries(prisma._state.map((d: any) => [d.domainType, d.priorityRank]));
    expect(byDomain).toEqual({ career: 1, health: 2, family: 3 });
  });
});
