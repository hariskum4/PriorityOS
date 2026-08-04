/**
 * Changing the order of what matters.
 *
 * Onboarding asks somebody to rank the parts of their life, and until now
 * that answer was permanent. Eleven places read `importanceScore` and nothing
 * wrote it after the first day, so a person whose life had visibly moved on —
 * the one whose health is running at a hundred against a claim of seventy —
 * had no way to say so. Every downstream reading inherited a day-one answer:
 * the allocation bars, the alignment score, which stack is offered, which
 * domain gets the season.
 *
 * **The rank is the durable thing, not the weight.** `importanceScore` is
 * derived — 60 points of inverted rank, plus goals and two flags — and
 * `recalcUserDomains` recomputes it on every habit tick, mission completion
 * and journal entry. Writing a weight straight onto the row would therefore
 * work perfectly until the reader next ticked anything, and then silently
 * revert. So this moves `priorityRank`, which is the actual input, and lets
 * importance follow the way it always has.
 *
 * A reorder, never a re-set. What arrives has to be a permutation of what the
 * account already holds, so this can shuffle a ranking and can never invent,
 * drop or unrank a domain.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';

@Injectable()
export class RankingService {
  constructor(private prisma: PrismaService, private scoring: ScoringService) {}

  async setOrder(userId: string, order: string[]) {
    const ranked = await this.prisma.lifeDomain.findMany({
      where: { userId, priorityRank: { not: null } },
      select: { id: true, domainType: true },
    });

    if (!ranked.length) {
      throw new BadRequestException('Nothing is ranked yet — finish onboarding first');
    }

    const wanted = order.map((d) => (d ?? '').trim().toLowerCase());
    if (new Set(wanted).size !== wanted.length) {
      throw new BadRequestException('A domain cannot appear twice in a ranking');
    }

    const held = new Set(ranked.map((d) => d.domainType));
    const sameSet = wanted.length === held.size && wanted.every((d) => held.has(d));
    if (!sameSet) {
      /* Refusing rather than reconciling. A body that does not match is a
         client bug, and the accommodating version of this — rank what you
         recognise, leave the rest — would quietly drop a domain out of
         somebody's plan and look like it had worked. */
      throw new BadRequestException(
        'The order must contain exactly the domains you have already ranked',
      );
    }

    const idOf = new Map(ranked.map((d) => [d.domainType, d.id]));
    await this.prisma.$transaction(
      wanted.map((domainType, i) => this.prisma.lifeDomain.update({
        where: { id: idOf.get(domainType)! },
        data: { priorityRank: i + 1 },
      })),
    );

    /* Immediately, and inline. Every number the reader is looking at is
       derived from importance, so returning before the recalc would show
       them the old bars over their new order and read as the change not
       having landed. */
    await this.scoring.recalcUserDomains(userId);

    const after = await this.prisma.lifeDomain.findMany({
      where: { userId, priorityRank: { not: null } },
      orderBy: { priorityRank: 'asc' },
      select: { domainType: true, priorityRank: true, importanceScore: true },
    });
    return {
      ranking: after.map((d) => ({
        domainType: d.domainType,
        rank: d.priorityRank,
        importance: Number(d.importanceScore),
      })),
    };
  }
}
