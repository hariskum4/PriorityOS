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

    /**
     * A phone-shaped mission downgrades to the chat, never to the room. The
     * children default is "sit down where they are playing" — which, under
     * "A call where they pick the topic" (written for a child in another
     * city), was a step for a different life.
     */
    /**
     * The mission can be right and the step still wrong. "Reach out to Sean
     * this week — one message is enough" is correct for an adult in another
     * city; under it sat "Sit down where Sean is playing", so the card
     * contradicted itself in two consecutive lines.
     */
    it('does not put you in the room of somebody in another city', () => {
      const remote = tinyStep({
        title: 'Reach out to Sean this week — one message is enough',
        domainType: 'children', missionType: 'relationship',
        personName: 'Sean', locationType: 'different_city',
      });
      expect(remote).not.toMatch(/sit down/i);
      expect(remote).toContain("Open Sean's chat");

      const partner = tinyStep({
        title: 'Reach out to Mira this week', domainType: 'partner',
        personName: 'Mira', locationType: 'abroad',
      });
      expect(partner).not.toMatch(/other room/i);
    });

    it('leaves the co-located step alone when they are near, or unknown', () => {
      for (const locationType of ['same_home', 'same_city', null, undefined]) {
        expect(tinyStep({
          title: 'Fifteen minutes with Zoe', domainType: 'children',
          personName: 'Zoe', locationType,
        })).toMatch(/sit down where Zoe is playing/i);
      }
    });

    it('does not answer a call-shaped children mission with the floor', () => {
      const s = tinyStep({ title: 'A call where they pick the topic', domainType: 'children', personName: 'Sean' });
      expect(s).not.toMatch(/sit down/i);
      expect(s).toContain("Open Sean's chat");
      expect(tinyStep({ title: 'Send a voice note about your ordinary day', domainType: 'children' }))
        .toMatch(/one line/i);
    });
  });

  /**
   * The templates were written around their fallbacks and then had names
   * dropped into the same slot. "Open Amma chat" and "Sit down where Lucía
   * are playing" both shipped, on the Reveal, on Today and on Missions — the
   * three places a new account looks first.
   */
  describe('a name is not a pronoun', () => {
    it("gives the chat an owner", () => {
      expect(tinyStep({ title: 'Call Amma this evening', domainType: 'family', personName: 'Amma' }))
        .toContain("Open Amma's chat");
      expect(tinyStep({ title: 'Check in on Sam', domainType: 'unknown_domain', personName: 'Sam' }))
        .toContain("Open Sam's chat");
    });

    it('keeps "their" when there is no name to own it', () => {
      expect(tinyStep({ title: 'One meaningful action in family', domainType: 'family' }))
        .toContain('Open their chat');
    });

    it('conjugates for the child it just named', () => {
      expect(tinyStep({ title: 'Fifteen minutes with Lucía', domainType: 'children', personName: 'Lucía' }))
        .toBe('Sit down where Lucía is playing. Just sit down.');
      expect(tinyStep({ title: 'x', domainType: 'children' }))
        .toBe('Sit down where they are playing. Just sit down.');
    });

    it('does not double an apostrophe a name already carries', () => {
      expect(tinyStep({ title: 'x', domainType: 'family', personName: "Nas'" }))
        .toContain("Open Nas' chat");
    });
  });

  it('never uses obligation language', () => {
    const forbidden = /\bmust\b|\bshould\b|\bhave to\b|\bdon'?t forget\b|\bfail/i;
    for (const d of ['family', 'health', 'career', 'finance', 'nope']) {
      expect(tinyStep({ title: 'x', domainType: d })).not.toMatch(forbidden);
    }
  });
});
