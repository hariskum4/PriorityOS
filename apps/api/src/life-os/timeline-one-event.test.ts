/**
 * One event, one act — however many tables recorded it.
 *
 * The app writes a single act into up to three places by design: finish a
 * mission, keep the moment, write the entry. `gather` flattened the tables,
 * so an hour with a seven-year-old arrived on the calendar three times —
 * "done", "kept", "wrote", stacked at the same hour, under a heading that
 * said "3 things recorded".
 *
 * On the grid that is untidy. In `rhythm()` it is a lie: a domain you follow
 * through on reads as about twice as lived as it was. Measured on the real
 * database when this was found — 14 of 24 kept moments came from a mission,
 * and seven of those were **family**, the one domain the product exists to be
 * honest about.
 */
import { describe, it, expect } from 'vitest';
import { LifeTimelineService } from './life-timeline.service';

const TZ = 'Asia/Kolkata';

function fakePrisma(opts: {
  missions?: Array<Record<string, any>>;
  memories?: Array<Record<string, any>>;
}) {
  const none = { findMany: async () => [] };
  return {
    user: { findUnique: async () => ({ timezone: TZ }) },
    mission: { findMany: async () => opts.missions ?? [] },
    memory: { findMany: async () => opts.memories ?? [] },
    contactLog: none,
    habitLog: none,
    journalEntry: none,
  } as any;
}

const AT = new Date('2026-08-07T09:30:00Z');
const mission = (over: Record<string, any> = {}) => ({
  id: 'm1', completedAt: AT, domainType: 'children',
  title: 'Give children one hour this week', ...over,
});
const memory = (over: Record<string, any> = {}) => ({
  occurredAt: AT, domainType: 'children',
  title: 'Give children one hour this week', missionId: 'm1', ...over,
});

/** The tapped-day read-out for the day everything above lands on. */
const dayActs = async (prisma: any) =>
  (await new LifeTimelineService(prisma).year('u1', 2026)).sample['2026-08-07'] ?? [];

describe('a moment kept from a mission is the same event', () => {
  it('is one act carrying both facets, not two acts', async () => {
    const acts = await dayActs(fakePrisma({ missions: [mission()], memories: [memory()] }));
    expect(acts).toHaveLength(1);
    expect([...acts[0].kinds].sort()).toEqual(['memory', 'mission']);
  });

  /**
   * The lead decides what the event is counted and weighted as, and
   * `ACT_WEIGHT` scores a kept moment at 5 against a ticked mission at 1.
   * Leading with the mission because it happened first would value the
   * evening you chose to keep at one errand.
   */
  it('leads with the heavier facet, so the organism is not shrunk', async () => {
    const acts = await dayActs(fakePrisma({ missions: [mission()], memories: [memory()] }));
    expect(acts[0].kinds[0]).toBe('memory');
  });

  it('prefers the words the person put on the moment', async () => {
    const acts = await dayActs(fakePrisma({
      missions: [mission()],
      memories: [memory({ title: 'An hour on the floor with the Lego' })],
    }));
    expect(acts[0].label).toBe('An hour on the floor with the Lego');
  });

  it('counts the day once', async () => {
    const year = await new LifeTimelineService(
      fakePrisma({ missions: [mission()], memories: [memory()] }),
    ).year('u1', 2026);
    const day = year.days.find((d) => d.date === '2026-08-07')!;
    expect(day.total).toBe(1);
    expect(year.events).toBe(1);
    /* Per-kind counts still sum to the total — the event is counted under
       its lead only, so a breakdown can never exceed the thing it breaks down. */
    expect(Object.values(day.kinds).reduce((a, b) => a + b, 0)).toBe(day.total);
  });
});

