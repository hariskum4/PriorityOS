/**
 * The receipts — what the catalog can honestly claim, entry by entry.
 *
 * Every rhythm and rung carries a `because`, which is the stake. This file
 * carries the other half: whether anyone has ever measured it. The two are
 * deliberately different registers — `because` persuades, this cites — and
 * keeping them apart is what lets the card copy stay warm while the footnote
 * stays exact.
 *
 * Why a sidecar and not a field on each entry:
 *
 *   **Rungs have no keys.** The ladder's identity is its titles, which the
 *   catalog already promises to keep stable. Keying evidence by title turns
 *   that promise into a test — rename a rung and `evidence.test.ts` names
 *   the orphan before a user ever sees an unreceipted card.
 *
 *   **One reviewable dossier.** Every claim the product makes about the
 *   literature sits in one file a careful reader can audit in one sitting.
 *   Scattered across four catalogs it would be checkable by nobody.
 *
 *   **The catalogs stay untouched.** rhythms.ts and domainLadder.ts are
 *   load-bearing and behaviorally tested; this adds a layer without moving
 *   a line of them.
 *
 * Grading rules, applied without mercy:
 *
 *   'A'    — meta-analysis or systematic review of randomized trials.
 *   'B'    — at least one decent randomized or strong quasi-experiment.
 *   'C'    — observational/correlational, INCLUDING meta-analyses of cohort
 *            studies. Holt-Lunstad's 148-study synthesis is the most
 *            consistent finding in its field and it is still a C, because
 *            nobody was randomized to loneliness. The grade is about design,
 *            not about how much we believe it.
 *   'folk' — sensible, widely kept, no direct outcome evidence. Allowed,
 *            and labelled. "Make the bed" being folk is what makes
 *            "strength training, A" believable.
 *
 * Two more honesty rules:
 *
 *   **Grade is not magnitude.** Expressive writing is Grade A and tiny
 *   (d ≈ 0.15). The `effect` string states the size; the grade states the
 *   design. Never let one impersonate the other.
 *
 *   **The grade attaches to the activity class, not the wording.** "Call
 *   home the same day every week" is graded as regular social contact (C,
 *   strong); the same-day ritual itself is implementation folklore, and the
 *   note says so when the gap matters.
 *
 * The copy rules in ai-prompts still apply above this file: an effect size
 * with a source is a fact, not a clinical claim, and nothing here licenses
 * the narrator to promise anybody an outcome.
 */

import { recognizeHabit } from './commonHabits';
import { rhythmDomains, rhythmsFor } from './rhythms';
import { domainLadder } from './domainLadder';

export type EvidenceGrade = 'A' | 'B' | 'C' | 'folk';

export interface Evidence {
  grade: EvidenceGrade;
  /**
   * The finding, in words somebody can use — and the only one of these fields
   * that reaches a screen.
   *
   * The panel used to print `effect` directly, so a reader who tapped "Why
   * this works" on the weekly money review got: *meta-analysis of trials · d
   * ≈ 0.40 · Harkin 2016, Psychol Bull*. Three lines, all true, and nothing a
   * person could do anything with. Somebody deciding whether to sit down with
   * their accounts on a Sunday does not know what d is, and asking them to
   * find out is asking them to do homework to be allowed to trust the app.
   *
   * So every record now says the same thing twice. `effect` stays exactly as
   * it was — the precise version, the one a careful reader can check the
   * sentence against. `plain` is what gets shown: what was found, on whom,
   * and how much it moved, in ordinary language.
   *
   * Two rules, both enforced by the test suite:
   *
   *   **Every record has one.** Including the folk entries, where the plain
   *   version is the most useful of the lot: "nobody has studied whether
   *   making the bed changes anything" is a sentence that earns trust.
   *
   *   **The size survives translation.** "Small" stays small. The whole point
   *   of the effect line was that expressive writing is well established and
   *   tiny; a plain sentence that quietly upgrades it to "helps" has broken
   *   the thing this file exists to protect.
   */
  plain?: string;
  /**
   * The precise version, kept for the audit and no longer shown.
   *
   * Human-readable size and direction: "g ≈ −0.62 vs active control". This is
   * what `plain` is answerable to — the two live side by side so that a claim
   * on screen can always be traced back to a number somebody measured.
   */
  effect?: string;
  /** Short, stable, never a URL: "Noetel 2024, BMJ". */
  source?: string;
  /** Dose gaps, replication caveats, who the benefit actually lands on. */
  note?: string;
}

/**
 * How well the thing is known, for the card footnote.
 *
 * These were the field's own words — "meta-analysis of trials",
 * "observational evidence" — which name the study design exactly and tell a
 * reader nothing. The replacements say what the design *means*: whether
 * anybody was assigned to do this and then followed, or whether it was only
 * ever watched happening.
 *
 * The distinction the old labels protected is still the one these protect.
 * Grade is not magnitude, and none of these four says anything about how much
 * the thing helps — that is the sentence above it. "Tested many times over" is
 * a statement about certainty, and expressive writing is tested many times
 * over and barely does anything.
 */
export const GRADE_LABELS: Record<EvidenceGrade, string> = {
  A: 'tested many times over',
  B: 'tested at least once, properly',
  C: 'observed in people, not tested',
  folk: 'nobody has studied this',
};

