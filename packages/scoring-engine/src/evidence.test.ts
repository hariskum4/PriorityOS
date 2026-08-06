/**
 * The evidence layer is load-bearing or it is decoration.
 *
 * Three contracts, each with a failure message that names the offender:
 *
 *   **Every entry has a receipt.** A rhythm, rung or lever added without an
 *   evidence record fails here before any user sees an unreceipted card.
 *   `folk` passes — the rule is honesty, not citations for everything.
 *
 *   **Every receipt points at something real.** Rungs are keyed by their
 *   exact titles, which the catalogs already promise to keep stable; a
 *   renamed rung orphans its receipt and this names it. This is the same
 *   promise domainLadder.ts makes in prose, turned into a test.
 *
 *   **Every grade follows the honesty rules.** A/B/C must say where the
 *   evidence lives; folk must say why it is kept anyway. An empty receipt
 *   is worse than none — it looks like diligence.
 */

import { describe, expect, it } from 'vitest';
import { rhythmDomains, rhythmsFor } from './rhythms';
import { domainLadder } from './domainLadder';
import { healthspan } from './lifeStrategy';
import { EVIDENCE, PROPOSED, evidenceForGenerated, catalogKeyFor, evidenceFor } from './evidence';

/** Every identity the catalogs currently ship. */
function catalogIdentities(): Set<string> {
  const ids = new Set<string>();
  for (const domain of rhythmDomains()) {
    for (const rhythm of rhythmsFor(domain)) ids.add(rhythm.key);
    for (const rung of domainLadder(domain)) ids.add(rung.title);
  }
  for (const lever of healthspan(35).levers) ids.add(`lever.${lever.key}`);
  return ids;
}

describe('evidence bank', () => {
  it('covers a catalog that actually exists', () => {
    // Guards the loops below against silently passing over nothing.
    expect(rhythmDomains().length).toBe(12);
    expect(healthspan(35).levers.length).toBeGreaterThanOrEqual(4);
  });

  it('has a receipt for every rhythm, rung and lever', () => {
    const missing = [...catalogIdentities()].filter((id) => !(id in EVIDENCE));
    expect(
      missing,
      `Catalog entries without evidence records (add them to evidence.ts, ` +
        `'folk' with a note is allowed): ${missing.join(' | ')}`,
    ).toEqual([]);
  });

  it('has no orphaned receipts', () => {
    const known = catalogIdentities();
    const orphans = Object.keys(EVIDENCE).filter((id) => !known.has(id));
    expect(
      orphans,
      `Evidence records that match no catalog entry — a typo here, or a ` +
        `renamed rung there. Deliberate forward-stubs belong in PROPOSED: ` +
        `${orphans.join(' | ')}`,
    ).toEqual([]);
  });

  it('keeps proposed stubs out of the live bank until their entries ship', () => {
    const known = catalogIdentities();
    const shippedEarly = Object.keys(PROPOSED).filter((id) => known.has(id));
    expect(
      shippedEarly,
      `These catalog entries now exist — move their records from PROPOSED ` +
        `into the live bank: ${shippedEarly.join(' | ')}`,
    ).toEqual([]);
  });

  it('follows the honesty rules: graded claims cite, folk explains', () => {
    const offenders: string[] = [];
    for (const [id, ev] of Object.entries({ ...EVIDENCE, ...PROPOSED })) {
      if (ev.grade === 'folk') {
        /* Folk has to say what it is. That used to live in `note`; it lives
           in the plain sentence now, which is the one a reader sees. */
        if (!ev.plain) offenders.push(`${id} (folk without an explanation)`);
      } else {
        if (!ev.source) offenders.push(`${id} (${ev.grade} without a source)`);
      }
    }
    expect(offenders, offenders.join(' | ')).toEqual([]);
  });

  /**
   * The panel shows `plain` and nothing else that states a finding. A record
   * without one is a card that opens "Why this works" and answers with a
   * grade label and a citation — which is what this whole field was added to
   * stop.
   */
  it('says what was found, in words, for every single entry', () => {
    const silent = Object.entries({ ...EVIDENCE, ...PROPOSED })
      .filter(([, ev]) => !ev.plain?.trim())
      .map(([id]) => id);
    expect(silent, `no plain sentence: ${silent.join(' | ')}`).toEqual([]);
  });
});

/**
 * The rule that stops the evidence layer being laundered: a model can phrase
 * a rhythm in somebody's own words, and phrasing is all it can do. It never
 * earns a grade by sounding like one.
 */
