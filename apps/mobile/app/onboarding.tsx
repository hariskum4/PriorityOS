import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated, Platform, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  deriveGoalTitle,
  namesAThing,
  countryFromTimezone,
  momentOptionsFor,
  relationshipSanity,
  relationshipBlocked,
  defaultsForRelation,
  asksAboutCalls,
  asksAboutWish,
  visitDefaultFor,
  parseAge,
  feelingOptions,
  lifeQuestions,
  weekEcho,
  driftEcho,
  somedayEcho,
  revealLedger,
  freeTimeBudget,
  driftFromReality,
  tinyStep,
  DRIFT_SCORE_MAX,
  type MicroReveal,
  type RevealLedger,
} from '@priority/scoring-engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { track } from '@/services/analytics';
import { Button, Card, DomainDot, GapBar, Input, Label } from '@/components/ui';
import { ShareRevealButton } from '@/components/ShareReveal';
import { CountryField } from '@/components/CountryField';
import { CityField } from '@/components/CityField';
import { RegionField } from '@/components/RegionField';
import { HobbyPicker } from '@/components/HobbyPicker';
import { colors, type, space, domainColor, alpha } from '@/theme';

const DOMAIN_LABELS: Record<string, string> = {
  family: 'Family / Parents',
  partner: 'Partner',
  children: 'Children',
  health: 'Health',
  career: 'Career',
  finance: 'Finance',
  growth: 'Personal growth',
  friends: 'Friends',
  experiences: 'Experiences',
  reflection: 'Inner life',
  purpose: 'Purpose / Creative work',
  impact: 'Giving back',
};
const DOMAINS = Object.keys(DOMAIN_LABELS);
const CADENCES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
const CADENCE_PER_YEAR: Record<string, number> = {
  daily: 365, weekly: 52, monthly: 12, quarterly: 4, yearly: 1,
};
const RELATIONS = ['mother', 'father', 'partner', 'sibling', 'friend', 'child'] as const;

/**
 * Where they live, including the option the form never offered.
 *
 * `same_home` was supported everywhere else in the app and missing from the
 * only screen most people would ever answer this on — so a partner or a child
 * had to be filed as living in "the same city", and the People tab then
 * measured the distance to someone in the next room.
 */
const PLACES = ['same_home', 'same_city', 'different_city', 'abroad'] as const;
const PLACE_LABELS: Record<string, string> = {
  same_home: 'same home', same_city: 'same city',
  different_city: 'another city', abroad: 'abroad',
};

const QUESTION_STEPS = 7; // life context, rank, reality+drift, postponing, person, feeling

/**
 * Lanes (activation research: first value in <3 min ≈ 2x retention).
 *  - fast:   rank → one person → the someday check → Reveal. ~90 seconds.
 *  - full:   the depth questions, for people who want them now.
 *  - deepen: entered from Today after a fast start — only the skipped
 *            depth questions, then a regenerated (richer) Life Reveal.
 *
 * Step 4 used to sit between 3 and 5, asking which domains were drifting
 * — the same question step 3 had just asked as a 1–5 score, with nothing
 * reconciling the two answers. Drift is now derived from the scores, so
 * the screen is gone rather than duplicated. Step numbers are unchanged
 * on purpose: they key the saved answers and the analytics.
 */
const LANES: Record<'fast' | 'full' | 'deepen', number[]> = {
  /**
   * Age leads even the hurried lane.
   *
   * The quick start used to skip step 1 entirely, so a fast starter reached
   * Today with no date of birth — and age is the number under every other
   * number this app owns: the body windows, the countables, the whole Time
   * tab. One number pad, five seconds, and the signature feature works. The
   * rest of step 1 (work pattern, household, parents) stays in the longer
   * lane; step 1 renders only the age question when the lane is fast.
   */
  fast: [1, 2, 6, 5],
  /**
   * Step 6 was nine inputs on one screen, second to last, exactly where
   * fatigue peaks. It is now who they are (6) and how you two actually keep
   * in touch (6.5) — fractional for the same reason 0.5 is: the numbers key
   * saved answers and analytics, so existing ones must not shift.
   */
  full: [0.5, 1, 2, 3, 5, 6, 6.5, 7],
  deepen: [0.5, 1, 3, 7],
};

/** The promises the quick start actually keeps — see the opening screen. */
const FAST_LANE_COVERS = new Set(['age', 'rank', 'person', 'someday']);

/** Where a half-finished onboarding waits. Versioned, so a shape change expires it. */
const DRAFT_KEY = 'priority.onboardingDraft.v1';

const WORK_TYPES: Record<string, string> = {
  office_9_5: '9–5 office', remote: 'remote', shift: 'shift work',
  business: 'business owner', freelance: 'freelancer', student: 'student', homemaker: 'homemaker',
  // "not working" used to be one option, and it flattened three different
  // lives into a shrug. A retiree, a job-seeker and someone on a career
  // break want very different things from a tool about time.
  retired: 'retired', between_jobs: 'between jobs', career_break: 'career break',
};
/** Work types whose weeks have no employer hours to count. */
const NO_WORK_HOURS = new Set(['retired', 'between_jobs', 'career_break', 'not_working']);
const WORK_HOURS: Record<string, string> = {
  '35': 'under 40 h', '45': '40–50 h', '55': '50–60 h', '65': '60+ h',
};
/**
 * The hours question a given life can actually answer. "Hours in a typical
 * week" asked of a homemaker has no right answer — the work has no edge, so
 * she either shrugs or writes down a guess the free-time math then treats as
 * gospel. Asking what the household takes is a real number.
 */
const HOURS_LABEL: Record<string, string> = {
  homemaker: 'Hours a week the household takes from you',
  student: 'Hours of classes and study in a typical week',
};
const MARITAL: Record<string, string> = {
  single: 'single', married: 'married', partnered: 'with a partner',
};

/**
 * Tap-first, type-if-you-must — the mobile-form rule this whole flow
 * follows, applied to the one question it forgot on. A bare text box asked
 * everyone to compose an answer on a phone keyboard; a handful of common
 * answers shaped to the work pattern they just picked turns the common case
 * into one tap, and the field stays for the ICU nurse the chips missed.
 * Deliberately not a dropdown: a closed menu hides its options and costs
 * three taps; these are visible and cost one.
 */
const PROFESSION_SUGGESTIONS: Record<string, string[]> = {
  office_9_5: ['Software engineer', 'Teacher', 'Accountant', 'Doctor', 'Designer', 'Marketing', 'Lawyer', 'Banker'],
  remote: ['Software engineer', 'Designer', 'Writer', 'Product manager', 'Consultant', 'Marketing', 'Customer support'],
  shift: ['Nurse', 'Doctor', 'Driver', 'Chef', 'Police officer', 'Factory worker', 'Flight crew', 'Security'],
  business: ['Shop owner', 'Restaurant owner', 'Startup founder', 'Trader', 'Contractor', 'Agency owner'],
  freelance: ['Designer', 'Developer', 'Writer', 'Photographer', 'Consultant', 'Tutor', 'Artist'],
  student: ['Engineering student', 'Medical student', 'Law student', 'MBA student', 'Arts student', 'PhD researcher'],
};
/** The generic list, for lives where the question is "what did you do?" as much as "what do you do?". */
const PROFESSION_DEFAULT = ['Teacher', 'Engineer', 'Doctor', 'Nurse', 'Accountant', 'Designer', 'Shopkeeper', 'Farmer'];

/**
 * The city the device's own timezone names — "Asia/Kolkata" knows a city the
 * way "what country" never asked one. Offered as a single tappable guess,
 * never pre-filled: a smart default the reader can take with one tap or
 * ignore entirely, which is the whole discipline of smart defaults. Zones
 * that name no city (UTC, Etc/*) offer nothing.
 */
function cityFromDeviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    const leaf = tz.split('/').pop() ?? '';
    if (!leaf || /^(UTC|GMT|Universal|Zulu|Greenwich)/i.test(tz) || tz.startsWith('Etc/')) return null;
    const name = leaf.replace(/_/g, ' ');
    /* The tz database keeps its original spellings for compatibility, so a
       great many devices still report Asia/Calcutta and Asia/Saigon. Offering
       somebody in Kolkata a chip reading "Calcutta" is the app using a name
       the city stopped using in 2001 — a small thing, and exactly the kind of
       small thing that reads as carelessness. */
    return ({
      Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Rangoon: 'Yangon',
      Dacca: 'Dhaka', Katmandu: 'Kathmandu', Bombay: 'Mumbai', Madras: 'Chennai',
    } as Record<string, string>)[name] ?? name;
  } catch {
    return null;
  }
}

/**
 * Life Discovery (PRODUCT_PHILOSOPHY.md): values ranking, current-reality
 * scores, drift admission, relationship mapping, and a feeling intention —
 * then the Time Reality Reveal: one finite-window number, framed with
 * agency, ending in a first-priority selection.
 */
