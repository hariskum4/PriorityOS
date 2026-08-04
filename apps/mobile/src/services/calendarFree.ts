import { Platform } from 'react-native';
import { freeGaps, bestGap, type FreeGap } from '@priority/scoring-engine';

/**
 * Today's holes, read from the device calendar.
 *
 * Read-only, always. A calendar the app maintains is exactly the manual
 * entry that killed the personal-CRM generation; a calendar it glances at
 * is a different promise, and this never writes, creates or deletes.
 *
 * Nothing about a meeting leaves the device. Titles are discarded on the
 * way in — the gaps are the only part this needs, and holding somebody's
 * meeting names to compute a subtraction would be collecting data for the
 * sake of having collected it.
 *
 * Unavailable on web by design: a browser has no device calendar, so the
 * manual sheet stays the whole feature there rather than showing a button
 * that cannot work.
 */

export type CalendarState =
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'ready'; gaps: FreeGap[]; best: FreeGap | null };

/** True only where a device calendar can exist at all. */
export const calendarSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Ask, read, subtract.
 *
 * Required rather than imported at the top, and only after the platform
 * check, so a browser never executes a line of it. Metro still bundles
 * the module for web — it resolves `require` statically — but nothing in
 * it runs, which is what matters for a device API that has no browser
 * equivalent.
 */
export async function readFreeGaps(opts: {
  workStartHour: number;
  workEndHour: number;
  minMinutes?: number;
  now?: Date;
}): Promise<CalendarState> {
  if (!calendarSupported) return { status: 'unsupported' };

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Calendar = require('expo-calendar');
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return { status: 'denied' };

    const now = opts.now ?? new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    /* `require` gives no types, so the shapes this actually depends on are
       named here rather than left implicit. */
    const calendars: Array<{ id: string }> =
      await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const events = await Calendar.getEventsAsync(
      calendars.map((c: { id: string }) => c.id),
      dayStart,
      dayEnd,
    );

    const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
    type RawEvent = { allDay?: boolean; startDate: string | Date; endDate: string | Date };
    const busy = (events as RawEvent[])
      /* All-day blocks say nothing about which hours are spoken for, and
         treating one as a full day would report a free day as solid. */
      .filter((e) => !e.allDay)
      .map((e) => ({
        startMinutes: minutesOf(new Date(e.startDate)),
        endMinutes: minutesOf(new Date(e.endDate)),
      }));

    const gaps = freeGaps({
      busy,
      fromMinutes: opts.workStartHour * 60,
      toMinutes: opts.workEndHour * 60,
      minMinutes: opts.minMinutes,
      nowMinutes: minutesOf(now),
    });
    return { status: 'ready', gaps, best: bestGap(gaps) };
  } catch {
    /* A calendar that will not open is not an error worth a screen. The
       manual sheet is right there and asks one question. */
    return { status: 'denied' };
  }
}
