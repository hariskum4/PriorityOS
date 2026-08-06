import { describe, it, expect } from 'vitest';
import {
  momentPrompts, momentDisclosure, isUsableQuestion, isUsableAccountLine, type MomentContext,
} from './momentPrompts';

const base: MomentContext = { title: 'Called Amma', memoryType: 'relationship' };

describe('the questions fit the moment they are under', () => {
  it('asks about the person by name when there was one', () => {
    const p = momentPrompts({ ...base, personName: 'Amma' });
    expect(p.conversation).toBe('What did you and Amma actually talk about?');
    expect(p.insight).toContain('Amma');
    expect(p.reflection).toContain('with Amma');
  });

  /* The failure this file was written for: "What did you talk about?" under a
     thing somebody did on their own is a question with no possible answer. */
  it('never asks what was said when nobody was there', () => {
    const p = momentPrompts({ title: 'Shipped the release', memoryType: 'achievement' });
    expect(p.conversation).toBe('What did it take to get there?');
    expect(p.conversation).not.toMatch(/talk/i);
  });

  it('gives a gathering the plural and nobody a name', () => {
    const p = momentPrompts({ ...base, title: 'Diwali at home', peopleCount: 4 });
    expect(p.conversation).toBe('What did you all actually talk about?');
  });

  /* One name is a link; four names is the app deciding whose evening it was.
     `personName` is only ever set when there is exactly one. */
  it('does not name one person out of a crowd', () => {
    const p = momentPrompts({ ...base, personName: 'Amma', peopleCount: 4 });
    expect(p.conversation).toBe('What did you all actually talk about?');
  });

  it('shapes the account line by what kind of thing it was', () => {
    expect(momentPrompts({ title: 'Ran the half', memoryType: 'achievement' }).reflection)
      .toBe('The longer version — how you actually got there');
    expect(momentPrompts({ title: 'Kerala trip', memoryType: 'experience' }).reflection)
      .toBe('The longer version — what it was actually like');
  });
});

describe('how long ago it was changes what can honestly be asked', () => {
  it('asks what you want to remember about something recent', () => {
    expect(momentPrompts({ ...base, daysAgo: 2 }).keepsake)
      .toBe('What do you want to remember about it?');
  });

  it('asks what has stayed once it has had time to', () => {
    expect(momentPrompts({ ...base, daysAgo: 60 }).keepsake)
      .toBe('What has stayed with you since?');
  });

  it('asks what still stays after a year', () => {
    expect(momentPrompts({ ...base, daysAgo: 900 }).keepsake)
      .toBe('What still stays with you about it?');
  });

  /* Unknown is treated as today — the cautious direction. Asking "what has
     stayed with you since?" about this afternoon is the app inventing time. */
  it('treats an unknown date as recent rather than old', () => {
    expect(momentPrompts({ ...base, daysAgo: null }).keepsake)
      .toBe(momentPrompts({ ...base, daysAgo: 0 }).keepsake);
  });
});

describe('the same moment is asked the same thing every time', () => {
  it('does not shuffle between openings', () => {
    const once = momentPrompts({ ...base, personName: 'Amma' });
    const twice = momentPrompts({ ...base, personName: 'Amma' });
    expect(once).toEqual(twice);
  });

  it('asks different moments different things', () => {
    const a = momentPrompts({ title: 'Called Amma', memoryType: 'relationship' });
    const b = momentPrompts({ title: 'Walked before the heat', memoryType: 'experience' });
    expect(a.insight).not.toBe(b.insight);
  });
});

describe('every prompt is a question, and none of them answers itself', () => {
  const cases: MomentContext[] = [
    { title: 'Called Amma', memoryType: 'relationship', personName: 'Amma' },
    { title: 'Shipped the release', memoryType: 'achievement' },
    { title: 'Kerala trip', memoryType: 'experience', peopleCount: 3 },
    { title: 'Realised why I keep putting it off', memoryType: 'reflection' },
    { title: 'Appa fixed the tap', memoryType: 'gratitude', personName: 'Appa' },
    { title: 'A good hour', memoryType: 'moment' },
    { title: 'Something', memoryType: null },
  ];

  it.each(cases)('holds the line for $memoryType', (ctx) => {
    const p = momentPrompts(ctx);
    for (const q of [p.insight, p.conversation, p.keepsake]) {
      expect(isUsableQuestion(q)).toBe(true);
    }
    expect(isUsableAccountLine(p.reflection)).toBe(true);
  });

  /* The hard line. Nothing here may tell somebody how their evening went. */
  it.each(cases)('never says how it went for $title', (ctx) => {
    const all = Object.values(momentPrompts(ctx)).join(' ');
    expect(all).not.toMatch(/\b(lovely|great|wonderful|well done|good job|proud|special)\b/i);
  });
});

describe('the link that hides the last two boxes names what is behind it', () => {
  it('promises a conversation only when there was somebody to have one with', () => {
    expect(momentDisclosure({ ...base, personName: 'Amma' }))
      .toBe('what you talked about, what you want to remember');
    expect(momentDisclosure({ ...base, peopleCount: 3 }))
      .toBe('what you talked about, what you want to remember');
  });

  it('names the box that is actually there when nobody was', () => {
    expect(momentDisclosure({ title: 'Shipped the release', memoryType: 'achievement' }))
      .toBe('what it took, what you want to remember');
    expect(momentDisclosure({ title: 'Why I keep moving it', memoryType: 'reflection' }))
      .toBe('what set it off, what you want to remember');
  });

  /* The link and the box it opens have to agree — a link promising a
     conversation over a box asking what it took is worse than either. */
  it.each([
    ['achievement', 'Shipped the release'],
    ['experience', 'Kerala trip'],
    ['reflection', 'Why I keep moving it'],
    ['gratitude', 'The tap got fixed'],
    ['moment', 'A good hour'],
  ])('agrees with the %s question it hides', (memoryType, title) => {
    const ctx = { title, memoryType };
    const label = momentDisclosure(ctx).split(',')[0];
    const asked = momentPrompts(ctx).conversation.toLowerCase();
    /* Loose on purpose: the label is the question's subject, not its words. */
    const subject = label.replace(/^(what|who) /, '').split(' ')[0];
    expect(asked).toContain(subject);
  });
});

describe('a rewrite has to still be a question', () => {
  it('accepts an open question', () => {
    expect(isUsableQuestion('What did that change between you and Amma?')).toBe(true);
  });

  it.each([
    ['Did you enjoy it?', 'a yes/no opener gets a yes, and a yes is not writing'],
    ['How did that make you feel?', 'invites one adjective and stops'],
    ['Tell me about it.', 'not a question'],
    ['What happened? And what did it change?', 'two questions in one box'],
    ['', 'nothing returned'],
  ])('rejects %s — %s', (rewrite) => {
    expect(isUsableQuestion(rewrite)).toBe(false);
  });

  it('rejects a question that has grown into a paragraph', () => {
    expect(isUsableQuestion(`What did that change ${'and more '.repeat(12)}?`)).toBe(false);
  });

  it('keeps the account line out of the question business', () => {
    expect(isUsableAccountLine('The longer version — how it actually went')).toBe(true);
    expect(isUsableAccountLine('What actually happened?')).toBe(false);
  });
});
