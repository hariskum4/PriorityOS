/**
 * The person a mission is about, kept on the way in.
 *
 * The kernel already refuses to raise somebody today's plate is already about
 * — `addressedSubjects`, seeded from pending missions' `relationshipId`. For
 * a mission created from a relationship proposal that rule could never fire,
 * because the mission had no `relationshipId` to seed it with.
 *
 * The relationship and time engines tag people as `person:<id>`; the client
 * posts a proposal's subjects back verbatim on accept; the lookup asked for
 * them as bare ids. It matched nothing, silently, and the mission was written
 * with a null person. So the reader accepted "Reach out to Vikram", and the
 * next morning the kernel proposed Vikram again — having been told nothing.
 *
 * Nothing failed. No error, no empty screen: one column quietly null, and a
 * suppression rule that read as enforced and was not.
 */
import { describe, it, expect } from 'vitest';
import { LifeOsService } from './life-os.service';

const VIKRAM = { id: 'rel-vikram', relationType: 'friend', name: 'Vikram' };

/** Records what the accept path tried to look up and what it wrote. */
function harness() {
  const seen: { lookedFor?: string[]; created?: Record<string, any> } = {};
  const prisma = {
    relationship: {
      findFirst: async ({ where }: any) => {
        seen.lookedFor = where.id.in;
        return where.id.in.includes(VIKRAM.id) ? VIKRAM : null;
      },
    },
    mission: {
      findFirst: async () => null,
      create: async ({ data }: any) => { seen.created = data; return { id: 'm1', ...data }; },
    },
    analyticsEvent: { create: async () => ({}) },
  };
  return { service: new LifeOsService(prisma as any), seen };
}

describe('accepting a proposal about a person', () => {
  it('resolves a subject the engines tagged as person:<id>', async () => {
    const { service, seen } = harness();
    await service.acceptProposal('u1', 'p1', {
      action: 'Reach out to Vikram — one message is enough',
      subjects: ['person:rel-vikram', 'friends'],
    });
    expect(seen.lookedFor).toContain('rel-vikram');
    expect(seen.created?.relationshipId).toBe('rel-vikram');
  });

  /* Goals and the host's own records use the bare id, and always did. */
  it('still resolves a bare id', async () => {
    const { service, seen } = harness();
    await service.acceptProposal('u1', 'p1', {
      action: 'Reach out to Vikram',
      subjects: ['rel-vikram'],
    });
    expect(seen.created?.relationshipId).toBe('rel-vikram');
  });

  /**
   * The consequence, stated as the thing that actually broke: a mission with
   * a person on it is what the next cycle reads to know the ask is standing.
   */
  it('gives the next cycle something to suppress on', async () => {
    const { service, seen } = harness();
    await service.acceptProposal('u1', 'p1', {
      action: 'Reach out to Vikram',
      subjects: ['person:rel-vikram'],
    });
    expect(seen.created?.relationshipId).not.toBeNull();
    expect(seen.created?.missionType).toBe('relationship');
  });

  it('leaves a mission about nobody alone', async () => {
    const { service, seen } = harness();
    await service.acceptProposal('u1', 'p1', {
      action: 'Book the checkup you have moved three times',
      subjects: [],
    });
    expect(seen.created?.relationshipId).toBeNull();
    expect(seen.created?.missionType).toBe('one_time');
  });

  it('does not mistake a subject that merely contains the word person', () => {
    /* `replace(/^person:/, …)` is anchored — "personal-growth" is a domain
       tag, not a prefixed id, and must survive untouched. */
    const { service, seen } = harness();
    return service.acceptProposal('u1', 'p1', {
      action: 'Something',
      subjects: ['personal-growth'],
    }).then(() => {
      expect(seen.lookedFor).toEqual(['personal-growth']);
    });
  });
});
