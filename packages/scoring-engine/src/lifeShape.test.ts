import { describe, it, expect } from 'vitest';
import { lifeShape } from './lifeShape';

describe('lifeShape', () => {
  it('a homemaker has no commute, no inbox, and her care work is the work', () => {
    const s = lifeShape('homemaker');
    expect(s.hasCommute).toBe(false);
    expect(s.hasDeskJob).toBe(false);
    expect(s.careWorkIsWork).toBe(true);
    expect(s.selfDirectedWork).toBe(true);
  });

  it('an office worker has the employee-shaped day', () => {
    const s = lifeShape('office_9_5');
    expect(s.hasCommute).toBe(true);
    expect(s.hasDeskJob).toBe(true);
    expect(s.selfDirectedWork).toBe(false);
  });

  it('shift work commutes but has no inbox to answer', () => {
    const s = lifeShape('shift');
    expect(s.hasCommute).toBe(true);
    expect(s.hasDeskJob).toBe(false);
  });

  it('a stated commute beats the assumption, in both directions', () => {
    // Remote worker with a weekly office day.
    expect(lifeShape('remote', 45).hasCommute).toBe(true);
    // Office worker who lives next door.
    expect(lifeShape('office_9_5', 0).hasCommute).toBe(false);
    // Null is "never asked", not "none": the default stands.
    expect(lifeShape('office_9_5', null).hasCommute).toBe(true);
  });

  it('unknown is permissive — absence of an answer is not an answer', () => {
    for (const wt of [undefined, null, '', 'astronaut']) {
      const s = lifeShape(wt as never);
      expect(s.hasCommute).toBe(true);
      expect(s.hasDeskJob).toBe(true);
      // Except the one flag that changes arithmetic rather than availability.
      expect(s.careWorkIsWork).toBe(false);
    }
  });

  it('the retired, between jobs, on a break — and the legacy not_working — own their days', () => {
    for (const wt of ['retired', 'between_jobs', 'career_break', 'not_working']) {
      const s = lifeShape(wt);
      expect(s.hasCommute).toBe(false);
      expect(s.hasDeskJob).toBe(false);
      expect(s.selfDirectedWork).toBe(true);
      expect(s.careWorkIsWork).toBe(false);
    }
  });
});

/**
 * Zoe, 22, found in the sweep: a student who filled in nothing beyond her
 * course, and was told to turn her commute into an audiobook.
 */
describe('naming a commute needs more than a guess that there is one', () => {
  it('will not name a commute a student never mentioned', () => {
    expect(lifeShape('student').canNameCommute).toBe(false);
  });

  it('still lets a student have one when they say so', () => {
    expect(lifeShape('student', 40).canNameCommute).toBe(true);
  });

  it('takes the workplace-naming work types at their word', () => {
    for (const wt of ['office_9_5', 'shift', 'business']) {
      expect(lifeShape(wt).canNameCommute).toBe(true);
    }
  });

  it('says nothing about a commute for a profile that said nothing at all', () => {
    expect(lifeShape(null).canNameCommute).toBe(false);
    /* But availability is untouched — the permissive default is the whole
       point of UNKNOWN. */
    expect(lifeShape(null).hasCommute).toBe(true);
  });

  it('lets a stated zero overrule a work type that assumes one', () => {
    expect(lifeShape('office_9_5', 0).canNameCommute).toBe(false);
  });
});
