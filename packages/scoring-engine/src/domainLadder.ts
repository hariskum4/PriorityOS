/**
 * The ladder — what a domain asks for next, once you have done the last thing.
 *
 * Each domain used to offer exactly one starter action, and the screen decided
 * whether to show it by checking the *pending* missions. So the moment you
 * completed it, it stopped being pending, the check passed again, and the app
 * offered you the identical action — forever. "Block two hours of focused
 * work", done, +30 XP, and there it is again. A system that asks for the same
 * thing after you have done it is not paying attention, and the person stops
 * believing anything else it says.
 *
 * So a domain holds an ordered sequence instead, and the screen shows the first
 * rung not already taken. Two properties matter:
 *
 *   **It climbs.** Each rung asks slightly more than the one before — the first
 *   is something you could do in the next ten minutes, the last is a standing
 *   commitment. That order is the honest shape of building anything, and it
 *   means the app earns the right to ask for more rather than opening with it.
 *
 *   **It ends.** When the ladder runs out it says so and stops, rather than
 *   looping back to the top and pretending the last six weeks did not happen.
 *   A domain whose ladder is finished is a domain where the person no longer
 *   needs suggestions from software, which is the goal.
 *
 * Deterministic and offline, like everything on this path. The model may later
 * rephrase a rung in the person's own idiom; it must never decide which rung.
 */

export interface LadderRung {
  /** The mission title, written as the action itself. */
  title: string;
  /** The button label — an invitation, shorter than the title. */
  label: string;
  /** Roughly what it costs, in minutes. Climbs with the ladder. */
  minutes: number;
  /**
   * Set when the rung is a standing rhythm rather than a one-off — then it
   * becomes a habit, not a mission, and `perWeek` is what it asks for.
   *
   * Most of these ladders end on something recurring by design, and every one
   * of them was being filed as a mission: "make the call a standing weekly
   * thing" got ticked once on a Tuesday, awarded its XP, and vanished. A
   * standing commitment marked done after one go is not a small inaccuracy —
   * it is the app agreeing that the rhythm is finished when it has not begun.
   *
   * `perWeek` is an integer because the habit target is, so this marks only
   * cadences of a week or tighter. See the note on LADDERS for what that
   * costs and why it is the right cost to pay.
   */
  recurring?: { perWeek: number };
}

/**
 * Six rungs per domain, small to standing.
 *
 * Titles are matched case-insensitively against completed missions, so they
 * have to stay stable — editing one re-offers it to everyone who has done it.
 * Add to the end rather than rewriting.
 *
 * The last rung is a standing rhythm wherever the cadence can be told the
 * truth. A habit's target is an integer per week, so "a standing monthly
 * catch-up" and "one real trip a year" cannot be marked recurring without
 * asking four and fifty-two times too often — those stay one-off missions,
 * and the domains they belong to get a weekly rung of their own at the end
 * instead. Rather no rhythm than a rhythm nobody could keep.
 */
