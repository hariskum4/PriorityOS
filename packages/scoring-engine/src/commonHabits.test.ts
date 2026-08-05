import { describe, it, expect } from 'vitest';
import { recognizeHabit } from './commonHabits';
import { rhythmForHabit, rhythmByKey } from './rhythms';
import { isPlaceable, isBoundary } from './rhythmPlan';

/**
 * The bar throughout: a stranger reading the title would name the same
 * habit. Everything short of that must return null — a wrong guess sits in
 * the way of the two-way learning, which reads what the person actually
 * does. The trap cases here matter more than the matches.
 */
describe('recognizing the habits people write for themselves', () => {
  // ---- the commonest things, phrased the ways people phrase them ---------
  it.each([
    ['Gym', 'common.exercise'],
    ['gym 3x a week', 'common.exercise'],
    ['Workout', 'common.exercise'],
    ['work out', 'common.exercise'],
    ['Go to the gym', 'common.exercise'],
    ['Morning run', 'common.run'],
    ['Go for a run', 'common.run'],
    ['jogging', 'common.run'],
    ['10,000 steps', 'common.walk'],
    ['10k steps', 'common.walk'],
    ['Walk the dog', 'common.walk'],
    ['go for a walk', 'common.walk'],
    /* Yoga resolves to its own identity now, not to stretching. They
       looked interchangeable until the catalog started printing
       receipts: yoga's mood evidence is among the strongest in the
       exercise literature and stretching's stops at range of motion,
       so the old mapping handed one the other's credentials. */
    ['Yoga', 'health.yoga'],
    ['Stretching', 'health.stretch'],
    ['Stretching', 'health.stretch'],
    ['Meditate 10 minutes', 'common.meditate'],
    ['daily meditation', 'common.meditate'],
    ['Mindfulness practice', 'common.meditate'],
    ['Prayer', 'reflection.prayer'],
    ['pray every morning', 'reflection.prayer'],
    ['Journal', 'reflection.journal'],
    ['Gratitude list', 'reflection.journal'],
    ['Read 20 minutes', 'growth.read'],
    ['Reading before bed', 'growth.read'],
    ['Study Spanish', 'common.study'],
    ['Duolingo', 'common.study'],
    ['Learn guitar', 'common.study'],
    ['Call mum', 'common.callhome'],
    ['Call my parents', 'common.callhome'],
    ['Take vitamins', 'health.vitamins'],
    ['meds', 'health.vitamins'],
    ['Skincare routine', 'health.upkeep'],
    ['Floss', 'health.upkeep'],
    ['Make the bed', 'health.makebed'],
    ['Meal prep Sundays', 'health.cook'],
    ['Track my spending', 'common.money'],
    ['Budgeting', 'common.money'],
    // The wider life — the domains the trackers never measure.
    ['Date night', 'common.datenight'],
    ['Date with my wife', 'common.datenight'],
    ['Family dinner', 'common.familytime'],
    ['Dinner with the family', 'common.familytime'],
    ['Play with the kids', 'common.playkids'],
    ['Playing with my daughter', 'common.playkids'],
    ['Read to the kids', 'common.readkids'],
    ['Reading with my son', 'common.readkids'],
    ['Call a friend', 'common.friend'],
    ['Text an old friend', 'common.friend'],
    ['Catch up with a friend', 'common.friend'],
    ['Volunteering at the shelter', 'common.volunteer'],
    ['Mentor a junior', 'common.mentor'],
    ['Side project', 'common.project'],
    ['Side hustle hour', 'common.project'],
    ['Networking coffee', 'common.network'],
    ['Plan a trip', 'common.plantrip'],
    ['Plan our holiday', 'common.plantrip'],
  ])('"%s" → %s', (title, key) => {
    expect(recognizeHabit(title)?.key).toBe(key);
  });

  /**
   * Order in the table is behaviour: first match wins, and "read to the
   * kids" contains a book. The generic reader must never take it.
   */
  it('reads to the kids before it reads', () => {
    expect(recognizeHabit('Read to the kids')?.key).toBe('common.readkids');
    expect(recognizeHabit('Read 20 minutes')?.key).toBe('growth.read');
  });

  it('a call to a friend is not a call home, and neither is a date', () => {
    expect(recognizeHabit('Call a friend')?.key).toBe('common.friend');
    expect(recognizeHabit('Call mum')?.key).toBe('common.callhome');
    /* "Date entry in the ledger" leads with the keyword and is bookkeeping —
       the pattern demands "night" or "with" for exactly this reason. */
    expect(recognizeHabit('Date entry in the ledger')).toBeNull();
  });

  // ---- the edges of the day ----------------------------------------------
  it.each([
    ['Sleep by 11', 'common.bedtime'],
    ['In bed by 10:30', 'common.bedtime'],
    ['Lights out at 11', 'common.bedtime'],
    ['Early to bed', 'common.bedtime'],
    ['Wake up at 6', 'common.wake'],
    ['Get up early', 'common.wake'],
    ['No phone in bed', 'common.phonebed'],
    ['No scrolling at night', 'common.phonebed'],
  ])('"%s" marks where the day ends: %s', (title, key) => {
    const r = recognizeHabit(title)!;
    expect(r.key).toBe(key);
    expect(isBoundary(r.when)).toBe(true);
    expect(isPlaceable(r.when)).toBe(false);
  });

  // ---- abstinences and counts: kept all day, placed never ----------------
  it.each([
    'Drink more water',
    '8 glasses of water',
    'Hydrate',
    'No sugar',
    'Quit smoking',
    'Stop doomscrolling',
    'Less screen time',
    'Cut down on coffee',
    'No alcohol on weekdays',
  ])('"%s" gets no slot in anybody\'s day', (title) => {
    const r = recognizeHabit(title)!;
    expect(r.when).toBe('allday');
    expect(isPlaceable(r.when)).toBe(false);
    expect(isBoundary(r.when)).toBe(false);
  });

  // ---- the traps ---------------------------------------------------------
  //
  // Each of these contains a keyword and is not that habit. Matching from
  // the front is the rule that keeps them out; these tests are what keeps
  // the rule.
  it.each([
    'Call Priya about the project', // a call, not a call home
    'Cut the grass',                // "cut" without down/back/out is a chore
    'Skipping rope',                // an activity wearing an abstinence verb
    'Work on my novel',             // "work" is not "workout"
    'Update my portfolio',          // starts with "up", is not waking early
    'Sort the garage',              // the canonical nobody-knows habit
    'Water the plants',             // water as a verb, not hydration
    'Note down three ideas',        // "no" must be its own word
    'Meditation retreat planning',  // about meditation, not meditating? No —
                                    // this one SHOULD match; see below.
  ].filter((t) => t !== 'Meditation retreat planning'))(
    '"%s" resolves to nothing', (title) => {
      expect(recognizeHabit(title)).toBeNull();
    },
  );

  /* Matching from the front is a heuristic, not a proof, and this is the
     honest cost of it: a title that leads with the keyword matches even
     when the rest of the line walks it somewhere else. Priced in — the
     reader can correct a card in one tap, and the alternative (parsing the
     whole title) is how "call Mum on my walk home" becomes a walk. */
  it('pays the known cost of front-matching without pretending otherwise', () => {
    expect(recognizeHabit('Meditation retreat planning')?.key).toBe('common.meditate');
  });

  it('claims nothing about emptiness', () => {
    expect(recognizeHabit('')).toBeNull();
    expect(recognizeHabit('   ')).toBeNull();
    expect(recognizeHabit(undefined as never)).toBeNull();
  });

  // ---- how it sits in the resolver ---------------------------------------
  it('loses to the catalog and the healthspan twins', () => {
    /* An exact catalog title must never fall through to the fuzzy table. */
    expect(rhythmForHabit('Move three times a week')?.key).toBe('health.move');
    expect(rhythmForHabit('Protecting 7–8 hours of sleep')?.key).toBe('health.sleep');
    /* And the table only speaks when both stayed silent. */
    expect(rhythmForHabit('Morning run')?.key).toBe('common.run');
  });

  it('gives every recognized habit the fields the day needs', () => {
    for (const title of ['Gym', 'Journal', 'Drink more water', 'No phone in bed']) {
      const r = recognizeHabit(title)!;
      expect(r.minutes).toBeGreaterThan(0);
      expect(r.because).toBeTruthy();
      expect(r.perWeek).toBeGreaterThanOrEqual(1);
      expect(r.perWeek).toBeLessThanOrEqual(7);
      /* A reading keeps its `common.` prefix. A promoted one names the domain
         it was spread into, and that entry has to actually be there — a key
         pointing at nothing is exactly how "Journal" would stop marking the
         catalog's Journal as held. */
      if (!r.key.startsWith('common.')) expect(rhythmByKey(r.key)).not.toBeNull();
    }
  });

  it('never uses guilt for the not-doing habits', () => {
    const r = recognizeHabit('Quit smoking')!;
    expect(r.because).not.toMatch(/you (always|never|should)/i);
  });
});
