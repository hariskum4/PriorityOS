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

export interface TimelineYearData {
  year: number;
  days: TimelineDay[];
  activeDays: number;
  restDays: number;
  events: number;
  byDomain: Record<string, number>;
  sample: Record<string, string[]>;
}

const WEEKDAYS = ['M', '', 'W', '', 'F', '', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monday-first weekday index, so weeks read the way a diary does. */
function weekdayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

export function YearGrid({ data, onClose }: { data: TimelineYearData; onClose?: () => void }) {
  const [picked, setPicked] = useState<TimelineDay | null>(null);

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

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.year}>{data.year}</Text>
          {/* Framed as rest, deliberately. These are not missing days. */}
          <Text style={type.faint}>
            {data.events} thing{data.events === 1 ? '' : 's'} recorded across{' '}
            {data.activeDays} day{data.activeDays === 1 ? '' : 's'} · {data.restDays} at rest
          </Text>
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
                  const lit = day.total > 0 && day.dominant;
                  const c = lit ? domainColor(day.dominant as string) : null;
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

      {/* what a tapped day actually was */}
      {picked ? (
        <View style={s.detail}>
          <Text style={type.label}>{picked.date}</Text>
          {picked.total === 0 ? (
            <Text style={[type.serif, { marginTop: 6 }]}>A day at rest.</Text>
          ) : (
            <View style={{ marginTop: 6, gap: 5 }}>
              {(data.sample[picked.date] ?? []).map((line, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
                  <View style={[s.dot, {
                    backgroundColor: domainColor(picked.dominant ?? 'growth'),
                  }]} />
                  <Text style={[type.body, { flex: 1, fontSize: 14 }]}>{line}</Text>
                </View>
              ))}
              {picked.total > (data.sample[picked.date] ?? []).length ? (
                <Text style={type.faint}>
                  + {picked.total - (data.sample[picked.date] ?? []).length} more
                </Text>
              ) : null}
            </View>
          )}
        </View>
      ) : (
        <Text style={[type.faint, { marginTop: space(3) }]}>
          Each square is a day, coloured by the part of life it belonged to — not by how
          much you did. Tap one to see what it was.
        </Text>
      )}

      {/* legend — the year's actual composition */}
      {present.length ? (
        <View style={s.legend}>
          {present.map(([domain, count]) => (
            <View key={domain} style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: domainColor(domain) }]} />
              <Text style={type.faint}>{domain} {count}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    marginTop: space(3), paddingTop: space(3),
    borderTopWidth: 1, borderTopColor: colors.lineSoft,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
