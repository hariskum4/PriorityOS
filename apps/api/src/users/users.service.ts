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
  movementLimits: true,
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
      'workStartHour', 'workEndHour', 'commuteMinutes', 'workDays', 'movementLimits',
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
      /**
       * A real date is not the same as a possible birthday.
       *
       * `2099-01-01` is a perfectly valid Date and was accepted, which gave
       * the Time tab an age of −73 to work with: "years lived" came back
       * negative, the horizon ran to a hundred and forty-three years, and the
       * grid was told to fill in minus seventy-three squares. Every number on
       * the tab is age arithmetic, so one impossible date poisons all of them
       * at once — and none of it looks like an error, it just looks generous.
       *
       * The upper bound is today because a person cannot be born tomorrow.
       * The lower is 130 years, comfortably past the oldest verified life, so
       * it refuses typos without ever refusing somebody real.
       */
      const now = Date.now();
      const OLDEST_YEARS = 130;
      if (dob.getTime() > now) {
        throw new BadRequestException('dob cannot be in the future');
      }
      if (now - dob.getTime() > OLDEST_YEARS * 365.25 * 86_400_000) {
        throw new BadRequestException(`dob cannot be more than ${OLDEST_YEARS} years ago`);
      }
      patch.dob = dob;
    }
    /**
     * A floor was not enough.
     *
     * Non-negative let `workHoursPerWeek: 500` through — more hours than a
     * week contains — and every free-hour figure on the Time tab is
     * `168 − sleep − work − overhead`, so the whole tab goes to its floor and
     * stays there with no clue why. Each ceiling is the largest value that is
     * still a fact about a week or a life rather than a typo.
     */
    /* The two work hours have their own clock check further down. */
    const CEILING: Record<string, number> = {
      workHoursPerWeek: 168,     // the week itself
      screenHoursPerDay: 24,     // the day itself
      childrenCount: 20,
      commuteMinutes: 600,       // five hours each way
    };
    for (const key of ['workHoursPerWeek', 'screenHoursPerDay', 'childrenCount', 'commuteMinutes']) {
      if (patch[key] === undefined || patch[key] === null) continue;
      const n = Number(patch[key]);
      if (!Number.isFinite(n) || n < 0 || n > CEILING[key]) {
        throw new BadRequestException(
          `${key} must be a number between 0 and ${CEILING[key]}`,
        );
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
    /**
     * Three answers, and null for never asked.
     *
     * Not a medical field and deliberately not a list of conditions: the app
     * needs to know whether to offer a vigorous session, and nothing more.
     * Anything outside the three is refused rather than stored, because a
     * value the offer path cannot read would silently behave as "no limits" —
     * which is the failure this column exists to prevent.
     */
    if (patch.movementLimits !== undefined && patch.movementLimits !== null
        && !['none', 'low_impact', 'ask_doctor'].includes(String(patch.movementLimits))) {
      throw new BadRequestException('movementLimits must be none, low_impact or ask_doctor');
    }
    /**
     * The country is not a label, it is an input to the arithmetic.
     *
     * Every horizon on the Time tab reads it — the life table, the marker on
     * the grid, how many years anybody is counted over. `NOT-A-COUNTRY` was
     * accepted and stored, and the lookup then quietly fell back to the
     * global default, so the tab went on quoting confident figures for a
     * place that does not exist while the You tab showed the reader their
     * own nonsense back. Two letters, upper case, as `countryFromTimezone`
     * produces and `LIFE_EXPECTANCY` is keyed.
     */
    if (patch.country !== undefined && patch.country !== null && patch.country !== '') {
      const code = String(patch.country).trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) {
        throw new BadRequestException('country must be a two-letter ISO code');
      }
      patch.country = code;
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
    /**
     * The setting that decides how directly this app talks about finite time,
     * and the only one where an unreadable value is a safety question rather
     * than a display one.
     *
     * `off` is honoured server-side — it returns an empty insight list. A
     * value the check cannot read is not `off`, so somebody who asked for
     * silence and had their answer stored as `screaming` would be talked to
     * anyway. Refused rather than stored, for the same reason as
     * `movementLimits` above.
     */
    if (patch.insightIntensity !== undefined && patch.insightIntensity !== null
        && !['off', 'gentle', 'direct'].includes(String(patch.insightIntensity))) {
      throw new BadRequestException('insightIntensity must be off, gentle or direct');
    }
    if (patch.weeklyReviewDay !== undefined && patch.weeklyReviewDay !== null) {
      const n = Number(patch.weeklyReviewDay);
      if (!Number.isInteger(n) || n < 0 || n > 6) {
        throw new BadRequestException('weeklyReviewDay must be a day between 0 and 6');
      }
      patch.weeklyReviewDay = n;
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
