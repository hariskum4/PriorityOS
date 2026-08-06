import { describe, it, expect } from 'vitest';
import { checkRephrase, safeRephrase } from './rephrase';

/** The kind of sentence the engine actually composes for the daily card. */
const ENGINE = 'Because Amma is the person this week keeps postponing — and friends is 30 points behind where you said it should be.';

describe('a rewrite that may change the words but not the facts', () => {
  it('accepts a warmer version of the same claim', () => {
    const r = safeRephrase(ENGINE, 'Amma is the one this week keeps sliding past, and friends is 30 points behind what you said it was worth.');
    expect(r.used).toBe('model');
  });

  it('rejects a number that was never in the original', () => {
    /* The failure this exists for: a figure that sounds plausible and is
       traceable to nothing. */
    const r = safeRephrase(ENGINE, 'Amma has been waiting 19 days, and friends is 30 points behind.');
    expect(r.used).toBe('engine');
    expect(r.reasons.join()).toContain('19');
    expect(r.sentence).toBe(ENGINE);
  });

  it('rejects a person nobody mentioned', () => {
    const r = safeRephrase(ENGINE, 'Amma is waiting, and so is Arjun — friends is 30 points behind.');
    expect(r.used).toBe('engine');
    expect(r.reasons.join()).toContain('Arjun');
  });

  it('rejects a unit the original never carried', () => {
    /* Live on production: "Friends are asking for 13 moments a week" over a
       digest whose 13 was a percentage of attention share. */
    const pct = 'Friends want 13% of your attention and are getting 0%.';
    const r = safeRephrase(pct, 'Friends are asking for 13 moments a week and getting none.');
    expect(r.used).toBe('engine');
    expect(r.reasons.join()).toContain('moment');
  });

  it('allows a unit the original already used', () => {
    const src = 'Amma has not been called in 26 days.';
    expect(safeRephrase(src, 'It has been 26 days since you called Amma.').used).toBe('model');
  });

  it('will not let a number be softened away', () => {
    /* Observed: "friends is 30 points behind" rewritten as "your friendships
       have slipped" — warmer, and the reader lost the one part they could
       check. Safe is not the same as good. */
    const r = safeRephrase(ENGINE, 'Amma is the person you keep postponing, and your friendships have slipped.');
    expect(r.used).toBe('engine');
    expect(r.reasons.join()).toContain('dropped numbers: 30');
  });

  it('lets a rewrite drop words, but not facts', () => {
    /* Trimming prose is a stylistic choice. Losing a figure is not. */
    expect(safeRephrase('Of everything pending, this moves the needle most on what you said matters.',
      'Of everything pending, this moves the needle most.').used).toBe('model');
    expect(safeRephrase(ENGINE, `${ENGINE} You have 95 minutes free tonight and three rhythms going, which means there is room for this and for the walk you keep meaning to take before the heat arrives.`).used).toBe('engine');
  });

  it('refuses an empty or missing rewrite without complaint', () => {
    for (const bad of [null, undefined, '', '   ']) {
      const r = safeRephrase(ENGINE, bad);
      expect(r.used).toBe('engine');
      expect(r.sentence).toBe(ENGINE);
    }
  });

  it('does not mistake the first word for an invented name', () => {
    /* Every sentence starts capitalised; only mid-sentence capitals are
       candidates for somebody the model made up. */
    const r = checkRephrase('Friends is behind where you said it should be.', 'Friends have slipped behind what you said they were worth.');
    expect(r.ok).toBe(true);
  });

  it('keeps the numbers checkable, which is the whole point', () => {
    /* Whatever a reader sees, they can find on another screen — because every
       figure came from the engine and the rewrite could not add one. */
    const rewritten = 'Amma keeps getting postponed; friends sits 30 points below what you asked of it.';
    expect(checkRephrase(ENGINE, rewritten).ok).toBe(true);
    expect((rewritten.match(/\d+/g) ?? []).every((n) => ENGINE.includes(n))).toBe(true);
  });
});
