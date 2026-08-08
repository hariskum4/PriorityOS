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
import { Button } from './ui';
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
  /**
   * Every facet of one event, lead first.
   *
   * One hour with your daughter can be a mission finished, a moment kept and
   * an entry written — one thing that happened, recorded three ways. It used
   * to arrive as three separate acts and stack up as "done", "kept",
   * "wrote", all at the same hour. It is one line now, and it says all three,
   * because you did do all three.
   */
  kinds: string[];
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
/** Monday-first, the way a diary reads. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-first weekday index. */
function weekdayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/** "Tuesday, 14 July 2026" — a day someone lived, not a database key. */
function longDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * A month, as a calendar.
 *
 * Cells here are large enough to say more than one thing: the date, and up to
 * three dots for the parts of life that day belonged to. That is what makes
 * this a zoom level rather than a magnifying glass — the year can only ever
 * show a day its single dominant colour.
 */
function MonthGrid({ year, month, byDate, width, focus, picked, litColour, onPick }: {
  year: number; month: number; byDate: Map<string, TimelineDay>; width: number;
  focus: string | null; picked: TimelineDay | null;
  litColour: (d: TimelineDay) => string | null;
  onPick: (d: TimelineDay) => void;
}) {
  const GAP = 6;
  const cell = width > 0 ? Math.max(30, Math.min(64, (width - GAP * 6) / 7)) : 40;

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(year, month, 1));
    const lead = weekdayIndex(first);
    const daysIn = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const slots: Array<string | null> = [
      ...new Array(lead).fill(null),
      ...Array.from({ length: daysIn }, (_, i) =>
        `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
    ];
    while (slots.length % 7) slots.push(null);
    const out: Array<Array<string | null>> = [];
    for (let i = 0; i < slots.length; i += 7) out.push(slots.slice(i, i + 7));
    return out;
  }, [year, month]);

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: GAP, marginBottom: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[s.axis, { width: cell, textAlign: 'center' }]}>{w}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={{ width: cell, height: cell }} />;
            const day = byDate.get(date);
            const c = day ? litColour(day) : null;
            const isPicked = picked?.date === date;
            const dots = day
              ? (focus
                  ? (day.byDomain[focus] ? [focus] : [])
                  : Object.entries(day.byDomain).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k))
              : [];
            return (
              <Pressable
                key={di}
                onPress={() => day && onPick(day)}
                style={[
                  s.monthCell,
                  { width: cell, height: cell },
                  c ? { backgroundColor: alpha(c, 0.18), borderColor: alpha(c, 0.5) } : null,
                  isPicked && { borderColor: colors.text, borderWidth: 1.5 },
                ]}
              >
                <Text style={[s.monthDate, c ? { color: colors.text } : null]}>{Number(date.slice(8, 10))}</Text>
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 'auto' }}>
                  {dots.map((d) => (
                    <View key={d} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: domainColor(d) }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The whole year, in the contribution-graph orientation: a column per week, a
 * row per weekday. Down means weekday and across means time, so the weekly
 * pulse of a life is visible in the shape rather than only in the numbers.
 *
 * Cells are sized to whatever width we are given rather than fixed, so a year
 * never scrolls sideways inside a tab that scrolls down — the gesture conflict
 * that made this view unusable. It can afford to be small because it no longer
 * has to be tapped precisely: the month view exists for that, and this one is
 * for the shape.
 */
function YearHeat({ days, width, picked, litColour, onPick, onMonth }: {
  days: TimelineDay[]; width: number; picked: TimelineDay | null;
  litColour: (d: TimelineDay) => string | null;
  onPick: (d: TimelineDay) => void;
  onMonth: (m: number) => void;
}) {
  const GAP = 1.5;
  const AXIS = 12;

  const columns = useMemo(() => {
    const cols: Array<Array<TimelineDay | null>> = [];
    let current: Array<TimelineDay | null> = new Array(7).fill(null);
    let started = false;
    for (const day of days) {
      const wd = weekdayIndex(new Date(`${day.date}T00:00:00Z`));
      if (!started) started = true;
      else if (wd === 0) { cols.push(current); current = new Array(7).fill(null); }
      current[wd] = day;
    }
    if (started) cols.push(current);
    return cols;
  }, [days]);

  const cell = width > 0
    ? Math.max(3.5, Math.min(11, (width - AXIS - columns.length * GAP) / columns.length))
    : 6;

  /** Which column each month begins in, for the axis — and for jumping in. */
  const monthMarks = useMemo(() => {
    const marks: Array<{ month: number; col: number }> = [];
    columns.forEach((col, i) => {
      const first = col.find((d) => d !== null);
      if (!first) return;
      const m = Number(first.date.slice(5, 7)) - 1;
      if (!marks.length || marks[marks.length - 1].month !== m) marks.push({ month: m, col: i });
    });
    return marks;
  }, [columns]);

  return (
    <View>
      {/* Month labels are also the way in: tapping one opens that month. */}
      <View style={{ height: 14, marginLeft: AXIS }}>
        {monthMarks.map((mark) => (
          <Pressable
            key={mark.month}
            onPress={() => onMonth(mark.month)}
            hitSlop={6}
            style={{ position: 'absolute', left: mark.col * (cell + GAP), top: 0 }}
          >
            <Text style={s.axis}>{MONTHS[mark.month]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: AXIS }}>
          {['M', '', 'W', '', 'F', '', 'S'].map((w, i) => (
            <View key={i} style={{ height: cell + GAP, justifyContent: 'center' }}>
              <Text style={s.axis}>{w}</Text>
            </View>
          ))}
        </View>
        {columns.map((col, ci) => (
          <View key={ci}>
            {col.map((day, ri) => {
              if (!day) return <View key={ri} style={{ width: cell, height: cell, marginBottom: GAP, marginRight: GAP }} />;
              const c = litColour(day);
              const isPicked = picked?.date === day.date;
              return (
                <Pressable
                  key={ri}
                  onPress={() => onPick(day)}
                  hitSlop={3}
                  style={[
                    s.cell,
                    { width: cell, height: cell, marginBottom: GAP, marginRight: GAP },
                    // Rest days are the faintest possible mark — present, but
                    // never reading as an accusation.
                    c ? { backgroundColor: c, borderColor: c } : { borderColor: colors.lineSoft },
                    isPicked && s.cellPicked,
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export function YearGrid({
  year, data, years, onYear, onClose, offline, failed, onRetry,
}: {
  year: number;
  /**
   * Null while this year is still on its way.
   *
   * The shell owns the loading and error states rather than the tab, because
   * the tab could only express them by swapping this whole component out for a
   * different card — which unmounted it, and took the filter, the zoom and the
   * open day with it. Stepping from 2026 to 2025 would silently clear a filter
   * you set two taps ago. Now the year changes underneath a header that stays
   * put, the way a calendar's does.
   */
  data: TimelineYearData | null;
  /** Years that hold something, ascending — the ones worth stepping to. */
  years: number[];
  onYear: (y: number) => void;
  onClose?: () => void;
  offline?: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  /**
   * Two zooms, because they answer different questions.
   *
   * A year is for shape — *where did my life actually go* — and needs the whole
   * 365 in one picture, which is exactly what makes a single lit week in April
   * legible as mostly-nothing. A month is for detail, and a month rendered in
   * the year's own orientation is a five-column sliver: awkward, and no more
   * informative than the year already was.
   *
   * Transposed, a month is simply a calendar — the shape everyone can already
   * read — and its cells are large enough to carry a date and more than one
   * colour, which is what earns the extra level rather than just magnifying it.
   *
   * The year keeps the contribution-graph orientation, where both axes mean
   * something: down is weekday, across is time. An earlier attempt rotated the
   * year to months-as-rows and lost that — every position still had a coordinate
   * but no vertical or diagonal pattern meant anything, so it read as a lookup
   * table rather than a picture of a life.
   */
  const isThisYear = year === new Date().getUTCFullYear();
  /**
   * The year opens first, always.
   *
   * You arrive here by tapping a year in the life grid, so a year is what you
   * asked for — and the shape of a whole one is the thing this view can say
   * that nothing else in the app can. Opening on a month answers a question
   * nobody asked yet and hides the only picture that shows how much of a year
   * was rest.
   *
   * The month is where you go once the year has told you where to look.
   */
  const [mode, setMode] = useState<'month' | 'year'>('year');
  // Which month a zoom-in lands on before one is chosen. Only reached by
  // tapping a month label, which sets it explicitly — this is the fallback.
  const [month, setMonth] = useState(isThisYear ? new Date().getUTCMonth() : 0);

  /**
   * The open day, held as a date rather than as the day itself.
   *
   * It used to hold the whole `TimelineDay`, which made it a photograph: the
   * moment you completed a mission the year above updated — 141 things became
   * 142 — while the open day underneath still read "35 things" and did not
   * list what you had just done. The record had it, the grid had it, and the
   * one panel actually being looked at was a snapshot taken on tap.
   *
   * A date is a reference. Everything about the day is looked up from whatever
   * data is current, so a refetch reaches the open panel too.
   */
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  /**
   * One domain, isolated — and isolated at every zoom.
   *
   * The filter survives moving between the year and a month, because it is one
   * question ("show me family") that both views are capable of answering. The
   * cost is that you can land in a month showing three lit days and read it as
   * an empty month, so a filtered view always says so in words.
   */
  const [focus, setFocus] = useState<string | null>(null);

  /**
   * Whether this year has been coming for long enough to say so.
   *
   * Loading here is deliberately silent, and that is right for the two
   * hundred milliseconds it usually takes — a spinner in a box about to
   * fill with days is one more thing moving on a screen about a settled
   * past. It stops being right at thirty seconds. A server that has been
   * idle takes that long to wake, and for the whole of it this card sits
   * on "Reading that year…" and an empty rectangle, which is indistinguishable
   * from broken. Silence is a claim that nothing is wrong; past a few
   * seconds it stops being a claim anyone believes.
   *
   * The threshold is the point where a person starts wondering rather than
   * waiting. Below it, saying anything would be noise about a request that
   * is about to land.
   */
  const SLOW_AFTER_MS = 8_000;
  const [slow, setSlow] = useState(false);
  const waiting = !data && !offline && !failed;
  React.useEffect(() => {
    if (!waiting) {
      /* Reset on arrival AND on the step to another year, so a slow 2009
         cannot make an instant 2010 apologise for itself. */
      setSlow(false);
      return;
    }
    setSlow(false);
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [waiting, year]);

  const [gridWidth, setGridWidth] = useState(0);

  /**
   * A picked day belongs to a year. When the year changes underneath it — the
   * point of the arrows — it is gone, and it has to go during this render:
   * clearing it in an effect would paint one frame of a January 2026 day
   * sitting under the heading "2025".
   *
   * `focus` and the zoom deliberately survive. "Show me family" is a question
   * about a life, not about a year, and carrying it across is the reason this
   * component stays mounted at all.
   */
  const [shownYear, setShownYear] = useState(year);
  if (shownYear !== year) {
    setShownYear(year);
    setPickedDate(null);
  }

  const days = data?.days ?? [];

  /** Every day of the year, by date, for direct lookup. */
  const byDate = useMemo(() => {
    const m = new Map<string, TimelineDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  /** The open day as it stands now, not as it stood when it was tapped. */
  const picked: TimelineDay | null = pickedDate ? byDate.get(pickedDate) ?? null : null;
  const setPicked = (d: TimelineDay | null) => setPickedDate(d?.date ?? null);

  /**
   * The neighbouring year that holds something, in a direction.
   *
   * Years are stepped the way days are: to the next one that holds something,
   * not to the next one on the calendar. Someone who started this year and
   * kept two memories from childhood has three years on record and thirty
   * empty ones between them; arrows that walked every year in between would be
   * a scroll bar through nothing.
   */
  const yearAt = (delta: number): number | null => {
    const i = years.indexOf(year);
    if (i >= 0) return years[i + delta] ?? null;
    // An empty year, opened straight from the life grid. Step out of it to the
    // nearest year on either side that has anything to show.
    return delta > 0
      ? years.find((y) => y > year) ?? null
      : [...years].reverse().find((y) => y < year) ?? null;
  };

  /**
   * The days worth stepping through, in order — filtered, and across the whole
   * year rather than the visible month: the next thing that happened does not
   * stop at a month boundary, so neither do the arrows. Landing on a day
   * outside the open month brings the month with it.
   */
  const walk = useMemo(
    () => days.filter((d) => (focus ? (d.byDomain[focus] ?? 0) > 0 : d.total > 0)),
    [days, focus],
  );
  const walkIndex = picked ? walk.findIndex((d) => d.date === picked.date) : -1;

  const pick = (day: TimelineDay | null) => {
    setPicked(day);
    if (day) setMonth(Number(day.date.slice(5, 7)) - 1);
  };

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
    if (next) pick(next);
  };
  const canBack = !!target(-1);
  const canFwd = !!target(1);

  /**
   * The header's arrows step whatever the heading names — months when a month
   * is open, years when the year is. One control per state, the way a calendar
   * works: a second pair that always stepped years would put four arrows in a
   * header, two of them doing nothing you can see.
   *
   * Stepping off the end of December is what a year boundary is for, so it
   * carries into January of the next year on record rather than stopping.
   */
  const headBack = mode === 'month' ? month > 0 || yearAt(-1) != null : yearAt(-1) != null;
  const headFwd = mode === 'month' ? month < 11 || yearAt(1) != null : yearAt(1) != null;
  const headStep = (delta: number) => {
    if (mode === 'year') {
      const y = yearAt(delta);
      if (y != null) onYear(y);
      return;
    }
    const next = month + delta;
    if (next >= 0 && next <= 11) { setMonth(next); return; }
    const y = yearAt(delta);
    if (y == null) return;
    setMonth(next < 0 ? 11 : 0);
    onYear(y);
  };

  /**
   * The year's domains, plus whichever one is filtered.
   *
   * A filter carried in from another year can find nothing here. It stays in
   * the row at zero, because a control that disappears while its own state is
   * still switched on leaves no way back to everything.
   */
  const present = useMemo(() => {
    const list = Object.entries(data?.byDomain ?? {}).sort((a, b) => b[1] - a[1]);
    if (focus && !list.some(([d]) => d === focus)) list.push([focus, 0]);
    return list;
  }, [data?.byDomain, focus]);

  /** Days in the open month holding the focused domain — what is on screen. */
  const monthFocusDays = useMemo(() => {
    if (!focus) return 0;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    return days.filter((d) => d.date.startsWith(prefix) && (d.byDomain[focus] ?? 0) > 0).length;
  }, [days, year, month, focus]);

  /** Everything recorded on the open day, and the part of it in focus. */
  const daySample = (picked && data?.sample[picked.date]) || [];
  const dayActs = focus ? daySample.filter((a) => a.domain === focus) : daySample;
  const focusTotal = (focus && picked && (picked.byDomain[focus] ?? 0)) || 0;

  /** Whether a day lights, and in which colour — the one rule both views share. */
  const litColour = (day: TimelineDay): string | null => {
    if (focus) return (day.byDomain[focus] ?? 0) > 0 ? domainColor(focus) : null;
    return day.total > 0 && day.dominant ? domainColor(day.dominant) : null;
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          {/* The title is the zoom control, the way a calendar's is — no
              segmented control, no extra chrome to hold a state the heading
              can hold by itself. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {mode === 'month' ? (
              /* Set smaller than the year. "September 2026" beside two arrows
                 and Close does not fit a 375pt phone at the year's size, and
                 the fix is not to truncate it — a heading that reads
                 "September…" has lost the only word the arrows can change. It
                 is also the right hierarchy: the year is the headline, the
                 month is where you are inside it. */
              <Pressable onPress={() => setMode('year')} hitSlop={8} style={{ flexShrink: 1 }}>
                <Text style={[s.year, s.monthTitle]} numberOfLines={1}>{MONTHS_LONG[month]} {year}</Text>
              </Pressable>
            ) : (
              <Text style={s.year}>{year}</Text>
            )}
            <Pressable
              onPress={() => headStep(-1)}
              disabled={!headBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={mode === 'month' ? 'Previous month' : 'Previous year'}
              style={({ pressed }) => [s.stepper, !headBack && { opacity: 0.25 }, pressed && { opacity: 0.5 }]}
            >
              <Text style={s.stepperGlyph}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => headStep(1)}
              disabled={!headFwd}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={mode === 'month' ? 'Next month' : 'Next year'}
              style={({ pressed }) => [s.stepper, !headFwd && { opacity: 0.25 }, pressed && { opacity: 0.5 }]}
            >
              <Text style={s.stepperGlyph}>›</Text>
            </Pressable>
          </View>

          {/* A filtered month can show three lit days and read as an empty
              month. Scoping the sentence to what is actually on screen is the
              whole cost of letting the filter survive the zoom, so it is paid
              here rather than left for the person to work out. */}
          {!data ? (
            /* Only while it is genuinely still coming. A year that has failed
               says so once, in the body — a subheading reading "Reading that
               year…" above "That year would not load" is the app arguing with
               itself. */
            offline || failed ? null : (
              <Text style={type.faint}>
                {slow ? 'Still waiting on the server…' : 'Reading that year…'}
              </Text>
            )
          ) : focus ? (
            <Text style={type.faint}>
              {mode === 'month'
                ? `${monthFocusDays} ${focus} day${monthFocusDays === 1 ? '' : 's'} in ${MONTHS_LONG[month]} · ${data.byDomain[focus] ?? 0} this year`
                : `${data.byDomain[focus] ?? 0} for ${focus} · ${walk.length} day${walk.length === 1 ? '' : 's'} of ${data.activeDays}`}
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

      {/**
        * Waiting, and failing, are states of this view — not replacements for
        * it. Loading is deliberately silent: the heading above already says
        * "Reading that year…", and a spinner in a box that is about to be full
        * of days is one more thing moving on a screen about a settled past.
        *
        * Silent, but not indefinitely. Past `SLOW_AFTER_MS` the empty box
        * says what is actually happening, because by then the reader has
        * stopped waiting and started wondering whether it is broken.
        */}
      {!data ? (
        <View style={{ marginTop: space(4), gap: space(3) }}>
          {offline || failed ? (
            <>
              <Text style={type.body}>
                {offline
                  ? 'This year lives on the server, and you are offline right now. It will open the moment you are back.'
                  : 'That year would not load. Nothing is lost — the days are still recorded.'}
              </Text>
              {onRetry ? <Button title="Try again" small kind="ghost" onPress={onRetry} /> : null}
            </>
          ) : slow ? (
            /* The honest version of a long wait: what is happening, that it
               is still happening, and that nothing has been lost. No spinner
               — a moving thing would only make the wait louder, not shorter.
               "Try again" is offered because a request this old is sometimes
               genuinely stuck, and a second tap costs nothing. */
            <View style={{ height: 84, gap: space(3) }}>
              <Text style={type.faint}>
                The server takes a moment to wake if it has been idle. Nothing is
                lost — the days are recorded, and this will fill in as soon as it
                answers.
              </Text>
              {onRetry ? <Button title="Try again" small kind="ghost" onPress={onRetry} /> : null}
            </View>
          ) : (
            <View style={{ height: 84 }} />
          )}
        </View>
      ) : (
        <>
      <View style={{ marginTop: space(3) }} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {mode === 'month' ? (
          <MonthGrid
            year={year}
            month={month}
            byDate={byDate}
            width={gridWidth}
            focus={focus}
            picked={picked}
            litColour={litColour}
            onPick={pick}
          />
        ) : (
          <YearHeat
            days={data.days}
            width={gridWidth}
            picked={picked}
            litColour={litColour}
            onPick={(d) => { pick(d); }}
            onMonth={(m) => { setMonth(m); setMode('month'); }}
          />
        )}
      </View>

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
                    <Text style={s.actKind}>
                      {act.kinds.map((k) => KIND_LABEL[k] ?? k).join(' · ')}
                    </Text>
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
                    + {picked.total - daySample.length} earlier that day
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
        </>
      )}
    </View>
  );
}

const GAP = 1.5;
/** Width of the month gutter. */
const LABEL_W = 26;

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
  monthTitle: { fontSize: 21, letterSpacing: -0.2 },
  close: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 999,
    paddingVertical: 5, paddingHorizontal: 12,
  },
  axis: {
    fontFamily: type.label.fontFamily, fontSize: 8,
    color: colors.textFaint, letterSpacing: 0.5,
  },
  cell: {
    marginBottom: GAP, borderRadius: 2, borderWidth: 1, backgroundColor: 'transparent',
  },
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

  /* A month's cell carries a date and up to three domains, which is what
     earns the zoom rather than merely magnifying the year's single hue. */
  monthCell: {
    borderRadius: 9, borderWidth: 1, borderColor: colors.lineSoft,
    padding: 5, backgroundColor: 'transparent',
  },
  monthDate: {
    fontFamily: type.label.fontFamily, fontSize: 11, color: colors.textFaint,
    fontVariant: type.stat.fontVariant,
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
