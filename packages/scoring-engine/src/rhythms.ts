/**
 * The rhythms — what a standing commitment in each part of a life looks like.
 *
 * This exists because the sky was offering rhythms that did not sound like the
 * domain they belonged to. Purpose asked you to "Give it a standing hour" —
 * give *what* a standing hour? Career asked you to "Protect one evening a
 * week", which is a good idea and is an instruction to work *less*, sitting
 * under a heading that says career. Experiences offered "One new thing a
 * week". Three domains, three lines that could have been shuffled between them
 * without anyone noticing.
 *
 * The cause was structural rather than editorial. Rhythms were being read off
 * the end of `domainLadder`, whose rungs are written as *button labels* for a
 * domain screen where the surrounding page supplies the missing noun. Lifted
 * out of that page and dropped onto a card on their own, they lost the thing
 * they were about.
 *
 * So rhythms are their own catalog, with their own rules:
 *
 *   **Every title stands alone.** It has to make sense as the only line on a
 *   card, with nothing around it but a domain colour.
 *
 *   **Every rhythm says what it is for.** `because` names the stake in that
 *   domain's own terms. A rhythm that cannot say why it belongs to its domain
 *   is the bug this file was written to fix.
 *
 *   **Every cadence is honest.** A habit's target is an integer per week, so
 *   monthly and yearly commitments are not in here at all. Rather no rhythm
 *   than one nobody could keep — the habit-tracker graveyard is full of apps
 *   that asked for four times what a person agreed to.
 *
 * Deterministic and offline. A model may rephrase one of these for a
 * particular life (see `rhythms.service.ts`); it never chooses which.
 */

import type { Setting } from './setting';
import { classifyLever, leverTwinKey, type LeverKey } from './lifeStrategy';
import { recognizeHabit, PROMOTED, CATALOG } from './commonHabits';

/**
 * Where in a day this kind of thing belongs.
 *
 * A property of the activity, not of the person: a walk wants a morning, a
 * call to a parent wants an evening when they are actually home, and "one
 * block nobody is allowed to interrupt" belongs inside the working day and
 * nowhere else — placing that one at nine at night would be nonsense, so
 * `work` is a refusal to place rather than a slot.
 *
 * `bedtime` is the other refusal, and it exists because of a real one that
 * shipped: "protecting 7–8 hours of sleep" was marked `evening`, the evening
 * anchor is seven o'clock, and the day card drew a ten-minute block of sleep
 * at 7pm — between getting home and the rest of the night, in the hours the
 * reader had left. Nobody lies down for ten minutes at seven and calls it
 * sleeping. The mistake was not the hour. It was treating the *edge* of a day
 * as something that happens *inside* one: what a bedtime costs is not ten
 * minutes of your evening, it is the decision to stop, and the only honest
 * place to draw it is against the sleep the person already told us about. So
 * a bedtime rhythm claims no free time, is never carved out of the hours left,
 * and rides on the sleep block instead. See `isBoundary` in `rhythmPlan.ts`.
 *
 * `allday` is the third refusal, and it came from looking at what people
 * actually track: a large share of the commonest habits are not activities at
 * all. "Drink more water" is a count kept across a whole day, and "no sugar"
 * or "less scrolling" are abstinences — the whole point is that *nothing*
 * happens, all day. None of these wants a slot; drawing "drink water,
 * 7–7:30am" turns a background intention into a fake appointment, which is
 * the seven-o'clock-bedtime bug with a glass of water in its hand. All-day
 * habits keep their place in the week strip, where a kept day is a tick
 * whatever hour it happened, and stay off the clock entirely.
 *
 * Otherwise only ever a preference. A life with no morning gap still gets its
 * walk somewhere; see `rhythmPlan.ts`, which decides what to do when the
 * preferred window is not open.
 */
export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'work' | 'bedtime' | 'allday' | 'any';

