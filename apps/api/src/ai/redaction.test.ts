/**
 * Redaction is a privacy boundary, so it gets tested like one.
 *
 * The failure that matters is not "a name looked odd in the output" — it is a
 * real person's name sitting in a third party's logs forever. Every case here
 * is one way that could happen quietly.
 */
import { describe, it, expect } from 'vitest';
import { buildPseudonyms, redact, restore } from './redaction';

const P = (...names: string[]) => buildPseudonyms(names);

describe('redact', () => {
  it('replaces a name with a stable placeholder', () => {
    const p = P('Amma');
    expect(redact('Call Amma today', p)).toBe('Call Person 1 today');
  });

  it('is case-insensitive — people type their mother’s name however they like', () => {
    const p = P('Amma');
    expect(redact('call AMMA, then amma again', p)).toBe('call Person 1, then Person 1 again');
  });

  it('replaces the longest name first so no fragment survives', () => {
    // Naively ordered, "Amma" would be replaced inside "Amma Devi" and leave
    // "Person 1 Devi" — a surname handed straight to the provider.
    const p = P('Amma', 'Amma Devi');
    const out = redact('Amma Devi called Amma', p);
    expect(out).not.toContain('Devi');
    expect(out).not.toContain('Amma');
  });

  it('does not maul words that merely contain a name', () => {
    const p = P('Ari');
    expect(redact('The safari was long', p)).toBe('The safari was long');
  });

  it('survives names with regex characters in them', () => {
    const p = P('J.R.');
    expect(redact('J.R. called', p)).toBe('Person 1 called');
    // If the dot were live, "JXR" would also match.
    expect(redact('JXR called', p)).toBe('JXR called');
  });

  it('ignores single characters, which would shred ordinary prose', () => {
    const p = P('A');
    expect(redact('A long walk', p)).toBe('A long walk');
  });

  it('leaves text alone when nobody is known', () => {
    expect(redact('Nothing to hide', P())).toBe('Nothing to hide');
  });
});

describe('restore', () => {
  it('puts the real name back for the reader', () => {
    const p = P('Amma');
    expect(restore('Call Person 1 today', p)).toBe('Call Amma today');
  });

  it('round-trips a sentence unchanged', () => {
    const p = P('Amma', 'Appa');
    const original = 'Ring Amma before Appa gets home';
    expect(restore(redact(original, p), p)).toBe(original);
  });

  it('keeps different people distinct through the round trip', () => {
    const p = P('Amma', 'Appa', 'Priya');
    const sent = redact('Amma, Appa and Priya', p);
    expect(new Set(sent.match(/Person \d+/g)).size).toBe(3);
    expect(restore(sent, p)).toBe('Amma, Appa and Priya');
  });

  it('gives the same person the same placeholder every time', () => {
    const first = P('Amma', 'Appa');
    const second = P('Appa', 'Amma');
    expect(first.out.get('Amma')).toBe(second.out.get('Amma'));
  });
});
