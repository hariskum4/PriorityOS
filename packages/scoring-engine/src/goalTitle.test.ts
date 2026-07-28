import { describe, it, expect } from 'vitest';
import { deriveGoalTitle, GOAL_TITLE_MAX } from './goalTitle';

describe('goal titles', () => {
  it('leaves a short answer completely alone', () => {
    const r = deriveGoalTitle('Run a 10K by December');
    expect(r.title).toBe('Run a 10K by December');
    expect(r.description).toBeNull();
  });

  it('splits the real 502-character onboarding answer into a name and its prose', () => {
    // The exact shape that shipped to production: a heading line, a dash
    // aside, and several sentences of reasoning.
    const raw = [
      'Getting my health fully in order — properly, not casually.',
      'Not just “I should work out” or “I’ll start next month,” but a real reset:',
      'health checkup, consistent training, better sleep, and getting my energy',
      'back under control.',
    ].join('\n');

    const r = deriveGoalTitle(raw);

    expect(r.title).toBe('Getting my health fully in order');
    expect(r.title.length).toBeLessThanOrEqual(GOAL_TITLE_MAX);
    expect(r.title).not.toContain('\n');
    // Nothing the person wrote is thrown away.
    expect(r.description).toBe(raw);
  });

  it('treats a newline as the end of a thought', () => {
    const r = deriveGoalTitle('Open a hotel\nSomewhere near the coast, eventually.');
    expect(r.title).toBe('Open a hotel');
    expect(r.description).toContain('coast');
  });

  it('keeps a one-line answer whole when it already fits', () => {
    // Splitting something that fits would discard meaning for no gain.
    const raw = 'Leave the agency — but only once the runway is 12 months';
    const r = deriveGoalTitle(raw);
    expect(r.title).toBe(raw);
    expect(r.description).toBeNull();
  });

  it('breaks on an em-dash aside once the answer is too long to keep whole', () => {
    const r = deriveGoalTitle(
      'Leave the agency and go independent — but only once the runway covers '
      + 'twelve full months of family expenses, not six',
    );
    expect(r.title).toBe('Leave the agency and go independent');
    expect(r.description).toContain('twelve full months');
  });

  it('does not treat a decimal point as a sentence end', () => {
    const r = deriveGoalTitle('Save 12.5 lakh for the emergency fund');
    expect(r.title).toBe('Save 12.5 lakh for the emergency fund');
    expect(r.description).toBeNull();
  });

  it('caps a single runaway sentence at the word boundary', () => {
    const raw =
      'Build a genuinely sustainable consulting practice that supports my family '
      + 'without consuming every evening and weekend for the next decade';
    const r = deriveGoalTitle(raw);
    expect(r.title.length).toBeLessThanOrEqual(GOAL_TITLE_MAX + 1); // +1 for the ellipsis
    expect(r.title.endsWith('…')).toBe(true);
    // Never cuts mid-word.
    expect(r.title.replace(/…$/, '')).toMatch(/\S$/);
    expect(raw.startsWith(r.title.replace(/…$/, ''))).toBe(true);
    expect(r.description).toBe(raw);
  });

  it('never overwrites a description the caller already supplied', () => {
    const r = deriveGoalTitle(
      'Get my health fully in order this year — properly, not casually, with a real plan',
      'Doctor said to start now.',
    );
    expect(r.title).toBe('Get my health fully in order this year');
    expect(r.description).toBe('Doctor said to start now.');
  });

  it('collapses internal whitespace in the title', () => {
    const r = deriveGoalTitle('Start my own  AI   business .');
    expect(r.title).toBe('Start my own AI business');
  });

  it('handles empty and whitespace-only input without throwing', () => {
    expect(deriveGoalTitle('').title).toBe('');
    expect(deriveGoalTitle('   \n  ').title).toBe('');
    expect(deriveGoalTitle(undefined as unknown as string).title).toBe('');
  });

  it('is idempotent — deriving twice changes nothing', () => {
    const once = deriveGoalTitle('Getting my health in order — properly, not casually.\nA real reset.');
    const twice = deriveGoalTitle(once.title, once.description);
    expect(twice.title).toBe(once.title);
    expect(twice.description).toBe(once.description);
  });
});
