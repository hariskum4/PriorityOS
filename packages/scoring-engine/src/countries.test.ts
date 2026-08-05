import { describe, it, expect } from 'vitest';
import {
  KNOWN_COUNTRIES, countryName, searchCountries, searchCities, CITIES_BY_COUNTRY,
  REGIONS_BY_COUNTRY, regionsOf, searchRegions, regionOfCity, citiesIn,
} from './countries';
import { timezoneCountryCodes } from './timezoneCountry';
import { lifeExpectancyRegions } from './timeReality';

describe('the countries a person can actually choose', () => {
  /**
   * The defect this file exists for: the app could *store* a hundred and
   * twenty countries and *offer* nine. A merchant navy officer living in
   * Vigo, on a phone still set to Asia/Calcutta, was filed under India and
   * had no way to say otherwise — Spain was not on the list.
   */
  it('can name every country a device timezone can produce', () => {
    const named = new Set(KNOWN_COUNTRIES.map((c) => c.code));
    const missing = timezoneCountryCodes().filter((c) => !named.has(c));
    expect(missing).toEqual([]);
  });

  it('can name every country the life-expectancy table has its own figure for', () => {
    const named = new Set(KNOWN_COUNTRIES.map((c) => c.code));
    // UK is an alias for GB rather than an ISO code of its own.
    const missing = lifeExpectancyRegions().filter((c) => c !== 'UK' && !named.has(c));
    expect(missing).toEqual([]);
  });

  it('has no duplicate codes', () => {
    const codes = KNOWN_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('uses the name people say, not the one the standard says', () => {
    expect(countryName('KR')).toBe('South Korea');
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName('ES')).toBe('Spain');
  });

  it('displays an unknown code rather than nothing', () => {
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName('')).toBeNull();
    expect(countryName(null)).toBeNull();
    expect(countryName(undefined)).toBeNull();
  });

  it('lowercases and trims what was stored', () => {
    expect(countryName(' es ')).toBe('Spain');
    expect(countryName('es')).toBe('Spain');
  });
});

