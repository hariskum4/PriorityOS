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
