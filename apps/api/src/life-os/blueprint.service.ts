/**
 * The Life Blueprint — generating a catalog for one person, and keeping it.
 *
 * Three steps, and only the middle one is interesting.
 *
 *   **Ask.** One structured call, over the onboarding answers this app has
 *   been storing and mostly not reading, plus the goals and the shape of the
 *   working day. It asks for far more than it needs.
 *
 *   **Judge.** `judgeBlueprint` in the scoring engine decides what may exist:
 *   pure, offline, deterministic, and the only thing standing between a free
 *   model's output and a card in front of a person. Nothing in this file
 *   second-guesses it, and nothing downstream re-reads raw model output —
 *   by the time a row is written, the judging is done.
 *
 *   **Keep.** Survivors become rows and join the same pools the built-ins
 *   feed. They do not replace the catalogs; an account with no rows here
 *   behaves exactly as it did before this table existed, which is also what
 *   happens when AI is switched off, the key is missing, the model is down,
 *   or a whole generation is rejected.
 *
 * Refreshed rarely on purpose — at the Reveal and then no more often than
 * weekly. A catalog that changed daily would not be a catalog; it would be a
 * feed, and the reader would stop trusting that a rhythm they agreed to on
 * Tuesday is the same one on Thursday.
 */
import { Injectable, Logger } from '@nestjs/common';
import { BLUEPRINT_CRAFT } from '@priority/ai-prompts';
import {
  bodyWindows,
  judgeBlueprint,
  lifeShape,
  roleOfRelation,
  type BlueprintContext,
  type PersonalRhythm,
  type PersonalStack,
  type PersonRole,
  type Rejection,
} from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const DAY_MS = 86_400_000;

/**
 * How long a blueprint stands before it may be rewritten.
 *
 * Matches the Sunday Session's own cadence: the weekly review is the moment
 * the app is already asking somebody to look at their life, and it is the
 * only honest place for their catalog to have changed.
 */
const REFRESH_AFTER_DAYS = 7;

/**
 * This asks for a dozen of each and expects most to be thrown away, which
 * takes a model longer than a single narrative line. The Reveal renders from
 * deterministic copy while this runs, so nothing is waiting on it.
 */
const TIMEOUT_MS = 90_000;

interface Proposal {
  rhythms?: unknown;
  stacks?: unknown;
}

@Injectable()
export class BlueprintService {
  private readonly logger = new Logger(BlueprintService.name);

  constructor(private prisma: PrismaService, private ai: AiService) {}

  /** The personal rhythms this person still holds, in engine shape. */
  async rhythmsFor(userId: string): Promise<PersonalRhythm[]> {
    return this.read<PersonalRhythm>(userId, 'rhythm');
  }

  /** The personal stacks this person still holds, in engine shape. */
  async stacksFor(userId: string): Promise<PersonalStack[]> {
    return this.read<PersonalStack>(userId, 'stack');
  }