export default function Onboarding() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [step, setStep] = useState<number>(0);
  const [lane, setLane] = useState<'fast' | 'full' | 'deepen'>('full');

  const [futureSelf, setFutureSelf] = useState('');
  const [eulogy, setEulogy] = useState('');
  const [userAge, setUserAge] = useState('');
  const [workType, setWorkType] = useState('');
  const [workHours, setWorkHours] = useState('');
  /**
   * Two facts four AI services already read and no screen ever wrote.
   *
   * The grounding rules tell the model to use "their profession, their
   * studies" — against a column that was null for every account ever made.
   * Full lane only, both optional: the fast lane's promise is ninety
   * seconds, and a blank here costs nothing it wasn't already costing.
   */
  const [profession, setProfession] = useState('');
  const [city, setCity] = useState('');
  /** Computed once — the device's zone does not change mid-form. */
  const deviceCity = React.useMemo(cityFromDeviceTimezone, []);
  /**
   * Seeded from the same zone signup used, so the common case needs no tap
   * and the uncommon one needs exactly one. Left as a real answer rather than
   * a silent default: whatever is showing when they move on is what gets
   * written, which is the point — before this, nothing they did on this
   * screen could change it.
   */
  const [country, setCountry] = useState<string>(
    () => countryFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? '',
  );
  /**
   * The state, kept only for as long as this form is open.
   *
   * It narrows the city list and nothing else — the country carries the
   * life-expectancy figure, the city carries the context, and neither of them
   * needs to know which state it came through. Storing it would be keeping
   * data to serve the form rather than the reader; on the You tab it is
   * re-derived from the saved city instead.
   */
  const [region, setRegion] = useState('');
  /**
   * What they do for themselves, and what they used to do.
   *
   * Kept apart all the way through — see `hobbies.ts` for why merging them
   * is the one thing this pair must never do.
   */
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [lapsedHobbies, setLapsedHobbies] = useState<string[]>([]);
  const [marital, setMarital] = useState('');
  const [children, setChildren] = useState<string>('0');
  const [awayFromParents, setAwayFromParents] = useState<string>('');
  const [ranking, setRanking] = useState<string[]>([]);
  const [reality, setReality] = useState<Record<string, number>>({}); // 1..5
  /** Domains they never ranked but say are slipping — the only drift input. */
  const [alsoSlipping, setAlsoSlipping] = useState<string[]>([]);
  /**
   * Drifting is not a separate answer — it is what a 1 or a 2 means. Asking
   * again on its own screen let someone rate a domain 5/5 and then flag it
   * as drifting, and the Life Reveal printed both.
   */
  const neglected = driftFromReality({ ranking, reality, alsoSlipping });
  const [person, setPerson] = useState({ name: '', relationType: 'mother' as string });
  const [personAge, setPersonAge] = useState<string>('');
  const [locationType, setLocationType] = useState<string>('different_city');
  const [healthStatus, setHealthStatus] = useState<string>('');
  const [callFrequency, setCallFrequency] = useState<string>('monthly');
  const [desired, setDesired] = useState<string>('weekly');
  const [visitFrequency, setVisitFrequency] = useState<string>('quarterly');
  /** What is worth counting with this person, in their reader's own words. */
  const [moments, setMoments] = useState<string[]>([]);
  /**
   * A moment in their own words, committed into `moments` on enter or blur.
   * Transient by design: once committed it is an ordinary chip — visible,
   * selected, removable — and the box empties for the second one. The cap
   * of two is the same cap the chips enforce.
   */
  const [customMoment, setCustomMoment] = useState('');
  const commitCustomMoment = () => {
    const m = customMoment.trim().toLowerCase();
    setCustomMoment('');
    if (!m) return;
    setMoments((prev) => (prev.includes(m) || prev.length >= 2 ? prev : [...prev, m]));
  };
  /**
   * Which of the person pickers the reader has actually touched.
   *
   * Picking "partner" should move the other answers somewhere plausible —
   * same house, spoken to daily — because seven pickers that all open on the
   * same default is a form, and seven that open somewhere sensible is a
   * confirmation. But it must never overwrite an answer already given: the
   * person who set "abroad" and then corrected the relation type would watch
   * their own answer disappear.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const pickRelation = (rel: string) => {
    setPerson({ ...person, relationType: rel });
    const d = defaultsForRelation(rel);
    if (!touched.locationType) setLocationType(d.locationType);
    if (!touched.callFrequency) setCallFrequency(d.callFrequency);
    if (!touched.desired) setDesired(d.desiredCallFrequency);
    if (!touched.visitFrequency) setVisitFrequency(d.inPersonFrequency);
  };

  /**
   * Moving somebody moves how often you could possibly see them.
   *
   * The relation defaults assume a child is at home and seen daily. Change
   * the address to "another city" and nothing re-derived: the screen read
   * "another city" above "see them in person: daily", and would have recorded
   * it. Distance bounds visits, so visits follow the address — unless the
   * reader picked one themselves, in which case it stands and the sanity note
   * says what looks odd about it rather than the app quietly overruling them.
   */
  const pickLocation = (loc: string) => {
    setTouched((t) => ({ ...t, locationType: true }));
    setLocationType(loc);
    if (!touched.visitFrequency) setVisitFrequency(visitDefaultFor(loc));
  };
  const own = <T,>(field: string, set: (v: T) => void) => (v: T) => {
    setTouched((t) => ({ ...t, [field]: true }));
    set(v);
  };

  /**
   * Not asked when they live in the same house, so not guessed at either —
   * the honest answer for someone in the next room is "daily".
   */
  const effectiveCall = asksAboutCalls(locationType) ? callFrequency : 'daily';
  /**
   * What they wish, or what they already do when there was nothing to wish.
   *
   * The wish row is hidden once the actual cadence is daily, and a question
   * that was never shown must not submit a stale answer: somebody who talks
   * to their son every day would otherwise have "wants weekly" recorded from
   * a default they never saw, and the People tab measures overdue against
   * exactly that field.
   */
  const effectiveDesired = asksAboutWish(effectiveCall) ? desired : effectiveCall;

  /**
   * Whether what they have told us about this person holds together.
   *
   * Age blocks: it is the input the visits-remaining, childhood-window and
   * closing-window readings are all built on, and leaving it optional meant a
   * People tab that silently counted nothing. Everything else is a note —
   * allowed, and worth hearing while the answer is still on screen.
   */
  const personFindings = React.useMemo(() => relationshipSanity({
    name: person.name,
    relationType: person.relationType,
    age: personAge,
    userAge: parseAge(userAge),
    locationType,
    // Withheld when the question was not asked, so it cannot produce a note.
    callFrequency: asksAboutCalls(locationType) ? callFrequency : null,
    desiredCallFrequency: effectiveDesired,
    inPersonFrequency: visitFrequency,
  }), [
    person.name, person.relationType, personAge, userAge,
    locationType, callFrequency, desired, visitFrequency,
  ]);
  const personBlocked = relationshipBlocked(personFindings);
  /**
   * Which screen each finding belongs to, now that the person is two screens.
   *
   * Splitting the nine-input page into 6 and 6.5 left this list rendered only
   * under step 6 — while three of the four inputs it reasons about (where
   * they live, how often you talk, how often you visit) moved to 6.5. So
   * every rule keyed on those became unreachable: a third of them, including
   * both cadence notes and both location notes. A father who said his
   * daughter lives in the same home and that he sees her monthly generated
   * three findings and was shown one.
   *
   * `age` findings are decided by the name, relation and age on this screen
   * and nothing else, so they stay. The rest are only true once the next
   * screen has been answered, and belong there.
   */
  const ageFindings = personFindings.filter((f) => f.field === 'age');
  const cadenceFindings = personFindings.filter((f) => f.field !== 'age');

  const [postponing, setPostponing] = useState('');
  const [postponingDomain, setPostponingDomain] = useState('');
  /**
   * The domain this goal files under, shown rather than assumed.
   *
   * `finish` falls back to `ranking[0]` when nothing is picked, so the goal
   * always landed somewhere — just somewhere the reader was never shown and
   * never agreed to. The fallback stays (it is the sane one), but now it is
   * on screen as a preselected chip they can move, which is the difference
   * between a smart default and a silent one.
   */
  const effectivePostponingDomain = postponingDomain || ranking[0] || '';
  const [feeling, setFeeling] = useState<string>('');
  /**
   * The last question, asked in their own terms.
   *
   * By the time this step is reached the app has been told which parts of a
   * life matter, which ones are drifting, and the name of one person. Offering
   * the same six words to everyone was the app forgetting all of it on the
   * final page — and "more alive" cannot be checked against anything a week
   * later, where "closer to Amma" can.
   */
  const feelings = React.useMemo(
    () => feelingOptions({ ranking, neglected, personName: person.name }),
    [ranking, neglected, person.name],
  );
  /* A choice that is no longer on offer must not stay selected — changing the
     ranking behind it would otherwise leave an answer nobody can see. */
  useEffect(() => {
    if (feeling && !feelings.includes(feeling)) setFeeling('');
  }, [feelings, feeling]);
  const [style, setStyle] = useState<string>('balanced');

  /**
   * Which of the life questions this life can actually answer. The gate is
   * age, not "student" — adult students marry and raise children; what a
   * sixteen-year-old must not be offered is "married" and "3+ children".
   */
  const plan = lifeQuestions(userAge, workType);

  /**
   * Micro-reveals: every answer buys the person a fact about themselves,
   * shown while the answer is still warm. All deterministic — the same
   * engine the Time tab runs, so nothing here waits on a server or a model.
   */
  const domainLabel = (d: string) => DOMAIN_LABELS[d] ?? d;
  const statedHours = NO_WORK_HOURS.has(workType)
    ? 0
    : workHours ? parseInt(workHours, 10) : null;
  const weekFact = weekEcho({ workHoursPerWeek: statedHours, workType });
  const somedayFact = somedayEcho(postponing);
  const driftFact = driftEcho({ ranking, neglected, reality, labelOf: domainLabel });

  const [reveal, setReveal] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  /**
   * The same importance scores every other screen shows, keyed by domain.
   *
   * The reveal used to compute its own "you say" number from rank position,
   * so Family read 100 here and 68 on Today one tap later — two formulas
   * wearing one label. The server's score is the only one the rest of the app
   * agrees with, so this screen reads it too.
   */
  const [domainScores, setDomainScores] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, item: string, max = 10) => {
    if (list.includes(item)) set(list.filter((d) => d !== item));
    else if (list.length < max) set([...list, item]);
  };

  /**
   * The answers survive the app closing.
   *
   * Everything above lives in component state, so a phone call on the person
   * screen threw away six answers and dropped the reader back at "First, the
   * honest part" — the single most expensive moment to lose, because they had
   * already paid for it. Written on every change, restored once on mount,
   * deleted the moment the reveal is earned.
   *
   * `hydrated` exists because the writer would otherwise fire on the first
   * render and overwrite the stored draft with the empty initial state before
   * the reader had a chance to load it.
   */
  const [hydrated, setHydrated] = useState(false);
  const draft = {
    step, lane, futureSelf, eulogy, userAge, workType, workHours, profession, city, country,
    marital, children, awayFromParents, ranking, reality, alsoSlipping,
    person, personAge, locationType, healthStatus, callFrequency, desired,
    visitFrequency, moments, postponing, postponingDomain, feeling, style, touched,
  };
  useEffect(() => {
    /* Deepen loads from the server instead — its answers are already saved,
       and a stale local draft would fight them. */
    if (mode === 'deepen') { setHydrated(true); return; }
    let alive = true;
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw);
        /* A draft older than a week is a different intention. */
        if (!saved?.at || Date.now() - saved.at > 7 * 86_400_000) {
          AsyncStorage.removeItem(DRAFT_KEY);
          return;
        }
        const d = saved.draft ?? {};
        if (typeof d.lane === 'string') setLane(d.lane);
        if (typeof d.futureSelf === 'string') setFutureSelf(d.futureSelf);
        if (typeof d.eulogy === 'string') setEulogy(d.eulogy);
        if (typeof d.userAge === 'string') setUserAge(d.userAge);
        if (typeof d.workType === 'string') setWorkType(d.workType);
        if (typeof d.workHours === 'string') setWorkHours(d.workHours);
        if (typeof d.profession === 'string') setProfession(d.profession);
        if (typeof d.city === 'string') setCity(d.city);
        if (typeof d.country === 'string') setCountry(d.country);
        if (typeof d.marital === 'string') setMarital(d.marital);
        if (typeof d.children === 'string') setChildren(d.children);
        if (typeof d.awayFromParents === 'string') setAwayFromParents(d.awayFromParents);
        if (Array.isArray(d.ranking)) setRanking(d.ranking);
        if (d.reality && typeof d.reality === 'object') setReality(d.reality);
        if (Array.isArray(d.alsoSlipping)) setAlsoSlipping(d.alsoSlipping);
        if (d.person && typeof d.person === 'object') setPerson(d.person);
        if (typeof d.personAge === 'string') setPersonAge(d.personAge);
        if (typeof d.locationType === 'string') setLocationType(d.locationType);
        if (typeof d.healthStatus === 'string') setHealthStatus(d.healthStatus);
        if (typeof d.callFrequency === 'string') setCallFrequency(d.callFrequency);
        if (typeof d.desired === 'string') setDesired(d.desired);
        if (typeof d.visitFrequency === 'string') setVisitFrequency(d.visitFrequency);
        if (Array.isArray(d.moments)) setMoments(d.moments);
        if (typeof d.postponing === 'string') setPostponing(d.postponing);
        if (typeof d.postponingDomain === 'string') setPostponingDomain(d.postponingDomain);
        if (typeof d.feeling === 'string') setFeeling(d.feeling);
        if (typeof d.style === 'string') setStyle(d.style);
        if (d.touched && typeof d.touched === 'object') setTouched(d.touched);
        /* Last, so the screen it lands on is the one they left. */
        if (typeof d.step === 'number') setStep(d.step);
      })
      .catch(() => {})
      .finally(() => { if (alive) setHydrated(true); });
    return () => { alive = false; };
  }, [mode]);
  useEffect(() => {
    if (!hydrated || mode === 'deepen') return;
    /* Nothing to keep before they have started, and nothing to keep once the
       reveal is up — `finish` clears it explicitly. */
    if (step === 0 || step > QUESTION_STEPS) return;
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), draft })).catch(() => {});
  });

  // Deepen mode: skip the intro, load what they already told us (the reality
  // step scores the domains they ranked during the fast start).
  useEffect(() => {
    if (mode !== 'deepen') return;
    setLane('deepen');
    api<any[]>('/onboarding/answers')
      .then((answers) => {
        const get = (key: string) => answers?.find((a) => a.key === key)?.value;
        const ranked = get('priorityRanking');
        if (Array.isArray(ranked) && ranked.length) setRanking(ranked);
        if (typeof get('futureSelf') === 'string') setFutureSelf(get('futureSelf'));
        if (typeof get('eulogy') === 'string') setEulogy(get('eulogy'));
        if (typeof get('firstWeekFeeling') === 'string') setFeeling(get('firstWeekFeeling'));
      })
      .catch(() => {})
      .finally(() => setStep(LANES.deepen[0]));
  }, [mode]);

  // Sequence-driven navigation: each lane walks its own list of steps.
  const seq = LANES[lane];
  const pos = seq.indexOf(step);
  const isLastStep = pos === seq.length - 1;
  const next = () => (isLastStep ? finish() : setStep(seq[pos + 1]));
  const back = () => {
    if (pos > 0) setStep(seq[pos - 1]);
    else if (lane === 'deepen') router.back();
    else setStep(0);
  };
  // Terminal steps build the reveal; mid-lane steps just advance.
  const nextTitle = isLastStep ? (busy ? 'Building your Life Reveal…' : 'See my Life Reveal') : 'Next';

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      // Life context → profile; work hours feed the Time Reality engine's
      // realistic visit-capacity math.
      await api('/me', {
        method: 'PATCH',
        body: {
          // Age anchors every life-window calculation on the Time tab.
          dob: userAge
            ? new Date(new Date().getFullYear() - parseInt(userAge, 10), 6, 1).toISOString()
            : undefined,
          workType: workType || undefined,
          /* Optional and trimmed — an untouched field must not write an
             empty string over a column the AI reads as "their words". */
          profession: profession.trim() || undefined,
          city: city.trim() || undefined,
          /* The one field on that screen that decides an arithmetic rather
             than a vocabulary, so it is sent whenever the screen was shown —
             including when they cleared it, which is a real answer meaning
             "use the world average" and must be able to overwrite the
             timezone's guess. The fast lane never shows it, and a lane that
             did not ask must not answer. */
          ...(lane === 'fast' ? {} : { country: country.trim().toUpperCase() || null }),
          // Not working means 0, not "unspecified" — leaving this undefined
          // let the Time tab's ?? 45 fallback quietly assume a 45h work
          // week for retired/non-working users, wrecking their free-time math.
          workHoursPerWeek:
            NO_WORK_HOURS.has(workType) ? 0 : workHours ? parseInt(workHours, 10) : undefined,
          // Questions the plan withheld must not leak stale answers — someone
          // who picked "married" and then corrected their age to 17 has no
          // visible answer left, so none may be submitted either.
          maritalStatus: plan.askMarital ? marital || undefined : undefined,
          /* Withheld means unknown, not zero. Sending 0 for a question the
             plan never asked would also wipe a real answer given earlier —
             a deepen pass that hides the children row must not reset it. */
          childrenCount: plan.askChildren ? parseInt(children, 10) || 0 : undefined,
          /**
           * Both fields, only when the question was actually answered.
           *
           * These read `awayFromParents`, which only the step-1 PickRow ever
           * sets — and the fast lane does not show step 1. So every quick
           * start wrote `livesAwayFromParents: false` and `parentsInLife:
           * true`: the app recording that someone lives with their parents
           * and that their parents are alive, having asked neither. The
           * second one is the same failure the three-answer question was
           * built to prevent — `blueprint.service` reads `parentsInLife
           * !== false` and will write a mother into a life that may not
           * have one. Silence is now silence.
           */
          livesAwayFromParents: awayFromParents ? awayFromParents === 'yes' : undefined,
          parentsInLife: awayFromParents ? awayFromParents !== 'neither' : undefined,
          motivationStyle: style,
        },
      });
      // The postponed thing becomes the user's first real goal — the Goals
      // table is what the engine's importance scoring reads from. This answer
      // is free text and people write paragraphs, so split it into a name and
      // its reasoning rather than posting an essay as a title. The API
      // normalises again on its side; doing it here keeps the intent explicit
      // and lets the reveal show the same short name the user will see later.
      /* Only an answer that names a thing becomes a goal. "Everything. I do
         not know where to start any more." is an honest answer to this
         question and is not a goal — written into one it becomes a permanent
         row the goal engine nags about forever ("Take the smallest possible
         step on 'Everything…'"), the app repeating someone's worst sentence
         back to them on a schedule. The answer itself is still saved below,
         where it belongs. */
      if (postponing.trim() && namesAThing(postponing)) {
        const goal = deriveGoalTitle(postponing);
        await api('/goals', {
          method: 'POST',
          body: {
            title: goal.title,
            description: goal.description,
            domainType: effectivePostponingDomain || 'growth',
            horizon: '1y',
          },
        });
      }
      // Only send answers that carry a value — a deepen pass must never
      // blank out what the fast lane already saved (upsert semantics).
      const hasValue = (v: unknown) =>
        Array.isArray(v) ? v.length > 0
        : typeof v === 'string' ? v.trim().length > 0
        : v && typeof v === 'object' ? Object.keys(v).length > 0
        : v != null;
      await api('/onboarding/answers', {
        method: 'POST',
        body: {
          answers: [
            { section: 'values', key: 'priorityRanking', value: ranking },
            { section: 'values', key: 'currentReality', value: reality },
            { section: 'values', key: 'neglectedDomains', value: neglected },
            { section: 'values', key: 'regretRisks', value: neglected.slice(0, 3) },
            { section: 'values', key: 'firstWeekFeeling', value: feeling },
            { section: 'reflection', key: 'postponing', value: postponing },
            { section: 'reflection', key: 'futureSelf', value: futureSelf },
            { section: 'reflection', key: 'eulogy', value: eulogy },
            /* Grounding, and the one thing worth putting back. Sent as
               `life` rather than `reflection`: these are facts about a
               person, not something they worked out about themselves. */
            { section: 'life', key: 'hobbies', value: hobbies },
            { section: 'life', key: 'lapsedHobbies', value: lapsedHobbies },
          ].filter((a) => hasValue(a.value)),
        },
      });
      if (person.name) {
        await api('/relationships', {
          method: 'POST',
          body: {
            ...person,
            age: parseAge(personAge) ?? undefined,
            locationType,
            healthStatus: healthStatus || undefined,
            callFrequency: effectiveCall,
            /* The wish is only asked where the call question is (see 6.5) —
               a shared roof gets neither, and a question never shown must
               not submit its default. The People tab measures overdue
               against this field, so an unasked "weekly" would set a clock
               nobody agreed to, against a person in the next room. */
            ...(asksAboutCalls(locationType) ? { desiredCallFrequency: effectiveDesired } : {}),
            inPersonFrequency: visitFrequency,
            closenessScore: 9,
            wantsMoreTime: true,
            /* The field two features read and nothing has ever written. */
            meaningfulMomentTypes: moments,
          },
        });
      }
      const res = await api<{ reveal: any }>('/onboarding/complete', { method: 'POST' });
      /* Earned and saved server-side — the local draft has nothing left to
         protect, and keeping it would restore a finished flow on next open. */
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      setReveal(res.reveal);
      api<any[]>('/insights/opportunities')
        .then((list) => setInsights(list ?? []))
        .catch(() => {});
      api<any>('/dashboard')
        .then((d) => {
          const rows: any[] = d?.domains ?? [];
          setDomainScores(
            Object.fromEntries(rows.map((r) => [r.domainType, Number(r.importance) || 0])),
          );
        })
        .catch(() => {});
      setStep(QUESTION_STEPS + 1);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      {pos >= 0 && step !== 0 && step !== QUESTION_STEPS + 1 && (
        <View style={s.progressHeader}>
          {/* Every control on this screen reaches a screen reader as an
              unnamed `generic` without this — including the only way back. */}
          <Pressable
            onPress={back}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back to the previous question"
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textDim} />
          </Pressable>
          <View style={s.progressTrack}>
            {seq.map((_, i) => (
              <View key={i} style={[s.progressSeg, i <= pos && { backgroundColor: colors.amber }]} />
            ))}
          </View>
          <Text style={type.faint}>{pos + 1}/{seq.length}</Text>
        </View>
      )}

      {step === 0 && (
        <View style={{ gap: space(4), paddingTop: space(10) }}>
          <View style={s.mark}>
            <View style={s.markRing} />
            <View style={s.markDot} />
          </View>
          <Text style={[type.display, { textAlign: 'center' }]}>First, the honest part</Text>
          <Text style={[type.serif, { textAlign: 'center', color: colors.textDim }]}>
            Four questions if you're in a hurry. Seven if you're not.{'\n'}
            Either way, we show you the gap between the life you describe and the life your time describes.
          </Text>
          {/* Which promises each lane actually keeps.
              This list showed six bullets above a button that answered three
              of them — a contract offered and then not honoured, on the first
              screen of the product. The brass marks are the quick start; the
              rest are what the extra minutes buy. */}
          <View style={{ gap: space(3), marginTop: space(4) }}>
            {([
              ['calendar-outline', 'Tell us your age — every number here rests on it', 'age'],
              ['podium-outline', 'Rank what actually matters to you', 'rank'],
              ['heart-outline', 'Name one person you want to show up for', 'person'],
              ['hourglass-outline', 'Name the thing you keep postponing', 'someday'],
              ['briefcase-outline', 'Tell us how your weeks actually work', 'week'],
              ['speedometer-outline', 'Score how you are living each one today', 'score'],
              ['sunny-outline', 'Choose how you want to feel in a week', 'feeling'],
            ] as const).map(([icon, text, key]) => {
              const inFast = FAST_LANE_COVERS.has(key);
              return (
                <View key={key} style={s.promiseRow}>
                  <Ionicons
                    name={icon as any}
                    size={18}
                    color={inFast ? colors.amber : colors.textFaint}
                  />
                  <Text style={[type.body, { flex: 1 }, !inFast && { color: colors.textDim }]}>
                    {text}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={[type.faint, { textAlign: 'center' }]}>
            Brass is the quick start. The rest is what four minutes buys.
          </Text>
          <Button
            title="Quick start — 90 seconds"
            onPress={() => { track('onboarding_started', { lane: 'fast' }); setLane('fast'); setStep(LANES.fast[0]); }}
          />
          <Pressable
            onPress={() => { track('onboarding_started', { lane: 'full' }); setLane('full'); setStep(LANES.full[0]); }}
            accessibilityRole="button"
            accessibilityLabel="I have four minutes — ask me everything"
          >
            <Text style={[type.dim, { textAlign: 'center', padding: 6, color: colors.amber }]}>
              I have four minutes — ask me everything
            </Text>
          </Pressable>
          <Text style={[type.faint, { textAlign: 'center' }]}>
            Either way: no forms after this. Priority learns from behavior, not data entry.
          </Text>
        </View>
      )}

      {step === 0.5 && (
        <View style={{ gap: space(4), paddingTop: space(6) }}>
          {/* Future self-continuity (Hershfield), not memento mori. The funeral
              version of this screen was the one surface left that broke the
              house rule ("no reference to lifespan or death", RESEARCH_NOTES §4)
              — and it broke it on the first screen of the product. Same two
              answers, same downstream extraction; only the narrator changed:
              alive at the table instead of in the coffin. */}
          <Text style={type.display}>The long view</Text>
          <Text style={[type.serif, { color: colors.textDim }]}>
            Picture yourself at 80, looking back on a life that went well. This is the compass for everything else — but it's optional. Skip if you'd rather just begin.
          </Text>
          <View style={{ gap: space(2) }}>
            <Label>Who is around you, and what did you build?</Label>
            <Input multiline value={futureSelf} onChangeText={setFutureSelf} placeholder="The people, the feeling, the kind of person you became…" />
          </View>
          <View style={{ gap: space(2) }}>
            <Label>At your 80th birthday, the people who know you best each say a few words. What do you hope they say — about the person, not the achievements?</Label>
            <Input multiline value={eulogy} onChangeText={setEulogy} placeholder="They were someone who always…" />
          </View>
          <Button title="Continue" onPress={next} />
          <Pressable
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel="Skip the long view — I'll just begin"
          >
            <Text style={[type.faint, { textAlign: 'center', padding: 6 }]}>Skip — I'll just begin</Text>
          </Pressable>
        </View>
      )}

      {step === 1 && (
        <>
          {/* One question in the quick lane, the whole life context in the
              long one. Age is here either way: it is the number every other
              number on the Time tab is derived from, and the fast lane used
              to skip this screen entirely and leave it unknown forever. */}
          <Text style={type.display}>
            {lane === 'fast' ? 'One number first' : 'First, your life as it is'}
          </Text>
          <Text style={type.dim}>
            {lane === 'fast'
              ? 'Every window Priority draws — the years, the visits, the weeks — is measured from here.'
              : "Your work pattern shapes what's realistic — Priority plans around your life, not an imaginary one."}
          </Text>
          <View style={{ gap: space(4), marginTop: space(2) }}>
            <View style={{ gap: space(2) }}>
              <Label>Your age</Label>
              <Input
                placeholder="e.g. 32"
                keyboardType="number-pad"
                value={userAge}
                onChangeText={(v) => setUserAge(v.replace(/[^0-9]/g, ''))}
                style={{ maxWidth: 120 }}
              />
            </View>
            {lane !== 'fast' && (
            <PickRow
              label="Your work looks like"
              options={Object.keys(WORK_TYPES)}
              display={WORK_TYPES}
              value={workType}
              onPick={setWorkType}
            />
            )}
            {lane !== 'fast' && !NO_WORK_HOURS.has(workType) && (
              <PickRow
                label={HOURS_LABEL[workType] ?? 'Hours in a typical week'}
                options={Object.keys(WORK_HOURS)}
                display={WORK_HOURS}
                value={workHours}
                onPick={setWorkHours}
              />
            )}
            {/* The vocabulary question. Everything generated downstream is
                told to speak in "their profession, their studies" — words
                that were null for every account, because nothing ever asked.
                Full lane only, and skippable: the fast lane's promise is
                ninety seconds, and silence here costs only what it already
                cost. Chips lead and the field follows — tapping fills the
                field, so there is one answer in one place, still editable. */}
            {lane !== 'fast' && (
              <>
                <View style={{ gap: space(2) }}>
                  <Label>What you do</Label>
                  <Text style={type.faint}>
                    Optional — it teaches Priority your words. A nurse's week
                    and a founder's week need different advice.
                  </Text>
                  <View style={s.chips}>
                    {(PROFESSION_SUGGESTIONS[workType] ?? PROFESSION_DEFAULT).map((p) => {
                      const on = profession === p;
                      return (
                        <Pressable
                          key={p}
                          onPress={() => setProfession(on ? '' : p)}
                          accessibilityRole="button"
                          accessibilityLabel={p}
                          aria-selected={on}
                          style={({ pressed }) => [
                            s.chip,
                            on && s.chipOn,
                            pressed && { transform: [{ scale: 0.96 }] },
                          ]}
                        >
                          <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                            {p}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Input
                    /* Short enough to survive a 375px field — the longer
                       version was clipped mid-word ("…potter, ima"), which
                       reads as a bug rather than an invitation. */
                    placeholder="…or your own words"
                    value={profession}
                    onChangeText={setProfession}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>
                {/**
                  * Where you live, asked the way an address is written:
                  * country, then the state inside it, then the city inside
                  * that.
                  *
                  * It used to run the other way — an unbounded "where you
                  * live" box first, with the country underneath it. Which
                  * meant the field that could have made the question small
                  * was answered after the question, and a reader in Ranchi
                  * typed their own city into a box that knew ten Indian
                  * cities and got nothing back. Each answer here shortens the
                  * next list; that is the entire reason a list beats a box.
                  *
                  * The country, meanwhile, is asked rather than assumed. It
                  * was never asked at all — signup derived it from the device
                  * timezone and that stood for good — so somebody who typed
                  * "Vigo" was still filed under India by a phone that had not
                  * been reset since the flight, and the Reveal counted his
                  * daughter's remaining visits over fourteen years instead of
                  * twenty-two. Pre-filled with the guess, because the guess is
                  * usually right.
                  */}
                <View style={{ gap: space(2) }}>
                  <Label>Where you live</Label>
                  <CountryField
                    value={country}
                    onPick={(code) => {
                      setTouched((t) => ({ ...t, country: true }));
                      setCountry(code ?? '');
                      /* A new country makes the two answers below it stale —
                         Kerala is not a state of Spain. */
                      setRegion('');
                      setCity('');
                    }}
                    footer="Only used to pick the life-expectancy figure behind your Time numbers."
                  />
                  <RegionField value={region} onChange={setRegion} country={country} />
                  <CityField
                    value={city}
                    onChange={setCity}
                    country={country}
                    region={region}
                    deviceGuess={deviceCity}
                  />
                </View>
              </>
            )}
            {/**
              * The one thing the app has never asked, and the reason every
              * generated suggestion read as though assembled from a CV.
              *
              * Two questions rather than one, because the answers are used
              * for opposite things — what you keep is grounding, what you
              * have lost is the behavioural-activation rung with a name in
              * it. Merged, they produce the cruellest sentence this app
              * could write: telling somebody to play the guitar they gave up
              * when the second child arrived, as though they had simply
              * forgotten to.
              *
              * Optional, both of them. Silence here costs nothing and leaves
              * the app exactly as it was.
              */}
            {lane !== 'fast' && (
              <>
                <View style={{ gap: space(2) }}>
                  <Label>What do you do for yourself? (optional)</Label>
                  <Text style={type.faint}>
                    Pick what fits, or type your own. Priority builds around what you
                    already do rather than guessing from your job.
                  </Text>
                  <HobbyPicker
                    value={hobbies}
                    onChange={setHobbies}
                    placeholder="…or one of your own"
                  />
                </View>
                <View style={{ gap: space(2) }}>
                  <Label>Anything you used to do and miss? (optional)</Label>
                  <Text style={type.faint}>
                    Not a reproach — it is the thing most worth putting back in a week,
                    and Priority will only ever offer it, once.
                  </Text>
                  <HobbyPicker
                    value={lapsedHobbies}
                    onChange={setLapsedHobbies}
                    placeholder="…or one of your own"
                    max={4}
                  />
                </View>
              </>
            )}
            {lane !== 'fast' && plan.askMarital && (
              <PickRow
                label="At home you are"
                options={Object.keys(MARITAL)}
                display={MARITAL}
                value={marital}
                onPick={setMarital}
              />
            )}
            {lane !== 'fast' && plan.askChildren && (
              <PickRow
                label="Children"
                options={['0', '1', '2', '3']}
                display={{ '0': 'none', '3': '3+' }}
                value={children}
                onPick={setChildren}
              />
            )}
            {/* Three answers, because two of them were a false choice. Anyone
                whose parents have died had to claim they live "away from"
                them, and the app then spent a year offering to help them call
                home. `neither` is a catch-all on purpose — death, estrangement
                and not wanting to say are one answer, since the app needs one
                fact and has no business itemising the reason.

                Withheld from the quick lane rather than answered for them:
                `finish` now sends nothing at all when this is untouched. */}
            {lane !== 'fast' && (
              <PickRow
                label={plan.awayLabel}
                options={['yes', 'no', 'neither']}
                display={{ neither: plan.awayNeitherLabel }}
                value={awayFromParents}
                onPick={setAwayFromParents}
              />
            )}
            {/* Keyed so a changed week fades in again — a corrected answer
                should land its corrected number, not silently swap a digit. */}
            {weekFact && <EchoCard key={`${workType}-${workHours}`} echo={weekFact} />}
            <Button
              title={nextTitle}
              onPress={next}
              disabled={
                busy || !userAge || (lane !== 'fast' && (
                  !workType || !awayFromParents
                  || (!NO_WORK_HOURS.has(workType) && !workHours)
                ))
              }
            />
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <Text style={type.display}>What matters most?</Text>
          <Text style={type.dim}>Tap in order of importance. Your first tap is your #1. Pick at least three.</Text>
          <View style={s.chips}>
            {DOMAINS.map((d) => {
              const idx = ranking.indexOf(d);
              const on = idx >= 0;
              const c = domainColor(d);
              return (
                <Pressable
                  key={d}
                  onPress={() => toggle(ranking, setRanking, d)}
                  accessibilityRole="button"
                  accessibilityLabel={on ? `${DOMAIN_LABELS[d] ?? d}, ranked ${idx + 1}` : DOMAIN_LABELS[d] ?? d}
                  aria-selected={on}
                  style={({ pressed }) => [
                    s.chip,
                    on && { borderColor: c, backgroundColor: `${c}1F` },
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                >
                  {/* The badge is always in the layout, visible only once
                      ranked. Mounting it on selection grew the chip and
                      reflowed the whole wrapped grid between taps — and this
                      input asks for three to five *ordered* taps, so the chip
                      a reader was aiming at had already moved. */}
                  <View style={[s.rankBadge, on && { backgroundColor: c }]}>
                    {on && (
                      <Text style={{ color: colors.bg, fontSize: 11, fontWeight: '800' }}>{idx + 1}</Text>
                    )}
                  </View>
                  <Text style={[type.body, on && { color: c, fontWeight: '700' }]}>
                    {DOMAIN_LABELS[d]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button title={nextTitle} onPress={next} disabled={busy || ranking.length < 3} />
        </>
      )}

      {step === 3 && (
        <>
          <Text style={type.display}>And honestly — how are you living them?</Text>
          <Text style={type.dim}>
            For each area you ranked: 1 means barely present in your weeks, 5 means fully lived.
            Anything at {DRIFT_SCORE_MAX} or below we'll treat as drifting — no need to tell us twice.
          </Text>
          {/* One screen holding up to five separate answers, with the only
              progress indicator counting whole steps — so a reader scoring
              their fourth of five domains saw the same "4/7" they saw at the
              first, and the Next button stayed dead without saying why. */}
          <Text style={[type.faint, { color: colors.amber }]}>
            {(() => {
              const done = ranking.filter((d) => reality[d]).length;
              return done === ranking.length
                ? 'All scored — the picture below is yours.'
                : `${done} of ${ranking.length} scored`;
            })()}
          </Text>
          <View style={{ gap: space(4), marginVertical: space(3) }}>
            {ranking.map((d) => {
              const c = domainColor(d);
              const score = reality[d] ?? 0;
              const drifting = score > 0 && score <= DRIFT_SCORE_MAX;
              return (
                <View key={d} style={{ gap: space(2) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <DomainDot domain={d} size={10} />
                    <Text style={type.heading}>{DOMAIN_LABELS[d]}</Text>
                    {score > 0 && <Text style={[type.faint, { color: c }]}>{score}/5</Text>}
                    {/* The derivation, made visible: this is why the app will
                        call it drifting later, shown at the moment it decides. */}
                    {drifting && (
                      <View style={s.driftTag}>
                        <Ionicons name="trending-down" size={11} color={colors.rose} />
                        <Text style={[type.faint, { color: colors.rose }]}>drifting</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: space(2) }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => setReality({ ...reality, [d]: n })}
                        accessibilityRole="button"
                        accessibilityLabel={`${domainLabel(d)}: ${n} out of 5`}
                        aria-selected={score === n}
                        style={({ pressed }) => [
                          s.scoreDot,
                          n <= score && { backgroundColor: c, borderColor: c },
                          pressed && { transform: [{ scale: 0.9 }] },
                        ]}
                      >
                        <Text style={{
                          color: n <= score ? colors.bg : colors.textFaint,
                          fontWeight: '700', fontSize: 13,
                        }}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>

          {/* The one thing the merged screen would otherwise lose: a domain
              that never made the ranking but still nags. Kept to a row, not a
              screen — nobody ranks twelve things and means all of them. */}
          {ranking.length > 0 && (
            <View style={{ gap: space(2) }}>
              <Label>Anything else slipping?</Label>
              <Text style={type.faint}>Areas you didn't rank, but that still nag at you. Optional.</Text>
              <View style={s.chips}>
                {DOMAINS.filter((d) => !ranking.includes(d)).map((d) => {
                  const on = alsoSlipping.includes(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => toggle(alsoSlipping, setAlsoSlipping, d, 2)}
                      accessibilityRole="button"
                      accessibilityLabel={DOMAIN_LABELS[d]}
                      aria-selected={on}
                      style={({ pressed }) => [
                        s.chip,
                        on && s.chipRisk,
                        pressed && { transform: [{ scale: 0.96 }] },
                      ]}
                    >
                      {on && <Ionicons name="trending-down" size={13} color={colors.rose} />}
                      <Text style={[type.body, on && { color: colors.rose, fontWeight: '700' }]}>
                        {DOMAIN_LABELS[d]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Constant key: mounts (and fades) once, then updates in place
              rather than re-animating on every score change. */}
          {driftFact && <EchoCard key="drift" echo={driftFact} />}
          <Button
            title={nextTitle}
            onPress={next}
            disabled={busy || ranking.some((d) => !reality[d])}
          />
        </>
      )}

      {step === 5 && (
        <>
          <Text style={type.display}>The someday check</Text>
          <Text style={type.dim}>What do you keep postponing? The thing you keep saying "someday" about. It becomes your first real goal — not a wish.</Text>
          <View style={{ gap: space(4), marginTop: space(2) }}>
            <Input
              multiline
              placeholder="Visit Amma for a full week · start the book · get the health checkup…"
              value={postponing}
              onChangeText={setPostponing}
            />
            <PickRow
              label="Which part of life is it?"
              options={ranking.length ? ranking.slice(0, 6) : DOMAINS.slice(0, 6)}
              display={DOMAIN_LABELS}
              value={effectivePostponingDomain}
              onPick={setPostponingDomain}
            />
            {somedayFact && <EchoCard key="someday" echo={somedayFact} />}
            {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
            <Button title={nextTitle} onPress={next} disabled={busy || !postponing.trim()} />
            <Pressable
              onPress={() => { if (!busy) next(); }}
              accessibilityRole="button"
              accessibilityLabel="Nothing comes to mind — skip this question"
            >
              <Text style={[type.faint, { textAlign: 'center', padding: 6 }]}>Nothing comes to mind — skip</Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 6 && (
        <>
          <Text style={type.display}>One person who matters</Text>
          <Text style={type.dim}>We start with one relationship. You can add more later — or never; one is enough.</Text>
          <View style={{ gap: space(4), marginTop: space(2) }}>
            <View style={{ flexDirection: 'row', gap: space(3) }}>
              <View style={{ flex: 2 }}>
                <Input
                  placeholder="Their name (e.g. Amma)"
                  value={person.name}
                  onChangeText={(name) => setPerson({ ...person, name })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="Age"
                  keyboardType="number-pad"
                  value={personAge}
                  onChangeText={(v) => setPersonAge(v.replace(/[^0-9]/g, ''))}
                />
              </View>
            </View>
            {/* Why the app is asking a stranger's age on screen five.
                Health below has carried a reassurance since it was written;
                age never did, and age is the more startling of the two to be
                asked for. It costs one line to say what it buys.

                It said "Leave it blank if you'd rather" — and `age.missing`
                is a blocking finding, so Next stays dead until a number is
                typed. A reader who took the invitation was stuck on 6 of 8
                with two sentences on screen contradicting each other, one of
                them promising the field was optional and the other saying
                Priority could not proceed without it. This line says what the
                age buys; the finding below says it is required, in the only
                moment that is worth saying — when it is empty. */}
            <Text style={type.faint}>
              Their age is what lets Priority count the time you have left
              together instead of guessing at it.
            </Text>
            {/* The wish question used to live here — one screen before the
                app asked how often they actually talk, in nearly the same
                words. Aspiration was collected before the reality it is an
                aspiration about, and the pair read as the same question asked
                twice. Both now sit together on the next screen, reality
                first, so the second question is visibly the follow-up. */}
            <PickRow label="They are your" options={RELATIONS} value={person.relationType} onPick={pickRelation} />
            {/* What the answers add up to.
                Blocks are arithmetic that cannot be true — a mother younger
                than her child — and stated as the typos they are. Notes are
                allowed and worth hearing now rather than in six weeks: asking
                for less than you already do is a correct calculation with a
                surprising result, and it switches this person off. */}
            <Findings items={ageFindings} />

            {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
            <Button title={nextTitle} onPress={next} disabled={busy || !person.name.trim() || personBlocked} />
          </View>
        </>
      )}

      {/* The second half of the person, on its own screen.
          These five lived on the screen above, which made it nine inputs
          deep and put it second-to-last, where fatigue peaks and every other
          screen in this flow asks exactly one thing. Who they are is one
          question; how the two of you actually keep in touch is another. */}
      {step === 6.5 && (
        <>
          <Text style={type.display}>
            {person.name ? `You and ${person.name.trim().split(/\s+/)[0]}` : 'You and them'}
          </Text>
          <Text style={type.dim}>
            How it actually works between you right now — not how you wish it did.
            Every one of these is optional.
          </Text>
          <View style={{ gap: space(4), marginTop: space(2) }}>
            <PickRow
              label="Where do they live?"
              options={PLACES}
              display={PLACE_LABELS}
              value={locationType}
              onPick={pickLocation}
            />
            {/* Not asked of someone in the next room, where the answer is
                "constantly", carries nothing, and is three taps of
                nothing. The People tab reads visits for these anyway.

                The wish rides directly under the reality it is a wish about.
                It lived on the previous screen, before the app had asked how
                often they actually talk — aspiration collected ahead of the
                fact it aspires against, in nearly identical words, which
                read as the same question twice. Here the order argues for
                itself: this is what happens, and this is what you want. The
                sanity notes underneath compare exactly these two answers. */}
            {asksAboutCalls(locationType) && (
              <>
                <PickRow label="How often do you talk?" options={CADENCES} value={callFrequency} onPick={own('callFrequency', setCallFrequency)} />
                {/* Only while there is room to wish for more. Somebody who
                    already talks daily was shown a second identical row of
                    five chips, also reading "daily", asking what they wished
                    for — a gap-finding question with no gap to find. */}
                {asksAboutWish(callFrequency) && (
                  <PickRow label="And how often do you wish you talked?" options={CADENCES} value={desired} onPick={own('desired', setDesired)} />
                )}
              </>
            )}
            <PickRow label="How often do you see them in person?" options={CADENCES} value={visitFrequency} onPick={own('visitFrequency', setVisitFrequency)} />

            {/* The strongest input the countable life has, and the app has
                never once asked for it. `suggestCountables` scores a
                reader's own phrase at four times a domain guess — it is
                the difference between "days out with Ines" and "hawker
                centre dinners with Wei" — and `meaningfulMomentTypes` had
                two readers and no writer, so it was empty for everybody. A
                blank text box would have collected nothing; taps collect
                plenty. Two is the cap, because this is one question in a
                long form and the Time tab can add more later. */}
            <View style={{ gap: space(2) }}>
              <Label>What is worth counting with them? (optional)</Label>
              <Text style={type.faint}>
                Pick up to two. Priority counts how many of these you have left,
                which turns out to be the number people remember.
              </Text>
              <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
                {/* The union, not the catalog: a moment typed below renders
                    here as a chip like any other, selected and removable —
                    otherwise a custom answer would be held invisibly, which
                    reads as it having been dropped. */}
                {[
                  ...momentOptionsFor(person.relationType),
                  ...moments.filter((m) => !momentOptionsFor(person.relationType).includes(m)),
                ].map((m) => {
                  const on = moments.includes(m);
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMoments((prev) => (
                        prev.includes(m)
                          ? prev.filter((x) => x !== m)
                          : prev.length >= 2 ? prev : [...prev, m]
                      ))}
                      accessibilityRole="button"
                      accessibilityLabel={m}
                      aria-selected={on}
                      style={[s.chip, on && s.chipOn]}
                    >
                      <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {/* Their ritual, not ours. The chips are guesses from the
                  relation type, and the whole point of this field is the
                  reader's own phrase — "temple visits", "sunday cooking" —
                  which `suggestCountables` scores far above anything
                  inferred. A pick-list with no door for their own words
                  collects only our vocabulary. */}
              {moments.length < 2 && (
                <Input
                  placeholder="…or one of your own — e.g. sunday cooking"
                  value={customMoment}
                  onChangeText={setCustomMoment}
                  onSubmitEditing={commitCustomMoment}
                  onBlur={commitCustomMoment}
                  returnKeyType="done"
                  autoCapitalize="none"
                />
              )}
            </View>
            <View style={{ gap: space(2) }}>
              <Label>How is their health these days? (optional)</Label>
              <Text style={type.faint}>This only tunes the arithmetic. It never changes how Priority speaks to you.</Text>
              <PickRow
                label=""
                options={['good', 'declining', 'serious'] as const}
                display={{ good: 'doing well', declining: 'some concerns', serious: 'serious' }}
                value={healthStatus}
                onPick={(v) => setHealthStatus(healthStatus === v ? '' : v)}
              />
            </View>
            {/* The notes that only became true on this screen — you already
                talk more often than you asked for, you share a roof but
                answered monthly. Worth hearing while the answer is still
                under your thumb rather than in six weeks of quiet arithmetic
                built on it. */}
            <Findings items={cadenceFindings} />
            {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
            <Button title={nextTitle} onPress={next} disabled={busy} />
          </View>
        </>
      )}

      {step === 7 && (
        <>
          <Text style={type.display}>One week from now…</Text>
          <Text style={type.dim}>If Priority works, how do you want to feel next {new Date(Date.now() + 7 * 86_400_000).toLocaleDateString(undefined, { weekday: 'long' })} evening?</Text>
          <View style={s.chips}>
            {feelings.map((f) => {
              const on = feeling === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFeeling(f)}
                  accessibilityRole="button"
                  accessibilityLabel={f}
                  aria-selected={on}
                  style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { transform: [{ scale: 0.96 }] }]}
                >
                  <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>{f}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ gap: space(2), marginTop: space(2) }}>
            <Label>And how should Priority speak to you?</Label>
            <PickRow
              label=""
              options={['gentle', 'balanced', 'direct'] as const}
              display={{ gentle: 'gently', balanced: 'balanced', direct: 'direct — hold me to it' }}
              value={style}
              onPick={setStyle}
            />
          </View>
          {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
          <Button
            title={busy ? 'Building your Life Reveal…' : 'See my Life Reveal'}
            onPress={finish}
            disabled={busy || !feeling}
          />
        </>
      )}

      {step === QUESTION_STEPS + 1 && reveal && (
        <Reveal
          reveal={reveal}
          insights={insights}
          ranking={ranking}
          reality={reality}
          domainScores={domainScores}
          feeling={feeling}
          person={person.name ? { ...person, callFrequency, desired, visitFrequency } : null}
          ledger={revealLedger({
            freeHoursPerWeek: workType && statedHours != null
              ? freeTimeBudget(statedHours, workType).freeHoursPerWeek
              : null,
            ranking,
            neglectedCount: neglected.length,
            personName: person.name.trim() || null,
            goalTitle: postponing.trim() && namesAThing(postponing)
              ? deriveGoalTitle(postponing).title
              : null,
            feeling: feeling || null,
            labelOf: domainLabel,
          })}
          onDone={() => router.replace('/(tabs)')}
        />
      )}
    </ScrollView>
  );
}

/**
 * What the answers so far add up to, said in place.
 *
 * Shared by both halves of the person, because both halves have something to
 * say and only one of them used to.
 */
function Findings({ items }: { items: Array<{ key: string; level: string; message: string }> }) {
  return (
    <>
      {items.map((f) => (
        <Text
          key={f.key}
          style={[
            type.faint,
            /* An empty field is not a mistake, it is a thing still to
               do. Only something typed and wrong is drawn in red. */
            f.level === 'block' && f.key !== 'age.missing' && { color: colors.rose },
            f.level === 'good' && { color: colors.amber },
          ]}
        >
          {f.message}
        </Text>
      ))}
    </>
  );
}

function PickRow({ label, options, value, onPick, display }: {
  label: string; options: readonly string[]; value: string; onPick: (v: string) => void;
  display?: Record<string, string>;
}) {
  return (
    <View style={{ gap: space(2) }}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const on = value === o;
          return (
            <Pressable
              key={o}
              onPress={() => onPick(o)}
              accessibilityRole="button"
              accessibilityLabel={display?.[o] ?? o}
              aria-selected={on}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>{display?.[o] ?? o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A micro-reveal, landed while the answer that earned it is still warm.
 * One number or one mirrored phrase and a single line — anything longer
 * is a lecture, and the reader is mid-form.
 */
function EchoCard({ echo }: { echo: MicroReveal }) {
  return (
    <Stage delay={150}>
      <Card accent={colors.amberSoft} style={{ gap: space(1) }}>
        {echo.stat && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[type.stat, { fontSize: 34, color: colors.amber }]}>~{echo.stat.value}</Text>
            <Text style={[type.dim, { flexShrink: 1 }]}>{echo.stat.unit}</Text>
          </View>
        )}
        {echo.quote && <Text style={type.serif}>“{echo.quote}”</Text>}
        <Text style={type.faint}>{echo.line}</Text>
      </Card>
    </Stage>
  );
}

/** Fades a block in with a slight rise, after `delay` ms. */
function Stage({ delay, children }: { delay: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 700, delay, useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      gap: space(3),
    }}>
      {children}
    </Animated.View>
  );
}

/** Counts a number up from 0 — the finite window landing softly. */
function CountUp({ value, color, delay }: { value: number; color: string; delay: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = Date.now() + delay;
    const timer = setInterval(() => {
      const t = (Date.now() - start) / 1400;
      if (t < 0) return;
      if (t >= 1) { setN(value); clearInterval(timer); return; }
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
    }, 40);
    return () => clearInterval(timer);
  }, [value]);
  return (
    <Text style={{ fontSize: 84, fontWeight: '800', letterSpacing: -3, color, lineHeight: 92 }}>
      {n}
    </Text>
  );
}

function Reveal({ reveal, insights, ranking, reality, domainScores, feeling, person, ledger, onDone }: {
  reveal: any;
  insights: any[];
  ranking: string[];
  reality: Record<string, number>;
  domainScores: Record<string, number> | null;
  feeling: string;
  person: { name: string; relationType: string; callFrequency: string; desired: string; visitFrequency: string } | null;
  ledger: RevealLedger | null;
  onDone: () => void;
}) {
  const top3 = (reveal.topPriorities ?? ranking).slice(0, 3);
  /**
   * Share of stated importance carried by rank position i, 0..100.
   *
   * Kept only as the fallback for when `/dashboard` has not answered yet —
   * see `statedImportance`.
   */
  const rankedCount = Math.max(ranking.length, top3.length, 1);
  const rankedShare = (i: number) => Math.round((100 * (rankedCount - i)) / rankedCount);
  /**
   * "You say", from whoever the rest of the app believes.
   *
   * This screen used to derive its own number from rank position while every
   * other surface read the server's `calculateImportanceScore`. The two
   * disagreed by 32 points on the very first tap out of onboarding — Family
   * read 100 on the reveal and 68 on Today. The server's score wins; the rank
   * share survives only for the moment before the dashboard call returns.
   */
  const statedImportance = (d: string, i: number) => domainScores?.[d] ?? rankedShare(i);
  const visits = insights.find((i) => i.kind === 'visits_remaining');
  const callDelta = insights.find((i) => i.kind === 'calls_per_year');

  /**
   * The number, its span, and what one change makes of it — all from whoever
   * actually did the arithmetic.
   *
   * This screen used to take the estimate from the engine and then compute the
   * uplift itself, as `(visitsPerYear + 2) * 10`. The engine's estimate is not
   * over ten years — when it knows the person's age it measures over the
   * quality-year window, which for a parent of sixty is nearer thirteen. So the
   * two numbers were answers to different questions, printed one above the
   * other: ~150 visits ahead, and "add just 2 visits a year and it becomes
   * 140". Visiting more often was rendered as a loss of ten visits, on the one
   * screen whose entire purpose is to make the case for showing up more.
   *
   * The engine's own answer is 180. It had it all along.
   *
   * The local arithmetic survives only as the no-insight fallback, where it is
   * correct because it is the same ten-year estimator the server uses when it
   * has no age — including its scarcity gate: no finite-window framing for
   * someone already seen more than monthly.
   */
  const perYear = person ? CADENCE_PER_YEAR[person.visitFrequency] ?? 4 : 4;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;   // Decimal arrives as a string
  };
  const bigNumber = num(visits?.estimate)
    ?? (person && perYear <= 12 ? perYear * 10 : null);
  const horizonYears = num(visits?.horizonYears) ?? 10;
  const uplift = visits
    ? num(visits.upliftEstimate)
    : (perYear + 2) * 10;
  const upliftLabel = (visits?.upliftLabel as string | undefined)
    ?? 'Adding just 2 visits a year';

  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);

  /**
   * The one tap that decides whether the app has anything in it.
   *
   * This is the only place a new account gets a mission, and it was reading
   * the domain out of the sentence with `title.split(' ').pop()` — fine while
   * every option ended in a domain name, fatal the moment they became
   * personal. "…one message is enough" posted `domainType: "enough"`, the API
   * rejected it, and the bare `catch {}` below swallowed the 400 without a
   * word. The row stayed unselected, so it read as an unresponsive button,
   * and every one of those accounts arrived at an empty Today screen.
   *
   * The domain now travels beside the title as a field. A failure is said out
   * loud, because a first mission that did not save is the difference between
   * an app with something in it and an app with nothing.
   */
  const pickPriority = async (f: {
    title: string; domainType: string; relationshipId?: string; goalId?: string;
  }) => {
    if (chosen || adding) return;
    setAdding(true);
    setPickFailed(false);
    try {
      await api('/missions', {
        method: 'POST',
        body: {
          title: f.title,
          domainType: f.domainType,
          estimatedMinutes: 15,
          xpReward: 30,
          /* An option about a person or a goal arrives linked to it. Without
             this the mission only *mentions* Vikram, and everything that
             reasons about Vikram carries on as though nothing were planned. */
          ...(f.relationshipId ? { relationshipId: f.relationshipId } : {}),
          ...(f.goalId ? { goalId: f.goalId } : {}),
        },
      });
      setChosen(f.title);
    } catch {
      setPickFailed(true);
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={{ gap: space(4), paddingTop: space(4) }}>
      <Stage delay={300}>
        <Label>Your life reveal</Label>
        <Text style={[type.display, { color: colors.amber, fontSize: 32 }]}>{reveal.headline}</Text>
      </Stage>

      {reveal.extractedValues && (
        <Stage delay={800}>
          <Card style={{ backgroundColor: colors.surfaceSunken, gap: space(2) }}>
            <Label>What we heard you say matters</Label>
            <Text style={type.serif}>{reveal.extractedValues.reflection}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) }}>
              {reveal.extractedValues.values.map((v: string) => (
                <View key={v} style={{ borderWidth: 1, borderColor: colors.amberSoft, backgroundColor: colors.amberFaint, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Text style={{ color: colors.amber, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{v}</Text>
                </View>
              ))}
            </View>
          </Card>
        </Stage>
      )}

      <Stage delay={1200}>
        <Card style={{ gap: space(3) }}>
          <Label>What you said · how you're living it</Label>
          {top3.map((d: string, i: number) => (
            <View key={d} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[type.stat, { fontSize: 18, color: domainColor(d), width: 20 }]}>{i + 1}</Text>
                <Text style={[type.heading, { textTransform: 'capitalize', flex: 1 }]}>{d}</Text>
                {reality[d] && <Text style={type.faint}>living it {reality[d]}/5</Text>}
              </View>
              {/* "You do" is only a measurement on the long path, which asks
                  for it. Quick start never does, and `?? 0` printed that
                  silence as a score — telling a new user they do none of the
                  thing they just said matters most. Unmeasured now reads as
                  unmeasured. */}
              <GapBar
                importance={statedImportance(d, i)}
                attention={reality[d] != null ? reality[d] * 20 : null}
                color={domainColor(d)}
              />
            </View>
          ))}
          <Text style={type.faint}>
            {top3.some((d: string) => reality[d] != null)
              ? 'The gap between those bars is what Priority works on.'
              : "We haven't measured how you're living these yet — that starts today."}
          </Text>
        </Card>
      </Stage>

      <Stage delay={2400}>
        <Card style={{ backgroundColor: colors.surfaceSunken }}>
          <Text style={type.serif}>{reveal.narrative}</Text>
        </Card>
      </Stage>

      {bigNumber !== null && person && (
        <Stage delay={3400}>
          <Card accent={colors.amberSoft} style={{ alignItems: 'center', gap: space(2), paddingVertical: space(6) }}>
            <Label color={colors.amber}>Your time reality</Label>
            <CountUp value={bigNumber} color={colors.amber} delay={3600} />
            <Text style={[type.body, { textAlign: 'center' }]}>
              more visits with {person.name} in the next {Math.round(horizonYears)} years,{'\n'}at your current pace.
            </Text>
            <Text style={[type.faint, { textAlign: 'center' }]}>
              {visits?.detail ?? 'Simple arithmetic on the visit pace you told us — a planning lens, not a prediction.'}
            </Text>
            {/*
              Shown only when it is genuinely more.

              Location and working hours cap how many visits a year are even
              possible, so someone whose parent lives abroad and who already
              visits at that ceiling has no uplift to be offered. Printing one
              anyway would either repeat their own number back at them or, as
              it did, print a smaller one — and a smaller number under a
              green arrow is the app arguing against itself.
            */}
            {uplift !== null && bigNumber !== null && uplift > bigNumber && (
              <View style={s.upliftRow}>
                <Ionicons name="trending-up" size={15} color={colors.green} />
                <Text style={[type.dim, { color: colors.green, flex: 1 }]}>
                  {upliftLabel} and it becomes {uplift}.
                </Text>
              </View>
            )}
            <Text style={[type.serif, { textAlign: 'center', color: colors.textDim, marginTop: space(2) }]}>
              That is not unlimited.{'\n'}But it is enough to make each one count.
            </Text>
          </Card>
        </Stage>
      )}

      {callDelta && (
        <Stage delay={4600}>
          <Card style={{ backgroundColor: colors.surfaceSunken }}>
            <Label>Worth knowing</Label>
            <Text style={type.serif}>{callDelta.headline}</Text>
          </Card>
        </Stage>
      )}

      {reveal.driftWarning && (
        <Stage delay={5200}>
          <Card accent={colors.roseSoft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.rose} />
              <Label color={colors.rose}>Drift warning</Label>
            </View>
            <Text style={type.body}>{reveal.driftWarning}</Text>
          </Card>
        </Stage>
      )}

      <Stage delay={5800}>
        <Card accent={colors.amberSoft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="compass-outline" size={14} color={colors.amber} />
            <Label color={colors.amber}>Choose your first priority</Label>
          </View>
          <Text style={type.dim}>Pick one. It becomes your first mission — small, this week, yours.</Text>
          {(reveal.firstWeekFocus ?? []).map((raw: any) => {
            /* Objects now; strings are what an older API build sends, and a
               reveal that arrives mid-deploy should still be pickable rather
               than crash on `.title`. The domain is never parsed back out of
               the copy — an option without one is filed under the reader's
               own first priority, which is at least a domain that exists. */
            const f = typeof raw === 'string'
              ? { title: raw, domainType: top3[0] ?? 'family' }
              : raw;
            const isChosen = chosen === f.title;
            const dimmed = !!chosen && !isChosen;
            return (
              <Pressable
                key={f.title}
                onPress={() => pickPriority(f)}
                disabled={!!chosen || adding}
                accessibilityRole="button"
                accessibilityLabel={`Start with this: ${f.title}`}
                aria-selected={isChosen}
                accessibilityState={{ disabled: !!chosen || adding }}
                style={({ pressed }) => [
                  s.priorityRow,
                  isChosen && { borderColor: colors.green, backgroundColor: colors.greenSoft },
                  dimmed && { opacity: 0.4 },
                  pressed && !chosen && { backgroundColor: colors.surfaceRaised },
                ]}
              >
                <Ionicons
                  name={isChosen ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={isChosen ? colors.green : colors.textFaint}
                />
                <Text style={[type.body, { flex: 1 }]}>{f.title}</Text>
              </Pressable>
            );
          })}
          {pickFailed ? (
            <Text style={[type.faint, { color: colors.rose }]}>
              That didn’t save — tap it again. Your answers are already stored.
            </Text>
          ) : null}
          {chosen && (
            <View style={{ gap: space(2) }}>
              <Text style={[type.dim, { color: colors.green, textAlign: 'center' }]}>
                {feeling
                  ? `Added to Today. That's where next week's "${feeling}" starts.`
                  : 'Added to Today. That is where it starts.'}
              </Text>
              {/* The smallest possible version of what they just committed to.
                  This one line does more for whether the thing actually
                  happens than any number on this screen — it turns an
                  intention into a motor action — and it was only ever shown on
                  the mission card, days later, to people who came back. Say it
                  at the moment of commitment, which is now. */}
              <Text style={[type.faint, { textAlign: 'center' }]}>
                <Text style={{ color: colors.amber }}>Too big right now? </Text>
                {tinyStep({
                  title: chosen,
                  domainType: ranking[0] ?? 'family',
                  personName: person?.name?.trim() || undefined,
                })}
              </Text>
            </View>
          )}
        </Card>
      </Stage>

      {/* The receipt: what the minutes just spent actually produced, and the
          one checkable reason to come back — a plan in motion, not a pitch. */}
      <Stage delay={6600}>
        {ledger && (
          <Card style={{ backgroundColor: colors.surfaceSunken, gap: space(2) }}>
            <Label>The trade</Label>
            <Text style={type.dim}>{ledger.intro}</Text>
            {ledger.lines.map((l) => (
              <View key={l} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle-outline" size={15} color={colors.amber} style={{ marginTop: 2 }} />
                <Text style={[type.body, { flex: 1 }]}>{l}</Text>
              </View>
            ))}
            <Text style={[type.serif, { color: colors.textDim, marginTop: space(1) }]}>
              {ledger.promise}
            </Text>
          </Card>
        )}
        <Button title="Start living it" onPress={onDone} />
        <ShareRevealButton
          data={{
            headline: reveal.headline,
            topDomains: top3,
            personLine: person && bigNumber !== null
              ? `~${bigNumber} more visits with ${person.name} in the next ${Math.round(horizonYears)} years — at my current pace.`
              : null,
            insightLine: 'That is not unlimited. But it is enough to make each one count.',
          }}
        />
      </Stage>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    padding: space(6), paddingTop: space(12), gap: space(4), paddingBottom: space(12),
    maxWidth: 560, width: '100%', alignSelf: 'center',
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  progressTrack: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  mark: {
    width: 52, height: 52, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
  },
  markRing: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    borderWidth: 3, borderColor: colors.amberSoft,
  },
  markDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.amber },
  promiseRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft,
    borderRadius: 14, padding: space(4),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginVertical: space(3) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  chipRisk: { borderColor: colors.rose, backgroundColor: colors.roseSoft },
  driftTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.roseSoft, borderRadius: 999,
    paddingVertical: 2, paddingHorizontal: 8,
  },
  rankBadge: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreDot: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  upliftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.greenSoft, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12, marginTop: space(2),
  },
  priorityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    padding: space(3),
  },
});
