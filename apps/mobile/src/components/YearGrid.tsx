/**
 * One year, as days.
 *
 * The second zoom level of the Time tab: the life grid shows a square per year,
 * this shows a square per day. Laid out the way a calendar heatmap is — a column
 * per week, a row per weekday — because that shape makes a year legible at a
 * glance and people already know how to read it.
 *
 * What it does **not** borrow is the meaning. A contributions graph encodes
 * volume: darker is more, empty is failure, and the whole device exists to make
 * you protect a streak. This product forbids that ("do not create streak
 * addiction", "missing one day should never feel like failure"). So here a day
 * is coloured by **which part of life it belonged to**, never by how much was
 * done — one call to your mother is not a lesser day than five admin tasks.
 *
 * Read across a year the grid answers "where did my life actually go", and a
 * year that is nearly all one colour is the most useful thing it can say. Days
 * with nothing are drawn as the faintest possible hairline and counted as rest,
 * not as gaps.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, type, space, domainColor, alpha } from '../theme';

export interface TimelineDay {
  date: string;
  total: number;
  dominant: string | null;
  byDomain: Record<string, number>;
  kinds: Record<string, number>;
}

export interface TimelineAct {
  label: string;
  domain: string | null;
  kind: string;
}

export interface TimelineYearData {
  year: number;
  days: TimelineDay[];
  activeDays: number;
  restDays: number;
  events: number;
  byDomain: Record<string, number>;
  sample: Record<string, TimelineAct[]>;
}

/** What each kind of act is called, in the person's language rather than ours. */
const KIND_LABEL: Record<string, string> = {
  mission: 'done', contact: 'reached out', memory: 'kept',
  habit: 'habit', reflection: 'wrote',
};

