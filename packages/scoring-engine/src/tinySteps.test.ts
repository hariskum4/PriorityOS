import { describe, it, expect } from 'vitest';
import { tinyStep } from './tinySteps';

describe('tiny steps', () => {
  it('personalizes relationship missions with the person name', () => {
    const s = tinyStep({
      title: 'Call Amma this evening',
      domainType: 'family',
      missionType: 'relationship',
      personName: 'Amma',
    });
    expect(s).toContain('Amma');
    expect(s).toMatch(/one line/i);
  });

  it('covers every domain with a concrete physical first action', () => {
    const domains = [
      'family', 'partner', 'friends', 'children', 'health',
      'career', 'finance', 'growth', 'experiences', 'reflection',
      'purpose', 'impact',
    ];
    for (const d of domains) {
      const s = tinyStep({ title: 'anything', domainType: d });
      expect(s.length, d).toBeGreaterThan(10);
      // Tiny means tiny: hard cap so steps never become homework again.
      expect(s.length, d).toBeLessThanOrEqual(90);
    }
  });

  it('falls back to the two-minute timer for unknown domains', () => {
    const s = tinyStep({ title: 'x', domainType: 'unknown_domain' });
    expect(s).toMatch(/two-minute timer/);
  });

  it('gives explicit permission to stop — the anti-homework clause', () => {
    const health = tinyStep({ title: 'x', domainType: 'health' });
    const growth = tinyStep({ title: 'x', domainType: 'growth' });
    expect(health + growth).toMatch(/allowed to stop|Close it if you want/);
  });

  /**
   * The step has to be the first move of *this* mission.
   *
   * "Take Priya out of the house for an hour, no screens" was answered with
   * "Open their chat. Type one line." — read off the domain, which said
   * family, with no glance at what the mission actually asked for.
   */
  describe('reads the mission, not only its domain', () => {
    it('does not answer an outing with a text message', () => {
      const s = tinyStep({
        title: 'Take Priya out of the house for an hour, no screens',
        domainType: 'family',
        missionType: 'relationship',
        personName: 'Priya',
      });
      expect(s).not.toMatch(/chat|type one line/i);
      expect(s).toContain('Priya');
      expect(s).toMatch(/evening/i);
    });

    it('sends a plan to the calendar', () => {
      expect(tinyStep({ title: 'Plan the trip you keep talking about', domainType: 'experiences' }))
        .toMatch(/calendar/i);
    });

    /**
     * The trap the anchoring exists for. This one contains "take" and
     * "walk" and is a solo walk with a phone call in it — reading it as an
     * outing would tell somebody to ask Jai which evening suits, for a
     * thing they are doing by themselves.
     */
    it('does not read a walk-and-call as an outing', () => {
      expect(tinyStep({
        title: 'Take your walk while calling Jai',
        domainType: 'health',
        personName: 'Jai',
      })).toMatch(/shoes/i);
    });

    it('leaves every other mission to its domain', () => {
      expect(tinyStep({ title: 'Call Amma this evening', domainType: 'family', personName: 'Amma' }))
        .toMatch(/one line/i);
    });
  });

  it('never uses obligation language', () => {
    const forbidden = /\bmust\b|\bshould\b|\bhave to\b|\bdon'?t forget\b|\bfail/i;
    for (const d of ['family', 'health', 'career', 'finance', 'nope']) {
      expect(tinyStep({ title: 'x', domainType: d })).not.toMatch(forbidden);
    }
  });
});
