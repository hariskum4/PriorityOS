import { describe, it, expect } from 'vitest';
import { anchorFor, type DayAnchors } from './anchor';
import { rhythmDomains, rhythmsFor } from './rhythms';

/** A nine-to-five with a fixed night, which most anchors can be pinned to. */
const ORDINARY: DayAnchors = {
  wakeHour: 7, workStartHour: 9, workEndHour: 17, sleepHour: 23, isWorkday: true,
};

describe('the if-then sentence', () => {
  it('pins a morning rhythm to getting up', () => {
    const a = anchorFor({ when: 'morning', anchorTemplate: 'put your shoes on' }, ORDINARY);
    expect(a?.sentence).toBe('After you get up, put your shoes on.');
    expect(a?.hour).toBe(7);
  });

  it('pins an evening rhythm to the end of work', () => {
    const a = anchorFor({ when: 'evening', anchorTemplate: 'call home' }, ORDINARY);
    expect(a?.sentence).toBe('After you finish work, call home.');
    expect(a?.hour).toBe(17);
  });

  it('pins a bedtime rhythm to stopping, not to an hour of the evening', () => {
    const a = anchorFor({ when: 'bedtime', anchorTemplate: 'put the phone away' }, ORDINARY);
    expect(a?.sentence).toBe('After the last thing is put away, put the phone away.');
  });

  /**
   * Silence is a real answer, and the common one. An if-then pinned to an
   * event that does not happen fails quietly and takes the reader's
   * confidence with it — so every one of these returns null rather than
   * guessing at a day it was not told about.
   */
  it('says nothing when the rhythm has no hand-written action', () => {
    expect(anchorFor({ when: 'morning' }, ORDINARY)).toBeNull();
    expect(anchorFor({ when: 'morning', anchorTemplate: '   ' }, ORDINARY)).toBeNull();
  });

  it('says nothing when the day holds no dependable cue', () => {
    expect(anchorFor({ when: 'morning', anchorTemplate: 'walk' }, {})).toBeNull();
    expect(anchorFor({ when: 'evening', anchorTemplate: 'call home' }, {})).toBeNull();
  });

  it('does not say "after work" to somebody who is not working today', () => {
    const restDay: DayAnchors = { ...ORDINARY, isWorkday: false };
    const a = anchorFor({ when: 'evening', anchorTemplate: 'call home' }, restDay);
    expect(a?.after).not.toMatch(/work/);
  });

  it('will not anchor a thing that fits anywhere', () => {
    for (const when of ['any', 'allday'] as const) {
      expect(anchorFor({ when, anchorTemplate: 'drink water' }, ORDINARY)).toBeNull();
    }
    expect(anchorFor({ anchorTemplate: 'drink water' }, ORDINARY)).toBeNull();
  });

  it('falls back to the evening itself when there is no working day at all', () => {
    const a = anchorFor(
      { when: 'evening', anchorTemplate: 'call home' },
      { sleepHour: 23, isWorkday: false },
    );
    expect(a?.sentence).toBe('After the evening starts, call home.');
  });
});

describe('the catalog templates', () => {
  const templates = rhythmDomains()
    .flatMap((d) => rhythmsFor(d))
    .filter((r) => r.anchorTemplate);

  it('are on the rhythms a reader meets first', () => {
    expect(templates.length).toBeGreaterThanOrEqual(12);
  });

  /* The whole reason the template is hand-written rather than derived from
     the title: it has to survive being put after a comma. */
  it('read as the second half of a sentence, never as a card title', () => {
    for (const r of templates) {
      const t = r.anchorTemplate!;
      expect(t, r.key).toBe(t.trim());
      expect(t[0], `${r.key} starts upper case`).toBe(t[0].toLowerCase());
      expect(t.endsWith('.'), `${r.key} ends with a full stop`).toBe(false);
      expect(t, `${r.key} carries a frequency`).not.toMatch(/\b(daily|weekly|a week|times a)\b/i);
    }
  });

  it('actually produce a sentence for an ordinary day', () => {
    const said = templates
      .map((r) => anchorFor(r, ORDINARY))
      .filter((a): a is NonNullable<typeof a> => a != null);
    expect(said.length).toBeGreaterThanOrEqual(10);
    for (const a of said) expect(a.sentence).toMatch(/^After .+, .+\.$/);
  });
});
