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
  /** Human-readable size and direction: "g ≈ −0.62 vs active control". */
  effect?: string;
  /** Short, stable, never a URL: "Noetel 2024, BMJ". */
  source?: string;
  /** Dose gaps, replication caveats, who the benefit actually lands on. */
  note?: string;
}

/** For the card footnote. The label never oversells the grade. */
export const GRADE_LABELS: Record<EvidenceGrade, string> = {
  A: 'meta-analysis of trials',
  B: 'randomized trials',
  C: 'observational evidence',
  folk: 'common practice',
};

// ---------------------------------------------------------------------------
// Shared records — one activity class, cited once, reused everywhere it
// appears. A rung and a rhythm that operationalize the same finding must
// never drift into citing it differently.
// ---------------------------------------------------------------------------

const MOVEMENT: Evidence = {
  grade: 'A',
  effect: 'walking/jogging g ≈ −0.62 for low mood vs active control; benefits rise with intensity',
  source: 'Noetel 2024, BMJ',
  note: 'This asks for about 120 minutes a week; the usual public-health figure is 150. The measured benefits start well below either.',
};

const STRENGTH: Evidence = {
  grade: 'A',
  effect: 'g ≈ −0.49 for low mood (trials); 10–17% lower all-cause mortality at 30–60 min/wk (cohorts)',
  source: 'Noetel 2024, BMJ; Momma 2022, Br J Sports Med',
  note: 'The mood effect is Grade A; the mortality figure is associational (C) and near-maximal at exactly the 1×45 this rhythm asks for.',
};

const SLEEP_SCHEDULE: Evidence = {
  grade: 'A',
  effect: 'a fixed sleep schedule is a core component of first-line insomnia treatment (CBT-I)',
  source: 'AASM guideline 2021; Edinger 2021, J Clin Sleep Med',
  note: 'The schedule and stimulus control are the active ingredients; sleep-hygiene tips alone grade C. Regularity itself tracks mortality in cohorts (Windred 2024, Sleep).',
};

const MINDFULNESS: Evidence = {
  grade: 'A',
  effect: 'modest: anxiety ≈ 0.38, low mood ≈ 0.30 at 8 weeks',
  source: 'Goyal 2014, JAMA Intern Med',
  note: 'Trial dose was ~8-week structured programs. Five minutes is a foothold, not the trial dose — the note exists so the card never claims otherwise.',
};

const EXPRESSIVE_WRITING: Evidence = {
  grade: 'A',
  effect: 'small: d ≈ 0.15 across 146 experiments',
  source: 'Frattaroli 2006, Psychol Bull',
  note: 'Grade A and tiny — the canonical proof that grade is not magnitude. The trial paradigm is short structured emotional disclosure, not a daily log.',
};

const SOCIAL_CONNECTION: Evidence = {
  grade: 'C',
  effect: 'stronger social ties track ~50% higher survival odds (OR 1.50, 148 cohort studies)',
  source: 'Holt-Lunstad 2010, PLoS Med',
  note: 'Among the most consistent associations in the field, and still observational. The specific ritual (same day, weekly) is implementation folklore.',
};

const REACH_OUT: Evidence = {
  grade: 'B',
  effect: 'people reliably underestimate how much an unprompted check-in is appreciated',
  source: 'Liu 2022, J Pers Soc Psychol',
  note: 'Experimental, and the bias is the point: the message you talk yourself out of lands better than you predict.',
};

const SOCIAL_ACTIVATION: Evidence = {
  grade: 'B',
  effect: 'scheduling rewarding activity is the active ingredient of behavioral activation',
  source: 'Ekers 2014, PLoS ONE',
  note: 'BA is a first-line depression treatment as therapy; as a weekly habit this is the same mechanism at maintenance dose.',
};

const COUPLE_TIME: Evidence = {
  grade: 'B',
  effect: 'shared novel activities improved relationship quality in couple experiments',
  source: 'Aron 2000, J Pers Soc Psychol',
  note: 'Novelty specifically — mediated by reduced boredom. Phone-presence harms are associational.',
};