// ---------------------------------------------------------------------------
// Shared records — one activity class, cited once, reused everywhere it
// appears. A rung and a rhythm that operationalize the same finding must
// never drift into citing it differently.
// ---------------------------------------------------------------------------

const MOVEMENT: Evidence = {
  grade: 'A',
  plain: 'Walking or jogging lifted low mood in trials — one of the bigger effects anything in this file has. Harder efforts helped more.',
  effect: 'walking/jogging g ≈ −0.62 for low mood vs active control; benefits rise with intensity',
  source: 'Noetel 2024, BMJ',
  note: 'This asks for about 120 minutes a week; the usual public-health figure is 150. The measured benefits start well below either.',
};

const STRENGTH: Evidence = {
  grade: 'A',
  plain: 'Lifting lifted low mood in trials, about as much as most things that work. Separately, people doing 30–60 minutes a week were 10–17% less likely to die during follow-up — that second part was watched rather than tested.',
  effect: 'g ≈ −0.49 for low mood (trials); 10–17% lower all-cause mortality at 30–60 min/wk (cohorts)',
  source: 'Noetel 2024, BMJ; Momma 2022, Br J Sports Med',
  note: 'The mood effect is Grade A; the mortality figure is associational (C) and near-maximal at exactly the 1×45 this rhythm asks for.',
};

const SLEEP_SCHEDULE: Evidence = {
  grade: 'A',
  plain: 'A fixed bed and wake time is the part of insomnia treatment that does the work — not the advice about screens and tea.',
  effect: 'a fixed sleep schedule is a core component of first-line insomnia treatment (CBT-I)',
  source: 'AASM guideline 2021; Edinger 2021, J Clin Sleep Med',
  note: 'The schedule and stimulus control are the active ingredients; sleep-hygiene tips alone grade C. Regularity itself tracks mortality in cohorts (Windred 2024, Sleep).',
};

const MINDFULNESS: Evidence = {
  grade: 'A',
  plain: 'Eight-week meditation programmes eased anxiety and low mood by a modest amount. Real, and not dramatic.',
  effect: 'modest: anxiety ≈ 0.38, low mood ≈ 0.30 at 8 weeks',
  source: 'Goyal 2014, JAMA Intern Med',
  note: 'What was tested was an eight-week structured programme. Five minutes is a foothold on that, not the same dose.',
};

const EXPRESSIVE_WRITING: Evidence = {
  grade: 'A',
  plain: 'Across 146 experiments, writing honestly about something difficult helped — but only slightly. This is the clearest case in the file of something well proven and small.',
  effect: 'small: d ≈ 0.15 across 146 experiments',
  source: 'Frattaroli 2006, Psychol Bull',
  note: 'What was tested was a few structured sessions about something specific, not a nightly log.',
};

const SOCIAL_CONNECTION: Evidence = {
  grade: 'C',
  plain: 'Across 148 studies, people with stronger ties to others were around 50% more likely to still be alive at follow-up. Nobody can be assigned to be lonely, so this is a pattern in how people live, not a proven cause.',
  effect: 'stronger social ties track ~50% higher survival odds (OR 1.50, 148 cohort studies)',
  source: 'Holt-Lunstad 2010, PLoS Med',
  note: 'One of the steadiest patterns anyone has found, and still only a pattern. Making it the same day each week is our idea, not theirs.',
};

const REACH_OUT: Evidence = {
  grade: 'B',
  plain: 'People who received an out-of-the-blue message valued it more than the sender expected they would. The message you talk yourself out of lands better than you think.',
  effect: 'people reliably underestimate how much an unprompted check-in is appreciated',
  source: 'Liu 2022, J Pers Soc Psychol',
  note: 'Tested directly, and the gap between what senders predicted and what receivers felt is the whole finding.',
};

const SOCIAL_ACTIVATION: Evidence = {
  grade: 'B',
  plain: 'Deliberately putting something you enjoy into the week is the active ingredient of a first-line treatment for depression. As a habit it is the same idea at a smaller dose.',
  effect: 'scheduling rewarding activity is the active ingredient of behavioral activation',
  source: 'Ekers 2014, PLoS ONE',
  note: 'Behavioural activation works as therapy; nothing here claims a weekly plan is therapy.',
};

const COUPLE_TIME: Evidence = {
  grade: 'B',
  plain: 'Couples who did something new together rated the relationship better afterwards. New specifically — repeating a favourite did less.',
  effect: 'shared novel activities improved relationship quality in couple experiments',
  source: 'Aron 2000, J Pers Soc Psychol',
  note: 'Novelty was the ingredient, and boredom is what it seems to work on. The harm from phones at the table is only a pattern, not a test.',
};

const RESPONSIVENESS: Evidence = {
  grade: 'C',
  plain: 'Feeling that the other person notices and understands you is one of the things happy couples consistently report. Asking is the cheapest way to be noticeable.',
  effect: 'perceived responsiveness is a core correlate of close-relationship satisfaction',
  source: 'Reis & Gable 2015, Curr Opin Psychol',
  note: 'A central idea in the field, built on what people report rather than on anything anyone assigned.',
};

