import { describe, it, expect } from 'vitest';
import { driftFromReality, DRIFT_LIMIT } from './drift';

describe('driftFromReality', () => {
  it('treats a low score as the drift, and leaves the rest alone', () => {
    const drift = driftFromReality({
      ranking: ['family', 'health', 'career'],
      reality: { family: 4, health: 2, career: 3 },
    });
    expect(drift).toEqual(['health']);
  });

  it('never contradicts itself — a 5/5 domain cannot be drifting', () => {
    const drift = driftFromReality({
      ranking: ['health'],
      reality: { health: 5 },
    });
    expect(drift).toEqual([]);
  });

  it('3 out of 5 is the middle, not a problem', () => {
    const drift = driftFromReality({
      ranking: ['family', 'health'],
      reality: { family: 3, health: 3 },
    });
    expect(drift).toEqual([]);
  });

  it('puts the biggest say-versus-lived gap first, not the lowest score', () => {
    // #1 lived at 2/5 outranks #3 lived at 1/5: the higher claim makes the
    // shortfall matter more, and this is the one the drift warning names.
    const drift = driftFromReality({
      ranking: ['family', 'health', 'career'],
      reality: { family: 2, health: 5, career: 1 },
    });
    expect(drift).toEqual(['family', 'career']);
  });

  it('ranks a lower priority first when its shortfall is far worse', () => {
    const drift = driftFromReality({
      ranking: ['family', 'health', 'career', 'friends'],
      reality: { family: 2, health: 5, career: 5, friends: 1 },
    });
    expect(drift[0]).toBe('family');
  });

  it('carries unranked slipping areas after the measured ones', () => {
    const drift = driftFromReality({
      ranking: ['family', 'health'],
      reality: { family: 1, health: 4 },
      alsoSlipping: ['friends'],
    });
    expect(drift).toEqual(['family', 'friends']);
  });

  it('does not list a domain twice when it was both scored low and named', () => {
    const drift = driftFromReality({
      ranking: ['family'],
      reality: { family: 1 },
      alsoSlipping: ['family'],
    });
    expect(drift).toEqual(['family']);
  });

  it('caps the list — everything drifting says the same as nothing drifting', () => {
    const ranking = ['family', 'health', 'career', 'friends', 'finance', 'growth'];
    const reality = Object.fromEntries(ranking.map((d) => [d, 1]));
    const drift = driftFromReality({ ranking, reality });
    expect(drift).toHaveLength(DRIFT_LIMIT);
    expect(drift[0]).toBe('family');
  });

  it('ignores domains that were ranked but never scored', () => {
    const drift = driftFromReality({
      ranking: ['family', 'health'],
      reality: { family: 2 },
    });
    expect(drift).toEqual(['family']);
  });

  it('is empty for an untouched form', () => {
    expect(driftFromReality({ ranking: [], reality: {} })).toEqual([]);
  });
});
