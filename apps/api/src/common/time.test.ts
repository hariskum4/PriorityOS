/**
 * The first tests in apps/api.
 *
 * Day boundaries earn them: this is the one piece of host code whose bugs are
 * unrecoverable. A misfiled act is a permanent error in a record meant to be
 * read decades from now, and it cannot be spotted by looking at a screen —
 * only by checking the arithmetic against a zone you are not sitting in.
 */
import { describe, it, expect } from 'vitest';
import { startOfDayIn, startOfWeekIn, dayKeyIn, daysAgoIn } from './time';

describe('startOfDayIn', () => {
  it('gives the user midnight, not the server midnight', () => {
    // 09:00 in Bengaluru on 28 July is 03:30 UTC the same day.
    const at = new Date('2026-07-28T03:30:00Z');
    expect(startOfDayIn('Asia/Kolkata', at).toISOString())
      .toBe('2026-07-27T18:30:00.000Z');
  });

  it('files an evening in India under the day it feels like', () => {
    // 23:00 IST on the 28th. A UTC server would call this 17:30 on the 28th
    // and agree by luck; the case that used to break is the other side of
    // midnight, below.
    const at = new Date('2026-07-28T17:30:00Z');
    expect(dayKeyIn('Asia/Kolkata', at)).toBe('2026-07-28');
  });

  it('does not roll a late Indian evening into tomorrow', () => {
    // 00:30 UTC on the 29th is 06:00 IST on the 29th — same day either way.
    // But 20:00 UTC on the 28th is 01:30 IST on the 29th: server says the
    // 28th, the person living it says the 29th.
    const at = new Date('2026-07-28T20:00:00Z');
    expect(dayKeyIn('UTC', at)).toBe('2026-07-28');
    expect(dayKeyIn('Asia/Kolkata', at)).toBe('2026-07-29');
  });

  it('handles a zone behind UTC', () => {
    // 01:00 UTC on the 28th is 18:00 on the 27th in Los Angeles.
    const at = new Date('2026-07-28T01:00:00Z');
    expect(dayKeyIn('America/Los_Angeles', at)).toBe('2026-07-27');
    expect(startOfDayIn('America/Los_Angeles', at).toISOString())
      .toBe('2026-07-27T07:00:00.000Z');
  });

  it('survives a spring-forward boundary', () => {
    // US DST began 8 March 2026. Midnight local still exists that day.
    const at = new Date('2026-03-08T18:00:00Z');
    const start = startOfDayIn('America/New_York', at);
    expect(dayKeyIn('America/New_York', start)).toBe('2026-03-08');
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('falls back to UTC for an unknown zone rather than to the server', () => {
    const at = new Date('2026-07-28T20:00:00Z');
    expect(dayKeyIn('Mars/Olympus', at)).toBe(dayKeyIn('UTC', at));
    expect(dayKeyIn(null, at)).toBe(dayKeyIn('UTC', at));
  });
});

describe('startOfWeekIn', () => {
  it('starts the week on Monday in the user zone', () => {
    // Tuesday 28 July 2026, 09:00 IST.
    const at = new Date('2026-07-28T03:30:00Z');
    const start = startOfWeekIn('Asia/Kolkata', at);
    expect(dayKeyIn('Asia/Kolkata', start)).toBe('2026-07-27');
  });

  it('does not move the week when it is already Monday', () => {
    const monday = new Date('2026-07-27T06:00:00Z');
    const start = startOfWeekIn('Asia/Kolkata', monday);
    expect(dayKeyIn('Asia/Kolkata', start)).toBe('2026-07-27');
  });

  it('treats Sunday as the end of the week, not the start', () => {
    const sunday = new Date('2026-08-02T06:00:00Z');
    expect(dayKeyIn('Asia/Kolkata', startOfWeekIn('Asia/Kolkata', sunday)))
      .toBe('2026-07-27');
  });
});

describe('daysAgoIn', () => {
  it('counts calendar days, not multiples of 24 hours', () => {
    const at = new Date('2026-07-28T03:30:00Z');
    expect(dayKeyIn('Asia/Kolkata', daysAgoIn('Asia/Kolkata', 7, at)))
      .toBe('2026-07-21');
  });

  it('crosses a DST boundary without drifting an hour', () => {
    // One week after spring-forward in New York.
    const at = new Date('2026-03-15T16:00:00Z');
    const back = daysAgoIn('America/New_York', 7, at);
    expect(dayKeyIn('America/New_York', back)).toBe('2026-03-08');
  });
});