export interface Rhythm {
  /**
   * Stable identity. Used for dedupe, for keying an AI rewrite, and never
   * shown. Titles may be rephrased for a life; this may not.
   */
  key: string;
  /** The habit title, and the line on the card. Must read alone. */
  title: string;
  /** Times per week. Integer, because the habit target is. */
  perWeek: number;
  /** Roughly what one occurrence costs. */
  minutes: number;
  /** Why this belongs to this domain, in that domain's own terms. */
  because: string;
  /** The part of a day this belongs in. Absent reads as `any`. */
  when?: TimeOfDay;
  /**
   * What the place has to allow before this can happen at all.
   *
   * Separate from `when`, which is about the hour: "call home" wants an
   * evening *and* somewhere you can speak, and an evening spent on a train
   * satisfies only one of them. Absent asks nothing and fits anywhere.
   */
  needs?: Array<keyof Setting>;
  /**
   * Wants a day with room in it — an outing, an unhurried hour, a visit.
   * Only shifts which weekday it lands on, never whether it is offered.
   */
  prefersWeekend?: boolean;
  /**
   * Needs one of the sharp hours, not merely a free one.
   *
   * A different axis from `needs`, which is about the room you are standing
   * in. This is about what the hour has to be worth: deep work, learning
   * something hard, and making something are bounded by how clear your head
   * is, and there are far fewer of those hours in a week than free ones.
   *
   * Deliberately narrow. Almost everything here is important, and importance
   * is not the test — a call home matters enormously and asks nothing of your
   * concentration. Writing an honest page is hard, but what it costs is
   * willingness and privacy, which the catalog already says elsewhere. Marking
   * those as sharp would spend the scarcest budget in the app on hours that
   * never needed it, and the warning it produces would stop meaning anything.
   */
  sharp?: boolean;
  /**
   * The action, phrased to follow "After X, …" — see `anchor.ts`.
   *
   * Lower case, no full stop, no frequency. Titles are written to read alone
   * on a card, so gluing one to an anchor produces "After work, Move three
   * times a week" — which nobody would say out loud. This is the same thing
   * said as a plan.
   *
   * Optional on purpose, and absent on most. A rhythm with no good if-then
   * gets no anchor rather than an awkward one; the effect being borrowed here
   * comes from a plan somebody could actually picture keeping.
   */
  anchorTemplate?: string;
  /**
   * How hard this is on a body — a different axis from `needs`.
   *
   * `needs: ['canMove']` asks whether the ROOM allows moving. It has never
   * asked whether the person can, so a strength session was offered to
   * somebody with a back injury standing in a perfectly open room. Absent
   * reads as gentle enough for anybody, which is true of almost everything
   * in these catalogs — only the entries that genuinely ask something of a
   * body carry this.
   */
  intensity?: 'gentle' | 'moderate' | 'vigorous';
  /**
   * What to offer instead when this one asks too much — a walk for a run,
   * yoga for a strength session.
   *
   * A twin rather than silence, because a domain that goes quiet reads as
   * the app having nothing to say about somebody's health, which is the
   * opposite of true for the person most likely to have declared a limit.
   */
  gentleTwin?: string;
}

/**
 * Three per domain, small to standing — and, in three domains, the daily
 * ones that follow them.
 *
 * The original three were all weekly and substantial, which turned out to be
 * a whole register missing rather than a shorter list: the app knew perfectly
 * well what drinking water, flossing and making the bed were, and had no way
 * to suggest a single one of them. Those nine live in `commonHabits.ts`,
 * beside the phrasings that mean the same thing, and are spread in below.
 *
 * Order is load-bearing. `rhythmFor` offers the first one still available, so
 * the promoted entries are appended and never inserted — a domain must not
 * start asking for five minutes when it used to ask for forty.
 *
 * Titles are matched case-insensitively against existing habits, retired ones
 * included, so they have to stay stable — editing one re-offers it to everyone
 * who already ended it. Add rather than rewrite.
 */
