/**
 * The half of a life that changes after onboarding.
 *
 * Every endpoint here existed on the server or was added with it, and none of
 * them was reachable from the app: relationships and goals could only be
 * created during onboarding, and journal entries and memories could never be
 * corrected or removed at all. So these tests are less about the handlers than
 * about the contract the screens now depend on — that a person can be added,
 * renamed, opened and removed, and that removing them does not quietly edit
 * the past.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { testPrisma, truncateAll } from './db';
import { RelationshipsService } from '../src/relationships/relationships.service';
import { GoalsService } from '../src/goals/goals.service';
import { JournalService } from '../src/journal/journal.service';
import { MemoriesService } from '../src/memories/memories.service';

let prisma: PrismaService;
let people: RelationshipsService;
let goals: GoalsService;
let journal: JournalService;
let memories: MemoriesService;
let userId: string;

const aiStub = { generate: async (_u: string, _k: string, _t: unknown, _c: unknown, fb: unknown) => fb };
const scoringStub = { recalcUserDomains: async () => {} };
const gameStub = { award: async () => ({ xp: 0 }) };

beforeAll(async () => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  prisma = await testPrisma();
  people = new RelationshipsService(prisma, aiStub as never);
  goals = new GoalsService(prisma);
  journal = new JournalService(prisma, scoringStub as never, gameStub as never);
  memories = new MemoriesService(prisma, gameStub as never);
});

beforeEach(async () => {
  await truncateAll(prisma);
  const user = await prisma.user.create({
    data: { email: `crud-${Math.random().toString(36).slice(2)}@example.com`, fullName: 'Test', timezone: 'UTC' },
  });
  userId = user.id;
});

afterAll(() => prisma.$disconnect());

describe('a life that can still change', () => {
  it('adds someone who was not there at onboarding', async () => {
    const person = await people.create(userId, { name: 'Nikhil', relationType: 'colleague' });
    expect(person.id).toBeTruthy();
    expect(await prisma.relationship.count({ where: { userId } })).toBe(1);
  });

  it('opens one person with their history and their moments', async () => {
    const person = await people.create(userId, { name: 'Amma', relationType: 'mother' });
    await people.logContact(userId, person.id, 'call');
    await memories.create(userId, {
      title: 'The afternoon by the river',
      relationshipId: person.id,
      occurredAt: '2019-04-02T12:00:00.000Z',
    });

    const detail = await people.detail(userId, person.id);
    expect(detail.name).toBe('Amma');
    expect(detail.contacts).toHaveLength(1);
    expect(detail.memories).toHaveLength(1);
    expect(detail.memories[0].title).toBe('The afternoon by the river');
  });

  it('will not open someone else’s person', async () => {
    const other = await prisma.user.create({
      data: { email: `other-${Math.random()}@example.com`, fullName: 'Other', timezone: 'UTC' },
    });
    const theirs = await people.create(other.id, { name: 'Private', relationType: 'friend' });
    await expect(people.detail(userId, theirs.id)).rejects.toThrow();
  });

  it('corrects a relation that onboarding got wrong', async () => {
    const person = await people.create(userId, { name: 'Jai', relationType: 'friend' });
    const fixed = await people.update(userId, person.id, { relationType: 'sibling', city: 'Pune' });
    expect(fixed.relationType).toBe('sibling');
    expect(fixed.city).toBe('Pune');
  });
});

describe('goals, after the day they were guessed at', () => {
  it('adds one', async () => {
    const goal = await goals.create(userId, { title: 'Run a 10K by December', domainType: 'health' });
    expect(goal.domainType).toBe('health');
    expect(goal.horizon).toBe('1y');
  });

  it('refiles one that landed in the wrong part of a life', async () => {
    // The real case: "Open a hotel" filed under children, which then chose its
    // colour, its suggested first step, and which engine reads it.
    const goal = await goals.create(userId, { title: 'Open a hotel', domainType: 'children' });
    const fixed = await goals.update(userId, goal.id, { domainType: 'purpose', horizon: '5y' });
    expect(fixed.domainType).toBe('purpose');
    expect(fixed.horizon).toBe('5y');
  });

  it('removes one without destroying the work already done for it', async () => {
    const goal = await goals.create(userId, { title: 'Learn to swim', domainType: 'health' });
    const mission = await prisma.mission.create({
      data: {
        userId, goalId: goal.id, title: 'Book one lesson',
        domainType: 'health', missionType: 'habit', status: 'completed',
      },
    });

    await goals.remove(userId, goal.id);

    expect(await prisma.goal.count({ where: { userId } })).toBe(0);
    const survivor = await prisma.mission.findUnique({ where: { id: mission.id } });
    // It was still done. Deleting the goal is not a claim it never happened.
    expect(survivor).toBeTruthy();
    expect(survivor!.goalId).toBeNull();
  });

  it('refuses to touch a goal that is not yours', async () => {
    const other = await prisma.user.create({
      data: { email: `o-${Math.random()}@example.com`, fullName: 'Other', timezone: 'UTC' },
    });
    const theirs = await goals.create(other.id, { title: 'Theirs', domainType: 'career' });
    await expect(goals.remove(userId, theirs.id)).rejects.toThrow();
  });
});

describe('a journal you can take something back out of', () => {
  it('keeps the fields the form never used to send', async () => {
    const entry = await journal.create(userId, {
      whatMattered: 'A long walk',
      gratitude: 'The weather held',
      gladNotPostponed: 'Called Appa instead of texting',
      mood: 4,
      domainTags: ['family', 'health'],
    });
    const read = await prisma.journalEntry.findUnique({ where: { id: entry.id } });
    expect(read!.gratitude).toBe('The weather held');
    expect(read!.gladNotPostponed).toBe('Called Appa instead of texting');
    expect(read!.mood).toBe(4);
    // The schema says this field feeds attention scoring, and nothing wrote it.
    expect(read!.domainTags).toEqual(['family', 'health']);
  });

  it('edits one line without blanking the others', async () => {
    const entry = await journal.create(userId, {
      whatMattered: 'first draft',
      gratitude: 'keep me',
    });
    await journal.update(userId, entry.id, { whatMattered: 'what I actually meant' });

    const read = await prisma.journalEntry.findUnique({ where: { id: entry.id } });
    expect(read!.whatMattered).toBe('what I actually meant');
    expect(read!.gratitude).toBe('keep me');
  });

  it('deletes one, for good', async () => {
    const entry = await journal.create(userId, { whatMattered: 'I wish I had not written this' });
    await journal.remove(userId, entry.id);
    expect(await prisma.journalEntry.count({ where: { userId } })).toBe(0);
  });

  it('pages back past the fiftieth entry', async () => {
    const base = Date.now();
    await prisma.journalEntry.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        userId,
        whatMattered: `entry ${i}`,
        createdAt: new Date(base - i * 86_400_000),
      })),
    });

    const first = await journal.list(userId, { take: 5 });
    expect(first).toHaveLength(5);

    const next = await journal.list(userId, { take: 5, before: first[4].createdAt.toISOString() });
    expect(next).toHaveLength(5);
    // A keyset page never repeats the row it was anchored on.
    const ids = new Set([...first, ...next].map((e) => e.id));
    expect(ids.size).toBe(10);
  });

  it('will not delete an entry belonging to someone else', async () => {
    const other = await prisma.user.create({
      data: { email: `o-${Math.random()}@example.com`, fullName: 'Other', timezone: 'UTC' },
    });
    const theirs = await journal.create(other.id, { whatMattered: 'private' });
    await expect(journal.remove(userId, theirs.id)).rejects.toThrow();
    expect(await prisma.journalEntry.count()).toBe(1);
  });
});

describe('moments, corrected', () => {
  it('moves one to the year it actually happened', async () => {
    // The failure this fixes: a memory typed today about a 2009 graduation
    // lands on today, and the years grid lights the wrong square for a life.
    const memory = await memories.create(userId, { title: 'Graduation' });
    await memories.update(userId, memory.id, { occurredAt: '2009-06-14T12:00:00.000Z' });

    const read = await prisma.memory.findUnique({ where: { id: memory.id } });
    expect(read!.occurredAt.getUTCFullYear()).toBe(2009);
    expect(read!.title).toBe('Graduation');
  });

  it('attaches a moment to the person it was about', async () => {
    const person = await people.create(userId, { name: 'Priya', relationType: 'spouse' });
    const memory = await memories.create(userId, {
      title: 'Dinner without phones',
      relationshipId: person.id,
      peoplePresent: ['Priya'],
    });
    expect(memory.relationshipId).toBe(person.id);

    const detail = await people.detail(userId, person.id);
    expect(detail.memories.map((m: { id: string }) => m.id)).toContain(memory.id);
  });

  it('deletes one', async () => {
    const memory = await memories.create(userId, { title: 'Mistyped' });
    await memories.remove(userId, memory.id);
    expect(await prisma.memory.count({ where: { userId } })).toBe(0);
  });
});