describe('what a generated entry may claim', () => {
  it('inherits the receipt of the thing it is a phrasing of', () => {
    expect(evidenceForGenerated('Yoga on Tuesdays and Fridays').grade).toBe('A');
    expect(evidenceForGenerated('Flossing before bed').source)
      .toBe(EVIDENCE['health.upkeep'].source);
  });

  it('takes an explicit catalog key over the phrasing', () => {
    expect(evidenceForGenerated('Something else entirely', 'health.strength').source)
      .toBe(EVIDENCE['health.strength'].source);
  });

  it('is folk when it resolves to nothing — a new idea nobody has measured', () => {
    const ev = evidenceForGenerated('Cycle the long way past the reservoir');
    expect(ev.grade).toBe('folk');
    /* And it says so out loud on the card, rather than showing a bare grade
       label to somebody who asked a real question. */
    expect(ev.plain).toMatch(/nobody has measured/i);
    expect(ev.source).toBeUndefined();
  });

  it('never invents a source for something ungraded', () => {
    for (const t of ['Repot the balcony plants', 'Sit with the cat', 'Sort the loft']) {
      expect(evidenceForGenerated(t).source, t).toBeUndefined();
    }
  });
});

/**
 * The identity behind the wording — the join key that makes it possible to
 * ask, in six months, which entries people actually keep.
 */
describe('which catalog entry a title is', () => {
  it('names a rhythm by its own title', () => {
    expect(catalogKeyFor('Move three times a week')).toBe('health.move');
    expect(catalogKeyFor('  yoga, twice a week  ')).toBe('health.yoga');
  });

  it('names a rung by its title, which is its identity', () => {
    expect(catalogKeyFor('Block two hours of focused work'))
      .toBe('Block two hours of focused work');
  });

  it('reads the phrasings people write for themselves', () => {
    expect(catalogKeyFor('Yoga')).toBe('health.yoga');
    expect(catalogKeyFor('Floss')).toBe('health.upkeep');
  });

  it('says null for something somebody invented, rather than guessing', () => {
    expect(catalogKeyFor('Cycle the long way past the reservoir')).toBeNull();
    expect(catalogKeyFor('   ')).toBeNull();
  });

  /* Every identity it can produce must be one the bank can cite, or the
     telemetry would count things the receipts cannot explain. */
  it('only ever produces identities the evidence bank knows', () => {
    for (const domain of rhythmDomains()) {
      for (const r of rhythmsFor(domain)) {
        expect(evidenceFor(catalogKeyFor(r.title)!), r.title).toBeTruthy();
      }
    }
  });
});

/**
 * The `note` field is read by a person, not by us.
 *
 * It is documented as "dose gaps, replication caveats, who the benefit
 * actually lands on", and most of the bank honours that. Some entries did
 * not, and nothing caught it because nothing was looking: a reader who
 * opened "Why this works" under *Move three times a week* was told
 *
 *   The catalog asks 3×40 = 120 min/wk; the cardio lever quotes 150.
 *   Reconcile the twins to one number.
 *
 * — an instruction to a developer, printed on a card about walking. Yoga's
 * note explained how the lookup resolves, and stretching's quoted a code
 * identifier in backticks. Found by opening the screen, which is not a
 * reliable way to find things.
 */
describe('every receipt is written for the person reading it', () => {
  /* Words that only mean something to somebody holding the source. `catalog`,
     `rung` and `lever` are this codebase's nouns, not anybody else's. */
  const OUR_VOCABULARY = /\b(catalog|rung|lever|blueprint|generator|telemetry|the bank|this receipt|identity)\b/i;
  /* Things said to a maintainer rather than to a reader. */
  const ADDRESSED_TO_US = /\b(reconcile|refactor|TODO|FIXME|we should|needs? fixing|should be read as)\b/i;

  const notes = Object.entries(EVIDENCE)
    .filter(([, e]) => e.note)
    .map(([key, e]) => [key, e.note as string] as const);

  it('has notes to check at all', () => {
    expect(notes.length).toBeGreaterThan(20);
  });

  it('never uses a word that only means something inside this repo', () => {
    for (const [key, note] of notes) {
      expect(OUR_VOCABULARY.test(note), `${key}: ${note}`).toBe(false);
    }
  });

  it('never addresses the maintainer instead of the reader', () => {
    for (const [key, note] of notes) {
      expect(ADDRESSED_TO_US.test(note), `${key}: ${note}`).toBe(false);
    }
  });

  it('never quotes a code identifier', () => {
    for (const [key, note] of notes) {
      expect(note.includes('`'), `${key}: ${note}`).toBe(false);
      expect(/\b[a-z]+[A-Z][a-zA-Z]*\b/.test(note), `${key} has camelCase: ${note}`).toBe(false);
    }
  });

  it('says nothing in the register this app does not use', () => {
    const FORBIDDEN = /\b(die|dying|death|deathbed|lifespan|too late|you failed|guilty|ashamed)\b/i;
    for (const [key, note] of notes) {
      expect(FORBIDDEN.test(note), `${key}: ${note}`).toBe(false);
    }
  });
});

