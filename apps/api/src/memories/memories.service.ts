import { Injectable } from '@nestjs/common';
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
}
