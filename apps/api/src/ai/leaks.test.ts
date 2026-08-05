/**
 * Copy that talks about the machine.
 *
 * Three of five personas walked out of onboarding with the Now card — the
 * first thing a new account reads — saying things like "with a neglectRisk of
 * 0, there's no urgent gap" and "given a neglect risk of 20 and importance of
 * 40". The prompt had taught the model the field name itself, in a rule that
 * read "A neglectRisk below 40 is NOT neglect".
 *
 * The prompt is fixed, and asking is not enough: a generation naming internals
 * has not written a worse sentence, it has written a different kind of thing,
 * so it is discarded in favour of the deterministic copy. These are the exact
 * strings that shipped, plus the ordinary sentences that must survive.
 */
import { describe, it, expect } from 'vitest';
import { leaksInternals } from './ai.service';

describe('a generation that names the machine', () => {
  it('catches the ones that actually reached readers', () => {
    expect(leaksInternals(
      "Today’s top mission is to reach out to Mum this week with one message; with a neglectRisk of 0, there’s no urgent gap.",
    )).toBe(true);
    expect(leaksInternals(
      'Reaching out to Miguel this week aligns with your partner goal and, at your current pace, one message keeps the connection active given a neglect risk of 20 and importance of 40.',
    )).toBe(true);
  });

  it('catches the camelCase spelled out as English', () => {
    // How a model renders a hump when it is trying to sound natural.
    for (const s of [
      'your neglect risk is low',
      'an importanceScore of 60',
      'the attention score has fallen',
      'this domainType is behind',
      'a priority score of 9',
    ]) {
      expect(leaksInternals(s), s).toBe(true);
    }
  });

  it('looks inside the whole shape, not just the top level', () => {
    expect(leaksInternals({
      whyToday: 'Because Amma has not heard from you in eleven days.',
      encouragement: 'One honest step.',
    })).toBe(false);
    expect(leaksInternals({
      whyToday: 'Because Amma has not heard from you in eleven days.',
      encouragement: 'Your neglectRisk says otherwise.',
    })).toBe(true);
    expect(leaksInternals({ nextWeekFocus: ['walk', 'a neglect risk of 40'] })).toBe(true);
  });

  /**
   * The words this app is allowed to use. "Importance" and "attention" are
   * ordinary English and central to what Priority is about — only the field
   * spellings are barred, or the guard would eat the product's vocabulary.
   */
  it('leaves ordinary sentences alone', () => {
    for (const s of [
      'You said family was important, and this week went the other way.',
      'Health is getting the least of what you said it was worth.',
      'Because Jai is the person this week keeps postponing.',
      'Twenty pages a night is a shelf a year, and it compounds.',
      'You rated friends 1/5 — that is the gap that compounds quietly.',
      'Family drifts on no particular day, which is why it needs a particular day.',
    ]) {
      expect(leaksInternals(s), s).toBe(false);
    }
  });

  it('says nothing about empty or absent copy', () => {
    expect(leaksInternals(null)).toBe(false);
    expect(leaksInternals(undefined)).toBe(false);
    expect(leaksInternals('')).toBe(false);
    expect(leaksInternals(42)).toBe(false);
  });
});