const GRATITUDE_EXPRESS: Evidence = {
  grade: 'B',
  plain: 'Saying a specific thank-you to a partner improved how both people saw the relationship in experiments. Specific — not general praise.',
  effect: 'expressing appreciation to a partner improved relationship perceptions in experiments',
  source: 'Lambert & Fincham 2011; Algoe 2010',
  note: 'That it has to be specific is our reading, but a well-aimed one: what was tested was concrete gratitude for a particular thing.',
};

const CHILD_TIME: Evidence = {
  grade: 'C',
  plain: 'How present the time was predicted how teenagers did. The number of hours barely did.',
  effect: 'engaged, undistracted time tracks adolescent outcomes better than total hours',
  source: 'Milkie 2015, J Marriage Fam',
  note: 'Quality over quantity is the honest reading of this work — not a permission slip for being absent.',
};

const RITUALS: Evidence = {
  grade: 'C',
  plain: 'Fifty years of studies find children do better in families that have their own routines and rituals. Watched, not tested.',
  effect: 'family routines and rituals associate with child adjustment across 50 years of studies',
  source: 'Fiese 2002, J Fam Psychol',
};

const TEACHING: Evidence = {
  grade: 'B',
  plain: 'In experiments, the person doing the explaining remembered more than the person being explained to.',
  effect: 'explaining to others improves the explainer\'s own retention (experiments)',
  source: 'Fiorella & Mayer 2013, Contemp Educ Psychol',
};

const PRACTICE: Evidence = {
  grade: 'B',
  plain: 'Structured practice reliably improves a skill. How much depends enormously on which skill — the evidence does not support "put in the hours and you will master it".',
  effect: 'structured practice reliably improves skill; how much varies widely by domain',
  source: 'Ericsson 1993, Psychol Rev; Macnamara 2014, Psychol Sci',
  note: 'The later review is the caveat: practice explains a real but very uneven share of how good people get. Cited so no card promises mastery on a schedule.',
};

const HABIT_FORMATION: Evidence = {
  grade: 'C',
  plain: 'People repeating something in the same setting found it automatic after about 66 days — though it ranged from 18 days to 254. Missing a single day did not undo the progress.',
  effect: 'automaticity forms from repetition in a stable context; median ≈ 66 days, range 18–254',
  source: 'Lally 2010, Eur J Soc Psychol',
  note: 'Watched rather than assigned. The one-missed-day finding is why grace tokens exist.',
};

const GOAL_SETTING: Evidence = {
  grade: 'B',
  plain: 'Across hundreds of studies, a specific goal written down beat a vague intention to try.',
  effect: 'specific, written goals outperform vague intentions across hundreds of studies',
  source: 'Locke & Latham 2002, Am Psychol',
};

const MONITORING: Evidence = {
  grade: 'A',
  plain: 'Keeping track of how you are doing makes you meaningfully more likely to get there — one of the steadier findings anyone has. Writing it down works better than just noticing.',
  effect: 'monitoring progress raises goal attainment, d ≈ 0.40; stronger when progress is recorded',
  source: 'Harkin 2016, Psychol Bull',
  note: 'Measured across all sorts of goals. Trials on money specifically are thinner.',
};

const AUTOMATION: Evidence = {
  grade: 'B',
  plain: 'When saving was made the thing that happens unless you stop it, far more people saved and they saved more. It is the strongest result in the study of household money.',
  effect: 'automatic-by-default designs raised saving participation and rates dramatically',
  source: 'Madrian & Shea 2001, QJE; Thaler & Benartzi 2004, JPE',
  note: 'Not a laboratory result — this was measured on real workplaces changing their default, at scale.',
};

const FIN_EDUCATION: Evidence = {
  grade: 'B',
  plain: 'Learning about money produces a small improvement in what people know and what they do. Earlier reviews found close to nothing; the newer trials find a little.',
  effect: 'small positive effects of financial education on knowledge and behavior (RCTs)',
  source: 'Kaiser 2022, J Financ Econ',
  note: 'Small, and stated as small.',
};

const IMPLEMENTATION_INTENTION: Evidence = {
  grade: 'A',
  plain: 'Deciding when and where you will do a thing — not just that you will — raised follow-through substantially across 94 studies. It is the largest cheap win in this whole file.',
  effect: 'when-where-how plans raise follow-through, d ≈ 0.65 across 94 studies',
  source: 'Gollwitzer & Sheeran 2006, Adv Exp Soc Psychol',
  note: 'Putting a date on it is not preparation for the intervention. It is the intervention.',
};

const NOVELTY: Evidence = {
  grade: 'C',
  plain: 'Weeks that repeat blur together; varied ones keep their shine. Watched rather than tested, for anything you do alone.',
  effect: 'variety and novelty slow hedonic adaptation — repeated weeks blur, varied ones don\'t',
  source: 'Sheldon & Lyubomirsky 2012, Pers Soc Psychol Bull',
  note: 'The version where two people do something new together was actually tested (Aron 2000). Doing it alone is the watched cousin.',
};

const EXPERIENTIAL: Evidence = {
  grade: 'B',
  plain: 'Asked later, people were happier about money they spent doing something than money they spent owning something.',
  effect: 'experiences beat possessions for remembered happiness (experiments and surveys)',
  source: 'Van Boven & Gilovich 2003, J Pers Soc Psychol',
};