/**
 * The sentence a reader actually gets.
 *
 * `note` has been checked for readability since the day somebody found a
 * developer instruction printed on a card about walking. `plain` is now the
 * more important of the two — it is the whole answer to "why does this work?"
 * — so it is held to the same rules and two of its own.
 *
 * One rule that deliberately does NOT carry over is the forbidden register.
 * Notes may not say "die", because the app's own voice does not. A good part
 * of this literature measures exactly that, and the two ways out of the word
 * are both worse: "lower all-cause mortality" is the jargon this field exists
 * to replace, and "more likely to still be alive" is not the same arithmetic
 * as a reduction in deaths. The panel is the one place in the app allowed to
 * be clinical, because the alternative is being unclear or being wrong.
 */
describe('the plain sentence is the one a reader can use', () => {
  const OUR_VOCABULARY = /\b(catalog|rung|lever|blueprint|generator|telemetry|the bank|this receipt|identity)\b/i;
  const ADDRESSED_TO_US = /\b(reconcile|refactor|TODO|FIXME|we should|needs? fixing|should be read as)\b/i;
  /**
   * The words that sent somebody to a search engine.
   *
   * Every one of these appeared on screen, unexplained, in the version this
   * replaced: *meta-analysis of trials, d ≈ 0.40, Harkin 2016*. They are all
   * still in the file — in `effect`, where a careful reader can check the
   * sentence against them. They are not allowed in the sentence.
   */
  const JARGON = /(\bd ≈|\bg ≈|δ|meta-analys|cohort|quasi-experiment|associational|cross-sectional|effect size|odds ratio|\bp <|confidence interval|systematic review|single-blind)/i;
  /* Case-sensitive, or the statistician's "OR" swallows every "or". */
  const ACRONYMS = /\b(OR|RCTs?|CBT-I|BA)\b/;

  const plains = Object.entries({ ...EVIDENCE, ...PROPOSED })
    .filter(([, e]) => e.plain)
    .map(([key, e]) => [key, e.plain as string] as const);

  it('has a sentence for every record in the bank', () => {
    expect(plains.length).toBe(Object.keys({ ...EVIDENCE, ...PROPOSED }).length);
  });

  it('never uses a word that only means something inside this repo', () => {
    for (const [key, p] of plains) {
      expect(OUR_VOCABULARY.test(p), `${key}: ${p}`).toBe(false);
    }
  });

  it('never addresses the maintainer instead of the reader', () => {
    for (const [key, p] of plains) {
      expect(ADDRESSED_TO_US.test(p), `${key}: ${p}`).toBe(false);
      expect(p.includes('`'), `${key}: ${p}`).toBe(false);
    }
  });

  it('never says the thing that sent somebody to a search engine', () => {
    for (const [key, p] of plains) {
      const hit = p.match(JARGON) ?? p.match(ACRONYMS);
      expect(hit?.[0], `${key} still says "${hit?.[0]}": ${p}`).toBeUndefined();
    }
  });

  /**
   * Translation may not quietly promote the finding.
   *
   * This is the rule the whole file was built to protect, now applied at the
   * point where it is easiest to lose: expressive writing is proven across
   * 146 experiments and does almost nothing, and a warm sentence saying
   * "writing helps" would be a lie told by omission. Wherever the precise
   * version calls the effect small, the readable version has to say so too.
   */
  /**
   * Folk says so in the sentence, not only in the label.
   *
   * The panel drops the "How well this is known" line for folk, because
   * printing "nobody has studied this" directly under "Nobody has studied
   * whether making the bed changes anything" is the app repeating itself to
   * fill a slot. That is only safe while every folk record admits what it is
   * in the sentence a reader actually gets — so this is the check the
   * suppression rests on.
   */
  it('lets a folk entry say out loud that it is folk', () => {
    const ADMITS = /\b(nobody has|(?:anybody|anyone) has studied|no studies|no solid evidence|no trials|not (?:been )?studied|barely been studied|found no benefit|are thin|only by watching|only observed|no direct outcome|no evidence)\b/i;
    const quiet = Object.entries({ ...EVIDENCE, ...PROPOSED })
      .filter(([, ev]) => ev.grade === 'folk' && !ADMITS.test(ev.plain ?? ''))
      .map(([id, ev]) => `${id}: ${ev.plain}`);
    expect(quiet, quiet.join('\n')).toEqual([]);
  });

  it('keeps a small finding small', () => {
    const SAYS_SMALL = /\b(small|tiny|modest|slight)\b/i;
    const STILL_SMALL = /\b(small|tiny|modest|slight(?:ly)?|a little|little|barely|not dramatic|only)\b/i;
    for (const [key, ev] of Object.entries(EVIDENCE)) {
      if (!ev.effect || !SAYS_SMALL.test(ev.effect)) continue;
      expect(STILL_SMALL.test(ev.plain ?? ''), `${key} lost its size: ${ev.plain}`).toBe(true);
    }
  });
});
