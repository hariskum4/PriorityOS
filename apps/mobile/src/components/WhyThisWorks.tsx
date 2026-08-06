import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { evidenceFor, GRADE_LABELS, type Evidence } from '@priority/scoring-engine';
import { colors, type, space } from '@/theme';

/**
 * The footnote — what anybody has actually measured about this.
 *
 * Every card in this app carries a `because`, which is the stake: why this
 * belongs to this part of a life, in that part's own words. It persuades, and
 * it is supposed to. This is the other half, in a different register
 * entirely: whether anyone has ever gone and looked.
 *
 * Collapsed by default and quiet when open, because a reader deciding whether
 * to walk on Tuesday does not need a citation and should not be made to read
 * one. The `because` stays the headline. This is for the reader who wants to
 * know whether the app is repeating something it read on the internet — and
 * the answer to that question is worth being able to give.
 *
 * Three rules the copy here follows, inherited from the bank it reads:
 *
 *   **Grade is not magnitude.** Expressive writing is Grade A and tiny. The
 *   finding says the size, the grade says how well it is known, and the label
 *   never lets one impersonate the other.
 *
 *   **Folk is a real answer, shown as proudly as A.** "Make the bed" has no
 *   outcome literature and is kept anyway. Saying so is precisely what makes
 *   "strength training, tested many times over" believable — a product that
 *   graded everything highly would be grading nothing.
 *
 *   **A measured finding with a source is a fact, not a claim.** Nothing here
 *   promises the reader an outcome, and the note is where the caveats live
 *   rather than being quietly dropped for a cleaner line.
 *
 * What this panel used to print was the bank's `effect` string, unmodified.
 * On the weekly money review that was three lines: *meta-analysis of trials ·
 * d ≈ 0.40 · Harkin 2016, Psychol Bull*. Every word true, and no reader
 * without a statistics course could do anything with it — which made the
 * panel worse than absent, because it took a question somebody asked in good
 * faith and answered it in a language they were not offered. The evidence
 * bank now carries a plain sentence for every record, and that is what gets
 * shown; `effect` stays in the file as the version the sentence is answerable
 * to. Nothing was softened to make this readable. The size still has to
 * survive the translation, which is what the bank's own tests enforce.
 */
export function WhyThisWorks({ idOrTitle, evidence }: {
  /** A rhythm key, an exact rung title, or `lever.<key>`. */
  idOrTitle?: string;
  /** Or the record itself, for a generated entry that carries its own. */
  evidence?: Evidence | null;
}) {
  const [open, setOpen] = React.useState(false);
  const ev = evidence ?? (idOrTitle ? evidenceFor(idOrTitle) : null);

  /* Null is a bug in the bank, not a state to design for — the test suite
     enforces completeness. Silence is still the right behaviour if it ever
     happens: never invent a receipt. */
  if (!ev) return null;

  return (
    <View style={{ gap: space(1) }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open
          ? 'Hide what is known about this'
          : `Why this works — ${GRADE_LABELS[ev.grade]}`}
      >
        <Text style={[type.faint, { color: colors.textDim }]}>
          {open ? 'Why this works —' : 'Why this works'}
          {open ? '' : ` · ${GRADE_LABELS[ev.grade]}`}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: space(1), paddingLeft: space(2) }}>
          {/* The finding first, and in ordinary words — what somebody
              measured, on whom, and how much it moved. Everything below it is
              context for this sentence. */}
          {ev.plain ? (
            <Text style={[type.faint, { color: colors.text }]}>{ev.plain}</Text>
          ) : null}
          {/* Then how well it is known, which is a different question from
              how much it helps and is labelled so it cannot be read as the
              same one. */}
          <Text style={type.faint}>How well this is known: {GRADE_LABELS[ev.grade]}</Text>
          {/* The caveat, kept rather than dropped for a tidier card. Dose
              gaps, replication trouble, and who the benefit actually lands
              on all live here. */}
          {ev.note ? <Text style={type.faint}>{ev.note}</Text> : null}
          {/* Last and quietest: where to go and check. A name and a year is
              enough to find the paper and not enough to clutter the card. */}
          {ev.source ? <Text style={type.faint}>{ev.source}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