const KINDNESS: Evidence = {
  grade: 'A',
  plain: 'Doing something kind made the doer feel better across pooled experiments — a small-to-moderate lift, and one of the few things here properly tested rather than observed.',
  effect: 'prosocial acts improve the actor\'s wellbeing, δ ≈ 0.28 (meta of experiments)',
  source: 'Curry 2018, J Exp Soc Psychol',
};

const VOLUNTEERING: Evidence = {
  grade: 'C',
  plain: 'Regular volunteers were about 20% less likely to die during follow-up, and reported better wellbeing. Watched, not tested.',
  effect: 'regular volunteering tracks ~20% lower mortality and better wellbeing in cohorts',
  source: 'Jenkinson 2013, BMC Public Health',
  note: 'The tested cousin is one-off kindness (Curry 2018), which is why "regular" is the word that matters here.',
};

const PROSOCIAL_SPEND: Evidence = {
  grade: 'B',
  plain: 'Given money to spend, people told to spend it on someone else ended the day happier than those who spent it on themselves. A small effect — and smaller again when the study was repeated carefully.',
  effect: 'spending on others beat spending on self in trials — small (d ≈ 0.2) and replicated smaller',
  source: 'Dunn 2008, Science; Aknin 2020 registered replication',
  note: 'Real, small, and honestly sized after the repeat. No card should promise more than that.',
};

const PURPOSE: Evidence = {
  grade: 'C',
  plain: 'People who said their life had a sense of purpose were less likely to die during follow-up, across many large studies. Watched, not tested.',
  effect: 'higher purpose in life tracks lower all-cause mortality (metas of cohorts)',
  source: 'Cohen 2016, Psychosom Med; Alimujiang 2019, JAMA Netw Open',
  note: 'The weekly standing hour is our idea of how to act on that, not something anybody measured.',
};

const DETACHMENT: Evidence = {
  grade: 'C',
  plain: 'People who genuinely switched off from work — not just stopped working — reported less exhaustion. Mostly from diaries and surveys.',
  effect: 'psychological detachment from work reliably tracks lower exhaustion (meta of mostly diary/cross-sectional studies)',
  source: 'Wendsche & Lohmann-Haislah 2017, Front Psychol',
};

const DEEP_FOCUS: Evidence = {
  grade: 'C',
  plain: 'Switching tasks leaves part of your attention behind on the last one, and the next task measurably suffers.',
  effect: 'switching tasks leaves attention residue that degrades performance on the next one',
  source: 'Leroy 2009, Organ Behav Hum Decis Process',
  note: 'Nobody has tested whether a two-hour block helps. It is our answer to a real finding about switching.',
};

const COOKING: Evidence = {
  grade: 'C',
  plain: 'People who cook at home more often eat better. One small trial also improved mood by changing the whole diet — 67 people, and its large result is probably flattering.',
  effect: 'home-cooking frequency tracks better diet quality; whole-diet improvement has one small RCT for low mood',
  source: 'Wolfson & Bleich 2015, Public Health Nutr; Jacka 2017, BMC Med',
  note: 'Cook because it steers what you eat, not because a trial promised you a better mood.',
};

const REMINISCENCE: Evidence = {
  grade: 'B',
  plain: 'Structured remembering eased depression in older adults in trials. The measured benefit lands mostly on the parent doing the remembering — the question is the gift.',
  effect: 'structured reminiscence reduces depressive symptoms in older adults (trials)',
  source: 'Bohlmeijer 2003, Int J Geriatr Psychiatry',
};

const CONTAGION: Evidence = {
  grade: 'C',
  plain: 'In lab games, one person choosing to cooperate made people three connections away more likely to cooperate too.',
  effect: 'cooperative behavior spread across three degrees in networked lab games',
  source: 'Fowler & Christakis 2010, PNAS',
};

// ---------------------------------------------------------------------------
// Rhythms — keyed by `Rhythm.key`. Thirty-six catalog rhythms plus the nine
// PROMOTED dailies from commonHabits.ts.
// ---------------------------------------------------------------------------

