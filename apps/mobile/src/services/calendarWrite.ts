import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { momentToIcs, icsFilename } from '@priority/scoring-engine';

/**
 * Moments, written to the device calendar — the first thing this app ever
 * writes there, and deliberately so.
 *
 * `calendarFree.ts` says read-only, always, on the grounds that "a calendar
 * the app maintains is exactly the manual entry that killed the personal-CRM
 * generation". That rule is right and it is about plans: a calendar full of
 * intentions somebody has to keep current is a chore, and chores get
 * abandoned in about three months.
 *
 * A kept moment is not a plan. It happened. There is nothing to keep current,
 * nothing to reschedule, nothing that goes stale — it is an entry in a record,
 * and a record is the one thing a calendar is genuinely good at holding. So
 * the reading half of that rule stands unchanged, and this is the narrow
 * exception, named rather than smuggled.
 *
 * Three rules it does not bend:
 *
 *   **Its own calendar, never yours.** Writing into whatever
 *   `getDefaultCalendarAsync` returns would put somebody's private archive on
 *   whichever calendar their phone happens to default to — frequently a
 *   shared family or work one. "Called Amma" appearing on a spouse's phone is
 *   not a feature. This finds or creates a local-only calendar named for the
 *   app, so the events are the reader's to see, hide or delete as a block.
 *
 *   **Titles only.** The account, the conversation and the keepsake never
 *   leave. Those are the prose the archive exists for, and a calendar entry
 *   is read over shoulders, shown on lock screens and synced by anything the
 *   phone is signed into. What goes across is the same one line the archive
 *   already shows as a heading.
 *
 *   **Off until asked.** Copying a journal into the device calendar without
 *   being told to is the kind of helpfulness nobody consents to.
 */

export const CALENDAR_WRITE_KEY = 'priority.calendarWrite';
const CALENDAR_TITLE = 'Priority moments';

export type CalendarWriteState =
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'ready'; calendarId: string };

/**
 * Both platforms can put a moment on a calendar; only one can do it silently.
 *
 * The first version made this iOS/Android only and hid the whole feature in a
 * browser, on the house rule that a button which cannot work is worse than no
 * button. That rule is right about *dead* buttons — and what it produced here
 * was a capability invisible in the only place it was being reviewed, which
 * nobody can judge and nobody can sign off.
 *
 * A browser genuinely has no device calendar to write into. What it does have
 * is the file every calendar application imports, so the web route is a
 * download rather than a background write: same destination, the way each
 * platform can actually reach it.
 */
export const canWriteToDeviceCalendar = Platform.OS === 'ios' || Platform.OS === 'android';
export const calendarWriteSupported = true;

/**
 * Whether the reader has turned this on. Off unless explicitly stored.
 *
 * Not `services/storage`, which is SecureStore on a device — the keychain,
 * meant for the two tokens and carrying per-item size limits. `cache.ts`
 * makes the same call for the same reason: an ordinary device preference is
 * ordinary application data.
 */
const store = {
  get: (k: string): Promise<string | null> => (Platform.OS === 'web'
    ? Promise.resolve(window.localStorage.getItem(k))
    : AsyncStorage.getItem(k)),
  set: (k: string, v: string): Promise<void> => (Platform.OS === 'web'
    ? Promise.resolve(window.localStorage.setItem(k, v))
    : AsyncStorage.setItem(k, v)),
  remove: (k: string): Promise<void> => (Platform.OS === 'web'
    ? Promise.resolve(window.localStorage.removeItem(k))
    : AsyncStorage.removeItem(k)),
};

export async function calendarWriteEnabled(): Promise<boolean> {
  return (await store.get(CALENDAR_WRITE_KEY)) === '1';
}

/**
 * Hand a browser the file, which is the only thing a browser can be handed.
 *
 * Nothing is uploaded and nothing is asked for: the document is built in the
 * page and offered as a download, so a moment reaches a calendar without a
 * permission, a server round trip, or an account anywhere.
 */
