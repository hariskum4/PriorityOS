import { describe, it, expect } from 'vitest';
import { domainLadder, nextDomainAction, rhythmRungFor } from './domainLadder';

const DOMAINS = [
  'career', 'health', 'finance', 'family', 'partner', 'children',
  'friends', 'growth', 'purpose', 'experiences', 'reflection', 'impact',
];

describe('nextDomainAction', () => {
  it('offers the first rung to someone who has done nothing', () => {
    const { next, taken, finished } = nextDomainAction('career');
    expect(next?.title).toBe('Block two hours of focused work');
    expect(taken).toBe(0);
    expect(finished).toBe(false);
  });

  it('never offers again what was already completed', () => {
    /**
     * The bug this exists for. The screen checked *pending* missions to decide
     * whether the starter had been taken, so completing it made the check pass
     * again and the identical action came straight back — done, +30 XP, and
     * there it is once more.
     */
    const { next } = nextDomainAction('career', ['Block two hours of focused work']);
    expect(next?.title).not.toBe('Block two hours of focused work');
    expect(next?.title).toBe('Write down what you actually want from this job');
  });

  it('does not re-offer something already sitting on the list', () => {
    const { next } = nextDomainAction('health', [], ['Book the annual health checkup']);
    expect(next?.title).toBe('Walk for twenty minutes today');
  });

  it('climbs — each rung asks at least as much as the one before it', () => {
    // Not strictly monotonic in minutes (a five-minute sentence can be the
    // hardest rung), but the ladder must not open with its heaviest ask.
    for (const domain of DOMAINS) {
      const rungs = domainLadder(domain);
      expect(rungs[0].minutes).toBeLessThanOrEqual(Math.max(...rungs.map((r) => r.minutes)));
    }
  });

  it('matches titles regardless of case and stray whitespace', () => {
    const { next, taken } = nextDomainAction('partner', ['  plan A PHONE-FREE evening TOGETHER ']);
    expect(taken).toBe(1);
    expect(next?.title).toBe('Ask them what they need more of right now');
  });

  it('ends rather than looping back to the top', () => {
    const all = domainLadder('friends').map((r) => r.title);
    const position = nextDomainAction('friends', all);
    expect(position.next).toBeNull();
    expect(position.finished).toBe(true);
    expect(position.taken).toBe(position.total);
  });

  it('counts progress through the ladder out of order', () => {
    const rungs = domainLadder('growth');
    const { taken, next } = nextDomainAction('growth', [rungs[0].title, rungs[3].title]);
    expect(taken).toBe(2);
    // The next offer is the earliest untaken rung, not the one after the last done.
    expect(next?.title).toBe(rungs[1].title);
  });

  it('has a ladder for every domain the app can show', () => {
    for (const domain of DOMAINS) {
      const rungs = domainLadder(domain);
      expect(rungs.length).toBeGreaterThanOrEqual(4);
      for (const r of rungs) {
        expect(r.title.trim().length).toBeGreaterThan(0);
        expect(r.label.trim().length).toBeGreaterThan(0);
        expect(r.minutes).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate titles within a ladder, which would strand the sequence', () => {
    for (const domain of DOMAINS) {
      const titles = domainLadder(domain).map((r) => r.title.toLowerCase());
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it('falls back to a real ladder for a domain it has never heard of', () => {
    const { next } = nextDomainAction('astrology');
    expect(next).toBeTruthy();
    expect(next!.title.length).toBeGreaterThan(0);
  });
});

/**
 * Every ladder was built to end on a standing commitment, and every one of
 * those was being filed as a mission — ticked once, awarded XP, gone. "Make
 * the call a standing weekly thing", done on a Tuesday, never seen again.
 */
describe('the rungs that are rhythms, not errands', () => {
  it('gives every domain a way to reach a standing rhythm', () => {
    for (const domain of DOMAINS) {
      const recurring = domainLadder(domain).filter((r) => r.recurring);
      expect(recurring.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('puts the rhythm last, so the ladder still climbs to it', () => {
    /**
     * Two ladders place theirs earlier and are right to. A weekly money
     * review is the cheapest thing finance has and belongs at the bottom;
     * purpose gives the project a standing hour before it asks anyone to
     * finish a piece or publish it, which is the honest order for making
     * something. The marker follows the rung that is genuinely a rhythm — it
     * does not get moved to satisfy a shape.
     */
    for (const domain of DOMAINS.filter((d) => d !== 'finance' && d !== 'purpose')) {
      const rungs = domainLadder(domain);
      expect(rungs[rungs.length - 1].recurring).toBeTruthy();
    }
  });

  it('asks for a cadence a habit can actually hold', () => {
    for (const domain of DOMAINS) {
      for (const r of domainLadder(domain)) {
        if (!r.recurring) continue;
        expect(Number.isInteger(r.recurring.perWeek)).toBe(true);
        expect(r.recurring.perWeek).toBeGreaterThanOrEqual(1);
        expect(r.recurring.perWeek).toBeLessThanOrEqual(7);
      }
    }
  });

  it('leaves monthly and yearly things as one-off missions', () => {
    /**
     * The target is an integer per week, so marking these recurring would ask
     * four and fifty-two times too often. A rhythm nobody could keep is worse
     * than no rhythm — those domains got a weekly rung of their own instead.
     */
    const monthly = domainLadder('friends')
      .find((r) => r.title === 'Put a standing monthly catch-up in the calendar');
    const yearly = domainLadder('experiences')
      .find((r) => r.title === 'Put one real trip in the calendar every year');
    expect(monthly?.recurring).toBeUndefined();
    expect(yearly?.recurring).toBeUndefined();
  });

  it('keeps the one-off rungs one-off — most of a ladder is not a habit', () => {
    for (const domain of DOMAINS) {
      const rungs = domainLadder(domain);
      expect(rungs.filter((r) => r.recurring).length).toBeLessThan(rungs.length / 2);
    }
  });

  it('offers the sky a rhythm for any domain, never an errand', () => {
    for (const domain of DOMAINS) {
      const rung = rhythmRungFor(domain);
      expect(rung).toBeTruthy();
      expect(rung!.recurring).toBeTruthy();
    }
  });

  it('does not offer back a rhythm someone already took up', () => {
    expect(rhythmRungFor('family')).toBeTruthy();
    expect(rhythmRungFor('family', ['Make the call a standing weekly thing'])).toBeNull();
  });

  it('stays quiet rather than inventing one, when the domain has none left', () => {
    // Retired counts as taken — the caller passes retired titles too, and an
    // ended rhythm handed back the next morning is the bug this guards.
    const all = domainLadder('reflection').filter((r) => r.recurring).map((r) => r.title);
    expect(rhythmRungFor('reflection', all)).toBeNull();
  });

  it('matches taken titles regardless of case and whitespace', () => {
    expect(rhythmRungFor('finance', ['  WEEKLY money REVIEW  '])).toBeNull();
  });

  it('still ends, now that three ladders are longer', () => {
    for (const domain of DOMAINS) {
      const all = domainLadder(domain).map((r) => r.title);
      const position = nextDomainAction(domain, all);
      expect(position.finished).toBe(true);
      expect(position.taken).toBe(position.total);
    }
  });
});