const RHYTHM_EVIDENCE: Record<string, Evidence> = {
  // career
  'career.next': GOAL_SETTING,
  'career.deep': DEEP_FOCUS,
  'career.leave': DETACHMENT,

  // health
  'health.move': MOVEMENT,
  'health.strength': STRENGTH,
  'health.sleep': SLEEP_SCHEDULE,
  'health.stretch': {
    grade: 'B',
    plain: 'Stretching does increase how far a joint will move, reliably. Whether it prevents injury or protects mobility in later life is not something anyone has shown.',
    effect: 'stretching improves range of motion in trials',
    source: 'Cochrane reviews (stretching & flexibility)',
  },
  'health.vitamins': {
    grade: 'folk',
    plain: 'Large trials found no benefit from routine multivitamins for healthy, well-fed adults — not for living longer, not for heart disease, not for cancer.',
    source: 'USPSTF 2022',
    note: 'Kept as a personal routine, not a health claim. Supplements for a diagnosed deficiency are a different question and belong with a doctor.',
  },
  'health.upkeep': {
    grade: 'B',
    plain: 'Brushing reduces gum disease and tooth decay in trials. Flossing has surprisingly little evidence behind it, and the links to heart disease and diabetes are only patterns — brushing carries this one.',
    effect: 'oral hygiene reduces gingivitis and caries risk in trials',
    source: 'Cochrane oral-health reviews',
  },
  'health.makebed': {
    grade: 'folk',
    plain: 'Nobody has studied whether making the bed changes anything. It is here because a small kept promise is a good way to start a day — which is a belief, not a finding.',
  },
  'health.yoga': {
    grade: 'A',
    plain: 'Yoga lifted low mood in trials about as much as other kinds of movement, and was among the gentlest options tested.',
    effect: 'g ≈ −0.55 for low mood vs active control; among the best-tolerated modalities in the network meta',
    source: 'Noetel 2024, BMJ',
    note: 'What was measured was mood, not flexibility or strength.',
  },
  'health.cook': COOKING,
  'health.water': {
    grade: 'folk',
    plain: 'There are no trials of "drink more water" in healthy adults. Kept because people keep it, and thirst is not a controversy.',
  },

  // finance
  'finance.review': MONITORING,
  'finance.first': AUTOMATION,
  'finance.learn': FIN_EDUCATION,

  // family
  'family.call': SOCIAL_CONNECTION,
  'family.ask': REMINISCENCE,
  'family.hour': {
    grade: 'C',
    plain: 'In a study that followed people for eighty years, how good their relationships were in midlife predicted their health in old age better than their cholesterol did. Watched, not tested.',
    effect: 'relationship quality in midlife predicted late-life health better than biomarkers',
    source: 'Harvard Study of Adult Development (Waldinger)',
    note: 'The unhurried hour is our idea of how to act on that, not something anyone measured.',
  },

  // partner
  'partner.evening': COUPLE_TIME,
  'partner.ask': RESPONSIVENESS,
  'partner.specific': GRATITUDE_EXPRESS,

  // children
  'children.hour': CHILD_TIME,
  'children.ours': RITUALS,
  'children.record': {
    grade: 'folk',
    plain: 'Nobody has studied this, and nobody needs to. It is memory-keeping.',
  },

  // friends
  'friends.message': REACH_OUT,
  'friends.moved': SOCIAL_CONNECTION,
  'friends.yes': SOCIAL_ACTIVATION,

  // growth
  'growth.daily': PRACTICE,
  'growth.hard': PRACTICE,
  'growth.teach': TEACHING,
  'growth.read': {
    grade: 'folk',
    plain: 'The claims that reading makes you sharper or kinder are thin — the famous one about fiction and empathy did not hold up when repeated. Twenty pages a night is a shelf a year, which is reason enough.',
  },

  // purpose
  'purpose.hour': PURPOSE,
  'purpose.open': HABIT_FORMATION,
  'purpose.show': MONITORING,

  // experiences
  'experiences.new': NOVELTY,
  'experiences.yes': SOCIAL_ACTIVATION,
  'experiences.near': EXPERIENTIAL,
  'experiences.outside': {
    grade: 'C',
    plain: 'People who spent at least two hours a week outdoors reported better health and wellbeing — and below two hours there was no benefit at all. You can reach it in one visit.',
    effect: '≥120 minutes/week in nature tracks good health and wellbeing; a threshold, reachable in one visit',
    source: 'White 2019, Sci Rep',
    note: 'Asked 19,806 people once, so it shows a pattern rather than a cause. Kept anyway: two hours is one Sunday morning, and the pattern is unusually consistent.',
  },

  // reflection
  'reflection.quiet': MINDFULNESS,
  'reflection.page': EXPRESSIVE_WRITING,
  'reflection.hour': {
    grade: 'folk',
    plain: 'Deliberate time alone has barely been studied, considering how fiercely the people who keep it defend it. No evidence either way.',
  },
  'reflection.prayer': {
    grade: 'C',
    plain: 'People who regularly attended religious services died later, in large studies that followed them for years. What was counted was mostly going with others; evidence on private practice is much thinner.',
    effect: 'religious service attendance tracks lower mortality in large cohorts',
    source: 'Li 2016, JAMA Intern Med',
  },
  'reflection.journal': {
    grade: 'C',
    plain: 'Writing down what you did each day is a form of keeping track, which is well proven. But the writing studies tested short, structured sessions about something difficult — not a nightly log, which nobody has measured.',
    effect: 'daily recording is self-monitoring, the meta-supported mechanism — but the writing trials used a different paradigm',
    source: 'Harkin 2016, Psychol Bull; Frattaroli 2006, Psychol Bull',
    note: 'A strong mechanism attached to a different practice. This grade is the honest average of the two.',
  },

  // impact
  'impact.hour': {
    grade: 'A',
    plain: 'Doing something kind made the doer feel better across pooled experiments — a small-to-moderate lift, properly tested. Separately, regular volunteers were about 20% less likely to die during follow-up, which was watched rather than tested.',
    effect: 'prosocial acts improve the actor\'s wellbeing, δ ≈ 0.28 (trials); regular volunteering tracks ~20% lower mortality (cohorts)',
    source: 'Curry 2018, J Exp Soc Psychol; Jenkinson 2013, BMC Public Health',
    note: '"Regular" is the word that matters in both.',
  },
  'impact.answer': KINDNESS,
  'impact.bring': CONTAGION,
};

// ---------------------------------------------------------------------------
// Ladder rungs — keyed by exact `LadderRung.title`, because rungs have no
// key and their titles are already contractually stable. The test turns that
// contract into a failure message.
// ---------------------------------------------------------------------------