const RESPONSIVENESS: Evidence = {
  grade: 'C',
  effect: 'perceived responsiveness is a core correlate of close-relationship satisfaction',
  source: 'Reis & Gable 2015, Curr Opin Psychol',
  note: 'Central construct, observational base. Asking is the cheapest way to be perceivable as responsive.',
};

const GRATITUDE_EXPRESS: Evidence = {
  grade: 'B',
  effect: 'expressing appreciation to a partner improved relationship perceptions in experiments',
  source: 'Lambert & Fincham 2011; Algoe 2010',
  note: 'Specificity is folklore, but well-aimed folklore: the trials used concrete expressed gratitude, not generic praise.',
};

const CHILD_TIME: Evidence = {
  grade: 'C',
  effect: 'engaged, undistracted time tracks adolescent outcomes better than total hours',
  source: 'Milkie 2015, J Marriage Fam',
  note: 'Quality-over-quantity is the honest reading of the time-use literature, not a permission slip.',
};

const RITUALS: Evidence = {
  grade: 'C',
  effect: 'family routines and rituals associate with child adjustment across 50 years of studies',
  source: 'Fiese 2002, J Fam Psychol',
};

const TEACHING: Evidence = {
  grade: 'B',
  effect: 'explaining to others improves the explainer\'s own retention (experiments)',
  source: 'Fiorella & Mayer 2013, Contemp Educ Psychol',
};

const PRACTICE: Evidence = {
  grade: 'B',
  effect: 'structured practice reliably improves skill; how much varies widely by domain',
  source: 'Ericsson 1993, Psychol Rev; Macnamara 2014, Psychol Sci',
  note: 'The Macnamara meta is the caveat: practice explains a real but domain-dependent share of performance. Cited so the card never promises mastery on a schedule.',
};

const HABIT_FORMATION: Evidence = {
  grade: 'C',
  effect: 'automaticity forms from repetition in a stable context; median ≈ 66 days, range 18–254',
  source: 'Lally 2010, Eur J Soc Psychol',
  note: 'Field-observational. Missing a single day did not break formation — which the grace-token design already honors.',
};

const GOAL_SETTING: Evidence = {
  grade: 'B',
  effect: 'specific, written goals outperform vague intentions across hundreds of studies',
  source: 'Locke & Latham 2002, Am Psychol',
};

const MONITORING: Evidence = {
  grade: 'A',
  effect: 'monitoring progress raises goal attainment, d ≈ 0.40; stronger when progress is recorded',
  source: 'Harkin 2016, Psychol Bull',
  note: 'Mechanism-level evidence across domains; money-specific trials are thinner.',
};

const AUTOMATION: Evidence = {
  grade: 'B',
  effect: 'automatic-by-default designs raised saving participation and rates dramatically',
  source: 'Madrian & Shea 2001, QJE; Thaler & Benartzi 2004, JPE',
  note: 'Quasi-experimental at scale — the strongest finding in household finance.',
};

const FIN_EDUCATION: Evidence = {
  grade: 'B',
  effect: 'small positive effects of financial education on knowledge and behavior (RCTs)',
  source: 'Kaiser 2022, J Financ Econ',
  note: 'Earlier syntheses found ~nothing; the newer trial base is modestly positive. Small, stated as small.',
};

const IMPLEMENTATION_INTENTION: Evidence = {
  grade: 'A',
  effect: 'when-where-how plans raise follow-through, d ≈ 0.65 across 94 studies',
  source: 'Gollwitzer & Sheeran 2006, Adv Exp Soc Psychol',
  note: 'The largest cheap effect in the behavior-change literature. Putting a date on it IS the intervention.',
};

const NOVELTY: Evidence = {
  grade: 'C',
  effect: 'variety and novelty slow hedonic adaptation — repeated weeks blur, varied ones don\'t',
  source: 'Sheldon & Lyubomirsky 2012, Pers Soc Psychol Bull',
  note: 'The couple version has experimental support (Aron 2000); solo novelty is the associational cousin.',
};

