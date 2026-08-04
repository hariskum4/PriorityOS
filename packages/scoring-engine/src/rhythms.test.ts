import { describe, it, expect } from 'vitest';
import {
  rhythmsFor, rhythmFor, rhythmByKey, rhythmDomains, availableRhythms,
} from './rhythms';

const ALL = rhythmDomains();

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

  it('leaves a domain with nothing left when every lever is kept', () => {
    const left = availableRhythms('health', [
      'Move three times a week',
      'Strength training twice a week',
      'Protecting 7–8 hours of sleep',
    ]);
    expect(left).toEqual([]);
    expect(rhythmFor('health', [
      'Move three times a week',
      'Strength training twice a week',
      'Protecting 7–8 hours of sleep',
    ])).toBeNull();
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
