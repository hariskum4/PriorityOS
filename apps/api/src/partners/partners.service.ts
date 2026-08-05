import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Accountability / family links. The privacy line is absolute: a partner
 * sees BROAD signal only — weekly completion, streak, domain balance —
 * and never content (no titles, people, journal, or memories).
 *
 * Two holes were closed here after the link model was proposed as the
 * foundation for shared activities. Both were quiet, both mattered more once
 * something was going to be built on top:
 *
 *   **An invite could be accepted by anyone holding its id.** `accept` looked
 *   the link up, checked it was pending, and bound whoever called it as the
 *   partner — without ever asking whether the invite was addressed to them.
 *   A leaked id (a log line, a support thread, a screenshot) was enough to
 *   start receiving a stranger's weekly signal.
 *
 *   **Inviting an email disclosed whether that email had an account.** The
 *   invite resolved the address to a user and returned `partnerId` alongside
 *   it, so a non-null value on a pending link meant "yes, they are here".
 *   That is account enumeration, and it is exactly the disclosure a shared
 *   activity feature must never make: whether somebody uses this app is
 *   their fact to share, not the app's to confirm.
 *
 * The second is closed at the source rather than by redacting a response.
 * A pending link now carries no partner at all — the address is resolved to
 * a person only when that person accepts, which is the only moment anybody
 * has agreed to be known. Nothing to leak beats nothing leaked.
 */
@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}

  /**
   * What may cross the wire about a link.
   *
   * `partnerId` and `ownerId` are deliberately absent: no screen has ever
   * used them, and the first is the account-enumeration channel above. A
   * shape that cannot carry the leak cannot regress into carrying it.
   */
  private static readonly PUBLIC_LINK = {
    id: true, inviteEmail: true, status: true, createdAt: true,
  } as const;

  async invite(ownerId: string, inviteEmail: string) {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) throw new BadRequestException('Email required');

    const me = await this.prisma.user.findUnique({
      where: { id: ownerId }, select: { email: true },
    });
    /* Linking to yourself is not an accountability relationship, and it would
       show your own numbers back to you as though somebody else were reading
       them. */
    if (me?.email?.toLowerCase() === email) {
      throw new BadRequestException('That is your own address');
    }

    /* One standing invite per address. Re-inviting is a no-op that returns
       the existing link rather than an error, because from the reader's side
       "I invited them again" and "they are already invited" are the same
       intention and neither deserves a red message. */
    const already = await this.prisma.partnerLink.findFirst({
      where: { ownerId, inviteEmail: email, status: { in: ['pending', 'active'] } },
      select: PartnersService.PUBLIC_LINK,
    });
    if (already) return already;

    /* No user lookup. See the note above: resolving the address here is what
       turned an invite into a question about somebody else's account. */
    return this.prisma.partnerLink.create({
      data: { ownerId, inviteEmail: email, status: 'pending' },
      select: PartnersService.PUBLIC_LINK,
    });
  }

  /** Links the current user owns (people they invited) + invites awaiting them. */
  async list(userId: string, userEmail: string) {
    const [owned, incoming] = await Promise.all([
      this.prisma.partnerLink.findMany({
        where: { ownerId: userId },
        /* `partnerId` is needed to read the stats and must not be returned,
           so it is selected here and dropped below. */
        select: { ...PartnersService.PUBLIC_LINK, partnerId: true },
      }),
      this.prisma.partnerLink.findMany({
        where: { inviteEmail: userEmail.toLowerCase(), status: 'pending', NOT: { ownerId: userId } },
        select: { ...PartnersService.PUBLIC_LINK, owner: { select: { fullName: true } } },
      }),
    ]);
    const withStats = await Promise.all(
      owned.map(async ({ partnerId, ...link }) => ({
        ...link,
        stats: link.status === 'active' && partnerId ? await this.sharedStats(partnerId) : null,
      })),
    );
    return { owned: withStats, incoming };
  }

  /**
   * Accept an invite that was addressed to you.
   *
   * The email check is the whole point. Without it the link id was a bearer
   * token for somebody else's weekly signal, and ids travel further than
   * anybody expects.
   *
   * Every failure returns the same message on purpose. "No pending invite"
   * for a link that does not exist, is already accepted, or belongs to
   * somebody else — because a more helpful error would confirm which of the
   * three is true, and that turns this endpoint into the oracle the fix
   * exists to remove.
   */
  async accept(userId: string, userEmail: string, linkId: string) {
    const link = await this.prisma.partnerLink.findUnique({ where: { id: linkId } });
    const addressedToMe =
      link?.inviteEmail.toLowerCase() === (userEmail ?? '').trim().toLowerCase();

    if (!link || link.status !== 'pending' || !addressedToMe) {
      throw new BadRequestException('No pending invite');
    }
    /* Somebody cannot become their own accountability partner by inviting an
       address they also control. */
    if (link.ownerId === userId) throw new BadRequestException('No pending invite');

    return this.prisma.partnerLink.update({
      where: { id: linkId },
      /* The address becomes a person here, and only here — the one moment
         somebody has agreed to be known to the person who invited them. */
      data: { partnerId: userId, status: 'active' },
      select: PartnersService.PUBLIC_LINK,
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
