/**
 * Time-stacking — the "steal the time" engine.
 *
 * The honest answer to "how do I serve 8 life domains in ~42 free hours":
 * you don't buy separate hours for each — you STACK. One walk with a parent
 * is health + family. One audiobook commute is growth + reclaimed dead time.
 * (Habit-stacking / "kill two birds" — Clear, Scott; documented behavior-change
 * technique.) Deterministic and local. Every stack names a concrete action.
 *
 * What this used to do, and why it was replaced
 * ---------------------------------------------
 * It ranked by *how many* of a person's flagged-neglected domains a stack
 * touched. Two faults compounded until the ranking did nothing at all.
 *
 *   1. When nothing was flagged it fell back to "all your domains", which put
 *      almost every catalog entry on the same score. A stable sort then handed
 *      back the first three entries **in the order they were typed** — the same
 *      three for every user whose life is broadly active, presented as if they
 *      had been chosen.
 *
 *   2. Counting domains treats a domain that is 7 share-points short exactly
 *      like one that is 0.2 short. The summary line inherited this: "these 3
 *      actions touch 5 of your life domains" counted domains already receiving
 *      more attention than they were promised.
 *
 * So ranking now happens in **share points short** — the same currency
 * `lifeAlignment` uses, so the tile and the alignment score can no longer
 * disagree about which part of a life is starving. A stack is worth what it
 * would feed, and a stack that feeds two starving domains beats one that feeds
 * a starving domain and a full one.
 */

import type { DomainShare } from './alignment';
import type { LifeShape } from './lifeShape';
import type { Setting } from './setting';

/** The relationships a stack can be built around. */
export type PersonRole = 'parent' | 'child' | 'partner' | 'friend';

export interface Stack {
  key: string;
  /**
   * What the place has to allow. A stack is one hour serving two parts of
   * a life, and most of them need legs or a person — which is why almost
   * none of these survive a found hour at an open-plan desk, and why the
   * ones that do are worth finding rather than guessing at.
   */
  setting?: Array<keyof Setting>;
  /** The action. `{who}` is where a real name belongs, when there is one. */
  action: string;
  domains: string[];
  framing: string;
  /**
   * Domains that lend the hour rather than gain one.
   *
   * Stacking works because one hour can serve two parts of a life — but not
   * every part it touches is better off for it. A walking meeting touches
   * career and health; the call was happening either way and is the same call,
   * so career gains nothing and health gains an hour. Counting career as fed
   * made the ranker offer that stack to someone whose career was starving, and
   * the reason line then argued it out loud: "career is getting 33% of your
   * attention — you asked for 47%", above an action that adds no career at all.
   * A person reading that is right to ask what one has to do with the other.
   *
   * The test is whether the domain's own activity changes. Giving the first
   * thirty minutes of work to the skill instead of the inbox is different work,
   * so career gains. Taking the same call on your feet is the same work, so
   * career only hosts. A host still appears in `domains` — the hour genuinely
   * does serve it — but it can neither pull the stack up the ranking nor be
   * offered as the reason the stack is on screen.
   */
  hosts?: string[];
  /**
   * The relationship this needs to be possible at all.
   *
   * A stack naming a child is not a suggestion to someone who has recorded
   * seven people and no children — it is the app describing a life they do not
   * have. Whereas someone who has recorded *nobody* is unknown, not childless,
   * and still gets the generic wording.
   */
  role?: PersonRole;
  /**
   * What this life must contain for the action to exist at all.
   *
   * Same rule as `role`, one level up: a commute suggestion to someone who
   * never leaves for work is the app describing a life they do not have. A
   * homemaker was told to turn her commute into an audiobook — the commute
   * was invented by the catalog, not lived by her.
   */
  needs?: Array<keyof LifeShape>;
  /**
   * The action reaches the person down a phone line, so it needs somebody
   * who is actually at the other end of one. A full-time carer was offered
   * "Take your walk while calling Halima" about the mother she lives with
   * and looks after all day — a call to her own flat. Same rule as `role`
   * again: a person under the same roof does not fill a by-phone slot.
   */
  byPhone?: boolean;
}

