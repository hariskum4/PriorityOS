import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RELATIONSHIP_NUDGE } from '@priority/ai-prompts';
import {
  calculateRelationshipPriorityScore,
  Cadence,
} from '@priority/scoring-engine';

@Injectable()
export class RelationshipsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
  ) {}

  async list(userId: string) {
    const rels = await this.prisma.relationship.findMany({
      where: { userId },
      orderBy: { priorityScore: 'desc' },
    });
    // Overdue people with no fresh reach-out line get one in the background
    // (top 3 only — bounded cost). Never blocks the list; shows next fetch.
    const stale = rels
      .filter(
        (r) =>
          r.wantsMoreTime &&
          Number(r.priorityScore) >= 60 &&
          (!r.reachOutLineAt || Date.now() - r.reachOutLineAt.getTime() > 6 * 86_400_000),
      )
      .slice(0, 3);
    for (const r of stale) {
      void this.ensureReachOutLine(r.id).catch(() => {});
    }
    return rels;
  }

  /**
   * Add someone, or fill in the person already there.
   *
   * The database now refuses a second row for the same name and relation, so
   * this has to decide what a repeat means. Re-adding "Amma / mother" is never
   * a request for a second mother — it is someone entering her again, usually
   * with more detail than the first time. So we update in place, and only
   * where the new value says something: a blank field must not erase what is
   * already known.
   */
  async create(userId: string, data: any) {
    const name = String(data.name ?? '').trim();
    const existing = await this.prisma.relationship.findFirst({
      where: {
        userId,
        relationType: data.relationType,
        name: { equals: name, mode: 'insensitive' },
      },
    });

    if (existing) {
      const patch = Object.fromEntries(
        Object.entries({
          age: data.age,
          city: data.city,
          closenessScore: data.closenessScore,
          inPersonFrequency: data.inPersonFrequency,
          callFrequency: data.callFrequency,
          desiredCallFrequency: data.desiredCallFrequency,
          healthStatus: data.healthStatus,
          locationType: data.locationType,
          wantsMoreTime: data.wantsMoreTime,
          meaningfulMomentTypes: data.meaningfulMomentTypes,
          notes: data.notes,
        }).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      );
      return this.prisma.relationship.update({ where: { id: existing.id }, data: patch });
    }

    return this.prisma.relationship.create({
      data: {
        userId,
        name,
        relationType: data.relationType,
        age: data.age ?? null,
        city: data.city ?? null,
        closenessScore: data.closenessScore ?? 5,
        inPersonFrequency: data.inPersonFrequency ?? null,
        callFrequency: data.callFrequency ?? null,
        desiredCallFrequency: data.desiredCallFrequency ?? data.callFrequency ?? 'weekly',
        healthStatus: data.healthStatus ?? null,
        locationType: data.locationType ?? null,
        wantsMoreTime: data.wantsMoreTime ?? true,
        meaningfulMomentTypes: data.meaningfulMomentTypes ?? [],
        notes: data.notes ?? null,
      },
    });
  }

  async update(userId: string, id: string, data: any) {
    await this.assertOwned(userId, id);
    return this.prisma.relationship.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.prisma.relationship.delete({ where: { id } });
    return { deleted: true };
  }

  /** One-tap contact log: the anti-friction feature manual CRMs lacked. */
  async logContact(userId: string, id: string, kind: string, note?: string) {
    await this.assertOwned(userId, id);
    const now = new Date();
    await this.prisma.contactLog.create({
      data: { relationshipId: id, kind, note },
    });
    const patch: Record<string, Date> = { lastContactAt: now };
    if (kind === 'visit') patch.lastVisitAt = now;
    const rel = await this.prisma.relationship.update({
      where: { id },
      data: patch,
    });
    await this.recalcPriority(rel.id);
    return rel;
  }

  async recalcPriority(relationshipId: string) {
    const rel = await this.prisma.relationship.findUnique({
      where: { id: relationshipId },
    });
    if (!rel) return;
    const days =
      rel.lastContactAt === null
        ? null
        : Math.floor((Date.now() - rel.lastContactAt.getTime()) / 86_400_000);
    const score = calculateRelationshipPriorityScore({
      closenessScore: rel.closenessScore ?? 5,
      wantsMoreTime: rel.wantsMoreTime,
      desiredContactCadence: (rel.desiredCallFrequency ?? 'weekly') as Cadence,
      daysSinceLastContact: days,
      age: rel.age,
    });
    await this.prisma.relationship.update({
      where: { id: relationshipId },
      data: { priorityScore: score },
    });
  }

  /**
   * "Reach out WITH something" — not just a reminder. Grounds the nudge in
   * the latest saved memory with this person, so the message is a gift
   * ("ask her about the recipe") instead of an obligation. Refreshed at most
   * every 6 days per person; stored on the row so reads cost nothing.
   */
  async ensureReachOutLine(relationshipId: string): Promise<{ title: string; body: string } | null> {
    const rel = await this.prisma.relationship.findUnique({ where: { id: relationshipId } });
    if (!rel) return null;
    const fresh =
      rel.reachOutLineAt && Date.now() - rel.reachOutLineAt.getTime() < 6 * 86_400_000;
    if (fresh && rel.reachOutLine) {
      return { title: `Time with ${rel.name}?`, body: rel.reachOutLine };
    }

    const memory = await this.prisma.memory.findFirst({
      where: { userId: rel.userId, relationshipId: rel.id },
      orderBy: { occurredAt: 'desc' },
      select: { title: true, reflection: true, occurredAt: true },
    });
    const days = rel.lastContactAt
      ? Math.floor((Date.now() - rel.lastContactAt.getTime()) / 86_400_000)
      : null;

    const nudge = await this.ai.generate(
      rel.userId,
      'reach_out',
      RELATIONSHIP_NUDGE,
      {
        person: { name: rel.name, relationType: rel.relationType },
        daysSinceContact: days,
        usuallyConnectVia: rel.callFrequency ? `calls (${rel.callFrequency})` : null,
        latestMemory: memory
          ? {
              title: memory.title,
              reflection: memory.reflection?.slice(0, 200) ?? null,
              when: memory.occurredAt.toISOString().slice(0, 10),
            }
          : null,
      },
      // Fallback still delivers the "with something" promise when possible.
      {
        title: `Time with ${rel.name}?`,
        body: memory
          ? `Last time you saved a moment together: "${memory.title.slice(0, 60)}". Ask ${rel.name} about it.`
          : `It's been a while since you connected with ${rel.name}. A short call counts.`,
      },
    );

    const body = String(nudge.body ?? '').trim().slice(0, 180);
    await this.prisma.relationship.update({
      where: { id: rel.id },
      data: { reachOutLine: body || null, reachOutLineAt: new Date() },
    });
    return { title: String(nudge.title ?? `Time with ${rel.name}?`).slice(0, 60), body };
  }

  private async assertOwned(userId: string, id: string) {
    const rel = await this.prisma.relationship.findFirst({
      where: { id, userId },
    });
    if (!rel) throw new NotFoundException('Relationship not found');
  }
}
