import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The shape of a user this API is willing to say out loud.
 *
 * One constant, used by every path that returns a user, because `update` had
 * its own answer: it returned `prisma.user.update()` unselected, so a plain
 * `PATCH /me` replied with the whole row — `passwordHash` included. `me()` had
 * always been careful; the write path beside it had simply never been given
 * the same list, and nothing made the omission visible.
 */
const PUBLIC_USER_FIELDS = {
  id: true, email: true, fullName: true, dob: true, timezone: true,
  city: true, country: true, profession: true, workType: true,
  workHoursPerWeek: true, screenHoursPerDay: true,
  workStartHour: true, workEndHour: true, commuteMinutes: true, workDays: true,
  maritalStatus: true, childrenCount: true,
  livesAwayFromParents: true, parentsInLife: true, onboardingCompleted: true,
  motivationStyle: true, createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_FIELDS,
    });
  }

  update(userId: string, data: Record<string, unknown>) {
    const allowed = [
      'fullName', 'dob', 'timezone', 'city', 'country', 'profession',
      'workType', 'workHoursPerWeek', 'screenHoursPerDay', 'maritalStatus',
      'childrenCount', 'livesAwayFromParents', 'parentsInLife', 'motivationStyle',
      'workStartHour', 'workEndHour', 'commuteMinutes', 'workDays',
    ];
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k)),
    );

    /**
     * `dob` is a DateTime column and arrives as whatever the client sent.
     * A plain "1992-03-14" made Prisma throw, which surfaced as a 500 — an
     * unhandled server error for what is a client mistake, and one that told
     * the caller nothing about which field was wrong.
     */
    if (patch.dob !== undefined && patch.dob !== null) {
      const dob = new Date(patch.dob as string);
      if (Number.isNaN(dob.getTime())) {
        throw new BadRequestException('dob must be a valid date');
      }
      patch.dob = dob;
    }
    for (const key of ['workHoursPerWeek', 'screenHoursPerDay', 'childrenCount', 'commuteMinutes']) {
      if (patch[key] === undefined || patch[key] === null) continue;
      const n = Number(patch[key]);
      if (!Number.isFinite(n) || n < 0) {
        throw new BadRequestException(`${key} must be a non-negative number`);
      }
      patch[key] = Math.round(n);
    }
    /**
     * Three states, and only one of them silences anything.
     *
     * `parentsInLife` is nullable because `null` means "never asked" — every
     * account older than the column — and an explicit `false` is what stops
     * the app offering to help somebody call a parent who has died. A string
     * "false" reaching Prisma would throw, and worse, a truthy "false" would
     * quietly restore the copy this field exists to withhold.
     */
    if (patch.parentsInLife !== undefined && patch.parentsInLife !== null
        && typeof patch.parentsInLife !== 'boolean') {
      throw new BadRequestException('parentsInLife must be true, false, or null');
    }
    /**
     * The working week, as a set of weekdays.
     *
     * Sorted and de-duplicated on the way in, because it is read as a set and
     * stored as an array — two clients disagreeing about order would make an
     * identical answer look like a change. An empty array is a real answer
     * ("none of them") and stays distinct from the column never being set,
     * which is what every account older than it holds.
     */
    if (patch.workDays !== undefined) {
      if (!Array.isArray(patch.workDays)) {
        throw new BadRequestException('workDays must be an array of weekdays');
      }
      const days = patch.workDays.map(Number);
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new BadRequestException('workDays must be whole numbers from 0 (Sunday) to 6');
      }
      patch.workDays = [...new Set(days)].sort((a, b) => a - b);
    }
    /* An hour of the day, not a duration — 0 is midnight and is valid. */
    for (const key of ['workStartHour', 'workEndHour']) {
      if (patch[key] === undefined || patch[key] === null) continue;
      const n = Number(patch[key]);
      if (!Number.isInteger(n) || n < 0 || n > 23) {
        throw new BadRequestException(`${key} must be an hour between 0 and 23`);
      }
      patch[key] = n;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: patch,
      select: PUBLIC_USER_FIELDS,
    });
  }

  preferences(userId: string) {
    return this.prisma.userPreferences.findUnique({ where: { userId } });
  }

  updatePreferences(userId: string, data: Record<string, unknown>) {
    const allowed = [
      'reminderTone', 'insightIntensity', 'quietHoursStart', 'quietHoursEnd',
      'preferredReminderHour', 'gamificationEnabled', 'weeklyReviewDay',
    ];
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k)),
    );
    /**
     * Hours of a clock, on non-nullable columns.
     *
     * These are `Int` with defaults, so there is no such thing as unsetting
     * one — and a null went to Prisma unchecked and came back a 500, an
     * unhandled server error for what is a client mistake. Same rule as the
     * profile's work hours: 0 is midnight and is valid, 24 is not an hour.
     */
    for (const key of ['quietHoursStart', 'quietHoursEnd', 'preferredReminderHour']) {
      if (patch[key] === undefined) continue;
      const n = Number(patch[key]);
      if (patch[key] === null || !Number.isInteger(n) || n < 0 || n > 23) {
        throw new BadRequestException(`${key} must be an hour between 0 and 23`);
      }
      patch[key] = n;
    }
    return this.prisma.userPreferences.update({ where: { userId }, data: patch });
  }

  /**
   * Everything this system holds about one person, as machine-readable JSON.
   *
   * The Record screen is the readable version; this is the portable one. It is
   * the other half of asking someone to keep their life here: they can take
   * all of it out, in a form another program can read, without asking us.
   *
   * Credentials are the one exclusion — password hashes and refresh-token
   * hashes are ours to hold, not data about them, and exporting them only
   * creates a second place to steal them from.
   */
  async exportAll(userId: string) {
    const [
      user, preferences, onboarding, domains, relationships, memories,
      goals, missions, habits, journal, insights, reviews, gamification,
      xp, decisions, knowledge, attention, lifeOsState, notifications,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: PUBLIC_USER_FIELDS,
      }),
      this.prisma.userPreferences.findUnique({ where: { userId } }),
      this.prisma.onboardingAnswer.findMany({ where: { userId } }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.relationship.findMany({
        where: { userId },
        include: { contactLogs: true },
      }),
      this.prisma.memory.findMany({ where: { userId } }),
      this.prisma.goal.findMany({ where: { userId } }),
      this.prisma.mission.findMany({ where: { userId } }),
      this.prisma.habit.findMany({ where: { userId }, include: { logs: true } }),
      this.prisma.journalEntry.findMany({ where: { userId } }),
      this.prisma.opportunityInsight.findMany({ where: { userId } }),
      this.prisma.weeklyReview.findMany({ where: { userId } }),
      this.prisma.gamificationProfile.findUnique({ where: { userId } }),
      this.prisma.domainXpEntry.findMany({ where: { userId } }),
      this.prisma.decision.findMany({ where: { userId } }),
      this.prisma.knowledgeItem.findMany({ where: { userId } }),
      this.prisma.domainAttentionSample.findMany({ where: { userId } }),
      this.prisma.lifeOsState.findUnique({ where: { userId } }),
      this.prisma.notification.findMany({ where: { userId } }),
    ]);

    return {
      format: 'priority-archive',
      version: 1,
      exportedAt: new Date().toISOString(),
      user,
      preferences,
      onboarding,
      domains,
      relationships,
      memories,
      goals,
      missions,
      habits,
      journal,
      insights,
      reviews,
      gamification,
      xp,
      decisions,
      knowledge,
      attention,
      lifeOsState,
      notifications,
    };
  }

  /**
   * Erase the account. Irreversible, and meant to be.
   *
   * Re-authenticating first is not ceremony: an access token can be lifted from
   * a shared laptop, and this is the one call that cannot be undone. Every
   * user-owned table cascades from User, so a single delete is genuinely
   * complete rather than merely thorough-looking.
   */
  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    if (!password || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Password does not match');
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true, at: new Date().toISOString() };
  }
}