const EXPERIENTIAL: Evidence = {
  grade: 'B',
  effect: 'experiences beat possessions for remembered happiness (experiments and surveys)',
  source: 'Van Boven & Gilovich 2003, J Pers Soc Psychol',
};

const KINDNESS: Evidence = {
  grade: 'A',
  effect: 'prosocial acts improve the actor\'s wellbeing, δ ≈ 0.28 (meta of experiments)',
  source: 'Curry 2018, J Exp Soc Psychol',
  note: 'Small-to-moderate and experimental — rarer than it sounds in this file.',
};

const VOLUNTEERING: Evidence = {
  grade: 'C',
  effect: 'regular volunteering tracks ~20% lower mortality and better wellbeing in cohorts',
  source: 'Jenkinson 2013, BMC Public Health',
  note: 'Associational; the experimental cousin is the kindness meta (Curry 2018), which is why "regular" is the operative word here.',
};

const PROSOCIAL_SPEND: Evidence = {
  grade: 'B',
  effect: 'spending on others beat spending on self in trials — small (d ≈ 0.2) and replicated smaller',
  source: 'Dunn 2008, Science; Aknin 2020 registered replication',
  note: 'Real, small, and honestly sized after the replication. The card should never promise more than d ≈ 0.2 feels like.',
};

const PURPOSE: Evidence = {
  grade: 'C',
  effect: 'higher purpose in life tracks lower all-cause mortality (metas of cohorts)',
  source: 'Cohen 2016, Psychosom Med; Alimujiang 2019, JAMA Netw Open',
  note: 'The standing hour is the folk implementation of an associational finding — graded for what it is.',
};

const DETACHMENT: Evidence = {
  grade: 'C',
  effect: 'psychological detachment from work reliably tracks lower exhaustion (meta of mostly diary/cross-sectional studies)',
  source: 'Wendsche & Lohmann-Haislah 2017, Front Psychol',
};

const DEEP_FOCUS: Evidence = {
  grade: 'C',
  effect: 'switching tasks leaves attention residue that degrades performance on the next one',
  source: 'Leroy 2009, Organ Behav Hum Decis Process',
  note: 'The uninterrupted block itself has no outcome meta; it is the sensible response to a real lab finding.',
};

const COOKING: Evidence = {
  grade: 'C',
  effect: 'home-cooking frequency tracks better diet quality; whole-diet improvement has one small RCT for low mood',
  source: 'Wolfson & Bleich 2015, Public Health Nutr; Jacka 2017, BMC Med',
  note: 'The SMILES trial was n=67 and single-blind — directionally supported since, but its large effect is likely inflated. Cook because it steers the diet, not because a trial promised mood.',
};

const REMINISCENCE: Evidence = {
  grade: 'B',
  effect: 'structured reminiscence reduces depressive symptoms in older adults (trials)',
  source: 'Bohlmeijer 2003, Int J Geriatr Psychiatry',
  note: 'The measured benefit lands mostly on the parent doing the remembering. The question is the gift.',
};