const RHYTHMS: Record<string, Rhythm[]> = {
  career: [
    {
      key: 'career.next',
      title: 'An hour a week on what comes next',
      perWeek: 1, minutes: 60, when: 'morning', needs: ['hasScreen'], sharp: true,
      because: 'The work that gets you the next thing is never the work that is due today.',
    },
    {
      key: 'career.deep',
      anchorTemplate: 'block the first two hours before anything else opens',
      title: 'One block nobody is allowed to interrupt',
      perWeek: 2, minutes: 90, when: 'work', needs: ['hasScreen'], sharp: true,
      because: 'Careers are built in the hours nobody interrupts, and those hours have to be taken.',
    },
    {
      key: 'career.leave',
      title: 'Leave on time one day a week',
      perWeek: 1, minutes: 15, when: 'work',
      because: 'A career that takes every evening has quietly stopped being a career.',
    },
  ],
  health: [
    {
      key: 'health.move',
      intensity: 'moderate', gentleTwin: 'health.stretch',
      anchorTemplate: 'put your shoes on before you sit down',
      title: 'Move three times a week',
      perWeek: 3, minutes: 40, when: 'morning', needs: ['canMove'],
      because: 'Nothing else on this list survives a body you stopped maintaining.',
    },
    {
      key: 'health.strength',
      intensity: 'vigorous', gentleTwin: 'health.yoga',
      anchorTemplate: 'do the session before the day fills up',
      title: 'One strength session a week',
      perWeek: 1, minutes: 45, when: 'morning', needs: ['canMove'],
      because: 'Strength is most of what decides how the last twenty years feel.',
    },
    {
      key: 'health.sleep',
      anchorTemplate: 'put the phone on the far side of the room',
      title: 'Lights out at the same hour',
      perWeek: 7, minutes: 5, when: 'bedtime',
      because: 'Sleep is the lever that moves every other one, and the cheapest to pull.',
    },
    /**
     * Appended after the three, never among them — order is load-bearing
     * here and inserting would re-offer a different rhythm to everyone who
     * already has one.
     *
     * Yoga was the strangest hole the evidence review found: the strongest
     * single modality in the exercise-for-mood network meta (g ≈ −0.55, and
     * the best tolerated of the lot), culturally native to the market this
     * app is built for, and absent. Worse than absent, in fact — the catalog
     * already *recognised* the word and resolved it to stretching, so
     * somebody who typed "yoga" was quietly filed under a rhythm whose own
     * evidence goes no further than range of motion.
     *
     * Defined in `commonHabits` beside `PROMOTED`, for the same reason those
     * are: it has to be both offered here and recognised there, and one
     * definition is the whole point of that file.
     */
    CATALOG.yoga,
    /* The small daily upkeep, after the three that decide most of it. */
    PROMOTED.stretch,
    PROMOTED.water,
    PROMOTED.vitamins,
    PROMOTED.upkeep,
    PROMOTED.makebed,
    PROMOTED.cook,
  ],
  finance: [
    {
      key: 'finance.review',
      anchorTemplate: 'open the accounts for fifteen minutes',
      title: 'Fifteen minutes on the money, weekly',
      perWeek: 1, minutes: 15, when: 'evening', needs: ['hasScreen', 'isPrivate'],
      because: 'Money goes wrong quietly. Fifteen minutes a week is enough to hear it.',
    },
    {
      key: 'finance.first',
      title: 'Move something to savings first',
      perWeek: 1, minutes: 10, when: 'any', needs: ['hasScreen', 'isPrivate'],
      because: 'What is put away before the month starts is the part that survives it.',
    },
    {
      key: 'finance.learn',
      title: 'Read one thing about money',
      perWeek: 1, minutes: 20, when: 'evening', needs: ['hasScreen'],
      because: 'The gap is rarely income. It is usually the thing nobody taught you.',
    },
  ],
  family: [
    {
      key: 'family.call',
      anchorTemplate: 'call home',
      title: 'Call home, the same day every week',
      perWeek: 1, minutes: 20, when: 'evening', needs: ['canSpeakFreely'],
      because: 'Family drifts on no particular day, which is why it needs a particular day.',
    },
    {
      key: 'family.ask',
      title: 'Ask one thing you have never asked',
      perWeek: 1, minutes: 15, when: 'evening', needs: ['canSpeakFreely'],
      because: 'Your parents carry a whole life you have not heard, and it does not keep.',
    },
    {
      key: 'family.hour',
      title: 'An unhurried hour with them, weekly',
      perWeek: 1, minutes: 60, when: 'evening', prefersWeekend: true, needs: ['canSpeakFreely', 'canMove'],
      because: 'A standing hour beats a good intention, every single time.',
    },
  ],
  partner: [
    {
      key: 'partner.evening',
      anchorTemplate: 'put both phones in the other room',
      title: 'One evening a week with phones away',
      perWeek: 1, minutes: 120, when: 'evening', needs: ['canMove'],
      because: 'Partnership is not maintained by living in the same house.',
    },
    {
      key: 'partner.ask',
      title: 'Ask what they need this week',
      perWeek: 1, minutes: 10, when: 'evening', needs: ['canSpeakFreely'],
      because: 'What they need is rarely the thing you would have guessed.',
    },
    {
      key: 'partner.specific',
      title: 'Say the specific thing, weekly',
      perWeek: 1, minutes: 5, when: 'any', needs: ['canSpeakFreely'],
      because: 'Specific is the difference between being appreciated and being told you are.',
    },
  ],
  children: [
    {
      key: 'children.hour',
      anchorTemplate: 'give them the hour before anything else asks for it',
      title: 'One undivided hour a week',
      perWeek: 1, minutes: 60, when: 'evening', prefersWeekend: true, needs: ['canMove'],
      because: 'Children measure attention by whether the phone is in the room.',
    },
    {
      key: 'children.ours',
      title: 'A thing only the two of you do',
      perWeek: 1, minutes: 45, when: 'any', prefersWeekend: true, needs: ['canMove'],
      because: 'What they remember is the thing that was theirs.',
    },
    {
      key: 'children.record',
      title: 'Write down one thing they said',
      perWeek: 1, minutes: 5, when: 'evening',
      because: 'You will not remember it, and it is the part you will most want back.',
    },
  ],
  friends: [
    {
      key: 'friends.message',
      anchorTemplate: 'message whoever came to mind',
      title: 'Message one friend a week, whoever',
      perWeek: 1, minutes: 10, when: 'any',
      because: 'Friendships end from nothing happening, not from anything happening.',
    },
    {
      key: 'friends.moved',
      title: 'Call the one who moved away',
      perWeek: 1, minutes: 20, when: 'evening', needs: ['canSpeakFreely'],
      because: 'Distance does not end friendships. Silence does.',
    },
    {
      key: 'friends.yes',
      title: 'Say yes to one thing a week',
      perWeek: 1, minutes: 60, when: 'evening', prefersWeekend: true, needs: ['canMove'],
      because: 'The invitations stop coming a while after they stop being taken.',
    },
  ],
  growth: [
    {
      key: 'growth.daily',
      anchorTemplate: 'open the book before opening anything else',
      title: 'Thirty minutes of learning, daily',
      perWeek: 7, minutes: 30, when: 'morning', needs: ['hasScreen'], sharp: true,
      because: 'Half an hour a day is a new field in three years and nothing at all in one week.',
    },
    {
      key: 'growth.hard',
      title: 'An hour a week on the hard thing',
      perWeek: 1, minutes: 60, when: 'morning', needs: ['hasScreen'], sharp: true,
      because: 'The thing you keep avoiding is usually the one that would move you.',
    },
    {
      key: 'growth.teach',
      title: 'Teach one thing you know, weekly',
      perWeek: 1, minutes: 20, when: 'any', needs: ['hasScreen'],
      because: 'You do not know it until you have had to say it out loud.',
    },
    PROMOTED.read,
  ],
  purpose: [
    {
      key: 'purpose.hour',
      anchorTemplate: 'give the project its hour',
      title: 'A standing hour on the project',
      perWeek: 1, minutes: 60, when: 'morning', needs: ['hasScreen'], sharp: true,
      because: 'Creative work does not wait for a free weekend. It waits for a fixed hour.',
    },
    {
      key: 'purpose.open',
      title: 'Open the file, every day',
      perWeek: 7, minutes: 15, when: 'morning', needs: ['hasScreen'], sharp: true,
      because: 'The hard part was never the hour. It is opening the file.',
    },
    {
      key: 'purpose.show',
      title: 'Show it to one person a week',
      perWeek: 1, minutes: 20, when: 'any', needs: ['hasScreen'],
      because: 'Work nobody sees quietly stops being work.',
    },
  ],
  experiences: [
    {
      key: 'experiences.new',
      title: 'One thing you have never done, weekly',
      perWeek: 1, minutes: 60, when: 'any', prefersWeekend: true, needs: ['canMove'],
      because: 'Years blur when they are made of the same week, repeated.',
    },
    {
      key: 'experiences.yes',
      title: 'Say yes to one invitation a week',
      perWeek: 1, minutes: 90, when: 'evening', prefersWeekend: true, needs: ['canMove'],
      because: 'The good years turn out to be mostly other people’s plans.',
    },
    {
      key: 'experiences.near',
      title: 'One place near you, never visited',
      perWeek: 1, minutes: 120, when: 'any', prefersWeekend: true, needs: ['canMove'],
      because: 'Most of what you have not seen is within an hour of where you live.',
    },
    /**
     * Appended, for the same reason as the yoga entry above.
     *
     * The nature threshold is the best effort-to-evidence ratio the review
     * turned up: two hours a week, reachable in a single visit, and the
     * association holds across nearly twenty thousand people. It is
     * observational and the receipt says so — but the ask is so small that
     * the grade barely matters. Two hours is one Sunday morning.
     */
    {
      key: 'experiences.outside',
      anchorTemplate: 'get out to something green',
      title: 'Two hours somewhere green, weekly',
      perWeek: 1, minutes: 120, when: 'any', prefersWeekend: true, needs: ['canMove'],
      because: 'Two hours a week outdoors is the whole dose, and it can be one walk.',
    },
  ],
  reflection: [
    {
      key: 'reflection.quiet',
      anchorTemplate: 'sit for five minutes before the day starts talking',
      title: 'Five quiet minutes, daily',
      perWeek: 7, minutes: 5, when: 'morning', needs: ['isPrivate'],
      because: 'A mind gets no maintenance window unless somebody makes one.',
    },
    {
      key: 'reflection.page',
      title: 'One honest page a week',
      perWeek: 1, minutes: 20, when: 'evening', needs: ['isPrivate'],
      because: 'You find out what you think by writing it, not before.',
    },
    {
      key: 'reflection.hour',
      title: 'A weekly hour that is nobody else’s',
      perWeek: 1, minutes: 60, when: 'morning', prefersWeekend: true, needs: ['isPrivate'],
      because: 'An hour belonging to no one else is the rarest thing in a full life.',
    },
    PROMOTED.prayer,
    PROMOTED.journal,
  ],
  impact: [
    {
      key: 'impact.hour',
      anchorTemplate: 'give the hour you set aside',
      title: 'An hour a week for someone who needs it',
      perWeek: 1, minutes: 60, when: 'any', prefersWeekend: true, needs: ['canMove'],
      because: 'The help that lands is the help that is regular.',
    },
    {
      key: 'impact.answer',
      title: 'Answer one person who asked',
      perWeek: 1, minutes: 20, when: 'any', needs: ['canSpeakFreely'],
      because: 'Most people who need help have already asked someone, once.',
    },
    {
      key: 'impact.bring',
      title: 'Bring one other person into it',
      perWeek: 1, minutes: 30, when: 'any', needs: ['canSpeakFreely'],
      because: 'What you do alone ends with you. What you hand over does not.',
    },
  ],
};