  /**
   * Read the catalog, and treat any failure as an empty one.
   *
   * Both callers put this inside a `Promise.all` alongside the queries their
   * screen genuinely depends on, so a rejection here would take out the whole
   * rhythms or stacks endpoint — an enrichment breaking the thing it was meant
   * to enrich.
   *
   * That is not hypothetical. The API's own container starts with
   * `migrate:deploy || echo 'migrate skipped'`, which is deliberate — it lets
   * the service boot against a pre-provisioned database — and it means a
   * deploy where the migration did not run brings up an API with no such
   * table. Every account would lose its rhythms to a feature none of them had
   * yet. Swallowing this is the difference between a missing enhancement and
   * an outage.
   */
  private async read<T>(userId: string, kind: 'rhythm' | 'stack'): Promise<T[]> {
    try {
      const rows = await this.prisma.personalCatalogItem.findMany({
        where: { userId, kind, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((r) => r.payload as unknown as T);
    } catch (err) {
      this.logger.warn(`Personal ${kind} catalog unreadable for ${userId}: ${String(err)}`);
      return [];
    }
  }

  /**
   * Turn one off.
   *
   * Deactivated rather than deleted, so the next generation can be told what
   * this person has already rejected. Losing that would mean re-proposing the
   * thing they said no to, which reads as the app not listening.
   */
  async retire(userId: string, key: string): Promise<boolean> {
    // Guarded for the same reason `read` is: on a deploy where the migration
    // has not run there is no such table, and an unguarded write turned a
    // missing enhancement into a 500 on a button the reader can see.
    try {
      const { count } = await this.prisma.personalCatalogItem.updateMany({
        where: { userId, key },
        data: { isActive: false },
      });
      return count > 0;
    } catch (err) {
      this.logger.warn(`Personal catalog unwritable for ${userId}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Write this person's catalog, if it is due one.
   *
   * Safe to call on any path and from anywhere: it decides for itself whether
   * anything needs doing, and it never throws. A blueprint failing is not an
   * event a reader should ever experience — the built-ins are right there.
   */
  async refresh(
    userId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ added: number; rejected: Rejection[]; skipped?: string }> {
    try {
      if (!opts.force) {
        const due = await this.isDue(userId);
        if (!due) return { added: 0, rejected: [], skipped: 'not-due' };
      }
      if (!this.ai.enabled) return { added: 0, rejected: [], skipped: 'ai-disabled' };
      return await this.generate(userId);
    } catch (err) {
      this.logger.warn(`Blueprint refresh failed for ${userId}: ${String(err)}`);
      return { added: 0, rejected: [], skipped: 'error' };
    }
  }

  private async isDue(userId: string): Promise<boolean> {
    const newest = await this.prisma.personalCatalogItem.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!newest) return true;
    return Date.now() - newest.createdAt.getTime() >= REFRESH_AFTER_DAYS * DAY_MS;
  }

  private async generate(userId: string) {
    const [user, answers, goals, habits, relationships, existing] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          profession: true, workType: true, workHoursPerWeek: true, commuteMinutes: true,
          city: true, country: true, maritalStatus: true, childrenCount: true, dob: true,
          livesAwayFromParents: true, parentsInLife: true, motivationStyle: true,
        },
      }),
      this.prisma.onboardingAnswer.findMany({
        where: { userId },
        select: { key: true, value: true },
      }),
      this.prisma.goal.findMany({
        where: { userId, status: { not: 'completed' } },
        select: { title: true, domainType: true },
        take: 8,
      }),
      /* Retired ones included, for the same reason the catalog includes them:
         something deliberately ended must not be proposed back. */
      this.prisma.habit.findMany({
        where: { userId },
        select: { title: true, domainType: true },
      }),
      this.prisma.relationship.findMany({
        where: { userId },
        select: { name: true, relationType: true },
      }),
      this.prisma.personalCatalogItem.findMany({
        where: { userId },
        select: { key: true, payload: true, isActive: true },
      }),
    ]);

    const answerOf = (key: string) => answers.find((a) => a.key === key)?.value ?? null;
    const shape = lifeShape(user?.workType, user?.commuteMinutes);

    /* Everything the model must not restate: what they hold, what they ended,
       and what a previous generation already proposed — accepted or rejected. */
    const previous = existing.map((e) => titleOf(e.payload));
    const takenTitles = [
      ...habits.map((h) => h.title),
      ...previous.filter(Boolean) as string[],
    ];

    const proposal = await this.ai.generate<Proposal>(
      userId,
      'blueprint_craft',
      BLUEPRINT_CRAFT,
      {
        profile: {
          profession: user?.profession ?? null,
          workType: user?.workType ?? null,
          workHoursPerWeek: user?.workHoursPerWeek ?? null,
          commuteMinutes: user?.commuteMinutes ?? null,
          city: user?.city ?? null,
          country: user?.country ?? null,
          maritalStatus: user?.maritalStatus ?? null,
          childrenCount: user?.childrenCount ?? 0,
          livesAwayFromParents: user?.livesAwayFromParents ?? null,
          /* So nothing generated writes a mother into a life that does not
             have one. Only an explicit false says so; null is never asked. */
          hasParentsInLife: user?.parentsInLife !== false,
          motivationStyle: user?.motivationStyle ?? 'balanced',
          ageYears: user?.dob
            ? Math.floor((Date.now() - user.dob.getTime()) / (365.25 * DAY_MS))
            : null,
        },
        /* Spelled out rather than left for the model to infer from workType.
           Inferring is exactly how a homemaker got told to reclaim a commute. */
        lifeContains: shape,
        onboarding: {
          postponing: answerOf('postponing'),
          futureSelf: answerOf('futureSelf'),
          eulogy: answerOf('eulogy'),
          neglectedDomains: answerOf('neglectedDomains'),
          firstWeekFeeling: answerOf('firstWeekFeeling'),
        },
        goals: goals.map((g) => ({ title: g.title, domain: g.domainType })),
        /* Roles, never names. The judge would reject a named person anyway,
           but there is no reason to send the names at all. */
        peopleRoles: [...new Set(relationships.map((r) => r.relationType))],
        /* What the engine has already ruled out for this age, and what each
           closure means now. The model never decides these — the arithmetic
           did — but a model that does not know the strength window has
           passed will write "build serious muscle" for a 70-year-old, and a
           model that does know can write the truer thing: what is kept, and
           what the closure makes more important. Facts in, narration out —
           the same division of labour as everywhere else. */
        windowsPassed: user?.dob
          ? bodyWindows(
            Math.floor((Date.now() - user.dob.getTime()) / (365.25 * DAY_MS)),
          )
            .filter((w) => w.state === 'closed')
            .map((w) => ({ what: w.label, meaning: w.framingText }))
          : [],
        existing: takenTitles,
      },
      { rhythms: [], stacks: [] },
      { timeoutMs: TIMEOUT_MS },
    );

    const ctx: BlueprintContext = {
      shape,
      knownNames: relationships.map((r) => r.name),
      roles: rolesOf(relationships.map((r) => r.relationType)),
      takenTitles,
    };

    const verdict = judgeBlueprint(proposal, ctx);

    /* One number, so a bad prompt shows up as a ratio in the logs rather than
       as a reader wondering why nothing on their Time tab ever changes. */
    const proposedCount = countOf(proposal);
    this.logger.log(
      `Blueprint for ${userId}: proposed ${proposedCount}, kept `
      + `${verdict.rhythms.length + verdict.stacks.length}, `
      + `rejected ${verdict.rejected.map((r) => r.reason).join(',') || 'none'}`,
    );

    const generation = await this.nextGeneration(userId);
    const rows = [
      ...verdict.rhythms.map((r) => ({
        kind: 'rhythm', key: r.key, domainType: r.domainType, payload: r,
      })),
      ...verdict.stacks.map((s) => ({
        kind: 'stack', key: s.key, domainType: null, payload: s,
      })),
    ];

    for (const row of rows) {
      await this.prisma.personalCatalogItem.upsert({
        where: { userId_kind_key: { userId, kind: row.kind, key: row.key } },
        /* An update leaves `isActive` alone on purpose: re-proposing something
           the reader switched off must not switch it back on. */
        update: { payload: row.payload as object, domainType: row.domainType, generation },
        create: {
          userId,
          kind: row.kind,
          key: row.key,
          domainType: row.domainType,
          payload: row.payload as object,
          generation,
        },
      });
    }

    return { added: rows.length, rejected: verdict.rejected };
  }

  private async nextGeneration(userId: string): Promise<number> {
    const newest = await this.prisma.personalCatalogItem.findFirst({
      where: { userId },
      orderBy: { generation: 'desc' },
      select: { generation: true },
    });
    return (newest?.generation ?? 0) + 1;
  }
}

/** A stored payload's human line, whichever kind it is. */
function titleOf(payload: unknown): string | null {
  const p = payload as { title?: unknown; action?: unknown } | null;
  if (typeof p?.title === 'string') return p.title;
  if (typeof p?.action === 'string') return p.action;
  return null;
}

function countOf(proposal: Proposal | null | undefined): number {
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return n(proposal?.rhythms) + n(proposal?.stacks);
}

/**
 * Relationship types, mapped to the roles a stack can be built around.
 *
 * Deliberately the engine's own map rather than a second one written here.
 * The judge has to gate on precisely what `suggestStacks` will later be able
 * to fill, or it would approve a stack naming a child on the strength of a
 * recorded sibling and the reader would be offered a person they do not have.
 */
function rolesOf(types: string[]): PersonRole[] {
  const out = new Set<PersonRole>();
  for (const t of types) {
    const role = roleOfRelation(t);
    if (role) out.add(role);
  }
  return [...out];
}