const RUNG_EVIDENCE: Record<string, Evidence> = {
  // career
  'Block two hours of focused work': DEEP_FOCUS,
  'Write down what you actually want from this job': GOAL_SETTING,
  'Have one honest conversation about your direction': {
    grade: 'folk',
    plain: 'Nobody has tested this. It sits next to research on asking for feedback, which is itself only watched rather than tested.',
  },
  'Learn one thing that outlasts this role': PRACTICE,
  'Ask for the thing you have been not asking for': {
    grade: 'folk',
    plain: 'That people ask for far less than they could is well documented. That asking anyway helps is our inference from it, not a finding.',
  },
  'Protect one evening a week from work, every week': DETACHMENT,

  // health
  'Book the annual health checkup': {
    grade: 'C',
    plain: 'General yearly checkups did not reduce deaths when all the trials were reviewed together. Screening aimed at your age and your risks does work — so this is the door to the right tests, not a life-saver in itself.',
    effect: 'routine general health checks did not reduce mortality in the Cochrane synthesis; age- and risk-targeted screening does work',
    source: 'Krogsbøll 2019, Cochrane',
    note: 'Kept deliberately, saying what it is. This entry existing is what makes every confident one on this list believable.',
  },
  'Walk for twenty minutes today': MOVEMENT,
  'Put a bedtime in the calendar and keep it once': SLEEP_SCHEDULE,
  'Do one strength session this week': STRENGTH,
  'Cook three meals at home this week': COOKING,
  'Move three times a week for a month': MOVEMENT,

  // finance
  'Weekly money review': MONITORING,
  'Write down every recurring payment you have': MONITORING,
  'Set aside one month of expenses': {
    grade: 'C',
    plain: 'How much cash people had on hand predicted how they felt about money better than what they earned did.',
    effect: 'liquid savings track financial wellbeing better than income does',
    source: 'Ruberton 2016, Emotion; CFPB financial well-being research',
    note: 'The buffer, not the salary, is what this research keeps pointing at.',
  },
  'Automate one monthly investment': AUTOMATION,
  'Read one thing about money you have been avoiding': FIN_EDUCATION,
  'Spend a planned amount on an experience with someone': {
    grade: 'B',
    plain: 'Two separate experiments point the same way: money spent doing something beat money spent owning something, and money spent on someone else beat money spent on yourself. Both effects are small. This is where they meet.',
    effect: 'experiences beat possessions for remembered happiness; spending on others beat spending on self, d ≈ 0.2',
    source: 'Van Boven & Gilovich 2003, J Pers Soc Psychol; Dunn 2008, Science',
    note: 'Both honestly sized after being repeated carefully.',
  },
  'Write the will, or the list of what is where': {
    grade: 'folk',
    plain: 'No studies, and none coming. It is here because the cost of not doing it falls entirely on somebody you love.',
  },

  // family
  'Call someone in your family today': REACH_OUT,
  'Ask a parent one question about their childhood': REMINISCENCE,
  'Record one story before it is gone': REMINISCENCE,
  'Plan a visit and put a date on it': IMPLEMENTATION_INTENTION,
  'Write down what you would want them to know': {
    grade: 'B',
    plain: 'Writing a gratitude letter gave the biggest short-term lift of anything in the original happiness trial — and it had faded by three months.',
    effect: 'the gratitude-letter exercise produced the largest short-term boost in the original positive-psychology trial, fading by three months',
    source: 'Seligman 2005, Am Psychol',
    note: 'Short-lived by the trial\'s own numbers, which is fine: the letter is not for the person writing it.',
  },
  'Make the call a standing weekly thing': SOCIAL_CONNECTION,

  // partner
  'Plan a phone-free evening together': COUPLE_TIME,
  'Ask them what they need more of right now': RESPONSIVENESS,
  'Take one thing off their plate this week': {
    grade: 'C',
    plain: 'In daily diaries, the help that actually helped was the help nobody mentioned. Do the thing; skip the announcement.',
    effect: 'support that was not announced ("invisible support") helped partners most in daily-diary studies',
    source: 'Bolger 2000, J Pers Soc Psychol',
  },
  'Plan something you both used to do': {
    grade: 'C',
    plain: 'Time together helps. In the experiments, doing something new together helped more than repeating a favourite — so this is the gentler starting point, not the strongest one.',
    effect: 'shared pleasant time helps; the trials favored NOVEL over familiar-pleasant',
    source: 'Aron 2000, J Pers Soc Psychol',
  },
  'Say the specific thing you appreciate': GRATITUDE_EXPRESS,
  'Put a recurring evening in the calendar': IMPLEMENTATION_INTENTION,

  // children
  'One undivided hour with them this week': CHILD_TIME,
  'Ask what they are actually into right now': RESPONSIVENESS,
  'Let them teach you something': {
    grade: 'B',
    plain: 'In experiments, the person doing the explaining learns more than the person listening. Here that is the child.',
    effect: 'the protégé effect: the one who explains is the one who learns (experiments)',
    source: 'Fiorella & Mayer 2013, Contemp Educ Psychol',
  },
  'Write down one thing they said this month': {
    grade: 'folk',
    plain: 'Nobody has studied this, and nobody needs to. It is memory-keeping.',
  },
  'Take a day off for no reason but them': CHILD_TIME,
  'Start a thing only the two of you do': RITUALS,

  // friends
  'Message a friend you have been meaning to': REACH_OUT,
  'Make an actual plan with a date on it': IMPLEMENTATION_INTENTION,
  'Call the one who moved away': SOCIAL_CONNECTION,
  'Introduce two people who should know each other': {
    grade: 'folk',
    plain: 'Well studied for careers, not at all for happiness. Kept because two people you like meeting each other costs nothing and occasionally changes both their lives.',
  },
  'Host something small': SOCIAL_ACTIVATION,
  'Put a standing monthly catch-up in the calendar': IMPLEMENTATION_INTENTION,
  'Message one friend every week, whoever it is': REACH_OUT,

  // growth
  'Learn for 30 minutes': PRACTICE,
  'Finish the thing you started and abandoned': {
    grade: 'folk',
    plain: 'The famous study people cite for this is about remembering unfinished tasks, not about any benefit from finishing them. No evidence — kept because it is worth doing.',
  },
  'Teach one thing you know to someone': TEACHING,
  'Read the book that keeps getting postponed': {
    grade: 'folk',
    plain: 'No solid evidence that reading makes you sharper. The book is the reward.',
  },
  'Take on something you are not qualified for': {
    grade: 'folk',
    plain: 'Studied inside companies, and only by watching. As personal advice it is a hunch — a good one.',
  },
  'Learn for thirty minutes a day for a month': HABIT_FORMATION,

  // purpose
  'Work on the project for 30 minutes': PURPOSE,
  'Show the work to one person': MONITORING,
  'Write down what you want this to become': GOAL_SETTING,
  'Give it a standing hour every week': IMPLEMENTATION_INTENTION,
  'Finish one piece of it, however small': {
    grade: 'C',
    plain: 'In daily diaries kept by people at work, small visible progress was the single biggest thing that made a day feel good.',
    effect: 'small visible progress was the strongest daily driver of inner work life in diary studies',
    source: 'Amabile & Kramer 2011',
  },
  'Put it somewhere other people can find it': {
    grade: 'folk',
    plain: 'Plenty of people swear by it. Nobody has studied it.',
  },

  // experiences
  'Plan one local adventure this month': NOVELTY,
  'Book the thing instead of researching it': {
    grade: 'B',
    plain: 'Waiting for something you are going to do felt better than waiting for something you are going to own. A booked plan pays twice — once now, once on the day. Researching without booking pays nothing.',
    effect: 'anticipating experiences beats anticipating purchases (experiments and experience-sampling)',
    source: 'Kumar 2014, Psychol Sci',
  },
  'Say yes to one invitation you would normally decline': SOCIAL_ACTIVATION,
  'Go somewhere you have never been, nearby': NOVELTY,
  'Take the trip while the people can still come': EXPERIENTIAL,
  'Put one real trip in the calendar every year': EXPERIENTIAL,
  'Do one new thing a week, however small': NOVELTY,

  // reflection
  'Sit quietly for 5 minutes': MINDFULNESS,
  'Write one honest page': EXPRESSIVE_WRITING,
  'Name the thing you have been avoiding thinking about': {
    grade: 'B',
    plain: 'Putting a feeling into words measurably turned the feeling down in lab studies. Naming it is doing something about it.',
    effect: 'putting feelings into words dampened emotional reactivity in lab studies',
    source: 'Lieberman 2007, Psychol Sci',
  },
  'Take a walk with no phone and no podcast': {
    grade: 'B',
    plain: 'A walk with nothing coming in restored people\'s attention in experiments, where a walk through busy streets did not.',
    effect: 'a walk without input restored directed attention vs a busy-environment walk in experiments',
    source: 'Berman 2008, Psychol Sci',
    note: 'The walks in the studies were in nature. The quiet appears to be doing real work either way.',
  },
  'Write the letter you will not send': EXPRESSIVE_WRITING,
  'Put one thing you used to enjoy back in the week': SOCIAL_ACTIVATION,
  'Write down three specific good things from this week': {
    grade: 'A',
    plain: 'Gratitude exercises reliably help a little. Clearly better than doing nothing, and barely better than any other pleasant writing — well proven, and genuinely small.',
    effect: 'small: gratitude exercises g ≈ 0.19–0.22 on wellbeing vs active controls',
    source: 'Davis 2016, J Couns Psychol; Cregg & Cheavens 2021, J Happiness Stud',
    note: 'Never offered as something to reach for when you are low.',
  },
  'Keep a weekly hour that belongs to no one else': {
    grade: 'folk',
    plain: 'Deliberate time alone has barely been studied, considering how fiercely the people who keep it defend it. No evidence either way.',
  },

  // impact
  'Mentor or help one person this month': KINDNESS,
  'Give to one thing you actually care about': PROSOCIAL_SPEND,
  'Offer the skill you have to someone who lacks it': KINDNESS,
  'Show up in person for something local': VOLUNTEERING,
  'Bring one other person into it': CONTAGION,
  'Make the giving automatic and forget it': {
    grade: 'B',
    plain: 'Making something happen unless you stop it, rather than only when you decide to, dramatically raises how often it actually happens. This is the saving evidence, pointed outward.',
    effect: 'automatic-by-default designs dramatically raise follow-through — the saving evidence, pointed outward',
    source: 'Madrian & Shea 2001, QJE',
  },
  'Give one hour a week to someone who needs it': {
    grade: 'A',
    plain: 'Doing something kind made the doer feel better across pooled experiments — a small-to-moderate lift, properly tested. Separately, regular volunteers were about 20% less likely to die during follow-up, which was watched rather than tested.',
    effect: 'prosocial acts improve the actor\'s wellbeing, δ ≈ 0.28 (trials); regular volunteering tracks ~20% lower mortality (cohorts)',
    source: 'Curry 2018, J Exp Soc Psychol; Jenkinson 2013, BMC Public Health',
    note: 'Same receipt as the rhythm it climbs toward — they are the same promise.',
  },
};

