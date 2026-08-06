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
  /* The draft path is the only thing that touches AI, and it is exercised in
     its own describe below with the model deliberately off. */
  const ai = { generate: vi.fn(async (_u: string, _k: string, _t: unknown, _c: unknown, fallback: unknown) => fallback) } as any;
  return { svc: new JournalService(prisma, scoring, game, ai), created, scoring, game, ai };
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

/**
 * The two halves of the Journal tab, finally introduced.
 *
 * "Today" is written; "Memories" is the archive. Completing a mission and
 * tapping Save it produced the second and never the first, so the app could
 * know somebody called their mother and hold not one word about it. The blank
 * page is why — nobody opens a text field at nine at night to describe a call
 * they have already had.
 *
 * These pin the fallback, which is the path that runs with AI switched off
 * and therefore the one that has to be right on its own.
 */
describe('a first line, so the page is not blank', () => {
  const draft = async (input: { title: string; personName?: string }) => {
    const { svc } = make();
    return (await svc.draft(USER, input)) as { whatMattered: string; prompt: string | null };
  };

  it('names the person when the title has not', async () => {
    const d = await draft({ title: 'Take one thing off their plate this week', personName: 'Yusuf' });
    expect(d.whatMattered).toBe('Take one thing off their plate this week, with Yusuf.');
  });

  it('does not say their name twice when the title already did', async () => {
    /* "Call Amma — not a text — with Amma." was the first version: her name
       twice and two em-dashes colliding. */
    const d = await draft({ title: 'Call Amma — not a text', personName: 'Amma' });
    expect(d.whatMattered).toBe('Call Amma — not a text.');
  });

  it('matches a name on a word boundary, not inside another word', async () => {
    /* "Ama" must not count as having named "Amma", nor the reverse. */
    const d = await draft({ title: 'Sit with Ama for an hour', personName: 'Amma' });
    expect(d.whatMattered).toContain('with Amma');
  });

  it('leaves a title that already ends in a full stop alone', async () => {
    const d = await draft({ title: 'Put on your shoes. You are allowed to stop there.' });
    expect(d.whatMattered).toBe('Put on your shoes. You are allowed to stop there.');
    expect(d.whatMattered).not.toMatch(/\.\./);
  });

  it('works with nobody in it', async () => {
    const d = await draft({ title: 'Walk for twenty minutes today' });
    expect(d.whatMattered).toBe('Walk for twenty minutes today.');
  });

  /**
   * The rules the prompt is held to, checked on the fallback because it is the
   * only output this test can see deterministically. The model is told the
   * same things, and the tone tests elsewhere cover generated copy.
   */
  it('never claims how it went, and never congratulates', async () => {
    const FICTION = /\b(lovely|great|wonderful|nice|well done|good job|proud of you|amazing)\b/i;
    for (const input of [
      { title: 'Call Amma — not a text', personName: 'Amma' },
      { title: 'Walk for twenty minutes today' },
    ]) {
      const d = await draft(input);
      expect(d.whatMattered).not.toMatch(FICTION);
      expect(d.whatMattered).not.toMatch(/[!?]/);
    }
  });
});
