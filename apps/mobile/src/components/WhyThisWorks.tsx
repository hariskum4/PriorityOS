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
 *   effect line says the size, the grade says the design, and the label never
 *   lets one impersonate the other.
 *
 *   **Folk is a real answer, shown as proudly as A.** "Make the bed" has no
 *   outcome literature and is kept anyway. Saying so is precisely what makes
 *   "strength training, meta-analysis of trials" believable — a product that
 *   graded everything highly would be grading nothing.
 *
 *   **An effect size with a source is a fact, not a claim.** Nothing here
 *   promises the reader an outcome, and the note is where the caveats live
 *   rather than being quietly dropped for a cleaner line.
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
        <View style={{ gap: 3, paddingLeft: space(2) }}>
          {/* The grade first, in words rather than a letter — "B" means
              nothing to a reader and "randomized trials" means exactly what
              it says. */}
          <Text style={type.faint}>{GRADE_LABELS[ev.grade]}</Text>
          {ev.effect ? <Text style={type.faint}>{ev.effect}</Text> : null}
          {ev.source ? <Text style={type.faint}>{ev.source}</Text> : null}
          {/* The caveat, kept rather than dropped for a tidier card. Dose
              gaps, replication trouble, and who the benefit actually lands
              on all live here. */}
          {ev.note ? <Text style={type.faint}>{ev.note}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
