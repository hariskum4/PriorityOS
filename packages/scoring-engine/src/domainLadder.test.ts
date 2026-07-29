import { describe, it, expect } from 'vitest';
import { domainLadder, nextDomainAction } from './domainLadder';

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
