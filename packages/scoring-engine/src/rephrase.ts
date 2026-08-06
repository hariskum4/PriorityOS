/**
 * Letting a model change the words without letting it change the facts.
 *
 * Five times in one evening a good model, given a correct digest and a prompt
 * that told it not to, wrote a sentence that was wrong. Never about a number
 * — every figure it quoted was real — always about what the number meant:
 * "26 days past" for 26 days since, `fed` reported as "enough",
 * `freeStretchMinutes` as a weekly total, a percentage given the unit
 * "moments a week". Each was fixed by naming that field in the prompt, and
 * each fix was followed by a new instance somewhere else.
 *
 * The pattern is the lesson. Interpretation is where the risk lives, so the
 * model should not be doing any: the engine composes the sentence — it has
 * the fields, the units and the meanings — and the model is asked only to say
 * the same thing better.
 *
 * And because a prompt is a request rather than a guarantee, the rewrite is
 * checked before it is used. Anything the model adds that was not in the
 * original sentence is a claim nobody verified, so the rewrite is rejected
 * and the engine's own words are shown instead. The reader never sees the
 * difference; the app simply stops being able to say something untrue.
 */

/** Digits that carry meaning — 26, 7, 13%, 1,300, 2.5. */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, ''));
}

/**
 * Words that look like names of people or places.
 *
 * Capitalised mid-sentence, which is where a model reaches when it decides a
 * sentence needs somebody in it. The first word is exempt because every
 * sentence starts capitalised, and the small function words that legitimately
 * appear capitalised after a full stop are covered by comparing against the
 * original rather than against a dictionary.
 */
function properNounsIn(text: string): string[] {
  return (text.match(/(?<=[a-z,;:)]\s)[A-Z][a-zA-Z'’-]+/g) ?? []);
}

/**
 * Everything capitalised, for building the allowlist.
 *
 * Asymmetric on purpose, and the asymmetry is the point: generous about what
 * counts as already-known, strict about what counts as newly-introduced. The
 * first version used the mid-sentence rule for both, so a name that opened
 * the original — "Amma has not been called in 26 days" — was not registered,
 * and the rewrite moving it to the end read as an invention.
 */
function anyCapitalisedIn(text: string): string[] {
  return (text.match(/\b[A-Z][a-zA-Z'’-]+/g) ?? []);
}

export interface RephraseCheck {
  ok: boolean;
  /** Why it was rejected, for the log. Empty when accepted. */
  reasons: string[];
}

/**
 * Whether a rewrite may be shown in place of the sentence it came from.
 *
 * Deliberately one-directional: the rewrite may drop things the original said,
 * because a shorter sentence is a stylistic choice. It may not add. Every
 * number and every name in the rewrite has to be traceable to the original,
 * which is what makes "the numbers on this screen are checkable" survive
 * contact with a language model.
 */
export interface RephraseRules {
  /**
   * Words the rewrite is not allowed to lose.
   *
   * Numbers already survive by rule, because a figure is checkable and a
   * feeling is not. Some words are load-bearing in exactly the same way and
   * cannot be recognised from the sentence alone — the caller knows which.
   *
   * The case this exists for: the Life Reveal's whole promise is a plan with
   * a particular person in it, and the engine's last line is "And Amma is in
   * this plan by name." A model handed that wrote four fluent sentences with
   * no Amma in them. Nothing was invented, nothing was misread; the sentence
   * simply stopped being about anybody, which is the one thing it was for.
   */
  mustKeep?: Array<string | null | undefined>;
}

export function checkRephrase(
  original: string,
  rewritten: string,
  rules: RephraseRules = {},
): RephraseCheck {
  const reasons: string[] = [];
  const clean = (rewritten ?? '').trim();

  const lostWords = (rules.mustKeep ?? [])
    .map((w) => (w ?? '').trim())
    .filter((w) => w && !clean.toLowerCase().includes(w.toLowerCase()));
  if (lostWords.length) reasons.push(`dropped: ${lostWords.join(', ')}`);

  if (!clean) reasons.push('empty');
  /* A rewrite that has grown by half is not a rewrite. Generous, because
     "friends" becoming "the friends you named" is legitimate expansion. */
  if (clean.length > original.length * 1.6 + 40) reasons.push('much longer than the original');

  const had = new Set(numbersIn(original));
  const kept = new Set(numbersIn(clean));
  const added = [...kept].filter((n) => !had.has(n));
  if (added.length) reasons.push(`invented numbers: ${added.join(', ')}`);

  /**
   * And every number has to survive.
   *
   * Dropping one is safe — it invents nothing — which is why the first
   * version allowed it. Then the model turned "friends is 30 points behind
   * where you said it should be" into "your friendships have slipped", and
   * the sentence got warmer by giving up the only part a reader could go and
   * check. This app's whole claim is arithmetic somebody can verify on
   * another screen; a rewrite that launders it into a feeling is not an
   * improvement, however well it reads.
   */
  const lost = [...had].filter((n) => !kept.has(n));
  if (lost.length) reasons.push(`dropped numbers: ${lost.join(', ')}`);

  const knownNames = new Set(anyCapitalisedIn(original));
  const newNames = properNounsIn(clean).filter((n) => !knownNames.has(n));
  if (newNames.length) reasons.push(`invented names: ${newNames.join(', ')}`);

  /* Units are the specific failure this was built after: a percentage given
     "moments a week". If the original names no unit, the rewrite may not
     invent one. */
  const UNIT = /\b(hours?|minutes?|days?|weeks?|months?|years?|times?|moments?|sessions?)\b/gi;
  const hadUnits = new Set((original.match(UNIT) ?? []).map((u) => u.toLowerCase().replace(/s$/, '')));
  const newUnits = [...new Set((clean.match(UNIT) ?? []).map((u) => u.toLowerCase().replace(/s$/, '')))]
    .filter((u) => !hadUnits.has(u));
  if (newUnits.length) reasons.push(`invented units: ${newUnits.join(', ')}`);

  return { ok: reasons.length === 0, reasons };
}

/**
 * The rewrite if it survives the check, the original if it does not.
 *
 * The caller does not branch on this. A rejected rewrite is not an error
 * state to handle — it is the app declining to say something it cannot
 * stand behind, and the engine's sentence was always going to be good
 * enough on its own.
 */
export function safeRephrase(
  original: string,
  rewritten: string | null | undefined,
  rules: RephraseRules = {},
): {
  sentence: string; used: 'model' | 'engine'; reasons: string[];
} {
  if (!rewritten) return { sentence: original, used: 'engine', reasons: ['nothing returned'] };
  const check = checkRephrase(original, rewritten, rules);
  return check.ok
    ? { sentence: rewritten.trim(), used: 'model', reasons: [] }
    : { sentence: original, used: 'engine', reasons: check.reasons };
}