describe('finding your country by typing', () => {
  it('finds Spain from three letters', () => {
    expect(searchCountries('spa').map((c) => c.code)).toContain('ES');
  });

  it('ranks a prefix above a substring — "in" is India, not Argentina', () => {
    expect(searchCountries('in')[0].code).toBe('IN');
  });

  it('ignores accents in both directions', () => {
    expect(searchCountries('turkiye').map((c) => c.code)).toContain('TR');
    expect(searchCountries('cote').map((c) => c.code)).toContain('CI');
  });

  it('accepts the ISO code from people who know it', () => {
    expect(searchCountries('pt')[0].code).toBe('PT');
  });

  it('returns nothing for an empty query rather than the whole world', () => {
    expect(searchCountries('')).toEqual([]);
    expect(searchCountries('   ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchCountries('a', 3).length).toBeLessThanOrEqual(3);
  });

  it('finds nothing for a query that matches nothing', () => {
    expect(searchCountries('qqqqq')).toEqual([]);
  });
});

/**
 * "Where you live" was a bare box with one timezone-derived chip beside it,
 * directly above a country field that had a searchable list — two answers to
 * one question. The suggestions are scoped by that country field.
 */
describe('finding your city', () => {
  it('suggests inside the country that was chosen', () => {
    expect(searchCities('kol', 'IN')).toContain('Kolkata');
    expect(searchCities('vig', 'ES')).toContain('Vigo');
  });

  it('does not offer another country’s cities', () => {
    expect(searchCities('kol', 'ES')).toEqual([]);
    expect(searchCities('vig', 'IN')).toEqual([]);
  });

  /* Birmingham is in England and in Alabama; with no country the app cannot
     tell which is meant, and a list that guesses is worse than no list. */
  it('says nothing at all when no country is known', () => {
    expect(searchCities('lon', null)).toEqual([]);
    expect(searchCities('lon', '')).toEqual([]);
    expect(searchCities('lon', 'ZZ')).toEqual([]);
  });

  it('offers the country’s best-known cities before anything is typed', () => {
    const out = searchCities('', 'IN');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('Mumbai');
  });

  it('ranks a prefix above a substring', () => {
    const out = searchCities('man', 'GB');
    expect(out[0]).toBe('Manchester');
  });

  it('ignores case and accents', () => {
    expect(searchCities('MUMBAI', 'IN')).toContain('Mumbai');
    expect(searchCities('sao', 'BR')).toContain('Sao Paulo');
  });

  it('respects the limit', () => {
    expect(searchCities('', 'US', null, 3).length).toBe(3);
  });

  it('only lists cities for countries the app can actually hold', () => {
    const known = new Set(KNOWN_COUNTRIES.map((c) => c.code));
    for (const code of Object.keys(CITIES_BY_COUNTRY)) expect(known).toContain(code);
  });

  it('has no empty city lists — an empty list is a broken promise', () => {
    for (const [code, cities] of Object.entries(CITIES_BY_COUNTRY)) {
      expect(cities.length, code).toBeGreaterThan(0);
      expect(new Set(cities).size, code).toBe(cities.length);
    }
  });
});

/**
 * The defect: a reader in Ranchi typed their own city into a box backed by
 * ten Indian cities and got nothing. Ten cities for a country of a billion
 * is not a shortlist, it is a rounding error — so the question is asked the
 * way an address is written, country then state then city.
 */
describe('the state between a country and a city', () => {
  it('knows Ranchi now, which is the whole point', () => {
    expect(searchCities('ranch', 'IN')).toContain('Ranchi');
    expect(regionOfCity('IN', 'Ranchi')).toBe('Jharkhand');
  });

  it('narrows the cities to the state that was chosen', () => {
    expect(searchCities('', 'IN', 'Jharkhand')).toContain('Ranchi');
    expect(searchCities('', 'IN', 'Kerala')).not.toContain('Ranchi');
  });

  it('offers every state, because a partial list reads as "you do not live anywhere"', () => {
    // 28 states + 8 union territories.
    expect(regionsOf('IN')).toHaveLength(36);
    // 50 states + the District of Columbia.
    expect(regionsOf('US')).toHaveLength(51);
    expect(regionsOf('CA')).toHaveLength(13);
    expect(regionsOf('AU')).toHaveLength(8);
    expect(regionsOf('GB')).toHaveLength(4);
    expect(regionsOf('DE')).toHaveLength(16);
  });

  it('has no middle step for a country it does not know, rather than an empty one', () => {
    expect(regionsOf('BR')).toEqual([]);
    expect(searchRegions('sao', 'BR')).toEqual([]);
    expect(regionOfCity('BR', 'Sao Paulo')).toBeNull();
  });

  it('still finds cities in those countries, exactly as before', () => {
    expect(searchCities('sao', 'BR')).toContain('Sao Paulo');
    expect(searchCities('vig', 'ES')).toContain('Vigo');
  });

  it('finds a state by typing part of it', () => {
    expect(searchRegions('jhar', 'IN')).toEqual(['Jharkhand']);
    expect(searchRegions('tamil', 'IN')).toEqual(['Tamil Nadu']);
    expect(searchRegions('cal', 'US')).toContain('California');
  });

  it('lists them all before anything is typed — a state has siblings, not peers', () => {
    expect(searchRegions('', 'IN', 40)).toHaveLength(36);
  });

  it('keeps the flat list reachable when no state is chosen', () => {
    // Mumbai is in both sources; Ranchi is only in the regional one.
    const all = citiesIn('IN');
    expect(all).toContain('Mumbai');
    expect(all).toContain('Ranchi');
    expect(new Set(all).size).toBe(all.length);
  });

  it('says nothing for a state that is not in the country', () => {
    expect(searchCities('', 'IN', 'California')).toEqual([]);
  });

  it('ignores case and spacing in a state name', () => {
    expect(searchCities('', 'IN', '  tamil nadu  ')).toContain('Chennai');
  });

  it('only names regions for countries the app can actually hold', () => {
    const known = new Set(KNOWN_COUNTRIES.map((c) => c.code));
    for (const code of Object.keys(REGIONS_BY_COUNTRY)) expect(known).toContain(code);
  });

  it('has no empty region, and no duplicate city inside one', () => {
    for (const [code, regions] of Object.entries(REGIONS_BY_COUNTRY)) {
      for (const [name, cities] of Object.entries(regions)) {
        expect(cities.length, `${code}/${name}`).toBeGreaterThan(0);
        expect(new Set(cities).size, `${code}/${name}`).toBe(cities.length);
      }
    }
  });
});