// ---------------------------------------------------------------------------
// Healthspan levers — keyed `lever.<LeverKey>`. The population years on the
// card already carry their "not a prediction" label; these carry the design.
// ---------------------------------------------------------------------------

const LEVER_EVIDENCE: Record<string, Evidence> = {
  'lever.strength': STRENGTH,
  'lever.cardio': {
    grade: 'A',
    plain: 'The 150-minutes-a-week guideline comes from a full review of the evidence, and the mood benefits were measured in trials.',
    effect: 'the 150-min/wk guideline rests on systematic review; mood effects are trial-grade',
    source: 'WHO 2020 activity guidelines; Noetel 2024, BMJ',
    note: 'The extra years on the card come from population modelling built on watched groups, as the card itself says. They are not a prediction about you.',
  },
  'lever.sleep': SLEEP_SCHEDULE,
  'lever.social': SOCIAL_CONNECTION,
};

// ---------------------------------------------------------------------------
// Proposed additions from the evidence review — receipts written BEFORE the
// entries exist, so the catalog change that adds them ships already covered.
// Listed here (not in the banks above) so the orphan check knows they are
// deliberate.
// ---------------------------------------------------------------------------

export const PROPOSED: Record<string, Evidence> = {};

// ---------------------------------------------------------------------------
// The bank, and the two ways to read it.
// ---------------------------------------------------------------------------

