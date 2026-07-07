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

  it('never uses obligation language', () => {
    const forbidden = /\bmust\b|\bshould\b|\bhave to\b|\bdon'?t forget\b|\bfail/i;
    for (const d of ['family', 'health', 'career', 'finance', 'nope']) {
      expect(tinyStep({ title: 'x', domainType: d })).not.toMatch(forbidden);
    }
  });
});
