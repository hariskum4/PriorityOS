/**
 * The evidence layer is load-bearing or it is decoration.
 *
 * Three contracts, each with a failure message that names the offender:
 *
 *   **Every entry has a receipt.** A rhythm, rung or lever added without an
 *   evidence record fails here before any user sees an unreceipted card.
 *   `folk` passes — the rule is honesty, not citations for everything.
 *
 *   **Every receipt points at something real.** Rungs are keyed by their
 *   exact titles, which the catalogs already promise to keep stable; a
 *   renamed rung orphans its receipt and this names it. This is the same
 *   promise domainLadder.ts makes in prose, turned into a test.
 *
 *   **Every grade follows the honesty rules.** A/B/C must say where the
 *   evidence lives; folk must say why it is kept anyway. An empty receipt
 *   is worse than none — it looks like diligence.
 */

import { describe, expect, it } from 'vitest';
import { rhythmDomains, rhythmsFor } from './rhythms';
import { domainLadder } from './domainLadder';
import { healthspan } from './lifeStrategy';
import { EVIDENCE, PROPOSED } from './evidence';

/** Every identity the catalogs currently ship. */
function catalogIdentities(): Set<string> {
  const ids = new Set<string>();
  for (const domain of rhythmDomains()) {
    for (const rhythm of rhythmsFor(domain)) ids.add(rhythm.key);
    for (const rung of domainLadder(domain)) ids.add(rung.title);
  }
  for (const lever of healthspan(35).levers) ids.add(`lever.${lever.key}`);
  return ids;
}

describe('evidence bank', () => {
  it('covers a catalog that actually exists', () => {
    // Guards the loops below against silently passing over nothing.
    expect(rhythmDomains().length).toBe(12);
    expect(healthspan(35).levers.length).toBeGreaterThanOrEqual(4);
  });

  it('has a receipt for every rhythm, rung and lever', () => {
    const missing = [...catalogIdentities()].filter((id) => !(id in EVIDENCE));
    expect(
      missing,
      `Catalog entries without evidence records (add them to evidence.ts, ` +
        `'folk' with a note is allowed): ${missing.join(' | ')}`,
    ).toEqual([]);
  });

  it('has no orphaned receipts', () => {
    const known = catalogIdentities();
    const orphans = Object.keys(EVIDENCE).filter((id) => !known.has(id));
    expect(
      orphans,
      `Evidence records that match no catalog entry — a typo here, or a ` +
        `renamed rung there. Deliberate forward-stubs belong in PROPOSED: ` +
        `${orphans.join(' | ')}`,
    ).toEqual([]);
  });

  it('keeps proposed stubs out of the live bank until their entries ship', () => {
    const known = catalogIdentities();
    const shippedEarly = Object.keys(PROPOSED).filter((id) => known.has(id));
    expect(
      shippedEarly,
      `These catalog entries now exist — move their records from PROPOSED ` +
        `into the live bank: ${shippedEarly.join(' | ')}`,
    ).toEqual([]);
  });

  it('follows the honesty rules: graded claims cite, folk explains', () => {
    const offenders: string[] = [];
    for (const [id, ev] of Object.entries({ ...EVIDENCE, ...PROPOSED })) {
      if (ev.grade === 'folk') {
        if (!ev.note) offenders.push(`${id} (folk without a note)`);
      } else {
        if (!ev.source) offenders.push(`${id} (${ev.grade} without a source)`);
      }
    }
    expect(offenders, offenders.join(' | ')).toEqual([]);
  });
});