const CONTAGION: Evidence = {
  grade: 'C',
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
    effect: 'stretching improves range of motion in trials',
    source: 'Cochrane reviews (stretching & flexibility)',
    note: 'The range-of-motion gain is well measured. Claims about preventing injury or protecting later-life mobility go further than the evidence does.',
  },
  'health.vitamins': {
    grade: 'folk',
    note: 'Population trials show no mortality or CVD/cancer benefit from routine multivitamins in well-nourished adults (USPSTF 2022). Kept as a personal routine, not a health claim; deficiency-targeted supplementation is a different, clinician-led question.',
  },
  'health.upkeep': {
    grade: 'B',
    effect: 'oral hygiene reduces gingivitis and caries risk in trials',
    source: 'Cochrane oral-health reviews',
    note: 'The systemic-disease links (heart, diabetes) are associational only. Flossing\'s trial base is famously thin; brushing carries the grade.',
  },
  'health.makebed': {
    grade: 'folk',
    note: 'The first-kept-promise logic is behavioral common sense with no outcome studies. Folk is allowed, and saying so is the point.',
  },
  'health.yoga': {
    grade: 'A',
    effect: 'g ≈ −0.55 for low mood vs active control; among the best-tolerated modalities in the network meta',
    source: 'Noetel 2024, BMJ',
    note: 'Measured for low mood rather than for flexibility or strength, and among the gentlest of the movement options the trials compared.',
  },
  'health.cook': COOKING,
  'health.water': {
    grade: 'folk',
    note: 'No outcome trials of "more water" in healthy adults. Kept because people keep it, and thirst is not a controversy.',
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
    effect: 'relationship quality in midlife predicted late-life health better than biomarkers',
    source: 'Harvard Study of Adult Development (Waldinger)',
    note: 'Eighty-year longitudinal, still observational. The unhurried hour is the folk implementation.',
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
    note: 'Memory-keeping. No outcome literature, and none needed.',
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
    note: 'Cognitive- and empathy-benefit claims for leisure reading are thin (the famous fiction-empathy result replicated poorly). Twenty pages a night is a shelf a year — kept for its own sake.',
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
    effect: '≥120 minutes/week in nature tracks good health and wellbeing; a threshold, reachable in one visit',
    source: 'White 2019, Sci Rep',
    note: 'n = 19,806, survey-based and cross-sectional. Graded C and asked for anyway: two hours is one Sunday morning, which is a price worth paying on an association this consistent.',
  },

  // reflection
  'reflection.quiet': MINDFULNESS,
  'reflection.page': EXPRESSIVE_WRITING,
  'reflection.hour': {
    grade: 'folk',
    note: 'Deliberate solitude is under-studied relative to how fiercely its keepers defend it. Folk, and proudly.',
  },
  'reflection.prayer': {
    grade: 'C',
    effect: 'religious service attendance tracks lower mortality in large cohorts',
    source: 'Li 2016, JAMA Intern Med',
    note: 'The measured associations are mostly communal attendance; evidence on private practice is thinner. Graded for what was measured.',
  },
  'reflection.journal': {
    grade: 'C',
    effect: 'daily recording is self-monitoring, the meta-supported mechanism — but the writing trials used a different paradigm',
    source: 'Harkin 2016, Psychol Bull; Frattaroli 2006, Psychol Bull',
    note: 'The expressive-writing trials were short structured disclosure sessions, not a nightly log. C is the honest average of a strong mechanism and an unmatched paradigm.',
  },

  // impact
  'impact.hour': {
    grade: 'A',
    effect: 'prosocial acts improve the actor\'s wellbeing, δ ≈ 0.28 (trials); regular volunteering tracks ~20% lower mortality (cohorts)',
    source: 'Curry 2018, J Exp Soc Psychol; Jenkinson 2013, BMC Public Health',
    note: 'The wellbeing effect is experimental; the mortality figure is associational. "Regular" is the operative word in both literatures.',
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
    note: 'Career conversations have face validity and no direct outcome trials. Adjacent to the feedback-seeking literature, which is associational.',
  },
  'Learn one thing that outlasts this role': PRACTICE,
  'Ask for the thing you have been not asking for': {
    grade: 'folk',
    note: 'The asking gap is documented descriptively; the intervention is folklore with good aim.',
  },
  'Protect one evening a week from work, every week': DETACHMENT,

  // health
  'Book the annual health checkup': {
    grade: 'C',
    effect: 'routine general health checks did not reduce mortality in the Cochrane synthesis; age- and risk-targeted screening does work',
    source: 'Krogsbøll 2019, Cochrane',
    note: 'Contested on purpose: the honest framing is "the door to targeted screening", not "the checkup saves lives". This annotation existing is the credibility of every other one.',
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
    effect: 'liquid savings track financial wellbeing better than income does',
    source: 'Ruberton 2016, Emotion; CFPB financial well-being research',
    note: 'The buffer, not the salary, is what the wellbeing data keeps pointing at.',
  },
  'Automate one monthly investment': AUTOMATION,
  'Read one thing about money you have been avoiding': FIN_EDUCATION,
  'Spend a planned amount on an experience with someone': {
    grade: 'B',
    effect: 'experiences beat possessions for remembered happiness; spending on others beat spending on self, d ≈ 0.2',
    source: 'Van Boven & Gilovich 2003, J Pers Soc Psychol; Dunn 2008, Science',
    note: 'Two small experimental literatures point the same way — money spent on experiences, and money spent with someone. Both honestly sized after replication. This is where they meet.',
  },
  'Write the will, or the list of what is where': {
    grade: 'folk',
    note: 'No wellbeing trials, and none coming. Kept because the cost of not doing it lands entirely on someone you love.',
  },

  // family
  'Call someone in your family today': REACH_OUT,
  'Ask a parent one question about their childhood': REMINISCENCE,
  'Record one story before it is gone': REMINISCENCE,
  'Plan a visit and put a date on it': IMPLEMENTATION_INTENTION,
  'Write down what you would want them to know': {
    grade: 'B',
    effect: 'the gratitude-letter exercise produced the largest short-term boost in the original positive-psychology trial, fading by three months',
    source: 'Seligman 2005, Am Psychol',
    note: 'Short-lived by the trial\'s own data — which is fine, because the letter is not for the writer.',
  },
  'Make the call a standing weekly thing': SOCIAL_CONNECTION,

  // partner
  'Plan a phone-free evening together': COUPLE_TIME,
  'Ask them what they need more of right now': RESPONSIVENESS,
  'Take one thing off their plate this week': {
    grade: 'C',
    effect: 'support that was not announced ("invisible support") helped partners most in daily-diary studies',
    source: 'Bolger 2000, J Pers Soc Psychol',
    note: 'Do the thing; skip the announcement. That specific distinction is what the studies tested.',
  },
  'Plan something you both used to do': {
    grade: 'C',
    effect: 'shared pleasant time helps; the trials favored NOVEL over familiar-pleasant',
    source: 'Aron 2000, J Pers Soc Psychol',
    note: 'The gentler starting point. Doing something new together tested stronger than repeating something familiar.',
  },
  'Say the specific thing you appreciate': GRATITUDE_EXPRESS,
  'Put a recurring evening in the calendar': IMPLEMENTATION_INTENTION,

  // children
  'One undivided hour with them this week': CHILD_TIME,
  'Ask what they are actually into right now': RESPONSIVENESS,
  'Let them teach you something': {
    grade: 'B',
    effect: 'the protégé effect: the one who explains is the one who learns (experiments)',
    source: 'Fiorella & Mayer 2013, Contemp Educ Psychol',
    note: 'The evidence benefit runs to the child, which is the correct direction.',
  },
  'Write down one thing they said this month': {
    grade: 'folk',
    note: 'Memory-keeping. No outcome literature, and none needed.',
  },
  'Take a day off for no reason but them': CHILD_TIME,
  'Start a thing only the two of you do': RITUALS,

  // friends
  'Message a friend you have been meaning to': REACH_OUT,
  'Make an actual plan with a date on it': IMPLEMENTATION_INTENTION,
  'Call the one who moved away': SOCIAL_CONNECTION,
  'Introduce two people who should know each other': {
    grade: 'folk',
    note: 'Network brokerage is well studied for careers, not for wellbeing. Kept because two people you like meeting each other costs nothing and occasionally changes lives.',
  },
  'Host something small': SOCIAL_ACTIVATION,
  'Put a standing monthly catch-up in the calendar': IMPLEMENTATION_INTENTION,
  'Message one friend every week, whoever it is': REACH_OUT,

  // growth
  'Learn for 30 minutes': PRACTICE,
  'Finish the thing you started and abandoned': {
    grade: 'folk',
    note: 'The Zeigarnik effect is about MEMORY for unfinished tasks, not the virtue of finishing them — the pop version overclaims. Folk, with its citation politely declined.',
  },
  'Teach one thing you know to someone': TEACHING,
  'Read the book that keeps getting postponed': {
    grade: 'folk',
    note: 'Reading for its own sake. The cognitive-benefit claims are thin; the shelf is the reward.',
  },
  'Take on something you are not qualified for': {
    grade: 'folk',
    note: 'Stretch-assignment research comes from organisations and is associational. As personal advice it is folklore with good aim.',
  },
  'Learn for thirty minutes a day for a month': HABIT_FORMATION,

  // purpose
  'Work on the project for 30 minutes': PURPOSE,
  'Show the work to one person': MONITORING,
  'Write down what you want this to become': GOAL_SETTING,
  'Give it a standing hour every week': IMPLEMENTATION_INTENTION,
  'Finish one piece of it, however small': {
    grade: 'C',
    effect: 'small visible progress was the strongest daily driver of inner work life in diary studies',
    source: 'Amabile & Kramer 2011',
  },
  'Put it somewhere other people can find it': {
    grade: 'folk',
    note: 'Shipping in public has testimonials, not trials.',
  },

  // experiences
  'Plan one local adventure this month': NOVELTY,
  'Book the thing instead of researching it': {
    grade: 'B',
    effect: 'anticipating experiences beats anticipating purchases (experiments and experience-sampling)',
    source: 'Kumar 2014, Psychol Sci',
    note: 'A booked thing pays twice — once in the calendar, once on the day. Research without booking pays zero.',
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
    effect: 'putting feelings into words dampened emotional reactivity in lab studies',
    source: 'Lieberman 2007, Psychol Sci',
    note: 'Affect labelling — naming it is doing something to it.',
  },
  'Take a walk with no phone and no podcast': {
    grade: 'B',
    effect: 'a walk without input restored directed attention vs a busy-environment walk in experiments',
    source: 'Berman 2008, Psychol Sci',
    note: 'The trials used nature walks; the no-input part is doing real work either way.',
  },
  'Write the letter you will not send': EXPRESSIVE_WRITING,
  'Put one thing you used to enjoy back in the week': SOCIAL_ACTIVATION,
  'Write down three specific good things from this week': {
    grade: 'A',
    effect: 'small: gratitude exercises g ≈ 0.19–0.22 on wellbeing vs active controls',
    source: 'Davis 2016, J Couns Psychol; Cregg & Cheavens 2021, J Happiness Stud',
    note: 'Grade A and small, and the smallness is the point — the trials show it beats doing nothing and barely beats other pleasant writing. Never positioned as anything to take when low.',
  },
  'Keep a weekly hour that belongs to no one else': {
    grade: 'folk',
    note: 'Deliberate solitude is under-studied relative to how fiercely its keepers defend it. Folk, and proudly.',
  },

  // impact
  'Mentor or help one person this month': KINDNESS,
  'Give to one thing you actually care about': PROSOCIAL_SPEND,
  'Offer the skill you have to someone who lacks it': KINDNESS,
  'Show up in person for something local': VOLUNTEERING,
  'Bring one other person into it': CONTAGION,
  'Make the giving automatic and forget it': {
    grade: 'B',
    effect: 'automatic-by-default designs dramatically raise follow-through — the saving evidence, pointed outward',
    source: 'Madrian & Shea 2001, QJE',
  },
  'Give one hour a week to someone who needs it': {
    grade: 'A',
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
    effect: 'the 150-min/wk guideline rests on systematic review; mood effects are trial-grade',
    source: 'WHO 2020 activity guidelines; Noetel 2024, BMJ',
    note: 'The mortality dose-response behind the +3y figure is cohort evidence — the years are population modelling, as the card already says.',
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
  note: 'Written for this life rather than taken from the catalog, so it carries no claim about outcomes. Kept because it fits, not because it was measured.',
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
