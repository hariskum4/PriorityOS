/**
 * One kept moment, as a calendar file.
 *
 * The device path writes straight into a local calendar, which a browser
 * cannot do — there is no device calendar behind a web page and no permission
 * that would grant one. The honest web equivalent is the file every calendar
 * application already imports, so a moment reaches a calendar on both, by the
 * route each platform actually has.
 *
 * Which matters more than it sounds. The first version hid the whole feature
 * on web, following the house rule that a button which cannot work is worse
 * than no button — correct, and it made the feature invisible in the only
 * place it was being reviewed. A capability nobody can see is a capability
 * nobody can judge.
 *
 * Same two rules as the device path, for the same reasons. All-day, because a
 * memory has a date and not an hour and inventing nine o'clock would be the
 * app making something up. Title only: the account, the conversation and the
 * keepsake stay in the archive, because a calendar entry is read over
 * shoulders and synced by whatever the reader is signed into.
 *
 * Deliberately not a library. RFC 5545 for a single all-day VEVENT is a dozen
 * lines, and the escaping rules below are the entire reason a dependency
 * would have been worth considering.
 */

/** `YYYYMMDD`, in local time, which is what an all-day DATE value means. */
function dateStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** `YYYYMMDDTHHMMSSZ` for DTSTAMP, which is UTC by specification. */
function utcStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * The escaping the format requires, and the reason this is hand-written.
 *
 * A comma or a semicolon in a title is a field separator to a parser, and a
 * newline ends the property — so "Dinner with Amma, then the long walk" would
 * arrive truncated at the comma, or corrupt the file outright. Backslash goes
 * first or it escapes the escapes.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Lines are folded at 75 octets by the specification, and a title long enough
 * to need it is a title somebody wrote by hand. Continuations begin with one
 * space, which the parser removes.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

export interface IcsMoment {
  title: string;
  occurredAt: string | Date;
  /** Stable across regenerations, so re-importing replaces rather than duplicates. */
  id?: string;
}

/**
 * A complete `.ics` document for one moment.
 *
 * CRLF throughout, because the specification says so and some importers are
 * strict about it — a file joined with bare newlines is rejected by Outlook
 * while looking fine everywhere else, which is the worst kind of bug to find
 * later.
 */
export function momentToIcs(moment: IcsMoment): string {
  const day = new Date(moment.occurredAt);
  if (Number.isNaN(day.getTime())) throw new Error('occurredAt is not a date');
  const next = new Date(day);
  next.setDate(next.getDate() + 1);

  /* DTEND is exclusive for an all-day event: a one-day moment ends on the
     following date, and using the same date produces a zero-length event that
     some calendars silently drop. */
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Priority//Moments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${moment.id ?? `${dateStamp(day)}-${Math.abs(hash(moment.title))}`}@priority.app`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${dateStamp(day)}`,
    `DTEND;VALUE=DATE:${dateStamp(next)}`,
    `SUMMARY:${escapeText(moment.title)}`,
    /* No DESCRIPTION. See the title-only rule above. */
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** A filename somebody can find again in a downloads folder. */
export function icsFilename(moment: IcsMoment): string {
  const slug = moment.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'moment';
  return `${dateStamp(new Date(moment.occurredAt))}-${slug}.ics`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
