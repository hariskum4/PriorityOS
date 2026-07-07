import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Accountability / family links. The privacy line is absolute: a partner
 * sees BROAD signal only — weekly completion, streak, domain balance —
 * and never content (no titles, people, journal, or memories).
 */
@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}

  async invite(ownerId: string, inviteEmail: string) {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) throw new BadRequestException('Email required');
    // If the invitee already has an account, link immediately as pending.
    const invitee = await this.prisma.user.findUnique({ where: { email } });
    return this.prisma.partnerLink.create({
      data: { ownerId, inviteEmail: email, partnerId: invitee?.id ?? null, status: 'pending' },
    });
  }

  /** Links the current user owns (people they invited) + invites awaiting them. */
  async list(userId: string, userEmail: string) {
    const [owned, incoming] = await Promise.all([
      this.prisma.partnerLink.findMany({ where: { ownerId: userId } }),
      this.prisma.partnerLink.findMany({
        where: { inviteEmail: userEmail.toLowerCase(), status: 'pending', NOT: { ownerId: userId } },
        include: { owner: { select: { fullName: true } } },
      }),
    ]);
    const withStats = await Promise.all(
      owned.map(async (l) => ({
        ...l,
        stats: l.status === 'active' && l.partnerId ? await this.sharedStats(l.partnerId) : null,
      })),
    );
    return { owned: withStats, incoming };
  }

  async accept(userId: string, linkId: string) {
    const link = await this.prisma.partnerLink.findUnique({ where: { id: linkId } });
    if (!link || link.status !== 'pending') throw new BadRequestException('No pending invite');
    return this.prisma.partnerLink.update({
      where: { id: linkId },
      data: { partnerId: userId, status: 'active' },
    });
  }

  /**
   * The ONLY thing a partner ever sees. Broad, non-identifying signal:
   * a weekly completion rate, current streak, and how many domains are
   * getting attention. No titles, no names, no content — ever.
   */
  private async sharedStats(userId: string) {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [done, gami, domains] = await Promise.all([
      this.prisma.mission.count({ where: { userId, status: 'completed', completedAt: { gte: weekAgo } } }),
      this.prisma.gamificationProfile.findUnique({ where: { userId }, select: { dailyStreak: true, level: true } }),
      this.prisma.lifeDomain.findMany({ where: { userId, importanceScore: { gt: 0 } }, select: { attentionScore: true } }),
    ]);
    const active = domains.filter((d) => Number(d.attentionScore) >= 20).length;
    return {
      missionsThisWeek: done,
      dailyStreak: gami?.dailyStreak ?? 0,
      level: gami?.level ?? 1,
      domainsActive: active,
      domainsTotal: domains.length,
    };
  }
}