/** Someone real, and how far past the rhythm they asked for. */
export interface StackPerson {
  /** Opaque to this module — handed back so a caller can link what it logs. */
  id?: string;
  name: string;
  relationType: string;
  /** Days since the last contact, or null if there has never been one. */
  daysSince?: number | null;
  /** Multiples of their own desired cadence: 1 means due, 2 means twice over. */
  overdue?: number;
  /** Where they live relative to the reader — `same_home` matters here. */
  locationType?: string | null;
}

export interface StackSuggestion {
  key: string;
  /** Carried through from the catalog, so a found hour can filter on it. */
  setting?: Array<keyof Setting>;
  /** The action, with a real name in it wherever one was available. */
  action: string;
  framing: string;
  domains: string[];
  /** Only the domains this actually helps — the ones short of their claim. */
  covers: string[];
  /** Who it names, when it names anyone. */
  person: string | null;
  /** That person's id, so what gets logged can be filed under them. */
  personId: string | null;
  /** Why it is on screen, in the person's own numbers. Empty if nothing is short. */
  reason: string;
  /**
   * The domain `reason` argues from — which is not always `covers[0]`, since
   * the reason speaks to whatever is still hungriest and `covers` is in the
   * stack's own order. Returned so a caller colouring the sentence colours it
   * after the domain the sentence is actually about.
   */
  reasonDomain: string | null;
}

const ROLE_OF: Record<string, PersonRole> = {
  mother: 'parent', father: 'parent', parent: 'parent',
  child: 'child', son: 'child', daughter: 'child',
  spouse: 'partner', partner: 'partner',
  friend: 'friend',
};

/**
 * The role a relationship type plays in a stack, if it plays one.
 *
 * Exported so the blueprint judge gates on exactly the map `pickPerson` will
 * later search. A second, looser mapping elsewhere would approve a stack whose
 * `role` nothing can fill, and the reader would be handed "cook dinner with
 * your child" on the strength of having recorded a sibling.
 */
export function roleOfRelation(relationType: string): PersonRole | null {
  return ROLE_OF[(relationType ?? '').trim().toLowerCase()] ?? null;
}

/** What to call someone when we have not been told who they are. */
const ANONYMOUS: Record<PersonRole, string> = {
  parent: 'a parent', child: 'your child', partner: 'your partner', friend: 'a friend',
};

