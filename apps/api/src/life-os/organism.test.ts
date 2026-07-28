/**
 * The organism makes claims about someone's life in a form they cannot check.
 *
 * Nobody can look at a limb and verify it holds forty-one acts. So the
 * properties that make the picture honest — that it is deterministic, that
 * thickness is conserved, that more attention really does reach further — have
 * to be held by tests rather than by eye.
 */
import { describe, it, expect } from 'vitest';
import { renderOrganism, OrganismDomain } from './organism';

const domain = (over: Partial<OrganismDomain> & { domainType: string }): OrganismDomain => ({
  importance: 50,
  attention: 50,
  acts: 10,
  net: 0,
  color: '#5B9BE8',
  ...over,
});

const TWELVE = [
  'partner', 'family', 'children', 'friends', 'finance', 'career',
  'impact', 'reflection', 'purpose', 'health', 'experiences', 'growth',
].map((domainType) => domain({ domainType }));

/** The field is a few million cell updates; off unless a test is about it. */
const fast = { field: false as const };

function tipRadii(svg: string): number[] {
  const cx = 700;
  const cy = 700;
  return [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="1\.7"/g)]
    .map((m) => Math.hypot(Number(m[1]) - cx, Number(m[2]) - cy));
}

describe('renderOrganism', () => {
  it('is deterministic — the same life draws the same organism', () => {
    const a = renderOrganism(TWELVE, { seed: 7, ...fast });
    const b = renderOrganism(TWELVE, { seed: 7, ...fast });
    expect(a).toBe(b);
  });

  it('changes when the life changes', () => {
    const busier = TWELVE.map((d) => (d.domainType === 'career' ? { ...d, acts: 90 } : d));
    expect(renderOrganism(busier, { seed: 7, ...fast }))
      .not.toBe(renderOrganism(TWELVE, { seed: 7, ...fast }));
  });

  it('grows a limb for every domain it is given', () => {
    const svg = renderOrganism(TWELVE, { seed: 7, ...fast });
    for (const d of TWELVE) expect(svg).toContain(d.color);
  });

  it('ignores domains it has no place for rather than throwing', () => {
    const svg = renderOrganism(
      [...TWELVE, domain({ domainType: 'not-a-domain', color: '#FFFFFF' })],
      { seed: 7, ...fast },
    );
    expect(svg).not.toContain('#FFFFFF');
  });

  it('returns nothing at all for an empty life instead of half a drawing', () => {
    expect(renderOrganism([], { seed: 7, ...fast })).toBe('');
  });

  it('reaches further when attention is higher', () => {
    const fed = renderOrganism([domain({ domainType: 'family', attention: 95 })], { seed: 3, ...fast });
    const starved = renderOrganism([domain({ domainType: 'family', attention: 10 })], { seed: 3, ...fast });
    expect(Math.max(...tipRadii(fed))).toBeGreaterThan(Math.max(...tipRadii(starved)));
  });

  it('keeps every limb inside the canvas however much attention is claimed', () => {
    const svg = renderOrganism(
      TWELVE.map((d) => ({ ...d, attention: 100, importance: 100, acts: 100 })),
      { seed: 7, ...fast },
    );
    // R_MAX is 590 from a centre at 700.
    expect(Math.max(...tipRadii(svg))).toBeLessThanOrEqual(590);
  });

  it('conserves thickness: no limb is thicker than the trunk it hangs from', () => {
    const svg = renderOrganism([domain({ domainType: 'family', acts: 60 })], { seed: 11, ...fast });
    const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    // Murray's law is capped at 7 in the renderer; nothing may exceed it.
    expect(Math.max(...widths)).toBeLessThanOrEqual(7);
    expect(widths.length).toBeGreaterThan(5);
  });

  it('paints no ground when asked for none, so the page shows through', () => {
    const clear = renderOrganism(TWELVE, { seed: 7, ground: 'transparent', ...fast });
    expect(clear).not.toContain('<rect');
    const opaque = renderOrganism(TWELVE, { seed: 7, ground: '#070B12', ...fast });
    expect(opaque).toContain('<rect');
  });

  it('draws the same organism in either sky', () => {
    /**
     * The dark sky adds a starfield the parchment one omits. If that consumed
     * random numbers the two skies would diverge and one life would grow two
     * different bodies depending on the theme — so the generator burns the
     * same draws either way. This is the test that keeps that true.
     */
    const limbs = (svg: string) => (svg.match(/<path d="M[^"]+"/g) ?? []).join('\n');
    const dark = renderOrganism(TWELVE, { seed: 7, ground: '#070B12', ...fast });
    const light = renderOrganism(TWELVE, { seed: 7, ground: 'transparent', dust: null, ...fast });
    expect(limbs(light)).toBe(limbs(dark));
    expect(limbs(dark).length).toBeGreaterThan(0);
  });

  it('runs the Turing field and embeds it as one image', () => {
    const svg = renderOrganism(TWELVE, { seed: 7, field: true, fieldSize: 48, fieldSteps: 40 });
    expect(svg).toContain('<image href="data:image/png;base64,');
    expect((svg.match(/<image /g) ?? []).length).toBe(1);
  });
});
