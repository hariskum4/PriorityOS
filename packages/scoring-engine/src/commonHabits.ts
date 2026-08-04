/**
 * The habits people already have, recognized when they walk in the door.
 *
 * The catalog answers "what should this app offer"; this file answers the
 * opposite question — what somebody meant when they typed a habit of their
 * own. A hand-written habit used to resolve to nothing: no length, no part
 * of day, no sense of what the place has to allow. The day card then padded
 * it to thirty minutes and parked it in the first free gap, which is how
 * "Drink more water" came to look like a half-hour appointment.
 *
 * What people write themselves is not random. Surveys of what gets tracked —
 * resolutions, habit-tracker staples, the daily practices half the world
 * keeps — converge on a couple of dozen things: moving, reading, praying,
 * journaling, drinking water, going to bed on time, staying off the phone.
 * Recognizing those phrasings is most of understanding a new user's list.
 *
 * Rules, in order of the trouble they prevent:
 *
 *   **Match from the front.** `classifyLever` matches keywords anywhere and
 *   is kept away from habits for exactly that reason — "Call Mum on my walk
 *   home" contains "walk" and is not one. A pattern anchored at the start of
 *   the title (after a leading "daily" or "morning") can only match what the
 *   habit is *about*.
 *
 *   **The catalog wins.** This runs only after an exact title match and the
 *   healthspan twins, so nothing here can shadow an entry somebody was
 *   actually offered.
 *
 *   **Abstinence is not an activity.** "No sugar", "quit smoking", "less
 *   scrolling" are kept all day and satisfied by nothing happening. They get
 *   `allday` and stay off the clock; see `TimeOfDay`.
 *
 *   **When unsure, stay silent.** A wrong guess is worse than no opinion —
 *   the two-way learning reads what the person actually does, and a bad
 *   default would sit in its way. Nothing matches "sort the garage", on
 *   purpose.
 */

import type { Rhythm } from './rhythms';

/**
 * One recognized habit: how to spot it, and what it turns out to be.
 *
 * `test` runs against a normalized title — trimmed, lowercased, a leading
 * cadence word ("daily", "morning", "every day") removed. Patterns are
 * anchored at the start; see the file comment for why.
 */
interface Recognized {
  test: RegExp;
  rhythm: Rhythm;
}

/**
 * Leading words that say how often or when, not what.
 *
 * "Daily meditation", "go to the gym" and "gym" are the same habit; cadence
 * lives in `targetPerWeek`, which the person sets separately, and "go to
 * the" is grammar. Stripped one word at a time from the front — never from
 * the middle, so "make the bed" keeps its "the" and "call Mum on my walk
 * home" keeps its walk — until the title leads with the thing itself.
 */
const FILLER =
  /^(?:daily|everyday|every|day|night|nightly|weekly|morning|evening|do|go|to|the|for|a|an|my)\s+/;

const norm = (s: string) => {
  let t = (s ?? '').trim().toLowerCase();
  for (let hit = t.match(FILLER); hit; hit = t.match(FILLER)) {
    t = t.slice(hit[0].length);
  }
  return t.trim();
};

/**
 * The table. Keys are prefixed `common.` so nothing mistakes these for
 * catalog entries — they are readings of somebody else's words, not offers.
 *
 * Durations are typical, deliberately modest, and exist to stop the
 * thirty-minute default from lying; the reader can correct any of them on
 * the card, and what they actually do wins over all of this. `because`
 * lines follow the house rule: the stake, never the guilt.
 */