const CATALOG: Stack[] = [
  { key: 'walk_call_parent', action: 'Take your walk while calling {who}', domains: ['health', 'family'], framing: 'Movement and a real conversation in the same 20 minutes.', role: 'parent', byPhone: true, setting: ['canMove', 'canSpeakFreely'] },
  { key: 'cook_with_kid', action: 'Cook dinner with {who}, no screens', domains: ['children', 'health'], framing: 'A shared ritual that also feeds you both well.', role: 'child', setting: ['canMove'] },
  { key: 'commute_learn', action: 'Turn your commute into an audiobook or course', domains: ['growth', 'experiences'], framing: 'Reclaimed dead time becomes the skill you keep postponing.', needs: ['hasCommute'], setting: ['canMove'] },
  { key: 'chore_learn', action: 'Put an audiobook on while cooking or folding', domains: ['growth', 'experiences'], framing: 'The chores take the hour either way; you keep the ideas.', setting: ['canMove'] },
  { key: 'workout_friend', action: 'Train with {who} once a week', domains: ['health', 'friends'], framing: 'Accountability and the friendship, in one slot.', role: 'friend', setting: ['canMove'] },
  { key: 'weekend_trip_family', action: 'Plan a weekend trip with the family', domains: ['family', 'experiences'], framing: 'A memory and time together, from the same weekend.', setting: ['hasScreen'] },
  { key: 'gratitude_partner', action: 'Share one gratitude with {who} at night', domains: ['partner', 'reflection'], framing: 'Presence and inner practice in sixty seconds.', role: 'partner', setting: ['canSpeakFreely'] },
  { key: 'teach_skill', action: 'Teach someone the thing you are learning', domains: ['growth', 'impact'], framing: 'Learning sticks when you give it away.', setting: ['canSpeakFreely'] },
  { key: 'creative_with_kid', action: 'Make something with {who} — draw, build, record', domains: ['purpose', 'children'], framing: 'Your creative practice, and their childhood, at once.', role: 'child', setting: ['canMove'] },
  { key: 'volunteer_family', action: 'Volunteer together as a family', domains: ['impact', 'family'], framing: 'Contribution that your kids will remember you for.', setting: ['canMove'] },
  { key: 'walk_meeting', action: 'Take one work call as a walking meeting', domains: ['career', 'health'], hosts: ['career'], framing: 'The work still happens; your body stops paying for it.', needs: ['hasDeskJob'], setting: ['canMove', 'canSpeakFreely'] },
  { key: 'money_date', action: 'A monthly money review with {who}', domains: ['finance', 'partner'], framing: 'Shared clarity beats separate anxiety.', role: 'partner', setting: ['canSpeakFreely', 'isPrivate'] },
  { key: 'nature_reflect', action: 'A quiet walk outdoors, phone in your pocket', domains: ['health', 'reflection'], framing: 'The cheapest reset there is — moving and thinking.', setting: ['canMove'] },

  /* Three at a time.
     Nothing about stacking stops at two — an afternoon outdoors with the
     family is health and family and a memory, and pretending it is only two of
     those undersells the hour it costs. The pairs above are still here because
     a pair is often the honest count; these are the cases where it is not. */
  { key: 'family_outing', action: 'Walk somewhere new with the family, phones away', domains: ['family', 'health', 'experiences'], framing: 'One afternoon doing the work of three.', setting: ['canMove'] },
  { key: 'partner_walk_month', action: 'Walk with {who} and talk through the month', domains: ['partner', 'health', 'reflection'], framing: 'The conversation you keep meaning to have, while moving.', role: 'partner', setting: ['canMove', 'canSpeakFreely'] },
  { key: 'kid_outdoors', action: 'Take {who} outdoors instead of to a screen', domains: ['children', 'health', 'experiences'], framing: 'They remember the weather, not the tablet.', role: 'child', setting: ['canMove'] },
  { key: 'kid_money_choice', action: 'Let {who} help with one real money decision', domains: ['children', 'finance', 'growth'], hosts: ['finance'], framing: 'A lesson that lands because the money is real.', role: 'child', setting: ['canSpeakFreely'] },
  { key: 'volunteer_with_friend', action: 'Volunteer somewhere with {who} once a month', domains: ['impact', 'friends', 'experiences'], framing: 'Contribution, company, and a day unlike the others.', role: 'friend', setting: ['canMove'] },
  { key: 'build_in_public', action: 'Publish one small piece of the thing you are building', domains: ['purpose', 'career', 'impact'], framing: 'The work stops being private, and starts being useful.', setting: ['hasScreen'] },
  { key: 'trip_around_learning', action: 'Plan one trip around something you want to learn', domains: ['experiences', 'growth', 'purpose'], framing: 'Go somewhere to become someone, not just to be away.', setting: ['hasScreen'] },
  { key: 'mentor_hour', action: 'Mentor someone for one hour a month', domains: ['career', 'impact', 'growth'], framing: 'You get sharper by explaining what you already know.', setting: ['canSpeakFreely'] },

  /* The catalog used to run five deep on health and one deep on purpose,
     friends, career and finance — thinnest exactly where lives starve, and the
     single `purpose` entry required having a child. These even it out, and none
     of them assume anyone you have not told us about. */
  { key: 'purpose_walk', action: 'Walk and think through the thing you keep postponing', domains: ['purpose', 'health'], framing: 'The work you never start gets its hour, and your body gets it too.', setting: ['canMove'] },
  { key: 'purpose_tell_friend', action: 'Tell {who} what you are actually trying to build', domains: ['purpose', 'friends'], framing: 'Saying it out loud is how it stops being a secret.', role: 'friend', setting: ['canSpeakFreely'] },
  { key: 'friend_cook', action: 'Cook for {who} instead of meeting at a restaurant', domains: ['friends', 'health'], framing: 'Longer, cheaper, and you both eat better for it.', role: 'friend', setting: ['canMove'] },
  { key: 'career_first_hour', action: 'Give the first thirty minutes of work to the skill, not the inbox', domains: ['career', 'growth'], framing: 'The compounding half of the job, before the day takes it.', needs: ['hasDeskJob'], setting: ['hasScreen'] },
  /* The same protected hour, for a life whose day answers to no employer —
     the homemaker who wrote "I will have my own business", the student, the
     founder. Career here is the thing being built, not a job being kept. */
  { key: 'build_first_hour', action: 'Give the first quiet hour of the day to the thing you want to build', domains: ['career', 'purpose'], framing: 'The plan you keep postponing starts as one protected hour, before the day fills.', needs: ['selfDirectedWork'], setting: ['hasScreen'] },
  { key: 'school_run_talk', action: 'Make the school run a real conversation with {who}', domains: ['children', 'family'], framing: 'The trip happens anyway; the conversation is the upgrade.', role: 'child', setting: ['canMove', 'canSpeakFreely'] },

  /* Career, where the hour is actually career.
     Once a walking meeting stopped counting as career time, a life short on
     career had one real answer left, and the third row fell through to
     whatever was broadly useful. These are moves where the work itself is
     different afterwards, and none of them need a person we have not been
     told about. */
  { key: 'career_write_up', action: 'Write up one thing you learned this month', domains: ['career', 'growth', 'reflection'], framing: 'The month stops blurring, and it is there when someone asks what you did.', setting: ['hasScreen'] },
  { key: 'career_show_work', action: 'Spend an hour on work that would show someone what you can do', domains: ['career', 'purpose'], framing: 'Proof travels further than a description of yourself.', setting: ['hasScreen'] },
  { key: 'finance_small_review', action: 'Cancel or renegotiate one recurring cost this week', domains: ['finance', 'reflection'], framing: 'Ten minutes once, instead of a worry every month.', setting: ['hasScreen', 'isPrivate'] },
  { key: 'finance_read', action: 'Read about money for fifteen minutes', domains: ['finance', 'growth'], framing: 'A subject that compounds faster than almost anything else you could read.', setting: ['hasScreen'] },
];