/** Everything a domain has to offer, in order. */
export function rhythmsFor(domainType: string): Rhythm[] {
  return RHYTHMS[domainType] ?? RHYTHMS.reflection;
}

/**
 * The children rhythms for a life where the children are somewhere else.
 *
 * The catalog's children entries are written for a child down the hall:
 * "One undivided hour a week" needs a shared room, and "Children measure
 * attention by whether the phone is in the room" is precisely backwards for
 * a father whose 25-year-old is in another city — for him the phone is the
 * room. Offered anyway, they read as the app not knowing the one thing it
 * was told about where his son lives.
 *
 * Not in `RHYTHMS.children`, because the catalog is unconditional and these
 * are not: the host decides who they are for (see `childrenAreRemote`) and
 * hands them in through the `extra` slot, the same door blueprint rhythms
 * use. The in-person titles it retires travel beside them, so the two lists
 * cannot drift apart.
 */
export const REMOTE_CHILDREN_RHYTHMS: Rhythm[] = [
  {
    key: 'children.call',
    title: 'A call where they pick the topic',
    perWeek: 1, minutes: 30, when: 'evening', needs: ['canSpeakFreely'],
    because: 'For a child in another city, the call is the room you share.',
  },
  {
    key: 'children.note',
    title: 'A photo or voice note, twice a week',
    perWeek: 2, minutes: 5, when: 'any',
    because: 'Distance grows in the gaps between calls. Small and often closes them.',
  },
];

