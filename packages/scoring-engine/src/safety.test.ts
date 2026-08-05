import { describe, it, expect } from 'vitest';
import { detectCrisisLanguage, supportLines, supportCountries } from './safety';

describe('crisis language detection', () => {
  it('flags explicit crisis statements', () => {
    const positives = [
      'I want to kill myself',
      'been having suicidal thoughts again',
      'I keep thinking about self-harm',
      'sometimes I want to hurt myself',
      "I've been cutting myself",
      'thought about ending my life',
      'I just want to end it all',
      'some days I want to die',
      'wish I was dead',
      'there is no reason to live',
      "they'd be better off without me",
      "I don't want to be here anymore",
      "I can't go on like this",
      'my life is not worth living',
    ];
    for (const text of positives) {
      expect(detectCrisisLanguage(text), text).toBe(true);
    }
  });

  it('does not flag common idioms and ordinary hard days', () => {
    const negatives = [
      'this deadline is killing me',
      'I could murder a biryani right now',
      'dead tired after work',
      'the traffic makes me want to scream',
      'I avoided calling Amma again, feeling guilty',
      'work was brutal, I feel like a failure this week',
      'I am so done with this project',
      'that meeting was painful',
      'my legs are dead after the run',
    ];
    for (const text of negatives) {
      expect(detectCrisisLanguage(text), text).toBe(false);
    }
  });

  it('scans across multiple fields and handles empties', () => {
    expect(detectCrisisLanguage(null, undefined, '')).toBe(false);
    expect(detectCrisisLanguage('nice day', null, 'no reason to live')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectCrisisLanguage('I WANT TO DIE')).toBe(true);
  });
});

/**
 * The support card was a fixed list of Indian helplines with the
 * international directory underneath. The right default for this product,
 * and the wrong thing to hand a reader in Manchester at two in the morning —
 * who then has to read past two numbers that cannot help them to reach the
 * one that can. Nobody in that state should be doing routing work for the
 * app.
 */
describe('who to offer, from where somebody actually is', () => {
  it('leads with the country the reader is in', () => {
    expect(supportLines('IN')[0].contact).toBe('14416');
    expect(supportLines('GB')[0].name).toBe('Samaritans');
    expect(supportLines('US')[0].contact).toBe('988');
  });

  it('does not hand US numbers to a reader in India, or the reverse', () => {
    expect(supportLines('IN').map((l) => l.contact)).not.toContain('988');
    expect(supportLines('US').map((l) => l.contact)).not.toContain('14416');
  });

  it('always ends with a line that works anywhere', () => {
    for (const c of [...supportCountries(), 'ZZ', '', null, undefined]) {
      const lines = supportLines(c);
      expect(lines[lines.length - 1].contact, String(c)).toBe('findahelpline.com');
    }
  });

  it('gives an unknown country the directory alone rather than a guess', () => {
    expect(supportLines('ZZ')).toHaveLength(1);
    expect(supportLines(null)).toHaveLength(1);
  });

  it('is not case- or whitespace-sensitive about the country', () => {
    expect(supportLines(' in ')[0].contact).toBe('14416');
  });

  it('offers nothing without a contact somebody could actually use', () => {
    for (const c of supportCountries()) {
      for (const line of supportLines(c)) {
        expect(line.name.trim().length, c).toBeGreaterThan(0);
        expect(line.contact.trim().length, c).toBeGreaterThan(0);
      }
    }
  });
});
