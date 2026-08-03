/**
 * Refreshing the views that are *derived* from a life, not stored in it.
 *
 * Completing a mission, logging a call, keeping a moment — each of these
 * writes one row and changes four screens: the year grid on the Time tab, the
 * list of years holding anything, the twelve-week drift behind the
 * constellation, and the record document. None of those were ever invalidated
 * by anything, so a person could complete the last action in a domain, watch
 * the XP land, open the year grid and find the day still empty. The data was
 * right; the screen was months of cache old.
 *
 * `timeline-years` was cached for ten minutes and `life-drift` for thirty, so
 * this was not a brief flicker of staleness — it was the app quietly disagreeing
 * with itself for the length of a sitting.
 *
 * One list, called from every write, so a screen added next year cannot forget
 * one of them.
 */
import type { QueryClient } from '@tanstack/react-query';

/** Everything that is a *view* of the record rather than a part of it. */
const DERIVED_KEYS = [
  ['timeline'],        // one year as days — prefix match covers every year
  ['timeline-years'],  // which years hold anything
  ['life-drift'],      // twelve weeks behind the constellation
  ['life-document'],   // the Record
  ['life-organism'],   // the drawing, which is grown from the same acts
  ['life-rhythm'],     // how often each domain is touched, and what it holds
  ['dashboard'],
  ['memories-otd'],
  // Steal the time is ranked from attention shares and filtered by what is
  // already planned, so every one of these writes changes what it should say.
  ['life-stacks'],
  /**
   * And the cycle, for exactly the same reason — which it was missing.
   *
   * Completing a mission refreshed the stacks and left today's proposals
   * cached for another five minutes, so the day card went on offering an hour
   * for something already finished. The stacks half of that card was filtered
   * and the cycle half was not, so the one that stayed stale was also the one
   * with nothing checking it.
   */
  ['life-os-today'],
];

/**
 * Call after any write that adds a dated act to the record: a completed
 * mission, a logged contact, a kept memory, a journal entry.
 */
export function invalidateLifeRecord(qc: QueryClient) {
  for (const queryKey of DERIVED_KEYS) {
    qc.invalidateQueries({ queryKey });
  }
}
