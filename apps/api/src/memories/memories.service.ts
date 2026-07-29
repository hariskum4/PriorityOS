import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class MemoriesService {
  constructor(
    private prisma: PrismaService,
    private game: GamificationService,
  ) {}

  list(userId: string, filters: { person?: string; countKey?: string } = {}) {
    return this.prisma.memory.findMany({
      where: {
        userId,
        ...(filters.person
          ? { peoplePresent: { array_contains: filters.person } }
          : {}),
        ...(filters.countKey ? { countKey: filters.countKey } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  /** Memories from this calendar day in earlier years — the ritual prompt. */
  async onThisDay(userId: string) {
    const all = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
    });
    const now = new Date();
    return all.filter((m) => {
      const d = new Date(m.occurredAt);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() < now.getFullYear()
      );
    });
  }

  /** Count of logged memories per countKey — "lived" side of the counts. */
  async countsSummary(userId: string) {
    const rows = await this.prisma.memory.groupBy({
      by: ['countKey'],
      where: { userId, countKey: { not: null } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.countKey, r._count._all]));
  }

  async create(userId: string, data: any) {
    const memory = await this.prisma.memory.create({
      data: {
        userId,
        title: data.title,
        memoryType: data.memoryType ?? 'moment',
        domainType: data.domainType ?? null,
        relationshipId: data.relationshipId ?? null,
        missionId: data.missionId ?? null,
        countKey: data.countKey ?? null,
        peoplePresent: Array.isArray(data.peoplePresent) ? data.peoplePresent : [],
        location: data.location ?? null,
        reflection: data.reflection ?? null,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      },
    });
    const xp = await this.game.award(
      userId,
      'memory_logged',
      memory.domainType ?? 'reflection',
      memory.id,
    );
    return { ...memory, xp };
  }

  /**
   * Correct a moment.
   *
   * Mostly this is a date. A memory typed today about a graduation in 2009
   * lands on today unless the person remembers to backdate it, and getting the
   * year wrong puts it on the wrong square of a grid meant to show their life
   * — worth being able to fix without deleting and retyping the whole thing.
   */
  async update(userId: string, id: string, data: any) {
    await this.assertOwned(userId, id);
    const patch: Record<string, unknown> = {};
    for (const field of ['title', 'memoryType', 'domainType', 'countKey', 'location', 'reflection', 'relationshipId']) {
      if (data[field] !== undefined) patch[field] = data[field];
    }
    if (Array.isArray(data.peoplePresent)) patch.peoplePresent = data.peoplePresent;
    if (data.occurredAt) patch.occurredAt = new Date(data.occurredAt);
    return this.prisma.memory.update({ where: { id }, data: patch });
  }

  /** No XP is clawed back — it was true when it happened. */
  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.prisma.memory.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwned(userId: string, id: string) {
    const memory = await this.prisma.memory.findFirst({ where: { id, userId } });
    if (!memory) throw new NotFoundException('Memory not found');
    return memory;
  }
}