export const EVIDENCE: Record<string, Evidence> = {
  ...RHYTHM_EVIDENCE,
  ...RUNG_EVIDENCE,
  ...LEVER_EVIDENCE,
};

/**
 * The receipt for a catalog identity — a rhythm key, an exact rung title, or
 * `lever.<key>`. Null means the test suite has a bug, because completeness
 * is enforced; treat null as "say nothing", never as "make something up".
 */
export function evidenceFor(idOrTitle: string): Evidence | null {
  return EVIDENCE[idOrTitle] ?? PROPOSED[idOrTitle] ?? null;
}

/**
 * Which catalog entry a title actually is — the identity behind the wording.
 *
 * The same identity space the receipts are keyed on, which is the point: if
 * this can name the thing, the bank can cite it, and the telemetry can count
 * it. Three ways in, tried in order of how sure each one is:
 *
 *   1. A rhythm's own title, matched exactly. Titles are contractually
 *      stable, which is what makes this safe.
 *   2. A ladder rung's title, which *is* the rung's identity.
 *   3. The recognizer, for the phrasings people write themselves — "Yoga",
 *      "hydrate", "meal prep Sundays".
 *
 * Null for anything hand-written that resolves to nothing, and null is a
 * perfectly good answer: it means somebody invented their own commitment,
 * which the app should record faithfully and never pretend to have authored.
 */
export function catalogKeyFor(title: string): string | null {
  const want = title.trim().toLowerCase();
  if (!want) return null;

  for (const domain of rhythmDomains()) {
    for (const r of rhythmsFor(domain)) {
      if (r.title.trim().toLowerCase() === want) return r.key;
    }
    for (const rung of domainLadder(domain)) {
      if (rung.title.trim().toLowerCase() === want) return rung.title;
    }
  }
  return recognizeHabit(title)?.key ?? null;
}

/** What a generated entry may claim before anything is known about it. */
const UNGRADED: Evidence = {
  grade: 'folk',
  plain: 'Nobody has measured this one. It was written for your life rather than taken from the catalog, so it makes no claim about what it will do — it is here because it fits.',
};

/**
 * The receipt for something a model wrote, which is `folk` until proven
 * otherwise — and proven only by being a rephrasing of something graded.
 *
 * This is the rule that stops the evidence layer from being laundered. A
 * generation phrases a rhythm in somebody's own idiom; if that phrasing
 * resolves to a catalog identity, it is that thing said differently and it
 * inherits that thing's receipt. If it resolves to nothing, it is a new idea
 * nobody has measured, and the honest grade for a new idea is folk.
 *
 * Personal phrasing inherits the evidence of the thing it is a phrasing of.
 * It never invents evidence of its own, and it never borrows a grade by
 * sounding similar to one — the resolution goes through the same recognizer
 * the catalog already uses to tell that "Yoga" and "yoga on Tuesdays" are
 * the same commitment.
 */
export function evidenceForGenerated(title: string, key?: string | null): Evidence {
  if (key) {
    const byKey = EVIDENCE[key] ?? PROPOSED[key];
    if (byKey) return byKey;
  }
  const resolved = recognizeHabit(title)?.key;
  if (resolved) {
    const byPhrase = EVIDENCE[resolved] ?? PROPOSED[resolved];
    if (byPhrase) return byPhrase;
  }
  return UNGRADED;
}