/** The catalog children rhythms that assume a shared roof, by exact title. */
export const IN_PERSON_CHILDREN_TITLES: string[] = [
  'One undivided hour a week',
  'A thing only the two of you do',
];

/**
 * The rhythm a domain is still asking for, if it has one left to give.
 *
 * `taken` is habit titles, retired ones included: a rhythm somebody ended is
 * not offered back to them. When a domain's three are all spoken for the
 * honest answer is null, and the caller says nothing rather than looping to
 * the top and pretending the last six weeks did not happen.
 */
export function availableRhythms(
  domainType: string,
  taken: Iterable<string> = [],
  /**
   * Rhythms written for this one person, already narrowed to this domain.
   *
   * Tried first, and the catalog is what answers when there are none or when
   * they are all spoken for — which is the whole arrangement in one line. A
   * generation that produces nothing, or produces rubbish the judge threw
   * away, leaves a reader with exactly the app that shipped.
   */
  extra: Rhythm[] = [],
): Rhythm[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const takenTitles = [...taken];
  const takenSet = new Set(takenTitles.map(norm));

  /**
   * Levers already being kept, whatever they happen to be called.
   *
   * This app creates habits from two places that name the same commitment
   * differently. "Strength training twice a week" comes from the healthspan
   * card; "One strength session a week" is the catalog's version of the same
   * promise. Matching on the title cannot see that, so somebody lifting twice
   * a week was being offered a strength rhythm as though they had none — the
   * app not noticing what they were already doing, which is the fastest way
   * to teach a reader it is not paying attention.
   *
   * The other direction has always worked: the healthspan card reads habits
   * through this same classifier, so a catalog rhythm correctly marks its
   * lever as held. Only the offering was blind.
   */
  const heldLevers = new Set(
    takenTitles.map((t) => classifyLever(t)).filter(Boolean) as LeverKey[],
  );

  return [...extra, ...rhythmsFor(domainType)].filter((r) => {
    if (takenSet.has(norm(r.title))) return false;
    const lever = classifyLever(r.title);
    return !lever || !heldLevers.has(lever);
  });
}

