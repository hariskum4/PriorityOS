import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { scheduledFor: 'desc' },
      take: 50,
    });
  }

  /**
   * Schedule with the three PRD guardrails baked in:
   * dedupe key blocks spam, quiet hours shift delivery, preferences respected.
   */
  async schedule(
    userId: string,
    kind: string,
    title: string,
    body: string,
    when: Date,
    dedupeKey: string,
  ) {
    const prefs = await this.prisma.userPreferences.findUnique({ where: { userId } });
    const target = new Date(when);
    if (prefs) {
      const hour = target.getHours();
      const inQuiet =
        prefs.quietHoursStart > prefs.quietHoursEnd
          ? hour >= prefs.quietHoursStart || hour < prefs.quietHoursEnd
          : hour >= prefs.quietHoursStart && hour < prefs.quietHoursEnd;
      if (inQuiet) target.setHours(prefs.quietHoursEnd, 0, 0, 0);
    }
    return this.prisma.notification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      create: { userId, kind, title, body, scheduledFor: target, dedupeKey },
      update: {}, // duplicate suppressed
    });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }
}