const LADDERS: Record<string, LadderRung[]> = {
  career: [
    { title: 'Block two hours of focused work', label: 'Block two hours of focused work', minutes: 120 },
    { title: 'Write down what you actually want from this job', label: 'Name what you want from this job', minutes: 20 },
    { title: 'Have one honest conversation about your direction', label: 'Talk to someone about direction', minutes: 45 },
    { title: 'Learn one thing that outlasts this role', label: 'Learn something that outlasts the role', minutes: 60 },
    { title: 'Ask for the thing you have been not asking for', label: 'Ask for the thing', minutes: 30 },
    { title: 'Protect one evening a week from work, every week', label: 'Protect one evening a week', minutes: 15, recurring: { perWeek: 1 } },
  ],
  health: [
    { title: 'Book the annual health checkup', label: 'Book the annual checkup', minutes: 15 },
    { title: 'Walk for twenty minutes today', label: 'Walk twenty minutes', minutes: 20 },
    { title: 'Put a bedtime in the calendar and keep it once', label: 'Set a bedtime, keep it once', minutes: 10 },
    { title: 'Do one strength session this week', label: 'One strength session', minutes: 40 },
    { title: 'Cook three meals at home this week', label: 'Cook three meals at home', minutes: 90 },
    { title: 'Move three times a week for a month', label: 'Move three times a week', minutes: 120, recurring: { perWeek: 3 } },
  ],
  finance: [
    { title: 'Weekly money review', label: 'Start a weekly money review', minutes: 15, recurring: { perWeek: 1 } },
    { title: 'Write down every recurring payment you have', label: 'List every recurring payment', minutes: 30 },
    { title: 'Set aside one month of expenses', label: 'Start the emergency fund', minutes: 30 },
    { title: 'Automate one monthly investment', label: 'Automate one investment', minutes: 25 },
    { title: 'Read one thing about money you have been avoiding', label: 'Read the thing you avoid', minutes: 40 },
    { title: 'Write the will, or the list of what is where', label: 'Write down what is where', minutes: 90 },
  ],
  family: [
    { title: 'Call someone in your family today', label: 'Call someone today', minutes: 15 },
    { title: 'Ask a parent one question about their childhood', label: 'Ask about their childhood', minutes: 20 },
    { title: 'Record one story before it is gone', label: 'Record one story', minutes: 30 },
    { title: 'Plan a visit and put a date on it', label: 'Put a date on a visit', minutes: 20 },
    { title: 'Write down what you would want them to know', label: 'Write what they should know', minutes: 30 },
    { title: 'Make the call a standing weekly thing', label: 'Make the call weekly', minutes: 15, recurring: { perWeek: 1 } },
  ],
  partner: [
    { title: 'Plan a phone-free evening together', label: 'Plan a phone-free evening', minutes: 90 },
    { title: 'Ask them what they need more of right now', label: 'Ask what they need', minutes: 20 },
    { title: 'Take one thing off their plate this week', label: 'Take one thing off their plate', minutes: 30 },
    { title: 'Plan something you both used to do', label: 'Do something you used to do', minutes: 60 },
    { title: 'Say the specific thing you appreciate', label: 'Say the specific thing', minutes: 5 },
    { title: 'Put a recurring evening in the calendar', label: 'Make the evening recurring', minutes: 15, recurring: { perWeek: 1 } },
  ],
  children: [
    { title: 'One undivided hour with them this week', label: 'One undivided hour', minutes: 60 },
    { title: 'Ask what they are actually into right now', label: 'Ask what they are into', minutes: 20 },
    { title: 'Let them teach you something', label: 'Let them teach you', minutes: 30 },
    { title: 'Write down one thing they said this month', label: 'Write down what they said', minutes: 10 },
    { title: 'Take a day off for no reason but them', label: 'A day off, for them', minutes: 240 },
    { title: 'Start a thing only the two of you do', label: 'Start a thing that is yours', minutes: 45, recurring: { perWeek: 1 } },
  ],
  friends: [
    { title: 'Message a friend you have been meaning to', label: 'Message the friend', minutes: 10 },
    { title: 'Make an actual plan with a date on it', label: 'Make a plan with a date', minutes: 15 },
    { title: 'Call the one who moved away', label: 'Call the one who moved', minutes: 30 },
    { title: 'Introduce two people who should know each other', label: 'Introduce two people', minutes: 15 },
    { title: 'Host something small', label: 'Host something small', minutes: 120 },
    { title: 'Put a standing monthly catch-up in the calendar', label: 'Make it standing', minutes: 15 },
    { title: 'Message one friend every week, whoever it is', label: 'One friend a week', minutes: 10, recurring: { perWeek: 1 } },
  ],
  growth: [
    { title: 'Learn for 30 minutes', label: 'Start a learning habit', minutes: 30 },
    { title: 'Finish the thing you started and abandoned', label: 'Finish what you abandoned', minutes: 60 },
    { title: 'Teach one thing you know to someone', label: 'Teach one thing', minutes: 45 },
    { title: 'Read the book that keeps getting postponed', label: 'Read the postponed book', minutes: 120 },
    { title: 'Take on something you are not qualified for', label: 'Do the unqualified thing', minutes: 90 },
    { title: 'Learn for thirty minutes a day for a month', label: 'Thirty minutes a day', minutes: 120, recurring: { perWeek: 7 } },
  ],
  purpose: [
    { title: 'Work on the project for 30 minutes', label: 'Open the project today', minutes: 30 },
    { title: 'Show the work to one person', label: 'Show it to one person', minutes: 20 },
    { title: 'Write down what you want this to become', label: 'Name what it should become', minutes: 30 },
    { title: 'Give it a standing hour every week', label: 'Give it a standing hour', minutes: 60, recurring: { perWeek: 1 } },
    { title: 'Finish one piece of it, however small', label: 'Finish one piece', minutes: 120 },
    { title: 'Put it somewhere other people can find it', label: 'Put it where it can be found', minutes: 60 },
  ],
  experiences: [
    { title: 'Plan one local adventure this month', label: 'Plan one local adventure', minutes: 45 },
    { title: 'Book the thing instead of researching it', label: 'Book it, stop researching', minutes: 30 },
    { title: 'Say yes to one invitation you would normally decline', label: 'Say yes to one invitation', minutes: 15 },
    { title: 'Go somewhere you have never been, nearby', label: 'Somewhere new, nearby', minutes: 180 },
    { title: 'Take the trip while the people can still come', label: 'Take the trip', minutes: 240 },
    { title: 'Put one real trip in the calendar every year', label: 'One real trip a year', minutes: 60 },
    { title: 'Do one new thing a week, however small', label: 'One new thing a week', minutes: 45, recurring: { perWeek: 1 } },
  ],
  reflection: [
    { title: 'Sit quietly for 5 minutes', label: 'Sit quietly for five minutes', minutes: 5 },
    { title: 'Write one honest page', label: 'Write one honest page', minutes: 20 },
    { title: 'Name the thing you have been avoiding thinking about', label: 'Name what you avoid', minutes: 20 },
    { title: 'Take a walk with no phone and no podcast', label: 'Walk with nothing on', minutes: 40 },
    { title: 'Write the letter you will not send', label: 'Write the unsent letter', minutes: 45 },
    { title: 'Keep a weekly hour that belongs to no one else', label: 'An hour that is yours', minutes: 60, recurring: { perWeek: 1 } },
  ],
  impact: [
    { title: 'Mentor or help one person this month', label: 'Help one person', minutes: 60 },
    { title: 'Give to one thing you actually care about', label: 'Give to one thing', minutes: 15 },
    { title: 'Offer the skill you have to someone who lacks it', label: 'Offer what you know', minutes: 90 },
    { title: 'Show up in person for something local', label: 'Show up locally', minutes: 180 },
    { title: 'Bring one other person into it', label: 'Bring someone with you', minutes: 30 },
    { title: 'Make the giving automatic and forget it', label: 'Make it automatic', minutes: 20 },
    { title: 'Give one hour a week to someone who needs it', label: 'An hour a week for someone', minutes: 60, recurring: { perWeek: 1 } },
  ],
};