/**
 * The rhythm a domain is still asking for, if it has one left to give.
 *
 * The first of what is available — see `availableRhythms` for what "still
 * has to give" actually means, which is more than a title comparison.
 */
export function rhythmFor(
  domainType: string,
  taken: Iterable<string> = [],
  extra: Rhythm[] = [],
  limits?: MovementLimits,
): Rhythm | null {
  const available = availableRhythms(domainType, taken, extra);
  return withinLimits(available, limits)[0] ?? null;
}

/**
 * What a body allows, as the reader declared it. Absent means never asked.
 *
 * `none` is not the same as absent in intent but is identical in behaviour,
 * and that is deliberate — somebody who answers "no limits" should see the
 * app they would have seen anyway.
 */
export type MovementLimits = 'none' | 'low_impact' | 'ask_doctor' | null | undefined;

/**
 * The offer list, filtered by what a body allows rather than what a room does.
 *
 * `needs: ['canMove']` asks about the place. A strength session was therefore
 * offered to somebody with a back injury standing in a perfectly open room,
 * because the app had no field in which to be told otherwise.
 *
 * A vigorous entry is swapped for its gentle twin, never merely dropped. A
 * health domain that goes quiet reads as the app having nothing to say about
 * somebody's health — which is precisely backwards for the person most likely
 * to have declared a limit in the first place. Where a twin is not available
 * the entry does fall away, and the domain's remaining entries carry on.
 */
