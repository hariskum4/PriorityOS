import { describe, it, expect } from 'vitest';
import {
  momentPrompts, facetsCovered, isUsableQuestion, isUsableAccountLine,
  type MomentContext, type Facet,
} from './momentPrompts';

const base: MomentContext = { title: 'Called Amma', memoryType: 'relationship' };

/* The moment from the bug report, in full. */
const DIVYA: MomentContext = {
  title: 'Dinner with the phones in the other room',
  memoryType: 'relationship',
  personName: 'Divya',
  peopleCount: 1,
  daysAgo: 3,
  written: { reflection: 'Forty minutes. We talked about her sister, then about nothing.' },
};

describe('the form does not ask for what it has already been given', () => {
  /**
   * The reported bug. The account says what they talked about; the next box
   * asked what they talked about.
   */
  it('stops asking what was said once the account has said it', () => {
    const asked = momentPrompts(DIVYA);
    expect(asked.conversation).not.toMatch(/talk/i);
    expect(momentPrompts({ ...DIVYA, written: undefined }).conversation)
      .toBe('What did you and Divya actually talk about?');
  });

  /* And it does not merely go quiet — it moves down to the layer nobody
     volunteers into an empty box. */
  it('spends the freed slot on detail that is not on the page yet', () => {
    expect(momentPrompts(DIVYA).conversation).toBe('What do you still see when you picture it?');
  });

  it('skips the meaning question when the meaning is already written', () => {
    const done = momentPrompts({
      ...base,
      written: { reflection: 'It changed how I talk to her, because I finally listened.' },
    });
    expect(done.insight).not.toBe('What did that change?');
    expect(isUsableQuestion(done.insight)).toBe(true);
  });

  it('reads the title as written material too', () => {
    const asked = momentPrompts({
      title: 'Told Amma about the job',
      memoryType: 'relationship',
      personName: 'Amma',
      peopleCount: 1,
    });
    expect(asked.conversation).not.toMatch(/talk about/i);
  });

  it('counts every box, not only the account', () => {
    const viaKeepsake = momentPrompts({
      ...base,
      personName: 'Amma',
      peopleCount: 1,
      written: { keepsake: 'What she said about the house, and how quietly she said it.' },
    });
    expect(viaKeepsake.conversation).not.toMatch(/talk about/i);
  });

  /* Hysteresis: in the composer this runs against a box somebody is
     mid-sentence in, and a question that flips on every keystroke is worse
     than one that is slightly redundant. */
  it('ignores a fragment too short to be a clause', () => {
    const typing = momentPrompts({ ...DIVYA, written: { reflection: 'We talked' } });
    expect(typing.conversation).toBe('What did you and Divya actually talk about?');
  });
});

describe('what counts as a facet already covered', () => {
  it.each([
    ['said', 'We talked about her sister for most of it'],
    ['said', 'She asked when we were coming next. I said soon.'],
    ['said', 'Did not tell her I had let go of the seat'],
    ['did', 'She cooked every meal and refused all help'],
    ['where', 'We sat in the kitchen until it got dark'],
    ['when', 'The first time since the move, finally'],
    ['who', 'Her sister came by later in the evening'],
    ['sensory', 'The face she made when she realised it'],
    ['why', 'It changed something, because I had not asked before'],
  ])('reads %s in: %s', (facet, text) => {
    expect(facetsCovered([text]).has(facet as Facet)).toBe(true);
  });

  /* Asking a question is not answering it. A title that opens with "Why"
     is the reader wondering, not the reader having worked it out. */
  it.each([
    'Why I keep moving the checkup',
    'Why does this keep happening to me',
  ])('does not read %s as meaning already made', (title) => {
    expect(facetsCovered([title]).has('why')).toBe(false);
  });

  it('does read an answered why', () => {
    expect(facetsCovered(['I finally understand why she never brings it up']).has('why')).toBe(true);
  });

  it('never marks the ground that cannot be covered', () => {
    const everything = facetsCovered([
      'We talked and cooked in the kitchen that evening with her sister, and I saw why it changed things',
    ]);
    expect(everything.has('open')).toBe(false);
  });

  it('says nothing about an empty moment', () => {
    expect(facetsCovered([null, undefined, '', '   ']).size).toBe(0);
  });
});

