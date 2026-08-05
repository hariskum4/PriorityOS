import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RELATIONSHIP_NUDGE } from '@priority/ai-prompts';
import {
  calculateRelationshipPriorityScore,
  normalizeHealthStatus,
  normalizeLocationType,
  Cadence,
} from '@priority/scoring-engine';

/**
 * What a client is allowed to say about a person.
 *
 * `update` used to hand the request body straight to Prisma. That let anything
 * in the JSON reach a column — including `userId`, which would have moved
 * someone's mother into a stranger's account, and `priorityScore`, which the
 * engine owns. An allowlist is the only thing standing between the request and
 * the row, so it lives next to the writes rather than in a decorator someone
 * can forget to add to the next endpoint.
 */
const WRITABLE_FIELDS = [
  'name', 'relationType', 'age', 'city', 'closenessScore',
  'inPersonFrequency', 'callFrequency', 'desiredCallFrequency',
  'healthStatus', 'locationType', 'wantsMoreTime',
  'meaningfulMomentTypes', 'notes', 'birthday',
] as const;

/**
 * Health and location are stored as free strings, and the Time Reality engine
 * indexes tables with them. Normalising on the way in means a word the engine
 * has never seen cannot sit in the database waiting to become NaN.
 */
/**
 * "harish" typed on a phone keyboard becomes "Harish" everywhere his name is
 * ever rendered — the People list, "Walk with Harish", "Time with Harish?".
 * Only fully-lowercase input is touched: "McKenna", "de Souza" and every
 * other deliberate casing pass through exactly as written, because a fix for
 * autocorrect must never argue with someone about their own mother's name.
 */
function displayName(raw: string): string {
  const name = raw.trim();
  if (name !== name.toLowerCase()) return name;
  return name.replace(/(^|[\s\-'])\p{L}/gu, (ch) => ch.toUpperCase());
}

function normalizeWritable(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE_FIELDS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  if (typeof out.name === 'string' && out.name.trim()) {
    out.name = displayName(out.name);
  }
  if (out.healthStatus != null && out.healthStatus !== '') {
    out.healthStatus = normalizeHealthStatus(String(out.healthStatus));
  }
  if (out.locationType != null && out.locationType !== '') {
    out.locationType = normalizeLocationType(String(out.locationType));
  }
  if (out.age !== undefined) {
    const age = Number(out.age);
    out.age = Number.isFinite(age) && age >= 0 && age < 130 ? Math.floor(age) : null;
  }
  return out;
}

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
   * One person, whole.
   *
   * The list gives a name and a number of days. This is everything else the
   * app already knew and had nowhere to show: how you said you want to see
   * them, every contact you logged, and the moments you kept with them in
   * them. A relationship the product cannot open is a row in a table, not a
   * person.
   */
  async detail(userId: string, id: string) {
    const person = await this.assertOwned(userId, id);
    const [contacts, memories] = await Promise.all([
      this.prisma.contactLog.findMany({
        where: { relationshipId: id },
        orderBy: { occurredAt: 'desc' },
        take: 40,
      }),
      this.prisma.memory.findMany({
        where: { userId, relationshipId: id },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      }),
    ]);
    return { ...person, contacts, memories };
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
  async create(userId: string, raw: any) {
    const data = { ...raw, ...normalizeWritable(raw ?? {}) };
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
      await this.prisma.relationship.update({ where: { id: existing.id }, data: patch });
      return this.recalcPriority(existing.id);
    }

    /**
     * Score at birth, not at first contact.
     *
     * Everything downstream selects BY this score — the drift cron takes
     * rows at 70+, reach-out lines at 60+, the People list orders by it. A
     * row created at the default 0 sat below every one of those gates, so
     * the person added during onboarding — the app's whole reason to nudge —
     * could never be nudged until a contact was logged by hand.
     */
    const created = await this.prisma.relationship.create({
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
    return this.recalcPriority(created.id);
  }

  async update(userId: string, id: string, data: any) {
    await this.assertOwned(userId, id);
    // Closeness, cadence and wantsMoreTime are all inputs to the score, so an
    // edit re-scores unconditionally — cheaper than diffing which field moved.
    await this.prisma.relationship.update({
      where: { id },
      data: normalizeWritable(data ?? {}),
    });
    return this.recalcPriority(id);
  }

  async remove(userId: string, id: string) {
    const person = await this.assertOwned(userId, id);

    /**
     * Keep the name on the moments before the person goes.
     *
     * Memory.relationshipId is SET NULL on delete, so without this the
     * memories survive with their subject quietly removed — "the afternoon by
     * the river" with nobody in it, and no way for anyone later to tell who it
     * was about. Deleting a person should remove the person, not edit the past.
     */
    await this.prisma.memory.updateMany({
      where: { relationshipId: id, personName: null },
      data: { personName: person.name },
    });

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
    await this.prisma.relationship.update({
      where: { id },
      data: patch,
    });
    // Hand back the re-scored row: the one-tap log is exactly the moment the
    // urgency number changes, and the screen that made the tap shows it.
    return this.recalcPriority(id);
  }

  async recalcPriority(relationshipId: string) {
    const rel = await this.prisma.relationship.findUnique({
      where: { id: relationshipId },
    });
    if (!rel) return null;
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
    return this.prisma.relationship.update({
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
      // "It's been a while" is only said when the data can back it: with no
      // contact ever logged, the app has no idea how long it has been, and
      // claiming otherwise sat directly above a row reading "nothing logged
      // yet" — an invented fact on the screen meant to earn trust.
      {
        title: `Time with ${rel.name}?`,
        body: memory
          ? `Last time you saved a moment together: "${memory.title.slice(0, 60)}". Ask ${rel.name} about it.`
          : days !== null
            ? `It's been a while since you connected with ${rel.name}. A short call counts.`
            : `Nothing logged with ${rel.name} yet. A short call counts — and starts the record.`,
      },
    );

    const body = String(nudge.body ?? '').trim().slice(0, 180);
    await this.prisma.relationship.update({
      where: { id: rel.id },
      data: { reachOutLine: body || null, reachOutLineAt: new Date() },
    });
    return { title: String(nudge.title ?? `Time with ${rel.name}?`).slice(0, 60), body };
  }

  /** Returns the row as well, so callers that need it do not fetch twice. */
  private async assertOwned(userId: string, id: string) {
    const rel = await this.prisma.relationship.findFirst({
      where: { id, userId },
    });
    if (!rel) throw new NotFoundException('Relationship not found');
    return rel;
  }
}