function downloadIcs(moment: { title: string; occurredAt: string | Date }): boolean {
  try {
    const blob = new Blob([momentToIcs(moment)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFilename(moment);
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Revoked on the next tick: same-tick revocation cancels the download in
       some browsers, and never revoking leaks the blob for the session. */
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

export async function setCalendarWriteEnabled(on: boolean): Promise<void> {
  if (on) await store.set(CALENDAR_WRITE_KEY, '1');
  else await store.remove(CALENDAR_WRITE_KEY);
}

/**
 * Find the app's own calendar, or make one.
 *
 * Matched by title rather than by a stored id, because an id kept in app
 * storage outlives the calendar it names: delete the calendar in the phone's
 * own settings and every later write fails against something that no longer
 * exists. The title is the durable handle.
 */
async function ensureCalendar(Calendar: any): Promise<string> {
  const existing: Array<{ id: string; title: string }> =
    await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const mine = existing.find((c) => c.title === CALENDAR_TITLE);
  if (mine) return mine.id;

  /* A local source, so nothing syncs anywhere by default. On iOS the local
     source has to be borrowed from an existing calendar; on Android it is
     described outright. */
  if (Platform.OS === 'android') {
    return Calendar.createCalendarAsync({
      title: CALENDAR_TITLE,
      name: CALENDAR_TITLE,
      color: '#A97742',
      entityType: Calendar.EntityTypes.EVENT,
      source: { isLocalAccount: true, name: CALENDAR_TITLE, type: 'LOCAL' },
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  const local = existing.find((c: any) => c.source?.type === 'Local' || c.allowsModifications);
  return Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    color: '#A97742',
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: (local as any)?.source?.id,
  });
}

/**
 * Put one kept moment on the calendar, on the day it happened.
 *
 * All-day, because a memory has a date and not an hour — the archive never
 * asked what time the call was, and inventing 9am to fill a field would be
 * the app making something up about somebody's evening.
 *
 * Returns null rather than throwing on every failure path. A calendar write
 * is a courtesy attached to saving a moment; the moment is already safe in
 * the archive, and taking the save down because a phone refused a permission
 * would trade the thing that matters for the thing that does not.
 */
export async function writeMemoryToCalendar(memory: {
  title: string;
  occurredAt: string | Date;
}): Promise<string | null> {
  if (!(await calendarWriteEnabled())) return null;

  /* A download is a visible act, so it happens on request rather than as a
     side effect of saving — `addMomentToCalendar` below is the web door. */
  if (!canWriteToDeviceCalendar) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Calendar = require('expo-calendar');
    /* Writing needs its own grant. The read path asks for its own and one
       does not imply the other. */
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return null;

    const calendarId = await ensureCalendar(Calendar);
    const day = new Date(memory.occurredAt);
    if (Number.isNaN(day.getTime())) return null;
    day.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setDate(end.getDate() + 1);

    return await Calendar.createEventAsync(calendarId, {
      title: memory.title,
      startDate: day,
      endDate: end,
      allDay: true,
      /* No notes field on purpose — see the titles-only rule above. */
      timeZone: Calendar.DEFAULT ?? undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Ask for the grant and prove a calendar can be made, before promising
 * anything. Turning a switch on and finding out days later that nothing was
 * ever written is worse than being told no at the moment of asking.
 */
/**
 * The explicit "put this one on my calendar" action.
 *
 * On a phone this writes into the app's own calendar. In a browser it hands
 * over a file. Both are the reader asking for one specific moment, which is
 * why this exists beside the automatic path rather than instead of it.
 */
export async function addMomentToCalendar(moment: {
  title: string; occurredAt: string | Date;
}): Promise<boolean> {
  if (!canWriteToDeviceCalendar) return downloadIcs(moment);
  const state = await prepareCalendarWrite();
  if (state.status !== 'ready') return false;
  /* Bypasses the preference: this is a direct request, not the background
     behaviour the toggle governs. */
  const previous = await calendarWriteEnabled();
  if (!previous) await setCalendarWriteEnabled(true);
  const id = await writeMemoryToCalendar(moment);
  if (!previous) await setCalendarWriteEnabled(false);
  return !!id;
}

export async function prepareCalendarWrite(): Promise<CalendarWriteState> {
  if (!canWriteToDeviceCalendar) return { status: 'unsupported' };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Calendar = require('expo-calendar');
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return { status: 'denied' };
    return { status: 'ready', calendarId: await ensureCalendar(Calendar) };
  } catch {
    return { status: 'denied' };
  }
}