const COMMON: Recognized[] = [
  // ---- moving -------------------------------------------------------------
  {
    test: /^(?:gym|work\s?out|workout|training|train(?:ing)?\b|exercise)/,
    rhythm: {
      key: 'common.exercise', title: 'Exercise', perWeek: 3, minutes: 45,
      when: 'any', needs: ['canMove'],
      because: 'Nothing else on a list survives a body you stopped maintaining.',
    },
  },
  {
    test: /^(?:run|running|jog|jogging)\b/,
    rhythm: {
      key: 'common.run', title: 'Run', perWeek: 3, minutes: 30,
      when: 'morning', needs: ['canMove'],
      because: 'The engine of every other hour is built in this one.',
    },
  },
  {
    test: /^(?:walk(?:ing)?\b|steps\b|10[,.]?000\s*steps|10k\s*steps)/,
    rhythm: {
      key: 'common.walk', title: 'Walk', perWeek: 5, minutes: 30,
      when: 'any', needs: ['canMove'],
      because: 'The cheapest reset there is — moving and thinking.',
    },
  },
  {
    test: /^(?:yoga|stretch(?:ing)?|mobility)\b/,
    rhythm: {
      key: 'common.stretch', title: 'Stretch', perWeek: 3, minutes: 20,
      when: 'morning', needs: ['canMove'],
      because: 'Range kept now is the moving-freely part of every later year.',
    },
  },

  // ---- the quiet practices ------------------------------------------------
  {
    test: /^(?:meditat|mindful|breath(?:e|ing|work))/,
    rhythm: {
      key: 'common.meditate', title: 'Meditate', perWeek: 7, minutes: 10,
      when: 'morning', needs: ['isPrivate'],
      because: 'A mind gets no maintenance window unless somebody makes one.',
    },
  },
  {
    test: /^(?:pray(?:er|ing)?\b|namaz|salah|rosary|devotion)/,
    rhythm: {
      key: 'common.prayer', title: 'Prayer', perWeek: 7, minutes: 10,
      when: 'any', needs: ['isPrivate'],
      because: 'A practice kept daily is the spine a day organizes itself around.',
    },
  },
  {
    test: /^(?:journal|gratitude|diary)/,
    rhythm: {
      key: 'common.journal', title: 'Journal', perWeek: 7, minutes: 10,
      when: 'evening', needs: ['isPrivate'],
      because: 'You find out what you think by writing it, not before.',
    },
  },
  /* Before the generic read entry, because the array is checked in order
     and first match wins — "read to the kids" contains a book, but the
     habit is the child, and the generic pattern would call it thirty
     minutes of growth in an armchair. */
  {
    test: /^read(?:ing)?\s+(?:to|with)\s+(?:the\s+|my\s+)?(?:kids?|children|son|daughter)\b/,
    rhythm: {
      key: 'common.readkids', title: 'Read to them', perWeek: 3, minutes: 15,
      when: 'evening',
      because: 'What they remember is the thing that was theirs.',
    },
  },
  {
    test: /^read(?:ing)?\b/,
    rhythm: {
      key: 'common.read', title: 'Read', perWeek: 7, minutes: 30,
      when: 'evening',
      because: 'Twenty pages a night is a shelf a year, and it compounds.',
    },
  },
  {
    test: /^(?:study(?:ing)?\b|learn(?:ing)?\b|practi[cs]e\b|duolingo|language)/,
    rhythm: {
      key: 'common.study', title: 'Study', perWeek: 5, minutes: 20,
      when: 'any', needs: ['hasScreen'], sharp: true,
      because: 'Twenty minutes a day is a new field in three years and nothing in one week.',
    },
  },

  // ---- people -------------------------------------------------------------
  {
    test: /^(?:call|ring|phone)\s+(?:mum|mom|dad|home|(?:my\s+)?(?:parents|mother|father|grandma|grandpa|nan))\b/,
    rhythm: {
      key: 'common.callhome', title: 'Call home', perWeek: 1, minutes: 20,
      when: 'evening', needs: ['canSpeakFreely'],
      because: 'Family drifts on no particular day, which is why it needs a particular day.',
    },
  },
  {
    test: /^(?:call|ring|phone|text|message|catch\s+up\s+with)\s+(?:a\s+|my\s+|an?\s+old\s+)?friend/,
    rhythm: {
      key: 'common.friend', title: 'Reach a friend', perWeek: 1, minutes: 15,
      when: 'any',
      because: 'Friendships end from nothing happening, not from anything happening.',
    },
  },
  {
    test: /^date\s+(?:night|with)\b/,
    rhythm: {
      key: 'common.datenight', title: 'Date night', perWeek: 1, minutes: 120,
      when: 'evening', needs: ['canMove'],
      because: 'Partnership is not maintained by living in the same house.',
    },
  },
  {
    test: /^(?:family\s+(?:dinner|time|night)|dinner\s+with\s+(?:the\s+)?family)\b/,
    rhythm: {
      key: 'common.familytime', title: 'Family time', perWeek: 1, minutes: 60,
      when: 'evening', needs: ['canMove'],
      because: 'A standing hour beats a good intention, every single time.',
    },
  },
  {
    test: /^play(?:ing)?\s+with\s+(?:the\s+|my\s+)?(?:kids?|children|son|daughter)\b/,
    rhythm: {
      key: 'common.playkids', title: 'Play with them', perWeek: 2, minutes: 45,
      when: 'evening', needs: ['canMove'],
      because: 'Children measure attention by whether the phone is in the room.',
    },
  },
  // ---- the wider life -----------------------------------------------------
  {
    test: /^volunteer(?:ing)?\b/,
    rhythm: {
      key: 'common.volunteer', title: 'Volunteer', perWeek: 1, minutes: 60,
      when: 'any', prefersWeekend: true, needs: ['canMove'],
      because: 'The help that lands is the help that is regular.',
    },
  },
  {
    test: /^mentor(?:ing)?\b/,
    rhythm: {
      key: 'common.mentor', title: 'Mentor', perWeek: 1, minutes: 30,
      when: 'any', needs: ['canSpeakFreely'],
      because: 'Most people who need help have already asked someone, once.',
    },
  },
  {
    test: /^(?:side\s+(?:project|hustle)|my\s+project)\b/,
    rhythm: {
      key: 'common.project', title: 'The project', perWeek: 2, minutes: 60,
      when: 'morning', needs: ['hasScreen'], sharp: true,
      because: 'Creative work does not wait for a free weekend. It waits for a fixed hour.',
    },
  },
  {
    test: /^network(?:ing)?\b/,
    rhythm: {
      key: 'common.network', title: 'One conversation', perWeek: 1, minutes: 20,
      when: 'any',
      because: 'The work that gets you the next thing is never the work that is due today.',
    },
  },
  {
    test: /^plan\s+(?:a\s+|the\s+|our\s+)?(?:trip|travel|holiday|vacation)\b/,
    rhythm: {
      key: 'common.plantrip', title: 'Plan the trip', perWeek: 1, minutes: 30,
      when: 'evening', needs: ['hasScreen'],
      because: 'Years blur when they are made of the same week, repeated.',
    },
  },

  // ---- small daily upkeep -------------------------------------------------
  {
    test: /^(?:take\s+)?(?:vitamins?|supplements?|meds?|medication|pills?)\b/,
    rhythm: {
      key: 'common.vitamins', title: 'Vitamins', perWeek: 7, minutes: 5,
      when: 'morning',
      because: 'The habits that keep you well are mostly this small.',
    },
  },
  {
    test: /^(?:skincare|skin\s+care|floss(?:ing)?)\b/,
    rhythm: {
      key: 'common.upkeep', title: 'Upkeep', perWeek: 7, minutes: 5,
      when: 'evening',
      because: 'Five minutes a night is the whole cost of keeping it.',
    },
  },
  {
    test: /^make\s+(?:the\s+|my\s+)?bed\b/,
    rhythm: {
      key: 'common.makebed', title: 'Make the bed', perWeek: 7, minutes: 5,
      when: 'morning',
      because: 'The first kept promise of a day makes the second one likelier.',
    },
  },
  {
    test: /^(?:cook(?:ing)?\b|meal\s+prep)/,
    rhythm: {
      key: 'common.cook', title: 'Cook', perWeek: 3, minutes: 45,
      when: 'evening',
      because: 'What you eat is decided by what is already made.',
    },
  },

  // ---- money --------------------------------------------------------------
  {
    test: /^(?:track|check|review)\s+(?:my\s+)?(?:spending|expenses|money|budget)\b|^budget(?:ing)?\b/,
    rhythm: {
      key: 'common.money', title: 'Look at the money', perWeek: 1, minutes: 15,
      when: 'evening', needs: ['hasScreen', 'isPrivate'],
      because: 'Money goes wrong quietly. Fifteen minutes a week is enough to hear it.',
    },
  },

  // ---- the edges of the day ----------------------------------------------
  {
    test: /^(?:sleep|bed(?:time)?\b|in\s+bed\s+by|lights\s+out|early\s+(?:to\s+bed|night))/,
    rhythm: {
      key: 'common.bedtime', title: 'Bedtime', perWeek: 7, minutes: 5,
      when: 'bedtime',
      because: 'Sleep is the lever that moves every other one, and the cheapest to pull.',
    },
  },
  {
    test: /^(?:wake|get(?:ting)?\s+up|up\s+(?:at|by))\b/,
    rhythm: {
      key: 'common.wake', title: 'Wake early', perWeek: 7, minutes: 5,
      when: 'bedtime',
      because: 'A morning is won the night before, which is why this sits with sleep.',
    },
  },
  {
    test: /^(?:no|zero)\s+(?:phone|screens?|scrolling)\s*(?:in\s+bed|at\s+night|after|before\s+bed)/,
    rhythm: {
      key: 'common.phonebed', title: 'Phone out of the bedroom', perWeek: 7, minutes: 5,
      when: 'bedtime',
      because: 'The last hour decides the night, and the night decides the day.',
    },
  },

  // ---- abstinences and counts --------------------------------------------
  //
  // Ordered after the bedtime patterns so "no phone in bed" reads as an edge
  // of the day and not as a general abstinence.
  {
    test: /^(?:drink(?:ing)?\s+(?:more\s+)?water|hydrate|hydration|water\s+intake|\d+\s*(?:glasses|litres|liters|l)\s+of\s+water)/,
    rhythm: {
      key: 'common.water', title: 'Drink water', perWeek: 7, minutes: 5,
      when: 'allday',
      because: 'Kept in sips across a day, not in an appointment.',
    },
  },
  {
    /* "cut" only with "down/back/out", or it eats "cut the grass"; "skip"
       never as "skipping", which is a rope and an activity. */
    test: /^(?:no|quit(?:ting)?|stop(?:ping)?|less|cut(?:ting)?\s+(?:down|back|out)|avoid(?:ing)?|skip|limit(?:ing)?)\b/,
    rhythm: {
      key: 'common.abstain', title: 'The thing you are not doing', perWeek: 7, minutes: 5,
      when: 'allday',
      because: 'Kept by nothing happening, which no hour of the day needs to hold.',
    },
  },
];

/**
 * What a hand-written habit most likely is, or null.
 *
 * Null is a real answer and the commonest one. The bar for a match is that
 * a stranger reading the title would name the same habit — anything short
 * of that belongs to the two-way learning, which reads what this person
 * actually does instead of what people in general call things.
 */
export function recognizeHabit(title: string): Rhythm | null {
  const want = norm(title);
  if (!want) return null;
  for (const { test, rhythm } of COMMON) {
    if (test.test(want)) return rhythm;
  }
  return null;
}
