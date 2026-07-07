import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateRelationshipPriorityScore,
  Cadence,
} from '@priority/scoring-engine';

@Injectable()
export class RelationshipsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const rels = await this.prisma.relationship.findMany({
      where: { userId },
      orderBy: { priorityScore: 'desc' },
    });
    return rels;
  }

  create(userId: string, data: any) {
    return this.prisma.relationship.create({
      data: {
        userId,
        name: data.name,
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

  private async assertOwned(userId: string, id: string) {
    const rel = await this.prisma.relationship.findFirst({
      where: { id, userId },
    });
    if (!rel) throw new NotFoundException('Relationship not found');
  }
}
