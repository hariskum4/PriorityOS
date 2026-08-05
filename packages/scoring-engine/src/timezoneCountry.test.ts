import { describe, it, expect } from 'vitest';
import { countryFromTimezone } from './timezoneCountry';
import { lifeExpectancyForRegion } from './timeReality';

describe('countryFromTimezone', () => {
  it('maps the common zones to their countries', () => {
    expect(countryFromTimezone('Asia/Kolkata')).toBe('IN');
    expect(countryFromTimezone('Asia/Calcutta')).toBe('IN');
    expect(countryFromTimezone('America/New_York')).toBe('US');
    expect(countryFromTimezone('Europe/London')).toBe('GB');
    expect(countryFromTimezone('Australia/Sydney')).toBe('AU');
    expect(countryFromTimezone('America/Sao_Paulo')).toBe('BR');
    expect(countryFromTimezone('Africa/Lagos')).toBe('NG');
  });

  /**
   * The reason this module exists: `startsWith('Asia/') → 'IN'` gave India's
   * table to the whole continent. Tokyo is not Kolkata.
   */
  it('does not map the rest of Asia to India', () => {
    expect(countryFromTimezone('Asia/Tokyo')).toBe('JP');
    expect(countryFromTimezone('Asia/Singapore')).toBe('SG');
    expect(countryFromTimezone('Asia/Seoul')).toBe('KR');
    expect(countryFromTimezone('Asia/Dubai')).toBe('AE');
    expect(countryFromTimezone('Asia/Karachi')).toBe('PK');
  });

  it('returns null rather than guessing', () => {
    expect(countryFromTimezone('UTC')).toBeNull();
    expect(countryFromTimezone('Etc/GMT+5')).toBeNull();
    expect(countryFromTimezone('Antarctica/McMurdo')).toBeNull();
    expect(countryFromTimezone('')).toBeNull();
    expect(countryFromTimezone(null)).toBeNull();
    expect(countryFromTimezone(undefined)).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(countryFromTimezone(' Asia/Kolkata ')).toBe('IN');
  });

  /** The mapping is only worth having if the table then distinguishes it. */
  it('feeds countries the expectancy table now knows', () => {
    expect(lifeExpectancyForRegion(countryFromTimezone('Asia/Tokyo')!)).toBe(84);
    expect(lifeExpectancyForRegion(countryFromTimezone('Asia/Singapore')!)).toBe(83);
    expect(lifeExpectancyForRegion(countryFromTimezone('Asia/Kolkata')!)).toBe(70);
    // Unmapped zones fall through to the default, stated as such.
    expect(lifeExpectancyForRegion('XX')).toBe(75);
  });
});
