/**
 * What the model is allowed to change about a moment's questions.
 *
 * The engine composes four questions that fit the moment and the model is
 * asked only to word them better. Everything below is a case where the
 * rewrite has to be thrown away and the engine's version shown instead — and
 * the point of testing it here rather than trusting the prompt is that a
 * prompt is a request. Six wrong sentences in one evening, from a good model
 * with a prompt that forbade exactly what it did, is the reason this layer
 * exists at all.
 *
 * The reader never sees a rejection. They see a question that was already
 * good.
 */
import { describe, it, expect } from 'vitest';
import { MemoriesService } from './memories.service';
import { momentPrompts } from '@priority/scoring-engine';

type Edited = { insight: string; account: string; conversation: string; keepsake: string };

const MOMENT = {
  id: 'm1',
  userId: 'u1',
  title: 'Called Amma',
  memoryType: 'relationship',
  personName: 'Amma',
  peoplePresent: ['Amma'],
  occurredAt: new Date(),
};

/** The service with one moment in it and a model that says whatever we say. */
function svc(edited: Partial<Edited>, memory: Record<string, any> = MOMENT) {
  const prisma = {
    memory: { findFirst: async () => memory },
  };
  const ai = {
    generateOrDefer: async (_u: string, _k: string, _t: unknown, _c: unknown, fb: Edited) => ({
      ...fb, ...edited,
    }),
  };
  return new MemoriesService(prisma as any, {} as any, {} as any, ai as any);
}

const engineFor = (memory: Record<string, any> = MOMENT) => momentPrompts({
  title: memory.title,
  memoryType: memory.memoryType,
  personName: memory.personName,
  peopleCount: (memory.peoplePresent ?? []).length,
  daysAgo: 0,
  written: {
    reflection: memory.reflection,
    conversation: memory.conversation,
    keepsake: memory.keepsake,
  },
});

describe('a rewrite that is still a question is used', () => {
  it('takes the model wording when it survives both checks', async () => {
    const out = await svc({
      insight: 'What shifted between you and Amma?',
      conversation: 'What did you and Amma actually say to each other?',
    }).prompts('u1', 'm1');
    expect(out.insight).toBe('What shifted between you and Amma?');
    expect(out.conversation).toBe('What did you and Amma actually say to each other?');
  });

  it('falls back per field, not all or nothing', async () => {
    const engine = engineFor();
    const out = await svc({
      insight: 'What shifted between you and Amma?',   // fine
      keepsake: 'Did you like it?',                     // closed
    }).prompts('u1', 'm1');
    expect(out.insight).toBe('What shifted between you and Amma?');
    expect(out.keepsake).toBe(engine.keepsake);
  });
});

describe('a rewrite that stops being a question is thrown away', () => {
  const engine = engineFor();

  it.each([
    ['Did you and Amma have a good talk?', 'a yes/no question gets a yes'],
    ['How did that make you feel?', 'one adjective, and it stops'],
    ['Tell me what Amma said.', 'not a question at all'],
    ['What did Amma say? And what did it change?', 'two questions in one box'],
  ])('rejects %s — %s', async (rewrite) => {
    const out = await svc({ conversation: rewrite }).prompts('u1', 'm1');
    expect(out.conversation).toBe(engine.conversation);
  });

  /* The Reveal's failure, in miniature: nothing invented, nothing misread,
     the question simply stopped being about anybody. */
  it('rejects a warmer question that has lost the person', async () => {
    const out = await svc({ conversation: 'What did you actually talk about?' })
      .prompts('u1', 'm1');
    expect(out.conversation).toBe(engine.conversation);
    expect(out.conversation).toContain('Amma');
  });

  it('rejects a question that has gained somebody who was not there', async () => {
    const out = await svc({ insight: 'What did that change between you, Amma and Appa?' })
      .prompts('u1', 'm1');
    expect(out.insight).toBe(engine.insight);
  });

  /* The account line lives inside an empty box as a hint. A third question
     stacked above one input is an interrogation. */
  it('keeps the account line from turning into a question', async () => {
    const out = await svc({ account: 'What actually happened with Amma?' })
      .prompts('u1', 'm1');
    expect(out.reflection).toBe(engine.reflection);
  });
});

describe('with the model off, the form is still asked four real things', () => {
  it('returns the engine set when nothing comes back', async () => {
    const out = await svc({ insight: '', account: '', conversation: '', keepsake: '' })
      .prompts('u1', 'm1');
    expect(out).toEqual(engineFor());
  });
});

