/**
 * An entry has to contain something.
 *
 * `create` took whatever it was given and wrote a row from it. A payload that
 * named no field the schema knows — a client sending `content` when the model
 * calls it `freeText`, which is exactly how this was found — still produced an
 * entry: every column null, counted in the archive, awarded XP, and fed into
 * domain scoring. A journal that fills up with entries nobody wrote is worse
 * than one that refuses a bad request.
 *
 * The Journal screen already disables Save when everything is blank. This is
 * the same rule on the side that cannot be bypassed.
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { JournalService } from './journal.service';

function make() {
  const created: any[] = [];
  const prisma = {
    journalEntry: {
      create: async ({ data }: any) => {
        const row = { id: `e${created.length + 1}`, createdAt: new Date(), ...data };
        created.push(row);
        return row;
      },
    },
  } as any;
  const scoring = { recalcUserDomains: vi.fn(async () => {}) } as any;
  const game = { award: vi.fn(async () => {}) } as any;
  return { svc: new JournalService(prisma, scoring, game), created, scoring, game };
}

const USER = 'u1';

describe('journal entries must carry something', () => {
  it('refuses a payload with nothing the model recognises', async () => {
    const { svc, created, game } = make();
    await expect(svc.create(USER, { content: 'wrong field name', title: 'also wrong' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(created).toHaveLength(0);
    // The blank entry used to earn XP and move the scores for the domain.
    expect(game.award).not.toHaveBeenCalled();
  });

  it('refuses an entirely empty payload', async () => {
    const { svc } = make();
    await expect(svc.create(USER, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses whitespace pretending to be writing', async () => {
    const { svc } = make();
    await expect(svc.create(USER, { freeText: '   \n  ', whatMattered: '' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('a mood on its own is a real entry', async () => {
    // Tapping "heavy" and closing the app is something someone said about
    // their day. The screen treats it as an entry, so this must too.
    const { svc, created } = make();
    const entry = await svc.create(USER, { mood: 2 });
    expect(entry.mood).toBe(2);
    expect(created).toHaveLength(1);
  });

  it('keeps writing, and trims it', async () => {
    const { svc } = make();
    const entry = await svc.create(USER, {
      whatMattered: '  Walked with Eleanor  ',
      freeText: 'Longer than usual.',
      whatIAvoided: '   ',
    });
    expect(entry.whatMattered).toBe('Walked with Eleanor');
    expect(entry.freeText).toBe('Longer than usual.');
    // Blank-after-trim is stored as absent, not as a string of spaces.
    expect(entry.whatIAvoided).toBeNull();
  });

  it('domainTags that are not a list do not reach the column', async () => {
    const { svc } = make();
    const entry = await svc.create(USER, { mood: 3, domainTags: 'family' });
    expect(entry.domainTags).toEqual([]);
  });

  it('a saved entry still awards XP and rescores', async () => {
    const { svc, scoring, game } = make();
    await svc.create(USER, { mood: 4, gratitude: 'Quiet morning.' });
    expect(game.award).toHaveBeenCalledOnce();
    expect(scoring.recalcUserDomains).toHaveBeenCalledOnce();
  });
});
