import { describe, it, expect } from 'vitest';
import { firstPersonPast, insightPrompt } from './journalVoice';

/**
 * The line the app is allowed to write, and the line it is not.
 *
 * Pennebaker's linguistic work found the shift to first person and past
 * tense is part of the mechanism rather than a style preference — so
 * "Call Amma — not a text" sitting in the composer was not merely ugly, it
 * was the app's instruction in the place somebody's own account belongs.
 */
describe('what happened, in their voice', () => {
  it.each([
    ['Call Amma — not a text', 'Amma', 'Today I called Amma.'],
    ['Reach out to Amma — a first hello counts', 'Amma', 'Today I reached out to Amma.'],
    ['Cook dinner with Arun, no screens', 'Arun', 'Today I cooked dinner with Arun.'],
    ['Walk for twenty minutes today', null, 'Today I walked for twenty minutes.'],
    ['Plan a weekend trip with the family', null, 'Today I planned a weekend trip with the family.'],
  ])('turns %s into a sentence somebody would write', (title, personName, expected) => {
    expect(firstPersonPast({ title, personName })).toBe(expected);
  });

  it('drops the coaching tail, which is not part of what happened', () => {
    /* "not a text" is the app saying how; once it is done it is not news. */
    expect(firstPersonPast({ title: 'Call Amma — not a text' })).not.toMatch(/not a text/);
    expect(firstPersonPast({ title: 'Cook dinner with Arun, no screens' })).not.toMatch(/no screens/);
  });

  it('stops addressing the reader, because a diary does not', () => {
    /* "one thing you learned" produced "Today I wrote up one thing you
       learned this month" — somebody reporting on a stranger. */
    expect(firstPersonPast({ title: 'Write up one thing you learned this month' }))
      .toBe('Today I wrote up one thing I learned this month.');
    expect(firstPersonPast({ title: 'Put on your shoes. You are allowed to stop there.' }))
      .toBe('Today I put on my shoes.');
  });

  it('says Today once', () => {
    const line = firstPersonPast({ title: 'Walk for twenty minutes today' })!;
    expect(line.toLowerCase().match(/today/g)).toHaveLength(1);
  });

  it('never ends in two full stops', () => {
    for (const title of ['Put on your shoes. You are allowed to stop there.', 'Call Amma.']) {
      expect(firstPersonPast({ title })).not.toMatch(/\.\./);
    }
  });

  it('offers an empty box rather than a clumsy sentence', () => {
    /* No verb it can conjugate honestly — better nothing than "Today I
       thirty minutes of learning". */
    expect(firstPersonPast({ title: 'Thirty minutes of learning, daily' })).toBeNull();
    expect(firstPersonPast({ title: '' })).toBeNull();
    expect(firstPersonPast({ title: 'Zzzz' })).toBeNull();
  });

  /**
   * The rule the research is unambiguous about, and the one this whole file
   * exists to hold: affect labelling works because the labelling is yours.
   */
  it('never says how it went', () => {
    const CLAIMS = /\b(good|lovely|great|nice|wonderful|hard|difficult|worth it|glad|happy)\b/i;
    for (const title of [
      'Call Amma — not a text', 'Walk for twenty minutes today',
      'Cook dinner with Arun, no screens', 'Plan a weekend trip with the family',
    ]) {
      const line = firstPersonPast({ title, personName: 'Amma' });
      if (line) expect(line).not.toMatch(CLAIMS);
    }
  });
});

describe('a question instead of an answer', () => {
  it('asks something only they can answer', () => {
    const q = insightPrompt({ title: 'Call Amma — not a text', personName: 'Amma' });
    expect(q.endsWith('?')).toBe(true);
    /* Open, not yes/no: the expressive-writing gain tracked causal and
       insight words, which a closed question cannot produce. */
    expect(q).toMatch(/^(what|why|how)\b/i);
  });

  it('is the same question every time for the same moment', () => {
    /* A question that changes on reopen reads as generated, which is exactly
       what stops somebody answering it. */
    const input = { title: 'Walk for twenty minutes today' };
    expect(insightPrompt(input)).toBe(insightPrompt(input));
  });

  it('speaks of them when somebody was there, and does not when nobody was', () => {
    const withPerson = insightPrompt({ title: 'Call Amma — not a text', personName: 'Amma' });
    const alone = insightPrompt({ title: 'Walk for twenty minutes today' });
    expect(withPerson).toMatch(/\b(you|them|between)\b/i);
    expect(alone).not.toMatch(/\bthem\b/i);
  });

  it('never asks for a feeling word', () => {
    /* "How did that make you feel?" invites one adjective and stops. */
    for (const input of [
      { title: 'Call Amma — not a text', personName: 'Amma' },
      { title: 'Walk for twenty minutes today' },
      { title: 'Plan a weekend trip with the family' },
    ]) {
      expect(insightPrompt(input)).not.toMatch(/\bfeel\b/i);
    }
  });

  describe('a title the person wrote themselves', () => {
    /**
     * The archive is not the catalog.
     *
     * This function was built for imperatives — "Call Amma" — and then the
     * memory→journal path started handing it titles from the archive, which
     * people write after the fact and therefore in the past. Every one of
     * them fell through to null, so the composer opened blank on exactly the
     * flow this exists to serve. Found by a persona sweep, not by a test.
     */
    it('accepts a past tense as the thing that already happened', () => {
      expect(firstPersonPast({ title: 'Called Amma' })).toBe('Today I called Amma.');
      expect(firstPersonPast({ title: 'Walked before the heat' })).toBe('Today I walked before the heat.');
      expect(firstPersonPast({ title: 'Sat with Appa' })).toBe('Today I sat with Appa.');
      expect(firstPersonPast({ title: 'Wrote the letter' })).toBe('Today I wrote the letter.');
    });

    it('gives an imperative and its past the same sentence', () => {
      expect(firstPersonPast({ title: 'Cook dinner with Arun' }))
        .toBe(firstPersonPast({ title: 'Cooked dinner with Arun' }));
    });

    it('still says nothing about a title that is not an act', () => {
      /* An empty box is never wrong; a clumsy sentence is. */
      expect(firstPersonPast({ title: 'Kerala with Amma' })).toBeNull();
      expect(firstPersonPast({ title: 'Diwali 2009' })).toBeNull();
      expect(firstPersonPast({ title: 'Amma' })).toBeNull();
    });

    it('leaves the words that are their own past alone', () => {
      /* put/read/set/let/had conjugate to themselves, so both spellings of
         the title have to land on one sentence rather than doubling up. */
      expect(firstPersonPast({ title: 'Read ten pages' })).toBe('Today I read ten pages.');
      expect(firstPersonPast({ title: 'Put the phone away' })).toBe('Today I put the phone away.');
    });
  });
});