/**
 * The children ladder for children who live somewhere else.
 *
 * The standard children ladder starts at "One undivided hour with them this
 * week" and climbs through afternoons that need a shared address. For a
 * parent whose children are grown and away, every rung the page offered was
 * one they could not take without a flight — so the domain read as finished
 * advice for a life the reader does not lead. Rungs that work at distance
 * survive unchanged; the ones that needed the same room become the call,
 * the plan, and the standing weekly thing.
 */
const CHILDREN_REMOTE_LADDER: LadderRung[] = [
  { title: 'A call where they pick the topic', label: 'A call, their topic', minutes: 30 },
  { title: 'Ask what they are actually into right now', label: 'Ask what they are into', minutes: 20 },
  { title: 'Let them teach you something over a call', label: 'Let them teach you', minutes: 30 },
  { title: 'Write down one thing they said this month', label: 'Write down what they said', minutes: 10 },
  { title: 'Plan the next visit and put a date on it', label: 'Put a date on a visit', minutes: 20 },
  { title: 'Make the call a standing weekly thing', label: 'Make the call weekly', minutes: 15, recurring: { perWeek: 1 } },
];

/** Everything the ladder for a domain contains, in order. */
export function domainLadder(
  domainType: string,
  opts?: { remoteChildren?: boolean },
): LadderRung[] {
  if (domainType === 'children' && opts?.remoteChildren) return CHILDREN_REMOTE_LADDER;
  return LADDERS[domainType] ?? LADDERS.reflection;
}

export interface LadderPosition {
  /** The next rung to offer, or null when the ladder is finished. */
  next: LadderRung | null;
  /** How many rungs have already been taken. */
  taken: number;
  total: number;
  /** True once nothing is left to suggest — a state worth saying out loud. */
  finished: boolean;
}

/**
 * Where a person stands on a domain's ladder.
 *
 * `done` and `open` are mission titles — completed, and currently on the list.
 * Both count as taken: an action already sitting in your missions must not be
 * offered a second time, and one you have finished must never be offered again
 * at all.
 */
export function nextDomainAction(
  domainType: string,
  done: Iterable<string> = [],
  open: Iterable<string> = [],
  opts?: { remoteChildren?: boolean },
): LadderPosition {
  const ladder = domainLadder(domainType, opts);
  const norm = (s: string) => s.trim().toLowerCase();
  const doneSet = new Set([...done].map(norm));
  const openSet = new Set([...open].map(norm));

  const next = ladder.find((r) => !doneSet.has(norm(r.title)) && !openSet.has(norm(r.title))) ?? null;
  const taken = ladder.filter((r) => doneSet.has(norm(r.title))).length;

  return { next, taken, total: ladder.length, finished: next === null };
}