/**
 * How much a domain still counts once a chosen stack has already fed it.
 *
 * Without this, three picks in a row all serve the single hungriest domain and
 * the card offers one idea three ways. With it, the second pick has to be worth
 * something on its own — but a domain badly short can still earn a second
 * mention, which is right: one walk does not fix a year.
 */
const ALREADY_FED = 0.25;

/**
 * The domains a stack actually feeds — everything it touches, less what only
 * lends the hour. Never empty: a stack whose every domain were a host would be
 * an hour that changes nothing, which is not a suggestion.
 */
function gainsOf(st: Stack): string[] {
  if (!st.hosts?.length) return st.domains;
  return st.domains.filter((d) => !st.hosts!.includes(d));
}

/** The person in a role who most needs the time — the most overdue, then the longest unseen. */
function pickPerson(role: PersonRole, people: StackPerson[], byPhone?: boolean): StackPerson | null {
  const inRole = people.filter((p) =>
    ROLE_OF[p.relationType?.toLowerCase()] === role
    // A by-phone slot needs somebody at the other end of a line, and a
    // person under the same roof is not — you walk WITH them instead.
    && (!byPhone || p.locationType !== 'same_home'));
  if (!inRole.length) return null;
  return [...inRole].sort((a, b) =>
    (b.overdue ?? 0) - (a.overdue ?? 0)
    || (b.daysSince ?? 0) - (a.daysSince ?? 0)
    || a.name.localeCompare(b.name),
  )[0];
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/**
 * Stacks worth someone's next free hour, most valuable first.
 *
 * @param needs   Every declared domain with its claimed and received share.
 * @param people  Who is actually in this life. Empty means we have not been
 *                told, which is different from being told there is nobody.
 * @param exclude Actions already on the person's list. Something they have
 *                agreed to do is not a suggestion any more — offering it again
 *                is how a card becomes wallpaper. Matched on the rendered text,
 *                which is what a caller has: the title it wrote down.
 * @param shape   What this life contains (`lifeShape`). Omitted means unknown,
 *                and unknown keeps everything available — absence of an answer
 *                is not an answer.
 */
export function suggestStacks(
  needs: DomainShare[],
  people: StackPerson[] = [],
  limit = 3,
  exclude: string[] = [],
  shape?: LifeShape,
  /**
   * Stacks written for this one person, from the Life Blueprint.
   *
   * They compete on exactly the same terms as the built-ins — same ranking,
   * same shortfall arithmetic, same person and life-shape gating — because a
   * generated stack that could not be outranked would be a model deciding
   * what matters, which is the one thing no model here is allowed to do.
   *
   * Ordered ahead of the catalog so that when the two are genuinely tied,
   * the one written for this life wins. That is the only advantage they get.
   */
  extra: Stack[] = [],
): StackSuggestion[] {
  const short = new Map<string, DomainShare>();
  for (const n of needs) if (n.shortfall > 0) short.set(n.domainType, n);
  const declared = new Set(needs.map((n) => n.domainType));

  const knowPeople = people.length > 0;
  const spoken = new Set(exclude.map(normalise));

  /**
   * Every stack this life can actually hold, with its name already filled in.
   *
   * The name has to be resolved before ranking rather than after: a stack is
   * excluded by the text of the action, and the text is not known until the
   * person is chosen.
   */
  const available = [...extra, ...CATALOG]
    .filter((st) => !st.needs || !shape || st.needs.every((c) => shape[c]))
    .filter((st) => !st.role || !knowPeople || pickPerson(st.role, people, st.byPhone))
    .map((st) => {
      const person = st.role ? pickPerson(st.role, people, st.byPhone) : null;
      return {
        st,
        person,
        action: st.role
          ? st.action.replace('{who}', person?.name ?? ANONYMOUS[st.role])
          : st.action,
      };
    })
    .filter((entry) => !spoken.has(normalise(entry.action)));

  /** What each starving domain is still worth, decayed as stacks are chosen. */
  const remaining = new Map([...short].map(([k, v]) => [k, v.shortfall]));

  const out: StackSuggestion[] = [];
  const taken = new Set<string>();

  while (out.length < limit) {
    let best: (typeof available)[number] | null = null;
    let bestHunger = -1;
    let bestTie = -1;

    for (const entry of available) {
      if (taken.has(entry.st.key)) continue;
      // Hunger is spent only on what the stack feeds. A domain that merely
      // hosts the hour is no reason to raise the stack above one that would
      // actually put time into a starving part of a life.
      const gains = gainsOf(entry.st);
      const hunger = gains.reduce((s, d) => s + (remaining.get(d) ?? 0), 0);
      /**
       * What breaks a tie depends on whether anything is starving.
       *
       * With nothing short, every score is zero and the useful answer is the
       * stack touching the most domains this person actually declared —
       * breadth, which is the whole argument for stacking.
       *
       * With something short, breadth is the wrong instinct: it prefers the
       * stack that spreads one hour over three domains to the one that puts it
       * squarely into the starving one. That is how "mentor someone for an
       * hour a month" came to outrank "give the first thirty minutes of work
       * to the skill, not the inbox" for a person whose career was short —
       * both touch career, both scored the same, and the winner was decided by
       * which had been typed into the catalog first. So ties go to whichever
       * concentrates more of itself on what is hungry.
       */
      const tie = hunger > 0
        ? hunger / gains.length
        : gains.filter((d) => declared.has(d)).length;
      if (hunger > bestHunger || (hunger === bestHunger && tie > bestTie)) {
        best = entry; bestHunger = hunger; bestTie = tie;
      }
    }
    if (!best) break;

    const { st: chosen, person, action } = best;
    taken.add(chosen.key);
    const gains = gainsOf(chosen);
    // Only what it feeds can be something it covers — and so only what it
    // feeds can be the reason it is on screen.
    const covers = gains.filter((d) => short.has(d));
    // Argued from what is *still* unmet, so the third row does not repeat the
    // second row's reason. A stack chosen for health after health has already
    // been fed is really on screen for the other thing it touches.
    const arguesFrom = [...covers]
      .sort((a, b) => (remaining.get(b) ?? 0) - (remaining.get(a) ?? 0))[0] ?? null;

    out.push({
      key: chosen.key,
      action,
      framing: chosen.framing,
      domains: chosen.domains,
      covers,
      person: person?.name ?? null,
      personId: person?.id ?? null,
      reason: arguesFrom ? reasonFor(short.get(arguesFrom)!, person) : '',
      reasonDomain: arguesFrom,
      setting: chosen.setting,
    });

    // Decay only what was fed. A hosted domain is exactly as short after this
    // stack as before it, and discounting it would quietly hide the shortfall
    // from every stack chosen after.
    for (const d of gains) {
      const left = remaining.get(d);
      if (left !== undefined) remaining.set(d, left * ALREADY_FED);
    }
  }

  return out;
}

/** Loose enough that a title written down yesterday still matches today. */
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Why a stack is on screen, in the person's own numbers.
 *
 * A recommendation that cannot say why it is a recommendation is a slogan. The
 * shares are the whole argument, and they are stated as shares rather than raw
 * scores because "friends is getting 1% of your attention" is a sentence and
 * "friends has a neglect risk of 7.2" is a readout.
 */
function reasonFor(worst: DomainShare, person: StackPerson | null): string {
  const base = `${worst.domainType} is getting ${pct(worst.received)} of your attention — you asked for ${pct(worst.claimed)}`;
  if (!person || !isWaiting(person)) return `${base}.`;
  if (person.daysSince == null) return `${base}. You have not logged ${person.name} yet.`;
  const d = person.daysSince;
  return `${base}. It has been ${d} ${d === 1 ? 'day' : 'days'} since you and ${person.name} spoke.`;
}

/**
 * Whether someone is far enough past their rhythm to be worth mentioning.
 *
 * Two guards, because one is not enough. `overdue >= 1.5` is the same bar the
 * People tab uses before it calls anyone overdue, so the two screens cannot
 * disagree about who is slipping. The three-day floor exists for the daily
 * cadences: a person you asked to speak to every day is technically "due" the
 * morning after you spoke, and telling someone it has been one day since they
 * talked to their partner reads as a reproach for a lapse that has not
 * happened. The API's `since()` needed the same floor for the same reason.
 */
function isWaiting(person: StackPerson): boolean {
  if ((person.overdue ?? 0) < 1.5) return false;
  return person.daysSince == null || person.daysSince >= 3;
}

/** Total domains a set of stacks would touch. */
export function domainsCovered(stacks: Array<{ domains: string[] }>): string[] {
  return [...new Set(stacks.flatMap((s) => s.domains))];
}

/**
 * The domains a set of stacks would actually *help* — those short of their claim.
 *
 * Distinct from `domainsCovered` on purpose. The old summary line counted every
 * domain a stack touched, so a life already pouring 100 into health read as
 * "these 3 actions touch 5 of your domains" when four of the five needed no
 * help at all. True, and useless.
 */
export function shortfallsCovered(stacks: Array<{ covers: string[] }>): string[] {
  return [...new Set(stacks.flatMap((s) => s.covers))];
}

/**
 * Every action the catalog ships, in its unfilled form.
 *
 * For the blueprint judge, which has to know whether a generated stack is
 * actually new or is a built-in restated. Placeholders are left as they are:
 * the comparison happens before `{who}` becomes a name, so both sides are the
 * generic wording.
 */
export function stackActions(): string[] {
  return CATALOG.map((s) => s.action);
}
