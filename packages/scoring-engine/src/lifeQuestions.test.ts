import { describe, expect, it } from 'vitest';
import { lifeQuestions, ADULT_AGE } from './lifeQuestions';

describe('lifeQuestions', () => {
  it('does not offer marriage or children to a minor', () => {
    const plan = lifeQuestions(16, 'student');
    expect(plan.askMarital).toBe(false);
    expect(plan.askChildren).toBe(false);
  });

  it('keeps both questions for an adult student — adult students marry', () => {
    const plan = lifeQuestions(28, 'student');
    expect(plan.askMarital).toBe(true);
    expect(plan.askChildren).toBe(true);
  });

  it('asks a student about home, not parents', () => {
    expect(lifeQuestions(16, 'student').awayLabel).toMatch(/hostel/i);
    expect(lifeQuestions(28, 'student').awayLabel).toMatch(/hostel/i);
    expect(lifeQuestions(16, 'student').awayLabel).not.toMatch(/parents/i);
  });

  it('asks a working minor about home in plain words', () => {
    const plan = lifeQuestions(17, 'shift');
    expect(plan.awayLabel).toBe('Do you live away from home?');
  });

  it('unknown age asks everything — not said is not underage', () => {
    const plan = lifeQuestions(null, 'office_9_5');
    expect(plan.askMarital).toBe(true);
    expect(plan.askChildren).toBe(true);
    expect(plan.awayLabel).toMatch(/parents/);
  });

  it('accepts the raw text-field string the form holds', () => {
    expect(lifeQuestions('16', 'student').askMarital).toBe(false);
    expect(lifeQuestions('', 'office_9_5').askMarital).toBe(true);
  });

  it('flips exactly at the adult boundary', () => {
    expect(lifeQuestions(ADULT_AGE - 1).askMarital).toBe(false);
    expect(lifeQuestions(ADULT_AGE).askMarital).toBe(true);
  });
});
