import { describe, it, expect } from 'vitest';
import {
  rhythmsFor,
  rhythmFor,
  rhythmByKey,
  rhythmDomains,
  availableRhythms,
  rhythmForHabit,
  REMOTE_CHILDREN_RHYTHMS,
  IN_PERSON_CHILDREN_TITLES,
  withinLimits,
} from './rhythms';
import { PROMOTED, CATALOG } from './commonHabits';

const ALL = rhythmDomains();

/**
 * The nine that are defined next to the phrasings that mean them.
 *
 * One definition serving two tables is the whole point — so the thing worth
 * testing is that the seam holds. A promoted entry has to be reachable as a
 * catalog entry, sit in the domain its key names, and answer to the words a
 * person would actually type. Any of those coming apart shows up as a
 * catalog that cannot tell somebody who wrote "yoga" that it already knows.
 */
describe('the habits people already write, offered', () => {
  it('every promoted rhythm is in the catalog, in the domain its key names', () => {
    for (const r of Object.values(PROMOTED)) {
      const [domain] = r.key.split('.');
      expect(rhythmByKey(r.key)).toEqual(r);
      expect(rhythmsFor(domain).map((x) => x.key)).toContain(r.key);
    }
  });

  it('resolves the phrasings people use to the same catalog entry', () => {
    const same: Array<[string, string]> = [
      /* Yoga has its own identity now — see commonHabits. Stretching keeps
         the one it always had, and the pair is here so the split cannot be
         quietly undone. */
      ['Yoga', CATALOG.yoga.key],
      ['Stretching', PROMOTED.stretch.key],
      ['hydrate', PROMOTED.water.key],
      ['Gratitude list', PROMOTED.journal.key],
      ['Floss', PROMOTED.upkeep.key],
      ['Meal prep Sundays', PROMOTED.cook.key],
      ['namaz', PROMOTED.prayer.key],
    ];
    for (const [written, key] of same) {
      expect(rhythmForHabit(written)?.key).toBe(key);
    }
  });

  /**
   * The bug this pass had to fix before it could add anything: `classifyLever`
   * matched a bare "bed", so making one read as the sleep lever — which would
   * have suppressed the bedtime rhythm for anybody who took it.
   */
  it('does not let a made bed stand in for a night of sleep', () => {
    const left = availableRhythms('health', ['Make the bed']).map((r) => r.key);
    expect(left).toContain('health.sleep');
  });
});

