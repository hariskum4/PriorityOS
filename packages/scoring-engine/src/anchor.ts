/**
 * "After X, Y" — the cheapest large effect in the behaviour-change literature.
 *
 * Implementation intentions are a when-where-how plan made before the moment
 * arrives, and across ninety-four studies they move follow-through by about
 * d = 0.65 (Gollwitzer & Sheeran 2006). Nothing else in this engine is that
 * well-supported for that little work — and the app was most of the way there
 * already without saying the sentence out loud. Every rhythm carries a `when`,
 * the day card computes where it lands, and the profile knows when work starts
 * and when the lights go out. All that was missing was handing the reader the
 * if-then.
 *
 * Two rules, both about not saying it badly:
 *
 *   **The anchor must be a thing that actually happens to this person.** Not
 *   "after breakfast" for somebody who does not eat it, and not "after work"
 *   on a day they do not work. Anchors are derived from hours the profile
 *   really holds; where it holds none, this says nothing.
 *
 *   **The action has to survive being put after a comma.** Catalog titles are
 *   written to read alone on a card — "Move three times a week", "Five quiet
 *   minutes, daily" — and a frequency glued to an anchor produces "After work,
 *   Move three times a week", which is not a sentence anybody would say. So
 *   the if-then half is written by hand per rhythm, in `anchorTemplate`, and
 *   a rhythm without one gets no anchor rather than an awkward one.
 *
 * The result is a sentence, not a schedule. It is shown at the moment somebody
 * takes a rhythm on, which is when a plan is worth making and the only moment
 * the literature says it does anything. Never a reminder, never a lecture.
 */

import type { TimeOfDay } from './rhythms';

/** The hours a day is pinned to, as the profile holds them. */
export interface DayAnchors {
  /** Hour of the day they wake, 0–23. */
  wakeHour?: number | null;
  /** Hour work starts and ends. Absent on somebody not working. */
  workStartHour?: number | null;
  workEndHour?: number | null;
  /** Hour the lights go out. */
  sleepHour?: number | null;
  /** False on a rest day — "after work" is not an anchor on a Sunday. */
  isWorkday?: boolean;
}

export interface AnchorInput {
  /** The part of the day this belongs to — the catalog already carries it. */
  when?: TimeOfDay;
  /**
   * The action, phrased to follow "After X, …".
   *
   * Lower case, no full stop, no frequency: "put the mat down", "call home".
   * Absent means this rhythm has no good if-then and will be given none.
   */
  anchorTemplate?: string;
}

/** What the sentence was built from, so a caller can show its workings. */
export interface Anchor {
  /** The whole sentence: "After you shut the laptop, call home." */
  sentence: string;
  /** Just the anchor half, for a caller that has its own phrasing. */
  after: string;
  /** Which hour it was pinned to, when it was pinned to one. */
  hour: number | null;
}

const hourWord = (h: number): string => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'am' : 'pm'}`;
};

/**
 * The anchor for a part of the day, from hours this person actually keeps.
 *
 * Ordered by how reliably each event happens. Waking is the most dependable
 * thing anybody does; the end of the working day is close behind and only on
 * days there is one. Where nothing dependable exists the answer is null, and
 * the caller says nothing — an if-then pinned to an event that does not occur
 * is worse than no plan, because it fails silently and takes the reader's
 * confidence with it.
 */
function anchorPhrase(when: TimeOfDay | undefined, day: DayAnchors): { after: string; hour: number | null } | null {
  const working = day.isWorkday !== false;
  const { wakeHour, workStartHour, workEndHour, sleepHour } = day;

  switch (when) {
    case 'morning':
      if (wakeHour != null) return { after: 'you get up', hour: wakeHour };
      return null;

    case 'work':
      if (working && workStartHour != null) return { after: 'you start work', hour: workStartHour };
      return null;

    case 'midday':
      /* The middle of a working day is anchored to work, because lunch is the
         least reliable event in anybody's day and the one most often skipped. */
      if (working && workStartHour != null) {
        return { after: `${hourWord((workStartHour + 4) % 24)}`, hour: (workStartHour + 4) % 24 };
      }
      return null;

    case 'evening':
      if (working && workEndHour != null) return { after: 'you finish work', hour: workEndHour };
      if (sleepHour != null) return { after: 'the evening starts', hour: (sleepHour + 21) % 24 };
      return null;

    case 'bedtime':
      if (sleepHour != null) return { after: 'the last thing is put away', hour: sleepHour };
      return null;

    /* 'any' and 'allday' are deliberately unanchored. A thing that fits
       anywhere has no natural cue, and inventing one would be the app
       pretending to know a day it has not been told about. */
    default:
      return null;
  }
}

/**
 * The if-then sentence for a rhythm, or null when one cannot be said honestly.
 *
 * Null is a real and frequent answer. It means either the rhythm has no
 * hand-written action phrase or this person's day holds no dependable cue for
 * that part of it — and in both cases the correct behaviour is silence.
 */
export function anchorFor(rhythm: AnchorInput, day: DayAnchors): Anchor | null {
  const action = (rhythm.anchorTemplate ?? '').trim();
  if (!action) return null;

  const anchor = anchorPhrase(rhythm.when, day);
  if (!anchor) return null;

  const sentence = `After ${anchor.after}, ${action}.`;
  return { sentence, after: anchor.after, hour: anchor.hour };
}
