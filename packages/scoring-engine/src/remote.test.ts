import { describe, it, expect } from 'vitest';
import { isRemoteLocation, allRemote, childrenAreRemote } from './remote';

describe('who is out of reach', () => {
  it('reads the stored values and their aliases', () => {
    expect(isRemoteLocation('different_city')).toBe(true);
    expect(isRemoteLocation('abroad')).toBe(true);
    expect(isRemoteLocation('Different City')).toBe(true);
    expect(isRemoteLocation('same_home')).toBe(false);
    expect(isRemoteLocation('same_city')).toBe(false);
  });

  it('unknown is not remote — behaviour must not change on missing data', () => {
    expect(isRemoteLocation(null)).toBe(false);
    expect(isRemoteLocation(undefined)).toBe(false);
    expect(isRemoteLocation('')).toBe(false);
    expect(isRemoteLocation('somewhere_odd')).toBe(false);
  });

  it('an empty list is "we know nothing", never "everyone is far away"', () => {
    expect(allRemote([])).toBe(false);
    expect(childrenAreRemote([])).toBe(false);
    expect(childrenAreRemote([{ relationType: 'friend', locationType: 'abroad' }])).toBe(false);
  });

  it('one child at home keeps the co-located vocabulary', () => {
    expect(childrenAreRemote([
      { relationType: 'child', locationType: 'different_city' },
      { relationType: 'daughter', locationType: 'same_home' },
    ])).toBe(false);
  });

  it('every child away flips the switch — other relations do not vote', () => {
    expect(childrenAreRemote([
      { relationType: 'child', locationType: 'different_city' },
      { relationType: 'son', locationType: 'abroad' },
      { relationType: 'mother', locationType: 'same_home' },
    ])).toBe(true);
  });
});
