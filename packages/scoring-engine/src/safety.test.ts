import { describe, it, expect } from 'vitest';
import { detectCrisisLanguage } from './safety';

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
