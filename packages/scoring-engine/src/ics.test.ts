import { describe, it, expect } from 'vitest';
import { momentToIcs, icsFilename } from './ics';

/**
 * The web half of putting a moment on a calendar.
 *
 * A browser has no device calendar, so the first version hid the feature
 * there entirely — following the house rule that a button which cannot work
 * is worse than no button. Correct, and it made the feature invisible in the
 * only place it was being reviewed, which is its own kind of failure.
 */
describe('a moment as a calendar file', () => {
  const AT = '2009-06-14T00:00:00.000Z';

  it('is a complete document a calendar will accept', () => {
    const ics = momentToIcs({ title: 'Kerala trip', occurredAt: AT });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toMatch(/UID:.+@priority\.app/);
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it('uses CRLF everywhere, because strict importers reject anything else', () => {
    /* A file joined with bare newlines is refused by Outlook while looking
       fine in every other client — the worst kind of bug to find later. */
    const ics = momentToIcs({ title: 'Kerala trip', occurredAt: AT });
    expect(/\r\n/.test(ics)).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('lands on the day it happened, all day', () => {
    const ics = momentToIcs({ title: 'Kerala trip', occurredAt: AT });
    expect(ics).toContain('DTSTART;VALUE=DATE:20090614');
    /* DTEND is exclusive for an all-day event: the same date would be a
       zero-length event, which some calendars silently drop. */
    expect(ics).toContain('DTEND;VALUE=DATE:20090615');
  });

  it('escapes the characters that are separators to a parser', () => {
    /* Unescaped, "Dinner with Amma, then the long walk" arrives truncated at
       the comma — or corrupts the file. */
    const ics = momentToIcs({ title: 'Dinner with Amma, then the walk; part 2', occurredAt: AT });
    expect(ics).toContain('SUMMARY:Dinner with Amma\\, then the walk\\; part 2');
  });

  it('escapes backslashes before anything else', () => {
    const ics = momentToIcs({ title: 'A back\\slash', occurredAt: AT });
    expect(ics).toContain('SUMMARY:A back\\\\slash');
  });

  it('never carries the prose the archive exists for', () => {
    /* A calendar entry is read over shoulders and synced by whatever the
       reader is signed into. Only the heading crosses. */
    const ics = momentToIcs({ title: 'Called Amma', occurredAt: AT });
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('folds a line too long for the format', () => {
    const ics = momentToIcs({ title: 'x'.repeat(200), occurredAt: AT });
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it('gives the same moment the same id, so re-importing replaces it', () => {
    const a = momentToIcs({ title: 'Kerala trip', occurredAt: AT });
    const b = momentToIcs({ title: 'Kerala trip', occurredAt: AT });
    const uid = (s: string) => s.match(/UID:(.+)/)![1];
    expect(uid(a)).toBe(uid(b));
  });

  it('refuses a date that is not one', () => {
    expect(() => momentToIcs({ title: 'x', occurredAt: 'soon' })).toThrow();
  });

  it('names the file so it can be found again', () => {
    expect(icsFilename({ title: 'Called Amma — not a text', occurredAt: AT }))
      .toBe('20090614-called-amma-not-a-text.ics');
    expect(icsFilename({ title: '🌸', occurredAt: AT })).toBe('20090614-moment.ics');
  });
});