describe('the questions fit the moment they sit under', () => {
  it('asks about the person by name when there was one', () => {
    const p = momentPrompts({ ...base, personName: 'Amma', peopleCount: 1 });
    expect(p.conversation).toBe('What did you and Amma actually talk about?');
    expect(p.insight).toContain('Amma');
    expect(p.reflection).toContain('with Amma');
  });

  /* "What did you talk about?" under something done alone has no possible
     answer — the failure this file was first written for. */
  it('never asks what was said when nobody was there', () => {
    const p = momentPrompts({ title: 'Shipped the release', memoryType: 'achievement' });
    expect(p.conversation).not.toMatch(/talk|said|told/i);
    /* Effort is still asked for, one slot up — the amber question took it,
       so the box below moves on rather than repeating it. */
    expect(p.insight).toBe('What did that take that nobody saw?');
    expect(p.conversation).toBe('Where were you?');
  });

  it('puts the effort question in the box when the top slot is spent elsewhere', () => {
    const p = momentPrompts({
      title: 'Shipped the release',
      memoryType: 'achievement',
      written: { reflection: 'I built the whole thing and cleaned up every last bug in it.' },
    });
    /* `did` is written about, so neither slot spends itself on effort. */
    expect(`${p.insight} ${p.conversation}`).not.toMatch(/take|took/i);
  });

  it('gives a gathering the plural and nobody a name', () => {
    const p = momentPrompts({ ...base, title: 'Diwali at home', peopleCount: 4 });
    expect(p.conversation).toBe('What did you all actually talk about?');
  });

  it('does not name one person out of a crowd', () => {
    const p = momentPrompts({ ...base, personName: 'Amma', peopleCount: 4 });
    expect(p.conversation).not.toContain('Amma');
    expect(p.insight).not.toContain('Amma');
    expect(p.reflection).not.toContain('Amma');
  });

  it('shapes the account line by what kind of thing it was', () => {
    expect(momentPrompts({ title: 'Ran the half', memoryType: 'achievement' }).reflection)
      .toBe('The longer version — how you actually got there');
    expect(momentPrompts({ title: 'Kerala trip', memoryType: 'experience' }).reflection)
      .toBe('The longer version — what it was actually like');
  });
});

describe('how long ago it was changes what can honestly be asked', () => {
  it.each([
    [0, 'What do you want to remember about it?'],
    [2, 'What do you want to remember about it?'],
    [29, 'What do you want to remember about it?'],
    [30, 'What has stayed with you since?'],
    [364, 'What has stayed with you since?'],
    [365, 'What still stays with you about it?'],
    [4000, 'What still stays with you about it?'],
  ])('at %i days asks: %s', (daysAgo, expected) => {
    expect(momentPrompts({ ...base, daysAgo }).keepsake).toBe(expected);
  });

  /* Unknown is treated as today — asking "what has stayed with you since?"
     about this afternoon is the app inventing elapsed time. */
  it('treats an unknown date as recent rather than old', () => {
    expect(momentPrompts({ ...base, daysAgo: null }).keepsake)
      .toBe(momentPrompts({ ...base, daysAgo: 0 }).keepsake);
  });
});

describe('the same moment is asked the same thing every time', () => {
  it('does not shuffle between openings', () => {
    expect(momentPrompts(DIVYA)).toEqual(momentPrompts(DIVYA));
  });

  it('asks different moments different things', () => {
    const a = momentPrompts({ title: 'Called Amma', memoryType: 'relationship' });
    const b = momentPrompts({ title: 'Walked before the heat', memoryType: 'experience' });
    expect(a.insight).not.toBe(b.insight);
  });

  /* Stability is per moment, not forever: writing about it is the one thing
     that should move the question on. */
  it('moves on once the moment has been written about', () => {
    const before = momentPrompts(DIVYA).conversation;
    const after = momentPrompts({ ...DIVYA, written: undefined }).conversation;
    expect(before).not.toBe(after);
  });
});

describe('the link agrees with the box it opens', () => {
  it('promises a conversation only when one is being asked for', () => {
    expect(momentPrompts({ ...base, personName: 'Amma', peopleCount: 1 }).disclosure)
      .toBe('what you talked about, what you want to remember');
  });

  it('names what is actually behind it when nobody was there', () => {
    expect(momentPrompts({ title: 'Shipped it', memoryType: 'achievement' }).disclosure)
      .toBe('what it took, what you want to remember');
  });

  it('follows the question down when the talking is already written', () => {
    expect(momentPrompts(DIVYA).disclosure)
      .toBe('what you still see, what you want to remember');
  });
});

/* ------------------------------------------------------------ permutations */

const KINDS = ['relationship', 'experience', 'achievement', 'reflection', 'gratitude', 'moment', null];
const COMPANY: Array<[string, Partial<MomentContext>]> = [
  ['alone', { personName: null, peopleCount: 0 }],
  ['one person', { personName: 'Amma', peopleCount: 1 }],
  ['a crowd', { personName: 'Amma', peopleCount: 4 }],
];
const AGES = [0, 3, 45, 900];
/* Every combination of facets a person might already have written down,
   built from real sentences rather than from the marker lists — a test that
   feeds the regexes their own vocabulary proves nothing. */
