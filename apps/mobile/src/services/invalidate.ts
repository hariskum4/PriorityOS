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
  ['dashboard'],
  ['memories-otd'],
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