export function withinLimits(list: Rhythm[], limits: MovementLimits): Rhythm[] {
  if (!limits || limits === 'none') return list;

  const out: Rhythm[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    /* Only 'vigorous' is swapped. 'moderate' is a brisk walk, which is the
       thing most people with a limit have been told to do more of. */
    if (r.intensity !== 'vigorous') {
      if (!seen.has(r.key)) { seen.add(r.key); out.push(r); }
      continue;
    }
    const twin = r.gentleTwin ? rhythmByKey(r.gentleTwin) : null;
    if (twin && !seen.has(twin.key)) { seen.add(twin.key); out.push(twin); }
  }
  return out;
}


/**
 * The catalog entry a saved habit came from, matched on title.
 *
 * Habits are rows a person owns; rhythms are the catalog they were offered
 * from. Nothing stores the link, and the title is what the two share — the
 * same case-insensitive match `rhythmFor` already uses to avoid re-offering
 * something. Returns null for a habit somebody wrote themselves, which then
 * simply has no opinion about when it belongs.
 *
 * A title an AI rewrote for this life will not match, and that is the
 * correct outcome: it falls back to having no preference rather than
 * inheriting a stranger's.
 */
export function rhythmByTitle(title: string): Rhythm | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const want = norm(title ?? '');
  if (!want) return null;
  for (const list of Object.values(RHYTHMS)) {
    const hit = list.find((r) => norm(r.title) === want);
    if (hit) return hit;
  }
  return null;
}

/**
 * What a habit actually is, whichever surface created it.
 *
 * The one place anything should ask. Four separate readers used to call
 * `rhythmByTitle` and then hand-pick the fields they cared about, so a gap in
 * the lookup showed up four different ways: a bedtime placed in the late
 * afternoon, a strength session offered to somebody at a desk, a row in the
 * week strip with no hour on it, and hours missing from the allocation total.
 * One resolver, one answer, and a caller reads whatever it needs.
 *
 * Three readings, most certain first: the catalog's own titles, the
 * healthspan card's exact labels, and then the common-habits table — the
 * couple of dozen things people write for themselves everywhere ("gym",
 * "meditate", "drink water"), recognized conservatively from the front of
 * the title. See `commonHabits.ts` for the rules that keep that last step
 * from guessing.
 *
 * Still null for anything genuinely somebody's own, which is honest rather
 * than unfortunate — nothing here knows how long "sort the garage" takes or
 * when it belongs. The two-way learning covers that from what they actually
 * do, and a guess would only get in its way.
 */
export function rhythmForHabit(title: string): Rhythm | null {
  const direct = rhythmByTitle(title);
  if (direct) return direct;
  const twin = leverTwinKey(title);
  if (twin) return rhythmByKey(twin);
  return recognizeHabit(title);
}

/** Look one up by key — the merge path for an AI rewrite. */
export function rhythmByKey(key: string): Rhythm | null {
  for (const list of Object.values(RHYTHMS)) {
    const hit = list.find((r) => r.key === key);
    if (hit) return hit;
  }
  return null;
}

/** Every domain this catalog covers. */
export function rhythmDomains(): string[] {
  return Object.keys(RHYTHMS);
}