const WRITTEN: Array<[string, MomentContext['written']]> = [
  ['nothing', undefined],
  ['bare account', { reflection: 'It was one of those ones I did not want to end.' }],
  ['the talk', { reflection: 'We talked about her sister, then about nothing much.' }],
  ['the place', { reflection: 'We sat at the kitchen table until it went dark outside.' }],
  ['the meaning', { reflection: 'It changed something for me, because she finally asked.' }],
  ['the doing', { reflection: 'She cooked every single meal and refused all the help.' }],
  ['talk and place', {
    reflection: 'We talked in the kitchen for hours.',
    conversation: 'She asked about the move and I told her the truth.',
  }],
  ['nearly everything', {
    reflection: 'We talked in the kitchen while she cooked, and I saw her face change.',
    conversation: 'She asked about the move, I told her, and she went quiet.',
    keepsake: 'It changed something, because she had never asked before.',
  }],
];

function permutations(): Array<[string, MomentContext]> {
  const out: Array<[string, MomentContext]> = [];
  for (const memoryType of KINDS) {
    for (const [who, company] of COMPANY) {
      for (const daysAgo of AGES) {
        for (const [wrote, written] of WRITTEN) {
          out.push([
            `${memoryType ?? 'untyped'} / ${who} / ${daysAgo}d / ${wrote}`,
            { title: 'Dinner with the phones in the other room', memoryType, daysAgo, written, ...company },
          ]);
        }
      }
    }
  }
  return out;
}

const ALL = permutations();

describe(`every one of the ${ALL.length} combinations holds the line`, () => {
  it.each(ALL)('%s', (_label, ctx) => {
    const p = momentPrompts(ctx);

    // Three questions and one hint, all usable.
    for (const q of [p.insight, p.conversation, p.keepsake]) {
      expect(isUsableQuestion(q)).toBe(true);
    }
    expect(isUsableAccountLine(p.reflection)).toBe(true);
    expect(p.disclosure).toMatch(/^[a-z]/);
    expect(p.disclosure).not.toContain('?');

    // No slot repeats another.
    const questions = [p.insight, p.conversation, p.keepsake];
    expect(new Set(questions).size).toBe(questions.length);

    /**
     * And no two slots ask the same thing in different words.
     *
     * String inequality is not enough — "What did that take that nobody
     * saw?" over "What did it take to get there?" passed it and was the
     * reported bug in its second form. This compares the load-bearing verb
     * instead, which is what a reader actually perceives as a repeat.
     */
    const asks = questions.map((q) => q.toLowerCase()
      .replace(/^what (did|do|has|still|would|made|was)\s+/, '')
      .match(/\b(take|talk|see|notice|change|remember|stay|learn|cost|spend|set off|picture)\b/)?.[0]);
    const named = asks.filter(Boolean);
    expect(new Set(named).size).toBe(named.length);

    // Nothing is left with an unfilled placeholder.
    expect(Object.values(p).join(' ')).not.toContain('%s');

    // The app never says how it went, and never grades a life.
    expect(Object.values(p).join(' '))
      .not.toMatch(/\b(lovely|great|wonderful|well done|good job|proud|amazing|special|beautiful)\b/i);
  });

  /* The bug, generalised: no question may ask for ground the person has
     already covered in their own words. */
  it.each(ALL)('asks nothing already answered — %s', (_label, ctx) => {
    const covered = facetsCovered([
      ctx.title, ctx.written?.reflection, ctx.written?.conversation, ctx.written?.keepsake,
    ]);
    const asked = momentPrompts(ctx);
    if (covered.has('said')) {
      expect(asked.conversation).not.toMatch(/\btalk(ed)? about\b/i);
      expect(asked.insight).not.toMatch(/\btalk(ed)? about\b/i);
    }
    if (covered.has('where')) expect(asked.conversation).not.toMatch(/^Where\b/i);
    if (covered.has('who')) expect(asked.conversation).not.toMatch(/^Who\b/i);
  });

  /* A question about a conversation, under a moment nobody else was at. */
  it.each(ALL.filter(([, c]) => !c.peopleCount))('never invents company — %s', (_label, ctx) => {
    const p = momentPrompts(ctx);
    expect(`${p.insight} ${p.conversation}`).not.toMatch(/\b(talk|said|told|they|them|both|everybody)\b/i);
  });

  it.each(ALL)('is stable on a second opening — %s', (_label, ctx) => {
    expect(momentPrompts(ctx)).toEqual(momentPrompts(ctx));
  });
});

describe('a rewrite has to still be a question', () => {
  it('accepts an open one', () => {
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
