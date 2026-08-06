/**
 * The door, on every endpoint that writes to a life.
 *
 * Four modules had no DTO at all and two more had gaps, which a fuzz pass
 * over the mutating endpoints turned into sixteen defects of two kinds:
 *
 *   500 — an unhandled throw reached the caller as "Internal server error",
 *         telling them nothing about which field was wrong. `{}` to /goals,
 *         to /habits, and three shapes of nothing to /onboarding/answers.
 *
 *   2xx — the rubbish was written to somebody's life. A goal filed under a
 *         domain that does not exist, a rhythm asking for zero times a week,
 *         a working week of 500 hours, a country called NOT-A-COUNTRY, and a
 *         date of birth in 2099.
 *
 * The second kind is the one worth having tests for. A 500 is loud and gets
 * noticed; a 201 is silent and the damage shows up somewhere else entirely,
 * as a number nobody can account for.
 */
/* Nest loads this at bootstrap; a bare vitest run does not, and
   `@Type`/`@ValidateNested` need the metadata it installs. */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateGoalDto } from '../goals/goals.dto';
import { CreateHabitDto } from '../habits/habits.dto';
import { SaveAnswersDto } from '../onboarding/onboarding.dto';
import { CreateMissionDto } from '../missions/missions.dto';

const bad = async (cls: any, body: unknown) =>
  (await validate(plainToInstance(cls, body) as object)).length > 0;

describe('a goal has to be filed somewhere real', () => {
  it('refuses an empty body', async () => {
    expect(await bad(CreateGoalDto, {})).toBe(true);
  });

  it('refuses a goal with no name', async () => {
    expect(await bad(CreateGoalDto, { title: '', domainType: 'health' })).toBe(true);
  });

  it('refuses a domain that does not exist', async () => {
    /* The quiet one. `domainType` decides the colour, the engine that reads
       the goal, the first step it suggests and which part of a life gets the
       credit — filed under `wombat` it is invisible to all of that and looks
       perfectly fine on the row. */
    expect(await bad(CreateGoalDto, { title: 'Learn Spanish', domainType: 'wombat' })).toBe(true);
  });

  it('refuses a date that is not a date', async () => {
    expect(await bad(CreateGoalDto, { title: 'A', domainType: 'health', targetDate: 'soon' })).toBe(true);
  });

  it('accepts a real goal, dated or not', async () => {
    expect(await bad(CreateGoalDto, { title: 'Walk daily', domainType: 'health' })).toBe(false);
    expect(await bad(CreateGoalDto, {
      title: 'Walk daily', domainType: 'health', targetDate: '2026-12-01T00:00:00.000Z',
    })).toBe(false);
  });
});

describe('a rhythm has to happen at a rate a week can hold', () => {
  it.each([
    ['zero a week — the absence of a rhythm', 0],
    ['minus three a week', -3],
    ['a thousand a week', 1000],
  ])('refuses %s', async (_label, targetPerWeek) => {
    expect(await bad(CreateHabitDto, { title: 'A', domainType: 'health', targetPerWeek })).toBe(true);
  });

  it('allows up to three a day, every day', async () => {
    expect(await bad(CreateHabitDto, { title: 'A', domainType: 'health', targetPerWeek: 21 })).toBe(false);
  });

  it('refuses an empty body and a bogus domain', async () => {
    expect(await bad(CreateHabitDto, {})).toBe(true);
    expect(await bad(CreateHabitDto, { title: 'A', domainType: 'wombat' })).toBe(true);
  });
});

describe('a mission is something a day could contain', () => {
  it('refuses a mission longer than a day', async () => {
    /* 999999 minutes is 694 days, and the day card places missions by
       duration. */
    expect(await bad(CreateMissionDto, {
      title: 'Forever', domainType: 'health', estimatedMinutes: 999999,
    })).toBe(true);
  });

  it('allows a whole day, because some things take one', async () => {
    expect(await bad(CreateMissionDto, {
      title: 'A day of it', domainType: 'health', estimatedMinutes: 1440,
    })).toBe(false);
  });
});

describe('the widest write surface in the app', () => {
  it.each([
    ['no answers at all', {}],
    ['answers as a string', { answers: 'nope' }],
    ['an answer with no key', { answers: [{ section: 'values', value: 1 }] }],
    ['an answer with no value', { answers: [{ section: 'values', key: 'ranking' }] }],
  ])('refuses %s', async (_label, body) => {
    expect(await bad(SaveAnswersDto, body)).toBe(true);
  });

  it('accepts the shape onboarding actually sends', async () => {
    expect(await bad(SaveAnswersDto, {
      answers: [
        { section: 'values', key: 'priorityRanking', value: ['health', 'family'] },
        { section: 'life', key: 'hobbies', value: ['Reading'] },
      ],
    })).toBe(false);
  });

  it('takes a value of any shape, because the questions differ', async () => {
    /* A string here, an array there, an object for a saved count. Narrowing
       it would mean teaching this file every question the app will ever ask. */
    for (const value of ['a string', 42, ['a', 'list'], { an: 'object' }, false]) {
      expect(await bad(SaveAnswersDto, { answers: [{ section: 's', key: 'k', value }] })).toBe(false);
    }
  });
});