describe('the endpoint reads what is already on the moment', () => {
  /**
   * The reported bug, end to end.
   *
   * The account narrates the conversation and the next box asked for the
   * conversation. The service has to hand the written fields to the engine
   * for this to be caught — the engine cannot read the database.
   */
  it('stops asking what was said once the account has said it', async () => {
    const written = {
      ...MOMENT,
      title: 'Dinner with the phones in the other room',
      personName: 'Divya',
      peoplePresent: ['Divya'],
      reflection: 'Forty minutes. We talked about her sister, then about nothing.',
    };
    const out = await svc({}, written).prompts('u1', 'm1');
    expect(out.conversation).not.toMatch(/talk/i);
    expect(out.conversation).toBe('What do you see when you picture it?');
  });

  it('still asks it when the account is empty', async () => {
    const blank = {
      ...MOMENT,
      title: 'Dinner with the phones in the other room',
      personName: 'Divya',
      peoplePresent: ['Divya'],
      reflection: null,
    };
    const out = await svc({}, blank).prompts('u1', 'm1');
    expect(out.conversation).toBe('What did you and Divya actually talk about?');
  });

  it('reads the keepsake and the conversation, not only the account', async () => {
    const out = await svc({}, {
      ...MOMENT,
      conversation: 'She asked when we were coming next and I told her soon.',
    }).prompts('u1', 'm1');
    expect(out.conversation).not.toMatch(/talk about/i);
  });

  /* The link is a control label, so the model never touches it — but it
     still has to follow the box it opens. */
  it('moves the disclosure label with the question', async () => {
    const out = await svc({}, {
      ...MOMENT,
      title: 'Dinner with the phones in the other room',
      personName: 'Divya',
      peoplePresent: ['Divya'],
      reflection: 'Forty minutes. We talked about her sister, then about nothing.',
    }).prompts('u1', 'm1');
    expect(out.disclosure).toBe('what you see, what you want to remember');
  });

  it('never lets the model rewrite the disclosure label', async () => {
    const out = await svc({ insight: 'What shifted between you and Amma?' } as any)
      .prompts('u1', 'm1');
    expect(out.disclosure).toBe(engineFor().disclosure);
  });
});

describe('on this day leads with the moment that has most left to say', () => {
  /** Same calendar day, earlier years, in the order the query returns them. */
  const anniversary = (yearsAgo: number, extra: Record<string, any>) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    return {
      id: `m${yearsAgo}`, userId: 'u1', memoryType: 'experience',
      peoplePresent: [], occurredAt: d, ...extra,
    };
  };

  function listing(memories: Array<Record<string, any>>) {
    const prisma = { memory: { findMany: async () => memories } };
    return new MemoriesService(prisma as any, {} as any, {} as any, {} as any);
  }

  it('puts the thinnest first, not the most recent', async () => {
    const rich = anniversary(1, {
      title: 'Pongal at home',
      reflection: 'We sat in the kitchen while she cooked, and I saw her face change because of it.',
    });
    const bare = anniversary(4, { title: 'Pongal at home again' });
    const out = await listing([rich, bare]).onThisDay('u1');
    expect(out.map((m: any) => m.title)).toEqual(['Pongal at home again', 'Pongal at home']);
  });

  /* The date still decides who is eligible — that is what the card means. */
  it('never promotes a moment from the wrong day', async () => {
    const wrongDay = { ...anniversary(2, { title: 'Not today' }), occurredAt: new Date('2020-03-03') };
    const out = await listing([wrongDay, anniversary(1, { title: 'Today, years ago' })])
      .onThisDay('u1');
    expect(out.map((m: any) => m.title)).toEqual(['Today, years ago']);
  });

  it('breaks a tie on recency', async () => {
    const out = await listing([anniversary(5, { title: 'older' }), anniversary(2, { title: 'newer' })])
      .onThisDay('u1');
    expect(out.map((m: any) => m.title)).toEqual(['newer', 'older']);
  });

  /* Thinness measures the record, never the life — an evening alone is not
     thin for having had no conversation in it. */
  it('does not count dialogue against a moment nobody else was at', async () => {
    const alone = anniversary(1, {
      title: 'A long walk', peoplePresent: [],
      reflection: 'I walked to the beach and sat there until it went dark, thinking about it.',
    });
    const together = anniversary(2, {
      title: 'Lunch', peoplePresent: ['Amma', 'Appa'],
      reflection: 'I walked to the beach and sat there until it went dark, thinking about it.',
    });
    const out = await listing([alone, together]).onThisDay('u1');
    expect(out.map((m: any) => m.title)).toEqual(['Lunch', 'A long walk']);
  });
});

describe('who was there decides what can be asked', () => {
  it('does not ask what was said when nobody was', async () => {
    const alone = {
      ...MOMENT, title: 'Shipped the release', memoryType: 'achievement',
      personName: null, peoplePresent: [],
    };
    const out = await svc({}, alone).prompts('u1', 'm1');
    expect(out.conversation).not.toMatch(/talk|said|told/i);
    /* Effort is asked for in the amber question, so the box below moves on
       rather than asking the same thing twice. */
    expect(out.insight).toBe('What did that take that nobody saw?');
    expect(out.conversation).toBe('Where were you?');
  });

  it('gives a gathering the plural rather than one name out of four', async () => {
    const crowd = {
      ...MOMENT, title: 'Diwali at home', personName: 'Amma',
      peoplePresent: ['Amma', 'Appa', 'Arun', 'Meera'],
    };
    const out = await svc({}, crowd).prompts('u1', 'm1');
    expect(out.conversation).toBe('What did you all actually talk about?');
  });

  /* A date in the future is a typo, not a reason to ask what has stayed with
     somebody since a thing that has not happened. */
  it('treats a future date as today', async () => {
    const ahead = { ...MOMENT, occurredAt: new Date(Date.now() + 90 * 86_400_000) };
    const out = await svc({}, ahead).prompts('u1', 'm1');
    expect(out.keepsake).toBe('What do you want to remember about it?');
  });

  it('asks what still stays about something years old', async () => {
    const old = { ...MOMENT, occurredAt: new Date(Date.now() - 900 * 86_400_000) };
    const out = await svc({}, old).prompts('u1', 'm1');
    expect(out.keepsake).toBe('What still stays with you about it?');
  });
});