const WEEKDAYS = ['M', '', 'W', '', 'F', '', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tuesday, 14 July 2026" — a day someone lived, not a database key. */
function longDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** Monday-first weekday index, so weeks read the way a diary does. */
function weekdayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

export function YearGrid({ data, onClose }: { data: TimelineYearData; onClose?: () => void }) {
  const [picked, setPicked] = useState<TimelineDay | null>(null);
  /**
   * One domain, isolated.
   *
   * Tapping `impact 7` in the legend lights only the days that held something
   * for impact and lets the rest fall back to the rest-day hairline. It turns
   * the grid from a picture into a question — *show me every day I gave
   * something* — which is the one query a year of your own life is worth
   * running. Tap it again to get the whole year back.
   */
  const [focus, setFocus] = useState<string | null>(null);

  /**
   * The days worth stepping through, in order.
   *
   * Arrows walk *this* list rather than the calendar, because stepping one
   * calendar day at a time through a life means landing on rest days over and
   * over to find the next thing that happened. With a domain in focus it walks
   * only that domain's days, so the arrows become "the next time I did this".
   */
  const walk = useMemo(
    () => data.days.filter((d) => (focus ? (d.byDomain[focus] ?? 0) > 0 : d.total > 0)),
    [data.days, focus],
  );
  const walkIndex = picked ? walk.findIndex((d) => d.date === picked.date) : -1;

  /**
   * The day the arrow would land on, or null when there is none that way.
   *
   * A picked day is often *outside* the walk — focus impact while sitting on a
   * day that held none, and it belongs to no position in the list. Stepping
   * from there has an obvious meaning ("the next day with impact after this
   * one") and an easy wrong answer: treating it as no position at all, which
   * greys out both arrows and strands the person on a day the filter has
   * already excluded.
   */
  const target = (delta: number): TimelineDay | null => {
    if (!walk.length) return null;
    if (!picked) return delta > 0 ? walk[0] : walk[walk.length - 1];
    if (walkIndex >= 0) return walk[walkIndex + delta] ?? null;
    return delta > 0
      ? walk.find((d) => d.date > picked.date) ?? null
      : [...walk].reverse().find((d) => d.date < picked.date) ?? null;
  };
  const step = (delta: number) => {
    const next = target(delta);
    if (next) setPicked(next);
  };
  const canBack = !!target(-1);
  const canFwd = !!target(1);

  /** Days arranged into week columns, aligned so row 0 is always Monday. */
  const columns = useMemo(() => {
    const cols: Array<Array<TimelineDay | null>> = [];
    let current: Array<TimelineDay | null> = new Array(7).fill(null);
    let started = false;

    for (const day of data.days) {
      const wd = weekdayIndex(new Date(`${day.date}T00:00:00Z`));
      // The first week of the year is usually partial; leading slots stay null.
      if (!started) {
        started = true;
      } else if (wd === 0) {
        cols.push(current);
        current = new Array(7).fill(null);
      }
      current[wd] = day;
    }
    if (started) cols.push(current);
    return cols;
  }, [data.days]);

  /** Which column each month begins in, for the axis labels. */
  const monthMarks = useMemo(() => {
    const marks: Array<{ month: number; col: number }> = [];
    columns.forEach((col, i) => {
      const first = col.find((d) => d !== null);
      if (!first) return;
      const month = Number(first.date.slice(5, 7)) - 1;
      if (!marks.length || marks[marks.length - 1].month !== month) {
        marks.push({ month, col: i });
      }
    });
    return marks;
  }, [columns]);

  const present = Object.entries(data.byDomain)
    .sort((a, b) => b[1] - a[1]);

  /** Everything recorded on the open day, and the part of it in focus. */
  const daySample = (picked && data.sample[picked.date]) || [];
  const dayActs = focus ? daySample.filter((a) => a.domain === focus) : daySample;
  /** The day's true count for the focused domain — exact, unlike the sample. */
  const focusTotal = (focus && picked && (picked.byDomain[focus] ?? 0)) || 0;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.year}>{data.year}</Text>
          {/* Framed as rest, deliberately. These are not missing days. */}
          {/* States a fact. It used to end "— tap it again for the whole
              year", which is the header explaining a control that is now
              visible two lines below it; `Everything` says that better than a
              sentence can, and colouring this line in the domain's hue made
              it compete with the pill that is already showing the same state. */}
          {focus ? (
            <Text style={type.faint}>
              {data.byDomain[focus] ?? 0} for {focus} · {walk.length}
              {' '}day{walk.length === 1 ? '' : 's'} of {data.activeDays}
            </Text>
          ) : (
            /* Framed as rest, deliberately. These are not missing days. */
            <Text style={type.faint}>
              {data.events} thing{data.events === 1 ? '' : 's'} recorded across{' '}
              {data.activeDays} day{data.activeDays === 1 ? '' : 's'} · {data.restDays} at rest
            </Text>
          )}
        </View>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10} style={s.close}>
            <Text style={[type.label, { color: colors.textDim }]}>Close</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space(3) }}>
        <View>
          {/* Month axis. One full-width row with the labels placed at absolute
              offsets — a per-column container is only 11px wide, which either
              wraps "Jan" or ellipsizes it however you style the Text. */}
          <View
            style={{
              height: 14,
              marginLeft: 14,
              width: columns.length * (CELL + GAP),
            }}
          >
            {monthMarks.map((mark) => (
              <Text
                key={mark.month}
                style={[s.axis, { position: 'absolute', left: mark.col * (CELL + GAP), top: 0 }]}
              >
                {MONTHS[mark.month]}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row' }}>
            {/* weekday axis */}
            <View style={{ width: 14 }}>
              {WEEKDAYS.map((w, i) => (
                <View key={i} style={{ height: CELL + GAP, justifyContent: 'center' }}>
                  <Text style={s.axis}>{w}</Text>
                </View>
              ))}
            </View>

            {columns.map((col, ci) => (
              <View key={ci}>
                {col.map((day, ri) => {
                  if (!day) return <View key={ri} style={s.cellSpacer} />;
                  /* With a domain in focus, a day lights only if it held that
                     domain — and in that domain's colour, not the day's own
                     dominant one, so the answer reads in a single hue. */
                  const lit = focus
                    ? (day.byDomain[focus] ?? 0) > 0
                    : day.total > 0 && !!day.dominant;
                  const c = lit ? domainColor(focus ?? (day.dominant as string)) : null;
                  const isPicked = picked?.date === day.date;
                  return (
                    <Pressable
                      key={ri}
                      onPress={() => setPicked(isPicked ? null : day)}
                      hitSlop={2}
                      style={[
                        s.cell,
                        // Rest days are the faintest possible mark — present, but
                        // never reading as an accusation.
                        lit
                          ? { backgroundColor: c as string, borderColor: c as string }
                          : { borderColor: colors.lineSoft },
                        isPicked && s.cellPicked,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── the filter ─────────────────────────────────────────────
          One control, one place.

          This was two: a row of the day's domains and a row of the year's,
          identical in shape, in different styles, setting the same state —
          the same button twice on one screen. With nineteen bordered pills
          fighting for attention, the day itself (two lines of what actually
          happened) was the quietest thing on a panel that exists to show it.

          So: one row, always here, scoped to the year. The day below states
          its own composition but does not offer a second way to change it. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: space(3) }}
        contentContainerStyle={s.filterRow}
      >
        <Pressable onPress={() => setFocus(null)} hitSlop={6}>
          <View style={[s.filterPill, !focus && s.filterPillOn]}>
            <Text style={[s.filterText, !focus && { color: colors.text, fontWeight: '600' }]}>
              Everything
            </Text>
            <Text style={s.filterCount}>{data.events}</Text>
          </View>
        </Pressable>
        {present.map(([domain, count]) => {
          const on = focus === domain;
          const c = domainColor(domain);
          return (
            <Pressable key={domain} onPress={() => setFocus(on ? null : domain)} hitSlop={6}>
              <View style={[s.filterPill, on && { backgroundColor: alpha(c, 0.16) }]}>
                <View style={[s.dot, { backgroundColor: c, marginTop: 0 }]} />
                <Text style={[s.filterText, on && { color: colors.text, fontWeight: '600' }]}>
                  {domain}
                </Text>
                <Text style={[s.filterCount, on && { color: c }]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── one day ────────────────────────────────────────────────── */}
      {picked ? (
        <View style={s.detail}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.dayTitle}>{longDate(picked.date)}</Text>
              <Text style={type.faint}>
                {picked.total === 0
                  ? 'A day at rest'
                  : `${picked.total} thing${picked.total === 1 ? '' : 's'}`}
                {walkIndex >= 0 && walk.length > 1 ? ` · ${walkIndex + 1} of ${walk.length}` : ''}
              </Text>
            </View>
            {/* Step between days that hold something, not through a month of
                rest days looking for the next one. */}
            <Pressable
              onPress={() => step(-1)}
              disabled={!canBack}
              hitSlop={10}
              style={({ pressed }) => [s.stepper, !canBack && { opacity: 0.25 }, pressed && { opacity: 0.5 }]}
            >
              <Text style={s.stepperGlyph}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => step(1)}
              disabled={!canFwd}
              hitSlop={10}
              style={({ pressed }) => [s.stepper, !canFwd && { opacity: 0.25 }, pressed && { opacity: 0.5 }]}
            >
              <Text style={s.stepperGlyph}>›</Text>
            </Pressable>
          </View>

          {picked.total > 0 ? (
            <>
              {/* What the day was made of, as one bar.
                  Nine labelled pills to say "this day was mostly family" is
                  nine times the ink the answer needs. Proportion is a length;
                  the exact counts are in the row above for whichever domain
                  is actually being asked about. */}
              <View style={s.compBar}>
                {Object.entries(picked.byDomain)
                  .sort((a, b) => b[1] - a[1])
                  .map(([domain, count]) => (
                    /* The same state as the row above, reached the direct way.
                       Two *different* filters that look alike would be the
                       original mistake; one state with two ways in is how a
                       setting reachable from Control Centre and from Settings
                       works. The bar is what you are already looking at when
                       the question occurs to you.

                       hitSlop, not height: a five-pixel target is unusable, and
                       fattening the bar to reach 44pt would turn a hairline
                       reading into a chart. */
                    <Pressable
                      key={domain}
                      onPress={() => setFocus(focus === domain ? null : domain)}
                      hitSlop={{ top: 14, bottom: 14, left: 0, right: 0 }}
                      accessibilityRole="button"
                      accessibilityLabel={`${domain}, ${count} on this day`}
                      style={({ pressed }) => ({
                        flex: count,
                        backgroundColor: domainColor(domain),
                        opacity: pressed ? 0.55 : (!focus || focus === domain ? 1 : 0.22),
                      })}
                    />
                  ))}
              </View>

              <View style={{ marginTop: space(3), gap: 9 }}>
                {dayActs.map((act, i) => (
                  <View key={i} style={s.actRow}>
                    {/* Each line in its own domain's colour, which is the whole
                        point of colouring them at all. */}
                    <View style={[s.dot, { backgroundColor: domainColor(act.domain ?? 'growth') }]} />
                    <Text style={s.actLabel}>{act.label}</Text>
                    <Text style={s.actKind}>{KIND_LABEL[act.kind] ?? act.kind}</Text>
                  </View>
                ))}

                {/* A list that silently shortens cannot be trusted, so the
                    count of what is hidden is always stated — but as a fact,
                    not an instruction. The way back is the row above. */}
                {/* What is not shown, counted honestly.
                    `byDomain` and `total` are exact; the listed sample is
                    capped to bound a year's payload. Measuring "hidden"
                    against the sample instead of the real totals would have
                    told someone their day held five family things when the
                    truth was eight — the two beyond the cap simply absent, and
                    the number confidently wrong. */}
                {focus ? (
                  <Text style={[type.faint, { marginTop: 2 }]}>
                    {focusTotal === 0
                      ? `Nothing for ${focus} this day`
                      : `${dayActs.length} of ${focusTotal} ${focus}`}
                    {focusTotal > 0 && picked.total > focusTotal
                      ? ` · ${picked.total - focusTotal} other`
                      : ''}
                  </Text>
                ) : picked.total > daySample.length ? (
                  <Text style={[type.faint, { marginTop: 2 }]}>
                    + {picked.total - daySample.length} more
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <Text style={[type.faint, { marginTop: space(3) }]}>
          Each square is a day, coloured by the part of life it belonged to — not by how
          much you did. Tap one to see what it was.
        </Text>
      )}

    </View>
  );
}

const CELL = 9;
const GAP = 2;

const s = StyleSheet.create({
  wrap: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 20,
    padding: space(4), backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  year: {
    fontFamily: type.stat.fontFamily, fontSize: 28, color: colors.text,
    letterSpacing: -0.4, fontVariant: type.stat.fontVariant,
  },
  close: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 999,
    paddingVertical: 5, paddingHorizontal: 12,
  },
  axis: {
    fontFamily: type.label.fontFamily, fontSize: 8,
    color: colors.textFaint, letterSpacing: 0.5,
  },
  cell: {
    width: CELL, height: CELL, marginBottom: GAP, marginRight: GAP,
    borderRadius: 2, borderWidth: 1, backgroundColor: 'transparent',
  },
  cellSpacer: { width: CELL, height: CELL, marginBottom: GAP, marginRight: GAP },
  cellPicked: {
    borderColor: colors.text, borderWidth: 1.5,
  },
  detail: {
    marginTop: space(3), borderTopWidth: 1, borderTopColor: colors.lineSoft,
    paddingTop: space(3),
  },
  /* One filter row. No borders — a border on every item is a page with no
     hierarchy at all; the selected one earns a fill and everything else is
     just a dot and a word. */
  filterRow: { flexDirection: 'row', gap: 4, paddingRight: space(4) },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11,
  },
  filterPillOn: { backgroundColor: colors.surfaceRaised },
  filterText: { fontSize: 13, color: colors.textDim },
  filterCount: {
    fontFamily: type.label.fontFamily, fontSize: 11, color: colors.textFaint,
    fontVariant: type.stat.fontVariant,
  },

  /* The day's composition, as a length rather than a row of labels. */
  compBar: {
    flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden',
    marginTop: space(3), gap: 1.5, backgroundColor: colors.lineSoft,
  },

  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  dayTitle: { fontSize: 16, color: colors.text, letterSpacing: -0.2, fontWeight: '600' },
  actRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  actLabel: { flex: 1, fontSize: 14.5, lineHeight: 20, color: colors.text },
  actKind: { fontSize: 11, color: colors.textFaint, marginTop: 3 },

  stepper: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  stepperGlyph: { fontSize: 17, color: colors.textDim, lineHeight: 20 },
});