describe('every domain has rhythms of its own', () => {
  it('covers all twelve app domains', () => {
    for (const d of [
      'career', 'health', 'finance', 'family', 'partner', 'children',
      'friends', 'growth', 'purpose', 'experiences', 'reflection', 'impact',
    ]) {
      expect(ALL).toContain(d);
      expect(rhythmsFor(d).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back rather than returning nothing for a domain it does not know', () => {
    expect(rhythmsFor('astrology').length).toBeGreaterThan(0);
  });

  it('keys are unique across the whole catalog', () => {
    const keys = ALL.flatMap((d) => rhythmsFor(d).map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every key is prefixed with its own domain', () => {
    for (const d of ALL) {
      for (const r of rhythmsFor(d)) expect(r.key.startsWith(`${d}.`)).toBe(true);
    }
  });

  /**
   * The bug this file was written for: three domains offered "Give it a
   * standing hour", "Protect one evening a week" and "One new thing a week",
   * which could have been shuffled between them without anyone noticing.
   */
  it('no title appears in two domains', () => {
    const titles = ALL.flatMap((d) => rhythmsFor(d).map((r) => r.title.toLowerCase()));
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('every rhythm can say what it is for', () => {
    for (const d of ALL) {
      for (const r of rhythmsFor(d)) {
        expect(r.because.length).toBeGreaterThan(20);
        expect(r.because).toMatch(/[.?]$/);
      }
    }
  });
});

describe('a rhythm has to read alone on a card', () => {
  it('titles are short enough to be one line', () => {
    for (const d of ALL) {
      for (const r of rhythmsFor(d)) expect(r.title.length).toBeLessThanOrEqual(42);
    }
  });

  /**
   * "Give it a standing hour" — give *what*? A rung written as a button on a
   * page that supplied the noun, lifted onto a card that does not.
   */
  it('no title leans on a noun that is not in it', () => {
    for (const d of ALL) {
      for (const r of rhythmsFor(d)) {
        expect(r.title).not.toMatch(/^(give|make|put|do) it\b/i);
        expect(r.title.toLowerCase()).not.toMatch(/\bthe thing\b\s*$/);
      }
    }
  });

  it('carries no blame and no mortality framing', () => {
    const forbidden = /death|dying|before it is too late|running out|wasted|lazy|you should/i;
    for (const d of ALL) {
      for (const r of rhythmsFor(d)) {
        expect(`${r.title} ${r.because}`).not.toMatch(forbidden);
      }
    }
  });
});

describe('cadences are ones a person could actually keep', () => {
  /**
   * A habit target is an integer per week. A monthly commitment stored as a
   * weekly one asks for four times what the person agreed to, which is how
   * habit trackers earn their reputation.
   */
  it('every cadence is a whole number of times a week, at most daily', () => {
    for (const d of ALL) {
      for (const r of rhythmsFor(d)) {
        expect(Number.isInteger(r.perWeek)).toBe(true);
        expect(r.perWeek).toBeGreaterThanOrEqual(1);
        expect(r.perWeek).toBeLessThanOrEqual(7);
      }
    }
  });

  it('asks for less time the more often it asks', () => {
    for (const d of ALL) {
      for (const r of rhythmsFor(d)) {
        // Nothing daily may cost an hour a go — that is a second job.
        if (r.perWeek >= 5) expect(r.minutes).toBeLessThanOrEqual(30);
        expect(r.perWeek * r.minutes).toBeLessThanOrEqual(240);
      }
    }
  });
});

describe('it stops rather than looping', () => {
  it('offers the first one nobody has taken', () => {
    const [first, second] = rhythmsFor('family');
    expect(rhythmFor('family')?.key).toBe(first.key);
    expect(rhythmFor('family', [first.title])?.key).toBe(second.key);
  });

  it('says nothing at all once a domain is spent', () => {
    const all = rhythmsFor('purpose').map((r) => r.title);
    expect(rhythmFor('purpose', all)).toBeNull();
  });

  it('matches titles regardless of case and stray spacing', () => {
    const t = rhythmsFor('health')[0].title;
    expect(rhythmFor('health', [`  ${t.toUpperCase()}  `])?.key)
      .not.toBe(rhythmsFor('health')[0].key);
  });

  it('a rhythm someone ended is not handed back', () => {
    const ended = rhythmsFor('friends')[0].title;
    expect(rhythmFor('friends', [ended])?.title).not.toBe(ended);
  });
});

/**
 * Two surfaces create habits and they name the same promise differently.
 * "Strength training twice a week" comes from the healthspan card; "One
 * strength session a week" is the catalog's version of it. A title match
 * cannot see that, so somebody lifting twice a week was being offered a
 * strength rhythm as though they had none — the app failing to notice what
 * they were already doing.
 */
describe('a commitment already kept under another name', () => {
  const strengthRhythm = rhythmsFor('health').find((r) => r.key === 'health.strength')!;
  const sleepRhythm = rhythmsFor('health').find((r) => r.key === 'health.sleep')!;

  it('is not offered again from the catalog', () => {
    const left = availableRhythms('health', ['Strength training twice a week']);
    expect(left.map((r) => r.key)).not.toContain(strengthRhythm.key);
  });

  it('recognises the sleep lever too', () => {
    const left = availableRhythms('health', ['Protecting 7–8 hours of sleep']);
    expect(left.map((r) => r.key)).not.toContain(sleepRhythm.key);
  });

  it('still offers everything the lever does not cover', () => {
    const left = availableRhythms('health', ['Strength training twice a week']);
    expect(left.map((r) => r.key)).toContain('health.move');
  });

  it('leaves nothing behind that a kept lever already covers', () => {
    const taken = [
      'Move three times a week',
      'Strength training twice a week',
      'Protecting 7–8 hours of sleep',
    ];
    const left = availableRhythms('health', taken).map((r) => r.key);
    expect(left).not.toContain('health.move');
    expect(left).not.toContain('health.strength');
    expect(left).not.toContain('health.sleep');
  });

  /**
   * Held levers must not swallow the daily upkeep.
   *
   * This asserted an empty list back when health was three rhythms and all
   * three were levers. Somebody who lifts, moves and sleeps well has not
   * thereby started flossing, and the honest answer for them is the small
   * daily register — not silence. What the earlier version was really
   * protecting is above: a lever kept under another name is never re-offered.
   */
  it('still offers the daily upkeep to someone whose levers are all kept', () => {
    const taken = [
      'Move three times a week',
      'Strength training twice a week',
      'Protecting 7–8 hours of sleep',
    ];
    const left = availableRhythms('health', taken).map((r) => r.key);
    expect(left).toContain('health.upkeep');
    expect(left).toContain('health.water');
    // "Make the bed" survives only because it is no longer read as sleep.
    expect(left).toContain('health.makebed');
    /* Appended, not inserted: the three that decide most of health still
       lead, and yoga sits directly after them — before the daily upkeep,
       because it is a session and they are maintenance. */
    expect(rhythmFor('health', taken)?.key).toBe('health.yoga');
  });

  it('does not suppress a rhythm that classifies as nothing', () => {
    // "Move three times a week" is not one of the levers, so holding a lever
    // must not quietly remove it.
    const left = availableRhythms('health', ['Protecting 7–8 hours of sleep']);
    expect(left.map((r) => r.key)).toContain('health.move');
  });

  it('applies to a generated rhythm as much as a catalog one', () => {
    const generated = {
      key: 'gen.health.lift', title: 'Lift weights on Tuesday and Friday',
      perWeek: 2, minutes: 45, because: 'Because it is the lever that lasts',
    };
    const left = availableRhythms('health', ['Strength training twice a week'], [generated]);
    expect(left.map((r) => r.key)).not.toContain('gen.health.lift');
  });

  it('is unaffected for somebody holding nothing', () => {
    expect(availableRhythms('health')).toHaveLength(rhythmsFor('health').length);
  });
});

describe('lookup by key', () => {
  it('finds one from any domain', () => {
    expect(rhythmByKey('purpose.hour')?.title).toBe('A standing hour on the project');
    expect(rhythmByKey('health.sleep')?.perWeek).toBe(7);
  });

  it('returns nothing for a key that was never issued', () => {
    expect(rhythmByKey('career.invented')).toBeNull();
    expect(rhythmByKey('')).toBeNull();
  });
});

/**
 * The arrangement the host uses for children who live away: the in-person
 * titles go into `taken`, the remote variants ride the `extra` slot. The two
 * lists are exported together so this test can hold them to each other.
 */
describe('children rhythms at a distance', () => {
  it('the retired titles are real catalog titles — the lists cannot drift', () => {
    const titles = rhythmsFor('children').map((r) => r.title);
    for (const t of IN_PERSON_CHILDREN_TITLES) expect(titles).toContain(t);
  });

  it('a remote household is offered the call, not the shared room', () => {
    const offered = rhythmFor('children', IN_PERSON_CHILDREN_TITLES, REMOTE_CHILDREN_RHYTHMS);
    expect(offered?.key).toBe('children.call');
    expect(offered?.because).toMatch(/call is the room/);
  });

  it('every remote rhythm passes the catalog bars — standalone title, honest cadence', () => {
    for (const r of REMOTE_CHILDREN_RHYTHMS) {
      expect(r.title.length).toBeGreaterThan(10);
      expect(Number.isInteger(r.perWeek)).toBe(true);
      expect(r.perWeek).toBeGreaterThanOrEqual(1);
      expect(r.because.length).toBeGreaterThan(10);
    }
  });

  it('a co-located household never sees the remote variants — they ride extra, not the catalog', () => {
    const titles = rhythmsFor('children').map((r) => r.title);
    for (const r of REMOTE_CHILDREN_RHYTHMS) expect(titles).not.toContain(r.title);
  });
});

/**
 * `needs: ['canMove']` asks whether the ROOM allows moving. It has never
 * asked whether the person can — so a strength session was offered to
 * somebody with a back injury standing in a perfectly open room.
 */
describe('what a body allows, as opposed to what a room allows', () => {
  it('changes nothing when no limit was declared', () => {
    for (const limits of [undefined, null, 'none'] as const) {
      expect(rhythmFor('health', [], [], limits)?.key).toBe('health.move');
    }
  });

  it('swaps a vigorous entry for its gentle twin rather than dropping it', () => {
    const taken = ['Move three times a week'];
    expect(rhythmFor('health', taken)?.key).toBe('health.strength');
    expect(rhythmFor('health', taken, [], 'low_impact')?.key).toBe('health.yoga');
  });

  it('leaves a brisk walk alone — moderate is the thing people are told to do more of', () => {
    expect(rhythmFor('health', [], [], 'ask_doctor')?.key).toBe('health.move');
  });

  /* A health domain that goes quiet reads as the app having nothing to say
     about somebody's health, which is backwards for the reader most likely
     to have declared a limit. */
  it('still has a full domain to offer under a limit', () => {
    const under = withinLimits(rhythmsFor('health'), 'low_impact');
    expect(under.length).toBeGreaterThanOrEqual(rhythmsFor('health').length - 1);
    expect(under.some((r) => r.intensity === 'vigorous')).toBe(false);
  });

  it('never offers the same thing twice after a swap', () => {
    const under = withinLimits(rhythmsFor('health'), 'low_impact');
    expect(new Set(under.map((r) => r.key)).size).toBe(under.length);
  });

  it('finds an entry by its key across every domain', () => {
    expect(rhythmByKey('health.yoga')?.title).toBe('Yoga, twice a week');
    expect(rhythmByKey('nope.nope')).toBeNull();
  });
});