describe('what must still count as two', () => {
  /**
   * The archive exists so a life older than the app can be written down.
   * Finish a mission today, date the moment to a graduation in 2009, and
   * those are two days — the doing, and the thing remembered. Merging on the
   * id alone would quietly move the 2009 square onto today.
   */
  it('keeps a backdated moment on its own day', async () => {
    const svc = new LifeTimelineService(fakePrisma({
      missions: [mission()],
      memories: [memory({ occurredAt: new Date('2026-03-02T09:30:00Z') })],
    }));
    const year = await svc.year('u1', 2026);
    expect(year.sample['2026-08-07']).toHaveLength(1);
    expect(year.sample['2026-03-02']).toHaveLength(1);
    expect(year.events).toBe(2);
  });

  it('keeps a moment that came from no mission', async () => {
    const acts = await dayActs(fakePrisma({
      missions: [mission()],
      memories: [memory({ missionId: null, title: 'Pongal at home' })],
    }));
    expect(acts).toHaveLength(2);
  });

  it('keeps a moment whose mission is a different one', async () => {
    const acts = await dayActs(fakePrisma({
      missions: [mission()],
      memories: [memory({ missionId: 'm-other' })],
    }));
    expect(acts).toHaveLength(2);
  });

  /* Two moments from one mission is not a shape the app makes, but the merge
     must not silently drop the second if it ever happens. */
  it('does not swallow a second moment from the same mission', async () => {
    const acts = await dayActs(fakePrisma({
      missions: [mission()],
      memories: [memory(), memory({ title: 'And later, the bedtime story' })],
    }));
    expect(acts.length).toBeGreaterThanOrEqual(1);
    expect(acts.map((a: any) => a.label)).toContain('And later, the bedtime story');
  });
});

describe('the contact a relationship mission logs for itself', () => {
  /**
   * Found by running the flow rather than by reading it: completing a
   * mission with a person on it also writes a `ContactLog`, so the event was
   * four rows, not three. The note is written by `missions.service` as
   * `Mission: <title>` — app-authored, which is what makes matching on it
   * safe where matching a journal line would not be.
   */
  const contact = (over: Record<string, any> = {}) => ({
    occurredAt: AT, kind: 'activity', note: 'Mission: Give children one hour this week',
    relationship: { name: 'Kavya', relationType: 'daughter' }, ...over,
  });
  const withContacts = (contacts: Array<Record<string, any>>, extra: Record<string, any> = {}) => {
    const base = fakePrisma({ missions: [mission()], ...extra });
    base.contactLog = { findMany: async () => contacts };
    return base;
  };

  it('folds into the same event', async () => {
    const acts = await dayActs(withContacts([contact()]));
    expect(acts).toHaveLength(1);
    expect(acts[0].kinds).toContain('contact');
  });

  it('folds all three together', async () => {
    const acts = await dayActs(withContacts([contact()], { memories: [memory()] }));
    expect(acts).toHaveLength(1);
    /* Lead checked before sorting a copy — `.sort()` mutates, and reading
       the lead afterwards would report alphabetical order, not weight. */
    expect(acts[0].kinds[0]).toBe('memory'); // memory 5 > contact 3 > mission 1
    expect([...acts[0].kinds].sort()).toEqual(['contact', 'memory', 'mission']);
  });

  it('leaves a contact logged by hand alone', async () => {
    const acts = await dayActs(withContacts([contact({ note: 'Rang her after work' })]));
    expect(acts).toHaveLength(2);
  });

  /* Two logs with the same note are two events; the merge takes one. */
  it('does not swallow a second contact', async () => {
    const acts = await dayActs(withContacts([contact(), contact()]));
    expect(acts).toHaveLength(2);
  });

  it('leaves a contact on a different day alone', async () => {
    const acts = await dayActs(withContacts([contact({ occurredAt: new Date('2026-03-02T09:30:00Z') })]));
    expect(acts).toHaveLength(1);
  });
});

describe('the rhythm estimator stops double-counting', () => {
  /**
   * This is the one that mattered. `rhythm()` answers how often a part of a
   * life actually happens, and the file's own header warns that a wrong
   * estimator "does not produce a wrong statistic — it produces a moving
   * picture that lies."
   */
  it('counts one event once for the domain', async () => {
    const r = await new LifeTimelineService(
      fakePrisma({ missions: [mission()], memories: [memory()] }),
    ).rhythm('u1');
    expect(r.domains.children.total).toBe(1);
    const perKind = r.domains.children.kinds.reduce((n, k) => n + k.count, 0);
    expect(perKind).toBe(1);
  });

  it('still counts two genuinely separate acts', async () => {
    const r = await new LifeTimelineService(fakePrisma({
      missions: [mission()],
      memories: [memory({ missionId: null })],
    })).rhythm('u1');
    expect(r.domains.children.total).toBe(2);
  });
});
