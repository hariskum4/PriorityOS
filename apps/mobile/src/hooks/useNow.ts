/**
 * The clock, kept — rather than read once and believed forever.
 *
 * Screens here decide real things from the time: whether the seven o'clock
 * hour is still ahead of you, which weekday the strip should light, what
 * "today" means to a mission that is about to be written. All of it was
 * `new Date()` at render, and a React screen renders when its data changes,
 * not when the world moves. So the number went stale the instant it was read
 * and stayed stale until something unrelated happened to force a repaint.
 *
 * Two ways that surfaced, both of them found by a reader rather than a test:
 *
 *  - The day card offers to put a block on the list. Open the app at 6:55,
 *    set the phone down, pick it up at 8:30: the seven o'clock block still
 *    said "Add to today", and tapping it wrote a mission due ninety minutes
 *    ago — a failure handed to somebody who had done nothing wrong. The
 *    passed-hour check was correct; the clock underneath it was not.
 *
 *  - Held open across midnight, the whole screen kept yesterday. Same day
 *    highlighted in the week strip, same "today" on the ticks, same date in
 *    the greeting — until some unrelated tap forced a render and half of it
 *    silently became tomorrow while the fetched data stayed behind.
 *
 * So: one subscription to the minute, and everything that depends on the time
 * derives from it. A minute is the coarsest tick that can still be right —
 * the finest thing any screen shows is an hour boundary, and a second hand
 * would cost sixty renders to change nothing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

export interface Now {
  /** Minutes past local midnight. */
  minutes: number;
  /** Local weekday, 0 = Sunday, matching `Date.getDay`. */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** The local calendar day as a stable string. Changes exactly at midnight. */
  dayKey: string;
  /** The moment itself, for the few things that need more than the above. */
  date: Date;
}

const MINUTE = 60_000;

/**
 * A quarter second past the boundary, not on it.
 *
 * Timers fire a hair early often enough to matter: land at 06:59:59.998 and
 * the minute read back is the one just left, so the tick is spent and the
 * screen waits another full minute to change. The delay is invisible and the
 * alternative is an off-by-one every so often, in the direction of being late.
 */
const SETTLE_MS = 250;

function read(at: number): Now {
  const date = new Date(at);
  return {
    date,
    minutes: date.getHours() * 60 + date.getMinutes(),
    weekday: date.getDay() as Now['weekday'],
    dayKey: date.toDateString(),
  };
}

export function useNow(): Now {
  const [at, setAt] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    /* Only when the minute has actually turned. Returning the previous value
       keeps both the state and the object below referentially stable, so a
       foreground event inside the same minute costs nothing. */
    const mark = () => setAt((prev) =>
      Math.floor(Date.now() / MINUTE) === Math.floor(prev / MINUTE) ? prev : Date.now());

    /* To the next boundary rather than a flat sixty seconds. An interval
       started at :30 would flip every value on this screen half a minute
       late — for as long as the screen stayed open. */
    const schedule = () => {
      timer = setTimeout(() => { mark(); schedule(); }, MINUTE - (Date.now() % MINUTE) + SETTLE_MS);
    };
    schedule();

    /* Coming back is when the clock is most wrong and least allowed to be.
       A backgrounded tab has its timers throttled to a crawl and a locked
       phone suspends them outright, so the reader who put the app down at
       6:55 and opens it at 8:30 gets the truth on the first frame, not after
       whatever the platform decides the next tick is worth. */
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      clearTimeout(timer);
      mark();
      schedule();
    });

    return () => { clearTimeout(timer); sub?.remove?.(); };
  }, []);

  return useMemo(() => read(at), [at]);
}

/**
 * Midnight is not a repaint — it is different data.
 *
 * Everything the server sent was answered for the day it was asked on: which
 * missions are today's, which rhythms have been kept this week, what the
 * streak stands at. When the date turns under an open app, that data is not
 * stale by a minute, it is about a different day; redrawing it under a new
 * heading would be worse than not redrawing it at all.
 *
 * Mounted once, above the tabs, because the day belongs to the app rather
 * than to whichever screen happens to be in front.
 */
export function useDayRollover(): void {
  const { dayKey } = useNow();
  const qc = useQueryClient();
  const seen = useRef(dayKey);

  useEffect(() => {
    if (seen.current === dayKey) return;
    seen.current = dayKey;
    qc.invalidateQueries();
  }, [dayKey, qc]);
}
