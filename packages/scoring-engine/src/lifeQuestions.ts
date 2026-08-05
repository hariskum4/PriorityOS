/**
 * Which of the life-as-it-is questions a particular life can answer.
 *
 * A sixteen-year-old who has just tapped "student" was being offered
 * "married" and "3+ children" — the same class of mistake the stacking
 * catalog made with commutes: the app describing a life the person does
 * not have. The gate is AGE, not "student". Adult students marry and
 * raise children; a 28-year-old MBA parent must keep both questions.
 *
 * The away-from-parents question is never dropped — for a minor or a
 * student it is often the most load-bearing answer they give — but it is
 * asked in the words of that life: a hosteller lives "away from home",
 * not "away from their parents".
 */

import { parseAge } from './relationshipSanity';

/** Below this, marital status and children are not questions but noise. */
export const ADULT_AGE = 18;

export interface LifeQuestionPlan {
  askMarital: boolean;
  askChildren: boolean;
  awayLabel: string;
  /**
   * The answer for somebody with no parents to live away from.
   *
   * The question was a yes/no, and for anyone whose parents have died — or
   * are not in their life — neither answer is true. They picked "away", the
   * truthful half of a wrong question, and were then offered "Call home, the
   * same day every week" for as long as they used the app.
   *
   * Deliberately a catch-all rather than a taxonomy. Death, estrangement,
   * never having known them and not wanting to say are one answer here,
   * because the app needs exactly one fact — whether to direct anything at a
   * parent — and has no business asking a bereaved person to itemise it.
   */
  awayNeitherLabel: string;
}

export function lifeQuestions(
  age?: number | string | null,
  workType?: string | null,
): LifeQuestionPlan {
  const parsed = typeof age === 'number' ? age : parseAge(age);
  const minor = parsed !== null && parsed < ADULT_AGE;
  const student = (workType ?? '').toLowerCase() === 'student';
  return {
    // Unknown age asks everything — "has not said" is not "is a child",
    // the same permissive default the lifeShape resolver uses.
    askMarital: !minor,
    askChildren: !minor,
    awayLabel: student
      ? 'Do you live away from home — hostel, PG, your own place?'
      : minor
        ? 'Do you live away from home?'
        : 'Do you live away from your parents?',
    // A minor or a hosteller is being asked about a house, not about whether
    // anyone is in it, so the opt-out is phrased against the question asked.
    awayNeitherLabel: student || minor ? 'no parents at home' : 'neither applies',
  };
}
