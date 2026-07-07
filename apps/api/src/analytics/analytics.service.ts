import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /** Record a named event and refresh the user's last-seen timestamp. */
  async track(userId: string, name: string, props: Record<string, unknown> = {}) {
    await this.prisma.$transaction([
      this.prisma.analyticsEvent.create({ data: { userId, name, props: props as object } }),
      this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }),
    ]);
    return { ok: true };
  }

  /**
   * The founder dashboard: funnel counts + D1/D7/D30 retention cohorts.
   * Retention = of users who signed up ≥N days ago, the share with any
   * event on day N or later. Deliberately simple and readable.
   */
  async metrics() {
    const [users, events] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, createdAt: true, onboardingCompleted: true } }),
      this.prisma.analyticsEvent.findMany({ select: { userId: true, name: true, createdAt: true } }),
    ]);

    const funnel = countByName(events);
    funnel['signed_up'] = users.length;
    funnel['onboarding_completed'] = users.filter((u) => u.onboardingCompleted).length;

    // Activity days per user (unique calendar days with any event).
    const activeDays = new Map<string, Set<string>>();
    for (const e of events) {
      const set = activeDays.get(e.userId) ?? new Set<string>();
      set.add(new Date(e.createdAt).toISOString().slice(0, 10));
      activeDays.set(e.userId, set);
    }

    const now = Date.now();
    const retention = [1, 7, 30].map((n) => {
      const eligible = users.filter((u) => now - new Date(u.createdAt).getTime() >= n * DAY);
      if (!eligible.length) return { day: n, eligible: 0, retained: 0, pct: null as number | null };
      const retained = eligible.filter((u) => {
        const signup = new Date(u.createdAt).getTime();
        const days = activeDays.get(u.id);
        if (!days) return false;
        return [...days].some((d) => {
          const t = new Date(d).getTime();
          return t - signup >= n * DAY - DAY / 2 && t - signup < (n + 1) * DAY;
        });
      }).length;
      return { day: n, eligible: eligible.length, retained, pct: Math.round((retained / eligible.length) * 100) };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalUsers: users.length,
      funnel,
      retention,
    };
  }
}

function countByName(events: { name: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.name] = (out[e.name] ?? 0) + 1;
  return out;
}
