import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl, StyleSheet,
  Animated, PanResponder, useWindowDimensions, type GestureResponderHandlers,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  lifeWindows,
  lifeInWeeks,
  countable,
  countKeyOf,
  dedupeRituals,
  matchRitual,
  suggestCountables,
  money as formatMoney,
  type ArchiveTheme,
  estimateTimeReality,
  screenTrade,
  estimateCostOfWaiting,
  estimateCreativeCompounding,
  suggestStacks,
  lifeShape,
  shortfallsCovered,
  domainShares,
  weeklyAllocation,
  healthspan,
  energyBudget,
  suggestSeason,
  classifyLever,
  rhythmFor,
  rhythmForHabit,
  rhythmByKey,
  rhythmWeekdays,
  passedSlot,
  type Weekday,
  rhythmDueToday,
  preferredMinutes,
  preferredTime,
  isPlaceable,
  isBoundary,
  weekPlan,
  foundTime,
  setting,
  SETTING_LABELS,
  type SettingKey,
  WEEK_COLUMNS,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  dayShape,
  activeHour,
  activeHourByKey,
  formatSpan,
  formatClock,
  type DayBlock,
  type DayType,
  PLANNING_HORIZON_AGE,
  lifeExpectancyForRegion,
  countryInSentence,
  type StackSuggestion,
  type LeverSignal,
} from '@priority/scoring-engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIFE_TO_DOMAIN, type LifeDomain } from '@priority/types';
import { api } from '@/services/api';
import { calendarSupported, readFreeGaps, type CalendarState } from '@/services/calendarFree';
import { invalidateLifeRecord } from '@/services/invalidate';
import { useRefresh } from '@/hooks/useRefresh';
import { useNow } from '@/hooks/useNow';
import { Button, Card, Chip, DomainDot, ErrorNote, HourField, Input, Label } from '@/components/ui';
import { YearGrid } from '@/components/YearGrid';
import { colors, type, space, domainColor, alpha, liningNums } from '@/theme';

/**
 * Time Reality — the user's own finite windows, computed live from their
 * onboarding facts. Everything is a planning lens: numbers move the
 * moment patterns move, and the whole tab respects insightIntensity=off.
 */

/**
 * How long a finished stack rests before it can be suggested again.
 *
 * Long enough that finishing something is not immediately answered by being
 * asked to do it again, short enough that a weekly-to-monthly rhythm comes back
 * while it is still the right suggestion. These are habits, not errands, so the
 * answer is a pause rather than retirement.
 */
const RESUGGEST_AFTER_DAYS = 14;

/** Days a desired contact cadence stands for. Mirrors the People tab's map. */
const CADENCE_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

/**
 * What kind of day today is.
 *
 * Local and dated rather than a column on the profile, because it is true for
 * one day and then it is not. Sending "I am travelling on the 3rd" to a server
 * that would still be holding it on the 9th is how a helpful tap becomes a
 * wrong assumption nobody remembers making — and there is nothing here worth
 * putting on a wire in the first place.
 */
const DAY_TYPE_KEY = 'priority-day-type-v1';
const NUDGE_KEY = 'priority-day-nudges-v1';
const MORE_YEARS_KEY = 'priority-more-years-v1';
const DURATION_KEY = 'priority-day-durations-v1';
/**
 * Which weekdays a rhythm was moved to.
 *
 * Unlike the nudges beside it, this is not keyed to a date: a person who
 * says their walk is Tuesday and Thursday means it every week, and having
 * that revert at midnight would be the app forgetting an answer it asked
 * for. Device-local for now, like the rest of this file's memory.
 */
const RHYTHM_DAYS_KEY = 'priority-rhythm-days-v1';
/**
 * The hour a rhythm was moved to, and kept.
 *
 * Moving anything else is a correction to today — the school run is at four
 * *this* Tuesday — and dies with the day. A rhythm is the one thing on the
 * card that recurs, so dragging one is not a note about today at all: it is
 * the reader answering the question the frequency never did. Storing it
 * beside the weekday choice is what makes the learning go both ways.
 */
const RHYTHM_HOURS_KEY = 'priority-rhythm-hours-v1';
/** Placement keys for standing commitments, so a move can be recognised. */
const RHYTHM_PREFIX = 'rhythm:';

/**
 * One step of "earlier" or "later".
 *
 * A quarter hour rather than a half, because this is the only stepper now and
 * it has to be able to land on the time somebody actually means. Coarse moves
 * are the drag's job.
 */
const TIME_STEP = 15;

/** How long a thing might take. A call is rarely the fifteen minutes it costs to start. */
const LENGTHS = [15, 30, 45, 60, 90, 120];

/**
 * Every hour there is.
 *
/**
 * "1 hour", "1½ hours", "45 min" — a length said the way it is spoken.
 *
 * The six lengths used to be laid out as six chips, which asked somebody to
 * read a menu to change one number. One number, stepped, needs to read as a
 * quantity rather than as an option code: "1.5h" is a spreadsheet cell, "1½
 * hours" is an hour and a half of a life.
 */
function formatLength(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = mins / 60;
  if (Number.isInteger(h)) return h === 1 ? '1 hour' : `${h} hours`;
  return h === 1.5 ? '1½ hours' : `${h} hours`;
}

/** The step this length sits on, or the nearest one when it sits between two. */
function lengthIndex(mins: number): number {
  const exact = LENGTHS.indexOf(mins);
  if (exact >= 0) return exact;
  return LENGTHS.reduce(
    (best, n, i) => (Math.abs(n - mins) < Math.abs(LENGTHS[best] - mins) ? i : best),
    0,
  );
}

/**
 * How far a finger has to travel to move something by an hour.
 *
 * Two minutes to the pixel: a quarter of an hour is about eight, which is
 * enough to feel deliberate and small enough that a whole evening is one
 * comfortable swipe. Dragging snaps to the quarter hour, because nobody means
 * 7:23.
 */
const MINUTES_PER_PX = 2;
const DRAG_SNAP = 15;

const DAY_TYPE_LABELS: Array<{ key: DayType; label: string }> = [
  { key: 'usual', label: 'usual' },
  { key: 'remote', label: 'from home' },
  { key: 'travel', label: 'travelling' },
  { key: 'off', label: 'day off' },
];

/** Local, not UTC — the day a person is living, not the one the server is in. */
function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const years = (Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000);
  return years > 5 && years < 110 ? Math.floor(years) : null;
}

/**
 * A foldable section of the tab.
 *
 * This screen holds a dozen lenses on the same finite life, and open all at
 * once it scrolls for minutes — which means the one thing that matters most,
 * the life grid, is followed by so much arithmetic that nobody reaches the end
 * of it. So everything below the grid folds, closed by default.
 *
 * The header keeps its number even when shut. A collapsed row that says only
 * "Health and energy" hides the answer; one that says "~41 able years" is still
 * doing the work, and opening it is for the reasoning behind the figure.
 */
/** The lived side of a ritual, as `/memories/counts-summary` reports it. */
interface CountsLived {
  count: number;
  firstAt: string;
  lastAt: string;
  /** Distinct names across the counted moments, most present first. */
  people: string[];
}
interface CandidateMemory { id: string; title: string; occurredAt: string }
/** A ritual someone chose to count, as stored in their onboarding answers. */
interface SavedCount { key: string; label: string; perYear: number; people?: string[] }

function Section({
  icon, title, preview, children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  preview?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: open ? space(3) : 0 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        // Eight of these rows are the whole Time tab, and as bare divs a
        // screen reader found none of them.
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [s.sectionHead, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name={icon} size={14} color={open ? colors.amber : colors.textDim} />
        <Label color={open ? colors.amber : undefined}>{title}</Label>
        <View style={{ flex: 1 }} />
        {!open && preview ? (
          <Text style={type.faint} numberOfLines={1}>{preview}</Text>
        ) : null}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textFaint}
        />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/**
 * A placed thing you can pick up and move.
 *
 * The chevrons work and are the wrong primary gesture for a time: nobody
 * thinks about their evening in units of "one tap earlier". Dragging is how
 * every calendar anybody already uses says the same thing, so the block moves
 * under the finger and shows the hour it will land on while it does.
 *
 * Deliberately not a proportional timeline. Laying the day out to scale is the
 * usual way to make a drag mean something, and it would render a fifteen-minute
 * call as an eight-pixel sliver with its reason unreadable — which is most of
 * what this card is for. So the layout stays a readable list, the gesture maps
 * travel to minutes at a fixed rate, and the live time is the feedback rather
 * than the position. Released, the whole day re-forms around the new hour.
 */
function DraggableBlock({
  block, offset, onMove, children,
}: {
  block: DayBlock;
  offset: number;
  onMove: (offsetMinutes: number) => void;
  children: (drag: {
    handlers: GestureResponderHandlers;
    dragging: boolean;
    preview: number | null;
  }) => React.ReactNode;
}) {
  const dy = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  /* Rebuilt only when the anchor moves. A PanResponder captured in a ref
     keeps the closure it was made with, so one built on the first render
     would go on reporting the first render's start time forever. */
  const pan = useMemo(
    () => PanResponder.create({
      /**
       * These go on a grip, not on the whole block, and that is the point.
       *
       * A block that is draggable everywhere is fighting two other gestures
       * for the same finger: the tap that opens its editor, and the scroll
       * that carries the page. Claiming the responder on touch broke
       * scrolling; claiming it on movement broke it differently; claiming it
       * on the capture phase lost to the Pressable that had already taken it.
       * All three are the same mistake — one surface asked to mean three
       * things.
       *
       * A grip means exactly one thing, so it can take the responder the
       * moment it is touched and never has to negotiate for it.
       */
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { setDragging(true); setPreview(block.startMinutes); },
      onPanResponderMove: (e, g) => {
        dy.setValue(g.dy);
        const step = Math.round((g.dy * MINUTES_PER_PX) / DRAG_SNAP) * DRAG_SNAP;
        setPreview(block.startMinutes + step);
      },
      onPanResponderRelease: (_e, g) => {
        const step = Math.round((g.dy * MINUTES_PER_PX) / DRAG_SNAP) * DRAG_SNAP;
        dy.setValue(0);
        setDragging(false);
        setPreview(null);
        if (step !== 0) onMove(offset + step);
      },
      onPanResponderTerminate: () => {
        dy.setValue(0); setDragging(false); setPreview(null);
      },
    }),
    [block.startMinutes, offset, onMove, dy],
  );

  return (
    <Animated.View
      style={[
        { transform: [{ translateY: dy }] },
        dragging && { opacity: 0.9, zIndex: 10 },
      ]}
    >
      {children({ handlers: pan.panHandlers, dragging, preview })}
    </Animated.View>
  );
}

/** How tall one allocation row runs — label, bar, and the gap beneath it. */
const RANK_ROW_H = 44;

/**
 * The ranking, as something you can move.
 *
 * The order given at onboarding drove every derived number on this tab and
 * could never be revised. That is fine on day one and wrong by month three:
 * the reader whose health is running at a hundred against a claim of seventy
 * had no way to tell the app it had the order wrong, and every reading
 * downstream went on inheriting a day-one answer.
 *
 * Its own component because the card renders below this screen's early
 * returns, and drag state living up there would be a hook count that changes
 * between the loading pass and the loaded one — the crash this file has now
 * produced twice.
 *
 * What moves is the RANK. There is no free-form weight to set: importance is
 * 60 points of inverted rank plus goals and flags, recomputed on every habit
 * tick, so a dragged-to weight would hold until the reader ticked anything
 * and then quietly revert. Dragging reorders, the bars reflow as it happens,
 * and what persists is the position.
 */
function RankableAllocation({
  allotments, onReorder, pending, children,
}: {
  allotments: Array<{ domainType: string }>;
  onReorder: (order: string[]) => void;
  pending: boolean;
  children: (row: {
    index: number;
    domainType: string;
    handlers: GestureResponderHandlers;
    dragging: boolean;
  }) => React.ReactNode;
}) {
  const [held, setHeld] = useState<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;

  const keys = allotments.map((a) => a.domainType);

  /* One responder per row, rebuilt when the order does — a responder kept in
     a ref would go on reporting the index it was born with. */
  const responderFor = (from: number) => PanResponder.create({
    /* On a grip, for the reason the day card's blocks use one: a row that is
       draggable everywhere fights the scroll carrying the page. A grip means
       exactly one thing and never has to negotiate for the finger. */
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => setHeld({ from, to: from }),
    onPanResponderMove: (_e, g) => {
      dy.setValue(g.dy);
      const to = Math.max(0, Math.min(
        keys.length - 1,
        from + Math.round(g.dy / RANK_ROW_H),
      ));
      setHeld((h) => (h && h.to === to ? h : { from, to }));
    },
    onPanResponderRelease: (_e, g) => {
      const to = Math.max(0, Math.min(
        keys.length - 1,
        from + Math.round(g.dy / RANK_ROW_H),
      ));
      dy.setValue(0);
      setHeld(null);
      if (to !== from) onReorder(moveItem(keys, from, to));
    },
    onPanResponderTerminate: () => { dy.setValue(0); setHeld(null); },
  });

  /**
   * Where a row sits while another is being carried past it.
   *
   * The dragged row follows the finger; everything between where it started
   * and where it would land steps one place out of the way, so the gap the
   * reader is aiming at is visible before they let go.
   */
  const shiftFor = (i: number): number => {
    if (!held || i === held.from) return 0;
    if (held.to > held.from && i > held.from && i <= held.to) return -RANK_ROW_H;
    if (held.to < held.from && i < held.from && i >= held.to) return RANK_ROW_H;
    return 0;
  };

  return (
    <View style={pending ? { opacity: 0.6 } : undefined}>
      {allotments.map((a, i) => {
        const isHeld = held?.from === i;
        return (
          <Animated.View
            key={a.domainType}
            style={[
              { transform: [{ translateY: isHeld ? dy : shiftFor(i) }] },
              isHeld && { zIndex: 10, opacity: 0.95 },
            ]}
          >
            {children({
              index: i,
              domainType: a.domainType,
              handlers: responderFor(i).panHandlers,
              dragging: !!isHeld,
            })}
          </Animated.View>
        );
      })}
    </View>
  );
}

/** A copy of the list with one item moved. */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

function Big({ value, unit, caption }: { value: string; unit: string; caption: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={[type.stat, { fontSize: 30, color: colors.amber }]}>{value}</Text>
      <Text style={[type.faint, { fontWeight: '600' }]}>{unit}</Text>
      <Text style={[type.faint, { textAlign: 'center', fontSize: 10 }]}>{caption}</Text>
    </View>
  );
}

/**
 * A number you can change without leaving the sentence it is in.
 *
 * Two arrows and the value between them, sized so the value is the thing you
 * read and the arrows are the thing you reach for — the opposite weighting to
 * a row of equal-sized chips, where the eye has to find the selected one before
 * it can find the meaning. The ends go quiet rather than disappearing, because
 * a control that changes shape at its limits moves the other one under the
 * finger that was aiming at it.
 */
function Stepper({ value, onLess, onMore, lessLabel, moreLabel, atLess, atMore }: {
  value: string;
  onLess: () => void;
  onMore: () => void;
  lessLabel: string;
  moreLabel: string;
  atLess?: boolean;
  atMore?: boolean;
}) {
  const arrow = (dir: 'back' | 'forward', onPress: () => void, label: string, spent?: boolean) => (
    <Pressable
      onPress={spent ? undefined : onPress}
      disabled={spent}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!spent }}
      style={({ pressed }) => [
        s.stepArrow,
        spent && { opacity: 0.25 },
        pressed && !spent && { backgroundColor: alpha(colors.amber, 0.16) },
      ]}
    >
      <Ionicons
        name={dir === 'back' ? 'chevron-back' : 'chevron-forward'}
        size={15}
        color={colors.amber}
      />
    </Pressable>
  );
  return (
    <View style={s.stepper}>
      {arrow('back', onLess, lessLabel, atLess)}
      <Text style={s.stepValue} numberOfLines={1}>{value}</Text>
      {arrow('forward', onMore, moreLabel, atMore)}
    </View>
  );
}

export default function TimeReality() {
  const qc = useQueryClient();
  const router = useRouter();
  /**
   * Whether the time and the length still fit on one line.
   *
   * The editor is written as a sentence — "7 am for 1 hour" — and the two
   * pills plus the connector need about 285px of card. A 320px phone has
   * roughly 245px inside the card, so the length wrapped onto its own row and
   * left "for" dangling at the end of the first one, pointing at nothing.
   * Below the threshold they stack on purpose and the connector is dropped;
   * a deliberate column reads as a choice, a wrapped row reads as a bug.
   */
  const { width: screenWidth } = useWindowDimensions();
  const tightEditor = screenWidth < 360;
  /**
   * Now, kept current. Every hour, weekday and "today" on this screen reads
   * from here rather than calling `new Date()` where it stands.
   *
   * This screen decides things from the clock — whether the seven o'clock
   * block is still ahead of you, which day the week strip lights, what day a
   * mission is being written for. A time read at render answers those with
   * whenever the screen last happened to repaint, which on a screen left open
   * is a number from hours ago. See `useNow` for the two bugs that made it.
   */
  const now = useNow();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('/me') });
  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api<any>('/me/preferences'),
  });
  const { data: insights } = useQuery({
    queryKey: ['insights'],
    queryFn: () => api<any[]>('/insights/opportunities'),
  });
  /**
   * Who is actually in this life.
   *
   * The suggestions used to say "calling a parent" and "a friend" while the
   * app knew their names, and had known which of them was overdue since the
   * People tab was built. Same query key the People tab uses, so this is
   * usually served from cache.
   */
  const { data: relationships } = useQuery({
    queryKey: ['relationships'],
    queryFn: () => api<any[]>('/relationships'),
  });
  /**
   * What is already planned — the same key and query the Missions tab uses.
   *
   * A suggestion you have already agreed to is not a suggestion. Without this
   * the card would keep offering the thing sitting on your list, which is how
   * a panel of advice turns into wallpaper.
   */
  const { data: pendingMissions } = useQuery({
    queryKey: ['missions'],
    queryFn: () => api<any[]>('/missions?status=pending'),
  });
  /**
   * And what was finished recently, which is not the same thing.
   *
   * A finished stack has to be able to come back — "train with Arjun once a
   * week" is a rhythm, not an errand, and a card that retires it forever after
   * one go is worse than one that repeats. But it must not come back the same
   * afternoon: caught in use, completing all of them put every one of them
   * straight back on the card, so the reward for doing the work was being
   * asked to do it again.
   */
  const { data: doneMissions } = useQuery({
    queryKey: ['missions', 'completed'],
    queryFn: () => api<any[]>('/missions?status=completed'),
  });
  /**
   * The server's version of Steal the time: the same ranking, worded for this
   * life. Kept fresh for a few minutes rather than per render — the wording is
   * cached server-side for the day anyway, and the ranking only moves when
   * something is planned or completed, both of which invalidate this key.
   */
  const { data: craftedStacks } = useQuery({
    queryKey: ['life-stacks'],
    queryFn: () => api<{
      stacks: StackSuggestion[];
      helps: string[];
      source: 'ai' | 'catalog';
    }>('/life-os/stacks'),
    staleTime: 5 * 60_000,
  });

  /**
   * What the whole system concluded today, not what this one card ranked.
   *
   * "Steal the time" is a good ranker of stackable moves and it is only that:
   * it sees shortfalls and people, and nothing of the eight engines that read
   * goals, decisions, closing windows and everything else. The day card was
   * placing `stacks[0]` — the top of one list — in the only hour it had, while
   * the cycle next door had already chosen something with better evidence
   * behind it. The hour should go to whatever actually won.
   *
   * Same key, same `preview=1` and same staleness as the dashboard, so opening
   * this tab neither runs the cycle twice nor spends the week's one profound
   * truth on a screen the person is only passing through.
   */
  const { data: lifeOs } = useQuery({
    queryKey: ['life-os-today'],
    queryFn: () => api<any>('/life-os/today?preview=1'),
    staleTime: 5 * 60_000,
  });

  /**
   * The rhythms already set, and how they are actually going.
   *
   * The healthspan card used to offer four levers to everyone forever, with no
   * idea that this person had set a walk four times a week and was managing
   * one. It has the habits now, so it can credit what is held and name what is
   * slipping instead of pitching all four as hypotheticals.
   */
  const { data: habits } = useQuery({
    queryKey: ['habits'],
    queryFn: () => api<any[]>('/habits'),
  });

  /**
   * The year drill-down.
   *
   * `activeYears` marks which squares hold anything, so the life grid shows
   * where there is something to open rather than making every year look alike.
   */
  const [openYear, setOpenYear] = useState<number | null>(null);
  const { data: activeYearsData } = useQuery({
    queryKey: ['timeline-years'],
    queryFn: () => api<{ years: number[] }>('/life-os/timeline/years'),
    staleTime: 10 * 60_000,
  });
  const activeYears = activeYearsData?.years ?? [];
  const {
    data: yearData,
    isError: yearFailed,
    isPaused: yearWaitingForNetwork,
    refetch: refetchYear,
  } = useQuery({
    queryKey: ['timeline', openYear],
    queryFn: () => api<any>(`/life-os/timeline/${openYear}`),
    enabled: openYear != null,
    // One retry, not the default three. A year that will not load should say
    // so in a couple of seconds; the alternative is a spinner that reads as
    // "still working" long after the request has given up.
    retry: 1,
  });

  /**
   * The years either side of the open one, fetched before they are asked for.
   *
   * Stepping between years should feel like stepping between days, and a day
   * is instant because the whole year is already in hand. Without this, every
   * tap of the year arrows would blank the grid for a round trip — on a
   * control people use to sweep through a life, that reads as broken. A year
   * is one small payload, and there are only ever two neighbours.
   */
  const neighbourYears = React.useMemo(() => {
    if (openYear == null) return [];
    const years: number[] = activeYearsData?.years ?? [];
    const before = [...years].reverse().find((y) => y < openYear);
    const after = years.find((y) => y > openYear);
    return [before, after].filter((y): y is number => y != null);
  }, [openYear, activeYearsData]);

  React.useEffect(() => {
    for (const y of neighbourYears) {
      qc.prefetchQuery({
        queryKey: ['timeline', y],
        queryFn: () => api<any>(`/life-os/timeline/${y}`),
        staleTime: 60_000,
      });
    }
  }, [neighbourYears, qc]);

  /**
   * Agreeing to a stolen hour.
   *
   * These were text. You could read that walking while calling your father
   * serves two parts of your life and there was nothing to press — so it never
   * entered the record, never earned anything, and the same three lines were
   * still there next month. Logging it puts it on the Missions list, which is
   * what feeds the timeline, which is what the year grid draws.
   *
   * The confirmation is the list itself: the moment one is logged it drops out
   * of the suggestions and a fourth takes its place.
   *
   * That confirmation cannot wait for the server. Planning something changes
   * which slots the engine picks, which changes the wording cache key, which
   * means the very next fetch is a cache miss and goes to the model — and that
   * call is allowed a full minute. So the row you just agreed to sat there,
   * unchanged and unacknowledged, for as long as the model took. Every report
   * of this said the same thing: "Plan it does nothing." It did. It logged the
   * mission, invalidated the list, and said so a lifetime later.
   *
   * So the row leaves on the tap. `planned` holds what has been agreed to but
   * not yet reflected by the server, and is only ever additive — if the write
   * fails the action comes back and says why, which is the one case where
   * silence would be a lie.
   */
  const [justPlanned, setJustPlanned] = useState<string | null>(null);
  const [planned, setPlanned] = useState<string[]>([]);
  const [planFailed, setPlanFailed] = useState<string | null>(null);
  const planStack = useMutation({
    mutationFn: (st: any) =>
      api('/missions', {
        method: 'POST',
        body: {
          title: st.action,
          description: st.framing,
          // A mission belongs to one domain, so it belongs to the one the
          // suggestion argued from — the hungriest thing it feeds.
          domainType: st.reasonDomain ?? st.covers[0] ?? st.domains[0],
          missionType: st.personId ? 'relationship' : 'one_time',
          relationshipId: st.personId ?? null,
          // Stacking is the whole thesis of this card, so an action that
          // genuinely serves three parts of a life is worth more than one that
          // serves two. Nothing here is worth more for being harder.
          xpReward: 20 * st.domains.length,
          sourceType: 'system',
        },
      }),
    // The row goes the instant it is pressed, not when the model gets back.
    onMutate: (st: any) => {
      setPlanFailed(null);
      setJustPlanned(st.action);
      setPlanned((p) => (p.includes(st.action) ? p : [...p, st.action]));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // The set has to re-plan around what was just agreed to.
      qc.invalidateQueries({ queryKey: ['life-stacks'] });
    },
    onError: (_err, st: any) => {
      // Put it back. An agreement that did not land must not look like one
      // that did — this is a record, and a phantom entry is worse than none.
      setPlanned((p) => p.filter((a) => a !== st.action));
      setJustPlanned(null);
      setPlanFailed(st.action);
    },
  });

  /**
   * Starting one of the levers.
   *
   * A habit rather than a mission, because these are rhythms — "strength
   * training twice a week" is not a thing you finish. The target comes from
   * the lever itself, so agreeing to it agrees to a real frequency rather than
   * a vague intention, and the card can tell next week whether it is being
   * kept. Same optimistic treatment as Steal the time: the row changes on the
   * press, not on the round trip.
   */
  const [startedLevers, setStartedLevers] = useState<string[]>([]);
  const startLever = useMutation({
    /* `domain` was added when the body windows began starting rhythms from
       here too — rough travel belongs to experiences, not health. Absent, the
       original lever rule stands. */
    mutationFn: (l: { key: string; title: string; target: number; domain?: string }) =>
      api('/habits', {
        method: 'POST',
        body: {
          title: l.title,
          domainType: l.domain ?? (l.key === 'social' ? 'friends' : 'health'),
          targetPerWeek: l.target,
          sourceType: 'system',
        },
      }),
    onMutate: (l) => setStartedLevers((p) => (p.includes(l.key) ? p : [...p, l.key])),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (_e, l) => setStartedLevers((p) => p.filter((k) => k !== l.key)),
  });

  /**
   * Crediting a day of not-doing.
   *
   * An abstinence is kept by nothing happening, so its tick is a reading of
   * the whole day rather than a record of an act — which is why the chip
   * lives at the day's edge and why tapping it twice must cost nothing.
   * The draft is the same optimistic shape the Today tab uses: the chip
   * changes on the press, the server catches up, a failure puts it back.
   */
  const [heldDraft, setHeldDraft] = useState<Record<string, boolean>>({});
  const settleHeld = (id: string) =>
    setHeldDraft((p) => { const { [id]: _drop, ...rest } = p; return rest; });
  const holdDay = useMutation({
    mutationFn: ({ id, undo }: { id: string; undo: boolean }) =>
      api(`/habits/${id}/${undo ? 'uncomplete' : 'complete'}`, { method: 'POST', body: {} }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      settleHeld(id);
    },
    onError: (_e, { id }) => settleHeld(id),
  });
  const toggleHeld = (id: string, doneNow: boolean) => {
    setHeldDraft((p) => ({ ...p, [id]: !doneNow }));
    holdDay.mutate({ id, undo: doneNow });
  };

  const [ageDraft, setAgeDraft] = useState('');
  const saveAge = useMutation({
    mutationFn: () =>
      api('/me', {
        method: 'PATCH',
        body: {
          dob: new Date(
            new Date().getFullYear() - parseInt(ageDraft, 10), 6, 1,
          ).toISOString(),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  /**
   * How many more years they want to work — an answer, so it is kept.
   *
   * This was a `useState(10)` that reset on every visit, which quietly said
   * the question did not matter. It does: the compounding card runs to
   * age-plus-this, and the sharp-hours budget divides by it. Stored locally
   * like the nudges — it is a planning lens, not a profile fact, and there
   * is nothing here worth putting on a wire.
   */
  const [moreYears, setMoreYearsState] = useState<number>(10);
  React.useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    AsyncStorage.getItem(MORE_YEARS_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw);
        if (saved?.userId === me.id && [5, 10, 15, 20, 25].includes(saved?.years)) {
          setMoreYearsState(saved.years);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [me?.id]);
  const setMoreYears = (years: number) => {
    setMoreYearsState(years);
    if (me?.id) {
      AsyncStorage
        .setItem(MORE_YEARS_KEY, JSON.stringify({ userId: me.id, years }))
        .catch(() => {});
    }
  };
  const [monthly, setMonthly] = useState('10000');
  const [minutes, setMinutes] = useState<number>(30);

  /**
   * The daily screen hours, which are a fact about this person and so live on
   * the profile rather than in a `useState(5)` that reset on every tab switch
   * and was quoted back as "at 5h a day" regardless.
   */
  const saveScreenHours = useMutation({
    mutationFn: (hours: number) =>
      api('/me', { method: 'PATCH', body: { screenHoursPerDay: hours } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  /** So the chip answers the tap before the round trip lands. */
  const [screenDraft, setScreenDraft] = useState<number | null>(null);

  /**
   * The three facts the day shape needs, asked once and then never again.
   *
   * Deliberately three and not a calendar: the personal-CRM graveyard is full
   * of tools that died of manual entry, and a schedule someone has to keep
   * current is abandoned by March.
   */
  const saveDay = useMutation({
    /* The working week is a list of weekdays, so the patch is no longer one
       number per key — it was `Record<string, number>` back when the only
       things on this card were an hour and a commute. */
    mutationFn: (patch: Record<string, number | number[]>) =>
      api('/me', { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  /**
   * When this person sleeps — which nothing has ever been able to ask.
   *
   * `dayShape` takes `sleepHour` and `wakeHour`, reads them from quiet hours,
   * and defaults to 10pm–7am when they are absent. They were absent for
   * everybody, because no screen in the app sets them: an ICU nurse who works
   * nights and sleeps from nine in the morning had her day drawn against a
   * night's sleep she does not get, and every "evening" suggestion landed in
   * the middle of her shift.
   */
  const saveRest = useMutation({
    mutationFn: (patch: Record<string, number>) =>
      api('/me/preferences', { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferences'] }),
  });
  const [editingDay, setEditingDay] = useState(false);

  /**
   * Today is different — the one thing the shape cannot work out for itself.
   *
   * Read back only if it was written by this account and on this date, so a
   * travelling Tuesday never leaks into a Wednesday at a desk, and never at
   * all into somebody else's account on a shared device.
   */
  const [dayType, setDayType] = useState<DayType>('usual');
  React.useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    AsyncStorage.getItem(DAY_TYPE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw);
        if (saved?.userId === me.id && saved?.date === localDayKey() && saved?.dayType) {
          setDayType(saved.dayType as DayType);
        }
      })
      .catch(() => {/* An unreadable note about today is not worth a message. */});
    return () => { alive = false; };
  }, [me?.id]);
  const chooseDayType = (next: DayType) => {
    setDayType(next);
    if (!me?.id) return;
    AsyncStorage
      .setItem(DAY_TYPE_KEY, JSON.stringify({ userId: me.id, date: localDayKey(), dayType: next }))
      .catch(() => {/* The shape has already moved; the note is the lesser half. */});
  };

  /**
   * Where the reader has moved things to.
   *
   * The shape puts each thing where the evidence says it goes, and the reader
   * is the authority on their own Tuesday — the app knows their work hours and
   * their habits, not that the school run is at four. Stored beside the day
   * type and expiring the same way: a correction to today is not a fact about
   * next Tuesday, and there is nothing here worth putting on a wire.
   */
  const [nudges, setNudges] = useState<Record<string, number>>({});
  React.useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    AsyncStorage.getItem(NUDGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw);
        if (saved?.userId === me.id && saved?.date === localDayKey() && saved?.nudges) {
          setNudges(saved.nudges);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [me?.id]);
  const saveNudges = (next: Record<string, number>) => {
    setNudges(next);
    if (me?.id) {
      AsyncStorage
        .setItem(NUDGE_KEY, JSON.stringify({ userId: me.id, date: localDayKey(), nudges: next }))
        .catch(() => {});
    }
  };
  /**
   * Move something to an offset, measured from where the shape would have put
   * it — never by adding to what is already stored.
   *
   * Adding to the stored value looked identical and was not. Once a thing had
   * been pushed past the end of the day the offset kept growing while the day
   * kept clamping it, so the next three taps of "earlier" each subtracted from
   * a number the day had already refused and nothing on screen moved. The
   * caller passes the offset the engine reported actually taking effect, so
   * every tap is one step from wherever the thing is really sitting.
   */
  /**
   * A standing commitment moved is not a note about today.
   *
   * Everything else on this card is corrected for one Tuesday and forgotten
   * by Wednesday, which is right for a school run and wrong for the one kind
   * of thing that recurs by definition. So a rhythm's move is converted into
   * the hour itself and kept — and the day-only nudge is dropped in the same
   * breath, or tomorrow the shape would start from the newly-stored hour and
   * then shift it by the same offset all over again.
   */
  const moveTo = (key: string, offsetMinutes: number, naturalStart?: number) => {
    if (key.startsWith(RHYTHM_PREFIX) && naturalStart != null) {
      setRhythmHour(key.slice(RHYTHM_PREFIX.length), naturalStart + offsetMinutes);
      const rest = { ...nudges };
      delete rest[key];
      saveNudges(rest);
      return;
    }
    saveNudges({ ...nudges, [key]: offsetMinutes });
  };

  /**
   * How long each thing is actually going to take.
   *
   * The engine sizes a proposal by what it costs to *start* — fifteen minutes
   * for a call, because the barrier is picking up the phone and not the
   * talking. That is the right number for deciding to do it and the wrong one
   * for a day: nobody rings their father for a quarter of an hour. Overriding
   * it changes the arithmetic honestly, because the shape then reserves what
   * was actually claimed and spaces the rest of the day around it.
   */
  const [durations, setDurations] = useState<Record<string, number>>({});
  React.useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    AsyncStorage.getItem(DURATION_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw);
        if (saved?.userId === me.id && saved?.date === localDayKey() && saved?.durations) {
          setDurations(saved.durations);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [me?.id]);
  const setDuration = (key: string, minutes: number) => {
    const next = { ...durations, [key]: minutes };
    setDurations(next);
    if (me?.id) {
      AsyncStorage
        .setItem(DURATION_KEY, JSON.stringify({ userId: me.id, date: localDayKey(), durations: next }))
        .catch(() => {});
    }
  };
  /**
   * When each rhythm runs, as the reader answered it — from the habit rows
   * themselves, so the walk set to Tuesday on a phone is on Tuesday on a
   * laptop. An absent answer is not an empty one: the engine goes back to
   * deriving it from what they actually do.
   */
  const rhythmDays = React.useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const h of habits ?? []) {
      if (Array.isArray((h as any).plannedDays) && (h as any).plannedDays.length) {
        out[(h as any).id] = (h as any).plannedDays;
      }
    }
    return out;
  }, [habits]);
  const rhythmHours = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of habits ?? []) {
      if (typeof (h as any).plannedMinute === 'number') {
        out[(h as any).id] = (h as any).plannedMinute;
      }
    }
    return out;
  }, [habits]);

  /**
   * A schedule change, shown before it lands.
   *
   * Written straight into the cached habit row so the tap is instant and
   * survives the round trip; the refetch afterwards only ever confirms it.
   * Sending `null` clears an answer, which the server distinguishes from
   * omitting the field.
   */
  const setSchedule = useMutation({
    mutationFn: (p: { habitId: string; plannedDays?: number[] | null; plannedMinute?: number | null }) =>
      api(`/habits/${p.habitId}/schedule`, {
        method: 'PATCH',
        body: {
          ...('plannedDays' in p ? { plannedDays: p.plannedDays } : {}),
          ...('plannedMinute' in p ? { plannedMinute: p.plannedMinute } : {}),
        },
      }),
    onMutate: (p) => {
      for (const key of [['habits'], ['habits', 'all']]) {
        qc.setQueryData(key, (old: any) => (Array.isArray(old) ? old.map((h: any) => (
          h.id === p.habitId
            ? {
              ...h,
              ...('plannedDays' in p ? { plannedDays: p.plannedDays } : {}),
              ...('plannedMinute' in p ? { plannedMinute: p.plannedMinute } : {}),
            }
            : h
        )) : old));
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  });

  /**
   * A new order for what matters.
   *
   * Optimistic against the dashboard cache so the bars reflow on release
   * rather than after a round trip — and the server recalculates every
   * derived score before it answers, so what comes back is the real reading
   * rather than the guess this made.
   *
   * The optimism is deliberately shallow: it moves `priorityRank` and leaves
   * the scores alone. Recomputing importance here would mean a second copy
   * of a formula that lives in the engine, and the two would drift.
   */
  const reorderDomains = useMutation({
    mutationFn: (order: string[]) => api('/life-os/domains/ranking', {
      method: 'PATCH',
      body: { order },
    }),
    onMutate: (order) => {
      const rankOf = new Map(order.map((d, i) => [d, i + 1]));
      qc.setQueryData(['dashboard'], (old: any) => (old?.domains ? {
        ...old,
        domains: old.domains.map((d: any) => (rankOf.has(d.domainType)
          ? { ...d, priorityRank: rankOf.get(d.domainType) }
          : d)),
      } : old));
    },
    /* Everything on this tab reads from these two. A ranking that moved and
       a set of bars that did not would be worse than no change at all. */
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['life-rhythms'] });
    },
  });

  /**
   * `current` is the row's days as drawn — derived or already chosen — so
   * the first tap edits the plan the reader can see rather than starting
   * from an empty week they never asked for.
   */
  const toggleRhythmDay = (habitId: string, weekday: number, current: number[]) => {
    const next = current.includes(weekday)
      ? current.filter((d) => d !== weekday)
      : [...current, weekday].sort((a, b) => a - b);
    setSchedule.mutate({ habitId, plannedDays: next.length ? next : null });
  };

  /**
   * Answers given before these lived on the account, carried up once.
   *
   * Losing somebody's own answer to make room for a better place to keep it
   * is the exact failure this whole feature exists to avoid, so anything
   * still in device storage is pushed to the row that has none — never over
   * a server answer, which is either newer or the same — and the local copy
   * is dropped so this can only happen once.
   */
  const adopted = useRef(false);
  React.useEffect(() => {
    if (adopted.current || !me?.id || !habits?.length) return;
    adopted.current = true;
    (async () => {
      const [rawDays, rawHours] = await Promise.all([
        AsyncStorage.getItem(RHYTHM_DAYS_KEY).catch(() => null),
        AsyncStorage.getItem(RHYTHM_HOURS_KEY).catch(() => null),
      ]);
      const days = rawDays ? JSON.parse(rawDays) : null;
      const hours = rawHours ? JSON.parse(rawHours) : null;
      const mine = (v: any) => (v?.userId === me.id ? v : null);
      const localDays = mine(days)?.days ?? {};
      const localHours = mine(hours)?.hours ?? {};

      for (const h of habits as any[]) {
        const patch: { plannedDays?: number[]; plannedMinute?: number } = {};
        if (!h.plannedDays?.length && localDays[h.id]?.length) patch.plannedDays = localDays[h.id];
        if (h.plannedMinute == null && typeof localHours[h.id] === 'number') {
          patch.plannedMinute = localHours[h.id];
        }
        if (Object.keys(patch).length) setSchedule.mutate({ habitId: h.id, ...patch });
      }
      await Promise.all([
        AsyncStorage.removeItem(RHYTHM_DAYS_KEY).catch(() => {}),
        AsyncStorage.removeItem(RHYTHM_HOURS_KEY).catch(() => {}),
      ]);
    })();
  }, [me?.id, habits]);

  const setRhythmHour = (habitId: string, minutes: number) =>
    setSchedule.mutate({
      habitId,
      plannedMinute: ((Math.round(minutes) % 1440) + 1440) % 1440,
    });
  /** Hand the hour back to the engine — the reset the strip offers. */
  const clearRhythmHour = (habitId: string) =>
    setSchedule.mutate({ habitId, plannedMinute: null });

  /**
   * A window that opened up — the cancelled-meeting case.
   *
   * Held for today only, like the day type beside it: a meeting that died
   * this afternoon says nothing about next Tuesday. `where` is the part the
   * app could never derive, and the part that decides whether any of this
   * is help or nonsense.
   *
   * Above the early returns, like every other hook on this screen.
   */
  const [foundMinutes, setFoundMinutes] = useState<number | null>(null);
  const [foundWhere, setFoundWhere] = useState<SettingKey>('desk');
  const [foundWindow, setFoundWindow] = useState<number | null>(null);
  /**
   * The calendar's own answer, when there is a calendar to ask.
   *
   * Never read unprompted: it costs a permission dialog, and an app that
   * demands one before it has been useful gets the answer it deserves. So
   * this stays null until the reader taps, and on web it never becomes
   * anything — the manual chips above are the whole feature there.
   */
  const [calendar, setCalendar] = useState<CalendarState | null>(null);

  /** Which placed thing is open for editing. One at a time. */
  const [openBlock, setOpenBlock] = useState<string | null>(null);

  /**
   * Which day the card is drawing. 0 is today, 1 is tomorrow.
   *
   * The card was today and only today, which stopped being tenable the moment
   * a passed hour started sending things to tomorrow: the app moved something
   * to a day it had no way of showing, and the reader had to take its word.
   * One step forward is the whole of it — two days out is a planner, and this
   * is a day card that can answer "so where did that go".
   */
  const [dayOffset, setDayOffset] = useState(0);
  const showingToday = dayOffset === 0;
  /** The weekday being drawn — which decides what is due and whether it is a workday. */
  const viewWeekday = ((now.weekday + dayOffset) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** That day's date, for anything that needs more than a weekday. */
  const viewDate = (() => {
    const d = new Date(now.date);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  /**
   * Putting an hour on the record.
   *
   * A Mission with the hour on it, not a calendar entry — the life grid holds
   * what *happened* (completed missions, contacts, memories, rhythms kept) and
   * a plan has no business in a record of a life until it is one. So this puts
   * it on the list with its hour attached, and the grid receives it on the day
   * it is actually done, at the time it was actually done.
   */
  const [scheduled, setScheduled] = useState<string[]>([]);
  const scheduleBlock = useMutation({
    mutationFn: (p: {
      key: string; action: string; reason?: string; domains: string[];
      startMinutes: number; minutes: number;
      /**
       * Days from today this is for. Zero unless the hour has already gone,
       * in which case writing it against today would file a mission due
       * hours ago — a thing that arrives on the list already failed.
       */
      daysAhead?: number;
    }) => {
      const at = new Date();
      at.setHours(0, 0, 0, 0);
      if (p.daysAhead) at.setDate(at.getDate() + p.daysAhead);
      at.setMinutes(p.startMinutes);
      return api('/missions', {
        method: 'POST',
        body: {
          title: p.action,
          description: p.reason ?? null,
          domainType: p.domains[0] ?? 'growth',
          missionType: 'one_time',
          dueDate: at.toISOString(),
          estimatedMinutes: p.minutes,
          sourceType: 'system',
        },
      });
    },
    onMutate: (p) => setScheduled((s) => (s.includes(p.key) ? s : [...s, p.key])),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (_e, p) => setScheduled((s) => s.filter((k) => k !== p.key)),
  });

  /**
   * Every rhythm including retired ones, so the reclaim offer never hands back
   * a commitment someone deliberately stopped. Mirrors the sky's own read.
   */
  const { data: allHabits } = useQuery({
    queryKey: ['habits', 'all'],
    queryFn: () => api<any[]>('/habits?all=1'),
    staleTime: 5 * 60_000,
  });

  /**
   * Spending the reclaimed hour.
   *
   * The screen card ended at "Every year." and stopped — the one sentence on
   * that tile a person could act on had nothing to press. This is the door:
   * the hour goes to whichever domain is furthest behind what they asked of
   * it, as a standing rhythm rather than a one-off good intention.
   */
  /**
   * What was just taken up, held separately from the offer that proposed it.
   *
   * Not a boolean against `reclaimOffer`: agreeing to the rhythm gives that
   * domain a rhythm, so the offer that produced it is correctly gone by the
   * time the answer renders. Reading the acknowledgement off the offer meant
   * the row simply disappeared on the tap, which is what a failure looks like.
   */
  const [reclaimed, setReclaimed] = useState<{ domainType: string; perWeek: number } | null>(null);
  const startRhythm = useMutation({
    mutationFn: (r: { domainType: string; title: string; perWeek: number }) =>
      api('/habits', {
        method: 'POST',
        body: {
          title: r.title,
          domainType: r.domainType,
          targetPerWeek: r.perWeek,
          sourceType: 'system',
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => setReclaimed(null),
  });

  // Custom counts — the user's own rituals, persisted as onboarding answers.
  const { data: answers } = useQuery({
    queryKey: ['onboarding-answers'],
    queryFn: () => api<any[]>('/onboarding/answers'),
  });
  /**
   * The lived side of each ritual — how many, since when, and with whom.
   * Was a bare count, which is why a pace nobody had kept could be quoted
   * back as "your current pace".
   */
  const { data: countsLived } = useQuery({
    queryKey: ['memories-counts'],
    queryFn: () => api<Record<string, CountsLived>>('/memories/counts-summary'),
  });
  /** Moments already in the archive that look like a ritual being counted. */
  const { data: countCandidates } = useQuery({
    queryKey: ['memories-count-candidates'],
    queryFn: () => api<Record<string, CandidateMemory[]>>('/memories/count-candidates'),
    staleTime: 5 * 60_000,
  });
  /** Words that keep recurring in untagged moments — done, never counted. */
  const { data: archiveThemes } = useQuery({
    queryKey: ['memories-archive-themes'],
    queryFn: () => api<ArchiveTheme[]>('/memories/archive-themes'),
    staleTime: 10 * 60_000,
  });
  const [countName, setCountName] = useState('');
  const [countPerYear, setCountPerYear] = useState<number>(1);
  /** Relationship ids this ritual is with — "road trips with Sheetal, Amma". */
  const [countPeople, setCountPeople] = useState<string[]>([]);
  const [foldedIn, setFoldedIn] = useState<string[]>([]);
  const savedCounts: SavedCount[] = (answers ?? [])
    .filter((a) => a.section === 'counts' && a.value?.label)
    .map((a) => ({
      ...(a.value as { label: string; perYear: number; people?: string[] }),
      key: a.key as string,
    }));

  /**
   * Whether the name being typed is a ritual already on the card.
   *
   * "treks" and "Went to trek" sat as two rows with identical numbers,
   * because nothing ever compared a new name to the names already there.
   */
  const dupe = countName.trim()
    ? matchRitual(countName, savedCounts.map((c) => ({ key: c.key, label: c.label })))
    : null;

  /**
   * What to offer counting, out of this life.
   *
   * Four sources in order of how much they belong to this person: the moments
   * they named as mattering with someone (`meaningfulMomentTypes`, collected
   * at onboarding and never read until now), then things their archive keeps
   * holding, then people they said they want more of, and only last a domain
   * they rate highly and count nothing in.
   */
  const countSuggestions = suggestCountables({
    existing: savedCounts.map((c) => ({ key: c.key, label: c.label })),
    people: (relationships ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      relationType: r.relationType,
      closenessScore: r.closenessScore,
      wantsMoreTime: r.wantsMoreTime,
      desiredCallFrequency: r.desiredCallFrequency,
      /* Without this the card offered "days out with Nikhil — 12 a year" to
         a father whose son lives abroad. */
      locationType: r.locationType,
      meaningfulMomentTypes: r.meaningfulMomentTypes,
    })),
    domains: (dashboard?.domains ?? []).map((d: any) => ({
      domainType: d.domainType,
      importance: d.importance,
    })),
    archiveThemes: archiveThemes ?? [],
    limit: 3,
  });

  const addCount = useMutation({
    mutationFn: () =>
      api('/onboarding/answers', {
        method: 'POST',
        body: {
          answers: [{
            section: 'counts',
            // The engine's key, so the same ritual typed two ways lands on
            // one row rather than making a twin.
            key: countKeyOf(countName),
            value: {
              label: countName.trim(),
              perYear: countPerYear,
              ...(countPeople.length ? { people: countPeople } : {}),
            },
          }],
        },
      }),
    onSuccess: () => {
      setCountName('');
      setCountPeople([]);
      qc.invalidateQueries({ queryKey: ['onboarding-answers'] });
      qc.invalidateQueries({ queryKey: ['memories-count-candidates'] });
    },
  });

  const { refreshing, onRefresh } = useRefresh();

  /**
   * Folding archive moments into a ritual's count.
   *
   * Offered, never applied on its own. The archive holds the evidence and
   * most of it was never tagged — but a number someone cannot explain is
   * worse than a smaller one they can, so nothing is attributed until it is
   * agreed to.
   */
  const foldIn = useMutation({
    mutationFn: ({ countKey, memoryIds }: { countKey: string; memoryIds: string[] }) =>
      api('/memories/count-attach', { method: 'POST', body: { countKey, memoryIds } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories-counts'] });
      qc.invalidateQueries({ queryKey: ['memories-count-candidates'] });
      invalidateLifeRecord(qc);
    },
  });

  /**
   * What this life is already doing about its own healthspan.
   *
   * Three of the levers are habits and read straight off them. The fourth,
   * staying socially connected, is not a habit anyone writes down — but the
   * People tab has been tracking exactly it for months: who someone said they
   * wanted to keep up with, and whether they have. Using that is the whole
   * difference between advice and a mirror.
   *
   * Sits above the early returns below, and must stay there. It used to sit
   * under them, which is a rules-of-hooks violation that only bites when the
   * early path is actually taken first — a cold cache, or anyone who has not
   * given their age yet. Warm from storage it never fired; the first load on
   * a new phone crashed the whole tab with "rendered more hooks".
   */
  const leverSignals: LeverSignal[] = useMemo(() => {
    const out: LeverSignal[] = [];

    for (const h of habits ?? []) {
      const key = classifyLever(h.title ?? '');
      if (!key || out.some((s) => s.key === key)) continue;
      out.push({
        key,
        target: h.targetPerWeek ?? 3,
        // The four-week rate, which survives a bad week. Falls back to this
        // week's ticks only if an older server has not sent one.
        actual: h.perWeek ?? (h.logs?.length ?? 0),
        label: h.title,
        // So a rhythm agreed to this morning is not graded this afternoon.
        ageDays: h.createdAt
          ? (Date.now() - new Date(h.createdAt).getTime()) / 86_400_000
          : undefined,
      });
    }

    /* Connected means keeping the cadence you set with the people you named,
       so the target is "everyone you are tracking" and the actual is how many
       of them are currently within it. */
    const tracked = (relationships ?? []).filter((r: any) => r.desiredCallFrequency);
    if (tracked.length) {
      const withinCadence = tracked.filter((r: any) => {
        if (!r.lastContactAt) return false;
        const days = (Date.now() - new Date(r.lastContactAt).getTime()) / 86_400_000;
        return days <= (CADENCE_DAYS[r.desiredCallFrequency] ?? 30);
      }).length;
      out.push({
        key: 'social',
        target: tracked.length,
        actual: withinCadence,
        label: `${withinCadence} of ${tracked.length} people you track`,
      });
    }

    return out;
  }, [habits, relationships]);

  /**
   * When this person actually gets to things.
   *
   * Both sources are already in hand — finished missions carry `completedAt`,
   * and each rhythm carries this week's ticks — so nothing new is fetched and
   * nothing new is asked. Below the engine's thresholds this is null and the
   * day shape keeps its honest guess about where the evening starts.
   *
   * Above the early returns, for the same reason `leverSignals` is.
   */
  const activeAt = useMemo(
    () => activeHour([
      ...(doneMissions ?? []).map((m: any) => m.completedAt),
      ...(habits ?? []).flatMap((h: any) => h.history ?? (h.logs ?? []).map((l: any) => l.completedAt)),
    ]),
    [doneMissions, habits],
  );

  /**
   * The hour each rhythm is kept at, separately from the hour this person
   * gets to things in general. One reading for a whole life is right for
   * "when are they reachable" and wrong for "when do they walk" — a morning
   * run and a call home have different homes, and pooling them reports an
   * afternoon belonging to neither. Held to the same thresholds, so a thin
   * history yields nothing and the catalog's own hint takes over.
   */
  const habitHours = useMemo(
    () => activeHourByKey(Object.fromEntries(
      (habits ?? []).map((h: any) => [h.id, h.history ?? []]),
    )),
    [habits],
  );

  /**
   * Standing commitments, on today's clock.
   *
   * A rhythm carries a frequency and never said which days or what hour, so
   * the app could hold something somebody had agreed to and still leave them
   * the question that decides whether it happens. The weekdays come from
   * what they actually do when there is enough of it to earn that, and the
   * hour from what they do with *this* rhythm, then from the part of the day
   * the activity belongs to.
   *
   * Placed is not scheduled: the week counts to the target, a planned day
   * that passes unused costs nothing, and a week already met is never asked
   * for again.
   */
  const dueRhythms = useMemo(() => {
    const today = viewWeekday;
    return (habits ?? [])
      .filter((h: any) => h.isActive !== false)
      .map((h: any) => {
        const catalog = rhythmForHabit(h.title);
        const perWeek = Math.max(1, Number(h.targetPerWeek) || 1);
        const { days } = rhythmWeekdays({
          key: catalog?.key ?? h.id,
          perWeek,
          history: h.history ?? [],
          prefersWeekend: catalog?.prefersWeekend,
          override: rhythmDays[h.id] as any,
        });
        const due = rhythmDueToday({
          days,
          perWeek,
          doneThisWeek: (h.logs ?? []).length,
          today,
        });
        if (!due || !isPlaceable(catalog?.when)) return null;
        return {
          key: `${RHYTHM_PREFIX}${h.id}`,
          action: h.title,
          minutes: catalog?.minutes ?? 30,
          domains: [h.domainType].filter(Boolean),
          reason: catalog?.because || undefined,
          at: preferredMinutes({
            when: catalog?.when,
            observedMinutes: habitHours[h.id]?.minutes ?? null,
            chosenMinutes: rhythmHours[h.id] ?? null,
          }),
        };
      })
      .filter((r: any): r is NonNullable<typeof r> => r != null);
  }, [habits, habitHours, rhythmDays, rhythmHours, viewWeekday]);

  /**
   * The rhythms that mark where the day ends rather than filling part of it.
   *
   * Same habits, same due-today rule, opposite half of `isPlaceable` — and
   * they are gathered here rather than dropped because the alternative was
   * worse than the bug. A bedtime placed in the evening drew ten minutes of
   * sleep at seven o'clock; a bedtime simply filtered out would be a thing
   * asked for seven times a week with nowhere on the screen it could be seen
   * at all. It goes on the sleep block, against the hour it is actually about.
   */
  const dayBoundaries = useMemo(() => {
    const today = viewWeekday;
    return (habits ?? [])
      .filter((h: any) => h.isActive !== false)
      .map((h: any) => {
        const catalog = rhythmForHabit(h.title);
        if (!isBoundary(catalog?.when)) return null;
        const perWeek = Math.max(1, Number(h.targetPerWeek) || 1);
        const { days } = rhythmWeekdays({
          key: catalog?.key ?? h.id,
          perWeek,
          history: h.history ?? [],
          override: rhythmDays[h.id] as any,
        });
        /* The same "never nag a finished week" rule the placements follow. A
           week already kept is kept, and the row goes quiet. */
        if (!rhythmDueToday({ days, perWeek, doneThisWeek: (h.logs ?? []).length, today })) {
          return null;
        }
        return {
          key: `${RHYTHM_PREFIX}${h.id}`,
          action: h.title,
          domains: [h.domainType].filter(Boolean),
          reason: catalog?.because || undefined,
        };
      })
      .filter((b: any): b is NonNullable<typeof b> => b != null);
  }, [habits, rhythmDays, viewWeekday]);

  /**
   * The same rhythms laid across a week rather than a day.
   *
   * The day card answers "what fits today"; this answers the question a
   * frequency actually raises — three times a week, but which three — and
   * is the only place the answer can be corrected. Ticks are shown so a
   * kept week reads as kept, never as four boxes and two failures.
   */
  const todayWeekday = now.weekday;
  /**
   * Minutes past midnight, now — from the ticking clock, not from whenever
   * this screen last repainted. It is the difference between "add to today"
   * and "that hour has gone", so it is the one number here that must not lag.
   */
  const nowMinutes = now.minutes;
  const weekRows = useMemo(() => {
    const entries = (habits ?? [])
      .filter((h: any) => h.isActive !== false)
      .map((h: any) => {
        const catalog = rhythmForHabit(h.title);
        return {
          /* The same key the placement uses, or the spread seeds from two
             different strings and the strip draws a week the day card does
             not agree with. Rows are re-keyed to habit ids below, since
             that is what the taps and the overrides are stored against. */
          key: catalog?.key ?? h.id,
          habitId: h.id,
          perWeek: Math.max(1, Number(h.targetPerWeek) || 1),
          history: h.history ?? [],
          thisWeek: (h.logs ?? []).map((l: any) => l.completedAt),
          prefersWeekend: catalog?.prefersWeekend,
          override: rhythmDays[h.id] as any,
          /* The hour and where it came from, so the row can say whether
             Priority worked it out or the reader did. */
          time: preferredTime({
            when: catalog?.when,
            observedMinutes: habitHours[h.id]?.minutes ?? null,
            chosenMinutes: rhythmHours[h.id] ?? null,
          }),
        };
      });
    const rows = weekPlan(entries);
    const byId = new Map((habits ?? []).map((h: any) => [h.id, h]));
    return rows.map((r, i) => {
      const habitId = entries[i].habitId;
      const h: any = byId.get(habitId);
      return {
        ...r,
        key: habitId,
        title: h?.title ?? '',
        domain: h?.domainType ?? 'growth',
        time: entries[i].time,
      };
    });
  }, [habits, rhythmDays, rhythmHours, habitHours]);

  /**
   * The days a placed block's rhythm runs on, when it is one.
   *
   * Placements key rhythms as `rhythm:<habitId>` and `weekRows` is keyed by
   * the same id, so a missed Saturday rhythm can be offered next Saturday
   * rather than blankly tomorrow. Anything not a rhythm — a proposal, a
   * stack — has no weekly shape and correctly gets no days.
   */
  const rhythmDaysFor = (key: string): Weekday[] | undefined => {
    if (!key.startsWith(RHYTHM_PREFIX)) return undefined;
    const id = key.slice(RHYTHM_PREFIX.length);
    return weekRows.find((r) => r.key === id)?.days;
  };

  const age = ageFromDob(me?.dob);
  const birthYear = me?.dob ? new Date(me.dob).getUTCFullYear() : null;
  const intensityOff = prefs?.insightIntensity === 'off';

  if (!me) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // ---------------------------------------------------------------- no age
  if (age === null) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
        <Text style={type.display}>Time Reality</Text>
        <Card style={{ gap: space(3) }}>
          <Label>One number first</Label>
          <Text style={type.body}>
            Everything on this screen is arithmetic on your age — working weeks left,
            free hours, open windows. We never show predictions, only planning lenses.
          </Text>
          <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
            <Input
              placeholder="Your age"
              keyboardType="number-pad"
              value={ageDraft}
              onChangeText={(v) => setAgeDraft(v.replace(/[^0-9]/g, ''))}
              style={{ maxWidth: 120 }}
            />
            <Button title="Show my numbers" small onPress={() => saveAge.mutate()} disabled={!ageDraft} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  const windows = lifeWindows({
    age,
    workHoursPerWeek: me.workHoursPerWeek ?? 45,
    plannedWorkYearsMore: moreYears,
    workType: me.workType,
    /* Every count on this tab is now counted for where this person lives,
       rather than on a flat hundred years that was only ever right for a
       reader in Tokyo. Unknown falls back to the global average, never dark. */
    country: me?.country,
  });
  const money = estimateCostOfWaiting({
    monthlyAmount: parseInt(monthly, 10) || 0,
    currentAge: age,
    targetAge: age + moreYears,
    /* So the figures carry a unit. Unknown country still renders bare. */
    country: me?.country,
  });
  const creative = estimateCreativeCompounding(minutes);
  const weeks = lifeInWeeks(age, me?.country);
  /**
   * Where the country average falls, for the mark on the grid.
   *
   * Not the horizon — the horizon is conditional on the age already reached
   * and is the larger, honest number. This is the flat at-birth average, and
   * it is the right thing to *mark* precisely because it is the figure a
   * reader has heard quoted about their country. Showing them where it sits
   * inside a hundred squares, with their own count running past it, is the
   * argument the card is making.
   */
  const averageAge = lifeExpectancyForRegion(me?.country ?? undefined);
  const averageCountry = countryInSentence(me?.country);
  /**
   * Whether "how many more years do you want to work?" is a question this
   * person can answer.
   *
   * Ravi is 72 and retired, with `workHoursPerWeek: 0`, and the compounding
   * card asked him to choose between five and twenty-five more working years.
   * The money question underneath survives the difference — how long he keeps
   * adding to the pot is still his to decide — so only the framing changes.
   * An explicit zero, not `?? 0`: an unanswered profile has not said it has
   * stopped working.
   */
  const stillWorking = me.workHoursPerWeek !== 0
    && !['retired', 'not_working'].includes((me.workType ?? '').toLowerCase());
  /* Their answer, or the one they just tapped while it is in flight. Never a
     house default — `screenTrade` says nothing at all without one. */
  const screenHours = screenDraft ?? me.screenHoursPerDay ?? null;
  const screens = screenTrade(age, screenHours, me?.country);

  /**
   * The section's own line while it is shut.
   *
   * It used to read "~900 books · ~150 trips", both computed from chips nobody
   * had ever touched — the collapsed header was the most-seen surface on the
   * tab and it was quoting two constants. Now it says what this person counts,
   * on the pace their archive shows, and says plainly when that is nothing.
   */
  /**
   * Who a count is with, and the window each of them shares.
   *
   * Extracted because the collapsed preview and the expanded row each built
   * this, and only the row bothered — the preview called `countable` with no
   * people at all. While both were counted on the reader's own horizon that
   * was invisible; the moment a person-named ritual started counting on the
   * window the two of them share, the same row read ~340 collapsed and ~110
   * open. One implementation, so they cannot disagree again.
   */
  const peopleForCount = (
    count: { people?: string[] | null },
    lived?: { people?: string[] } | null,
  ) => {
    const named = (count.people ?? [])
      .map((id) => (relationships ?? []).find((r: any) => r.id === id))
      .filter(Boolean) as any[];
    /* Whoever they named, and failing that whoever the archive keeps finding
       there — nobody has to tell the app that Diwali means Amma. */
    const observed = named.length
      ? []
      : ((lived?.people ?? [])
        .map((n: string) => (relationships ?? []).find((r: any) => r.name === n))
        .filter(Boolean) as any[]);
    return [...named, ...observed]
      .filter((r) => r.age != null)
      .slice(0, 2)
      .map((r) => ({
        name: r.name as string,
        qualityYears: estimateTimeReality({
          personAge: r.age,
          personLabel: r.name,
          personHealthStatus: r.healthStatus ?? undefined,
          personLocationType: r.locationType ?? undefined,
          currentVisitsPerYear: 1,
          region: me?.country ?? undefined,
        }).qualityYears,
      }));
  };

  const countPreview = dedupeRituals(savedCounts, (c) => countsLived?.[c.key]?.count ?? 0)
    .slice(0, 2)
    .map((g) => {
      const merged = g.keys.map((k) => countsLived?.[k]).filter(Boolean) as CountsLived[];
      const observation = merged.length
        ? {
          count: merged.reduce((n, m) => n + m.count, 0),
          firstAt: merged.map((m) => m.firstAt).sort()[0],
        }
        : undefined;
      return `~${countable({
        age,
        country: me?.country,
        label: g.item.label,
        declaredPerYear: g.item.perYear,
        observation,
        people: peopleForCount(g.item, merged.length
          ? { people: [...new Set(merged.flatMap((m) => m.people))] }
          : undefined),
      }).remaining} ${g.item.label}`;
    })
    .join(' · ');
  const peopleInsights = (insights ?? []).filter((i) =>
    ['visits_remaining', 'childhood_windows', 'calls_per_year'].includes(i.kind),
  );
  /**
   * How many *people* these insights are about, not how many insights there are.
   *
   * The engine routinely writes several rows against one relationship — a
   * visits-remaining and a calls-per-year for the same mother — so counting
   * rows under a heading that says "your people" told someone with one
   * relationship that they had two, and would have said five soon enough.
   */
  const peopleCounted = new Set(
    peopleInsights.map((i: any) => i.relationshipId).filter(Boolean),
  ).size;

  // "Fit it all in" — the synthesis layer.
  /**
   * Ranked domains, in the order the reader actually put them.
   *
   * By rank rather than by score, now that the order is something they can
   * move. Importance is the rank plus a bonus for active goals and flags, so
   * two domains can trade places on score without the ranking having moved —
   * and a card sorted by score would answer a drag by showing an order
   * nobody set. A domain with no rank sorts last rather than first.
   */
  const activeDomains = (dashboard?.domains ?? [])
    .filter((d: any) => d.importance > 0)
    .sort((a: any, b: any) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99));

  /**
   * The people a stack can name, each with how far past their own rhythm they
   * are. A stack that names someone should name whoever is actually waiting.
   */
  const stackPeople = (relationships ?? []).map((r: any) => {
    const days = r.lastContactAt
      ? Math.floor((Date.now() - new Date(r.lastContactAt).getTime()) / 86_400_000)
      : null;
    return {
      id: r.id,
      name: r.name,
      relationType: r.relationType,
      daysSince: days,
      // Never logged counts as well over — the same reading the People tab uses.
      overdue: days === null ? 2 : days / (CADENCE_DAYS[r.desiredCallFrequency] ?? 30),
    };
  });

  /**
   * What each domain was promised against what it received.
   *
   * This replaced a raw-level test — `neglectRisk >= 40 || importance -
   * attention >= 25` — that flagged nothing at all for a real profile whose
   * `purpose` sat at importance 12 and attention 0. Nothing flagged meant the
   * ranker fell back to "everything is neglected", which tied almost every
   * suggestion and handed back the catalog in the order it was written. Shares
   * are also the unit `lifeAlignment` uses, so the tile and the alignment score
   * can no longer name different domains as the starving one.
   */
  const shares = domainShares(
    activeDomains.map((d: any) => ({
      domainType: d.domainType, importance: d.importance, attention: d.attention,
    })),
  );
  const shortDomains = shares.filter((s) => s.shortfall > 0);

  /**
   * Where the reclaimed hour would go.
   *
   * Not a menu and not the app's favourite domain — the one furthest behind
   * what this person said they wanted from it, which is the same shortfall the
   * stacks and the alignment score are computed from, so the screen card can
   * no longer name a different starving domain than the tile above it. Only
   * offered when the domain has no rhythm yet; a domain already holding one
   * does not need a second.
   */
  const reclaimOffer = (() => {
    for (const s of [...shortDomains].sort((a, b) => b.shortfall - a.shortfall)) {
      const mine = (allHabits ?? []).filter((h: any) => h.domainType === s.domainType);
      if (mine.some((h: any) => h.isActive !== false)) continue;
      const rhythm = rhythmFor(s.domainType, mine.map((h: any) => h.title));
      if (rhythm) return { domainType: s.domainType, rhythm, share: s };
    }
    return null;
  })();
  /**
   * The same ranking, run twice, and the server's answer wins.
   *
   * The server runs this exact engine and then has a model rewrite the wording
   * for this particular life — the catalog is 26 fixed sentences and cannot
   * know that someone cycles to work or has a six-year-old rather than a
   * sixteen-year-old. What the server cannot do is answer while the phone is
   * offline, which in an offline-first app is a normal Tuesday.
   *
   * So the local engine stays and computes the same slots from cached data.
   * The ranking is identical either way — only the phrasing differs — so
   * falling back is never a worse suggestion, just a plainer one.
   */
  const localStacks = suggestStacks(shares, stackPeople, 3, [
    ...(pendingMissions ?? []).map((m: any) => m.title),
    ...(doneMissions ?? [])
      .filter((m: any) => {
        if (!m.completedAt) return false;
        return Date.now() - new Date(m.completedAt).getTime() < RESUGGEST_AFTER_DAYS * 86_400_000;
      })
      .map((m: any) => m.title),
  ], lifeShape(me.workType, me.commuteMinutes));
  /* Anything already agreed to is gone from here, whether or not the server
     has caught up — the list is what is still on offer, never a history. */
  const offered: StackSuggestion[] = craftedStacks?.stacks?.length
    ? craftedStacks.stacks
    : localStacks;

  /**
   * What is already dealt with, and must not be offered again.
   *
   * One rule for the whole card, because it was two. The stacks were filtered
   * — `localStacks` gets an exclude list, the server's version builds its own
   * — while the cycle's proposals were checked against `planned` alone, which
   * holds only what was agreed to in *this session*. So a mission finished on
   * the Missions tab came straight back as a proposal, and the day drew an
   * hour for something already done.
   *
   * The same fourteen-day window the stacks use, so the two halves cannot
   * disagree: a move the stacks are still resting must not slip back in
   * through the cycle.
   */
  const norm = (t: string) => t.trim().toLowerCase();
  const settled = (() => {
    const out = new Set<string>(planned.map(norm));
    for (const m of (doneMissions ?? []) as any[]) {
      if (!m?.title || !m.completedAt) continue;
      if (Date.now() - new Date(m.completedAt).getTime() < RESUGGEST_AFTER_DAYS * 86_400_000) {
        out.add(norm(m.title));
      }
    }
    return out;
  })();
  const isSettled = (action: string) => settled.has(norm(action));

  /**
   * Already on the list — which is a different thing from already done.
   *
   * Something finished has no business on today's shape. Something *planned*
   * very much does: it has an hour, and the hour is the whole point of the
   * card. So a pending mission stays drawn and its button reads as agreed to
   * rather than offering to add it again — which is what happened on every
   * reload, because "agreed to" lived only in session state.
   */
  const onTheList = new Set(
    ((pendingMissions ?? []) as any[]).filter((m) => m?.title).map((m) => norm(m.title)),
  );

  const stacks: StackSuggestion[] = offered.filter(
    (st: StackSuggestion) => !isSettled(st.action),
  );
  /** What these moves would actually feed — not merely touch. */
  const stackHelps = craftedStacks?.stacks?.length
    ? craftedStacks.helps ?? []
    : shortfallsCovered(localStacks);
  /**
   * What this person has actually agreed to, in hours.
   *
   * A habit row carries a title, a domain and a target per week — never a
   * duration — so the length comes from the catalog entry the title came
   * from. One somebody wrote themselves does not match, and reports null
   * rather than a guess: an invented length would be fiction inside the only
   * honest number on the card.
   *
   * Deliberately NOT a `useMemo`: this sits below the component's early
   * returns, so a hook here renders a different number of hooks on the
   * loading pass than on the loaded one. Mapping a handful of habits costs
   * nothing next to that.
   */
  const held = (habits ?? [])
    .filter((h: any) => h.isActive !== false && h.targetPerWeek > 0)
    .map((h: any) => {
      const catalog = rhythmForHabit(h.title);
      return {
        domainType: h.domainType,
        perWeek: h.targetPerWeek,
        /* Null only for a habit somebody wrote themselves. Anything this app
           created resolves — including from the healthspan card, whose
           labels the rhythm catalog has never heard of. */
        minutes: catalog?.minutes ?? null,
        sharp: catalog?.sharp === true,
      };
    });

  const commitments = held.map(({ domainType, perWeek, minutes }: any) => ({
    domainType, perWeek, minutes,
  }));

  /**
   * Which catalog rhythms this life already holds, by key.
   *
   * The body windows use it to tell "begin this" from "already begun" —
   * a window somebody is already using should say so, not offer them the
   * thing they are doing. Substance rather than title, for the usual
   * reason: "Strength training twice a week" and "One strength session a
   * week" are the same commitment wearing different cards.
   */
  const heldRhythmKeys = new Set(
    (habits ?? [])
      .filter((h: any) => h.isActive !== false)
      .map((h: any) => rhythmForHabit(h.title)?.key)
      .filter(Boolean),
  );

  /**
   * The habits kept by nothing happening, and how today stands on each.
   *
   * These have no slot anywhere in the day on purpose — see `allday` — so
   * the sleep row is their one home: a day of not-doing is only complete
   * when the day is, and the row that says where the day ends is the only
   * honest place to ask. `done` reads the draft first so the chip answers
   * the finger, not the network.
   */
  const todayKey = now.dayKey;
  const alldayRows = (habits ?? [])
    .filter((h: any) => h.isActive !== false && rhythmForHabit(h.title)?.when === 'allday')
    .map((h: any) => ({
      id: h.id as string,
      title: h.title as string,
      done: heldDraft[h.id] ?? (h.logs ?? []).some(
        (l: any) => new Date(l.completedAt).toDateString() === todayKey,
      ),
    }));

  /**
   * The rhythms that need a clear head rather than merely a free hour.
   *
   * Counted only where the catalog knows both that it is focused work and
   * how long it takes. Something written by hand has neither, and guessing
   * would put invented hours into a warning about over-commitment — which is
   * the one number on that card a reader might actually act on.
   */
  const sharpHeld = held.filter((h: any) => h.sharp && h.minutes);
  const sharpCommitted = sharpHeld.reduce(
    (sum: number, h: any) => sum + (h.perWeek * h.minutes) / 60, 0,
  );

  const allocation = weeklyAllocation(
    windows.freeTime.freeHoursPerWeek,
    activeDomains.map((d: any) => ({ domainType: d.domainType, importance: d.importance })),
    commitments,
    /* Retired ones included, so a domain is not credited with room it would
       have to re-offer something the reader already ended to reach. */
    (habits ?? []).map((h: any) => h.title),
  );
  /**
   * The same allotments, in the reader's own order.
   *
   * `weeklyAllocation` sorts by hours, which is the right default for a card
   * nobody can touch. This one can be dragged, so it has to be drawn in the
   * order being edited — otherwise a row moved to the top could reappear
   * second because a goal bonus outweighed the rank change, and the drag
   * would read as having failed.
   */
  /** Rhythms held whose length nothing knows — a footnote, not a per-row fact. */
  const unmeasured = allocation.allotments
    .reduce((n, a) => n + a.unknownCommitments, 0);

  const rankedAllotments = activeDomains
    .map((d: any) => allocation.allotments.find((a) => a.domainType === d.domainType))
    .filter(Boolean) as typeof allocation.allotments;

  const season = suggestSeason(
    /* The share table, not raw importance. Without it the deepen branch picks
       whatever was ranked highest — which is usually the domain already being
       over-served, so the card recommended more of the one thing that needed
       it least. `shares` is the same reading the alignment score uses. */
    activeDomains.map((d: any) => ({
      domainType: d.domainType,
      importance: d.importance,
      neglectRisk: d.neglectRisk,
      shortfall: shares.find((s) => s.domainType === d.domainType)?.shortfall,
    })),
  );

  /**
   * Where in a day the top move would actually go.
   *
   * Everything above this answers what is short and how to serve two things
   * with one hour. None of it says when, and "when" is most of the distance
   * between agreeing with a suggestion and doing it. The stack is already
   * ranked; this only puts it on a clock.
   */
  const topStack = stacks[0];

  /**
   * The proposal the cycle chose, which is not the same as the top of a list.
   *
   * The engines rank on pressure and evidence across the whole life; this card
   * ranks stackable moves against domain shortfalls. When the cycle has an
   * answer it is the better-argued one and it gets the hour. Anything already
   * agreed to is skipped for the same reason the stacks are: an hour spent
   * proposing something already on the list is an hour proposing nothing.
   */
  const cycleProposal = (lifeOs?.proposals ?? []).find(
    (p: any) => p?.action && !planned.includes(p.action),
  ) ?? null;

  /**
   * Everything worth placing, best-argued first.
   *
   * The cycle's own proposals lead — they are ranked on pressure and evidence
   * across eight engines — and the stacks follow, which is what fills a day
   * that has more room in it than the cycle had things to say. How many of
   * these actually land is the shape's decision, not this list's: a working
   * evening takes one, a cleared Saturday takes three.
   */
  const placeable = [
    /* Standing commitments lead, because they are the only things here the
       reader has already agreed to — and each one knows the hour it wants,
       so they mostly take slots the rest were never going to use. Among
       themselves the starved domain wins: a rhythm in the part of a life
       that is drifting is exactly the hour worth defending, which is what
       the ranking and the honest 1-5 scores were collected for. */
    ...[...dueRhythms].sort((a: any, b: any) => {
      const risk = (d: string) =>
        (dashboard?.domains ?? []).find((x: any) => x.domainType === d)?.neglectRisk ?? 0;
      return risk(b.domains[0]) - risk(a.domains[0]);
    }),
    ...(lifeOs?.proposals ?? [])
      .filter((p: any) => p?.action && !isSettled(p.action))
      .map((p: any) => ({
        key: `proposal:${p.id ?? p.action}`,
        action: p.action,
        minutes: p.effortMinutes || 60,
        /* Kernel domains are the eight; the dots speak the twelve. Lossy, and
           only used to colour a row — the proposal's own text is the truth. */
        domains: p.domain ? [LIFE_TO_DOMAIN[p.domain as LifeDomain]].filter(Boolean) : [],
        reason: p.because || undefined,
        fromCycle: true,
      })),
    ...stacks.map((st) => ({
      key: `stack:${st.key}`,
      action: st.action,
      minutes: 60,
      domains: st.covers?.length ? st.covers : st.domains,
      reason: st.reason || undefined,
      fromCycle: false,
    })),
  ]
    .filter((s, i, all) => all.findIndex((o) => o.action === s.action) === i)
    /* Their length wins over the engine's sizing, so the day reserves what was
       actually claimed and spaces everything else around it. */
    .map((s) => (durations[s.key] ? { ...s, minutes: durations[s.key] } : s));

  /**
   * A window that opened up — the cancelled-meeting case.
   *
   * Held for today only, like the day type beside it: a meeting that died
   * this afternoon says nothing about next Tuesday. `where` is the part
   * the app could never derive, and the part that decides whether any of
   * this is help or nonsense.
   */
  /**
   * The freed window, once it has been put into the day rather than merely
   * asked about. Starts now — a meeting that has just been cancelled frees
   * the time in front of you, not a tidy slot at the top of the hour.
   *
   * A plain value rather than a memo: it is two numbers, and the hooks it
   * would cost have to sit above the early returns, which is a worse trade
   * than recomputing them.
   */
  const freedWindows = (() => {
    /* An hour that has just come free is an hour of *today*. Carving it out
       of tomorrow would be the card inventing a cancellation. */
    if (!foundWindow || !showingToday) return [];
    return [{ startMinutes: now.minutes, endMinutes: now.minutes + foundWindow }];
  })();


  const shape = dayShape({
    workStartHour: me.workStartHour,
    workEndHour: me.workEndHour,
    /* Already answered at onboarding. Asking again for something the profile
       holds is how a "three questions, once" card becomes a form. */
    workHoursPerWeek: me.workHoursPerWeek,
    commuteMinutes: me.commuteMinutes,
    workType: me.workType,
    sleepHour: prefs?.quietHoursStart,
    wakeHour: prefs?.quietHoursEnd,
    /* Asked once, rather than corrected with a chip every Saturday. */
    workDays: me.workDays,
    weekday: viewWeekday,
    /* The chips correct today and are cleared at midnight, so carrying
       "travelling" onto tomorrow would be asserting something nobody said. */
    dayType: showingToday ? dayType : 'usual',
    activeAt,
    suggestions: placeable,
    boundaries: dayBoundaries,
    nudges,
    freed: freedWindows,
    /* Only ever the day that was read. A calendar answer belongs to one date,
       and yesterday's bookings drawn on tomorrow would be a confident lie. */
    busy: calendar?.status === 'ready' && calendar.dayKey === viewDate.toDateString()
      ? calendar.busy
      : null,
  });
  /**
   * Now, against a day that runs from waking to waking.
   *
   * The blocks keep counting past midnight — a card that wakes at seven ends
   * at 1860, not at 1440 — so a small-hours clock reading has two possible
   * meanings and the card has to tell them apart:
   *
   *   A day worker at 00:53. The Thursday being drawn has not started; its
   *   seven o'clock is seven hours away, not seventeen hours behind. Pushing
   *   the clock forward greys out the whole day and puts "you are here" at
   *   the bottom of a day nobody has lived yet.
   *
   *   An ICU nurse at 03:20, whose day began at five the previous afternoon
   *   and who is four hours into a shift that ends at six. Taking the clock
   *   as it reads puts "you are here" above her five o'clock block, at the
   *   top of a day she is more than half way through.
   *
   * Reading the clock literally is right for the first and wrong for the
   * second; normalising forward is the exact reverse. What separates them is
   * not the hour but whether the pushed-forward time still lands inside the
   * day being drawn — 03:20 becomes 1640, which is inside the nurse's
   * 1320–1800 shift, while 00:53 becomes 1493, past the end of a day that
   * finished at 23:00. So: try the wrapped reading, and keep it only if the
   * day is still running there.
   */
  const dayStartsAt = shape.blocks[0]?.startMinutes ?? 0;
  const dayEndsAt = shape.blocks[shape.blocks.length - 1]?.endMinutes ?? 1440;
  const nowInDay = (() => {
    if (!showingToday) return null;
    const raw = now.minutes;
    if (raw >= dayStartsAt) return raw;
    /* Before the day's own start on the clock: either the small hours of a
       day still ahead, or the far side of midnight on a day already running. */
    return raw + 1440 < dayEndsAt ? raw + 1440 : raw;
  })();
  /** The small hours: today is drawn, and none of it has happened yet. */
  const dayNotStarted = nowInDay != null && nowInDay < dayStartsAt;

  /**
   * Everything that could fill it, from all three sources the app has.
   *
   * Rhythms carry what the week still owes them, which is the one claim
   * strong enough to lead — a commitment already made beats anything the
   * app merely thinks is a good idea.
   */
  const foundCandidates = (() => {
    const riskOf = (d: string) =>
      (dashboard?.domains ?? []).find((x: any) => x.domainType === d)?.neglectRisk ?? 0;
    const owed = new Map(weekRows.map((r) => [r.key, r.remaining]));

    const fromRhythms = (habits ?? [])
      .filter((h: any) => h.isActive !== false)
      .map((h: any) => {
        const catalog = rhythmForHabit(h.title);
        /* The same question the day card asks. A found window is a piece of
           free time like any other, and a sheet that offers you your bedtime
           because forty minutes opened up at three in the afternoon has made
           the day card's mistake in a second place. */
        if (!isPlaceable(catalog?.when)) return null;
        return {
          key: `rhythm:${h.id}`,
          action: h.title,
          minutes: catalog?.minutes ?? 30,
          domain: h.domainType,
          because: catalog?.because,
          needs: catalog?.needs,
          owedThisWeek: owed.get(h.id) ?? 0,
          neglectRisk: riskOf(h.domainType),
        };
      })
      /* Only what the week still owes. A rhythm already kept its three
         times has no claim on found time, and offering it a fourth is the
         app failing to keep count. */
      .filter((c: any): c is NonNullable<typeof c> => c != null && c.owedThisWeek > 0);

    const fromStacks = stacks.map((st) => ({
      key: `stack:${st.key}`,
      action: st.action,
      minutes: 60,
      domain: st.covers?.[0] ?? st.domains[0] ?? 'growth',
      because: st.framing,
      needs: st.setting,
      neglectRisk: riskOf(st.covers?.[0] ?? st.domains[0] ?? 'growth'),
    }));

    const fromProposals = (lifeOs?.proposals ?? [])
      .filter((p: any) => p?.action)
      .map((p: any) => {
        const domain = p.domain ? LIFE_TO_DOMAIN[p.domain as LifeDomain] ?? 'growth' : 'growth';
        return {
          key: `proposal:${p.id ?? p.action}`,
          action: p.action,
          minutes: p.effortMinutes || 30,
          domain,
          because: p.because,
          neglectRisk: riskOf(domain),
        };
      });

    /**
     * Nothing the day has already claimed.
     *
     * This deduped against itself and against nothing else, so an hour that
     * came free was answered with the three things pencilled into the day
     * card directly below it — "thirty minutes of learning", "read about
     * money", the family trip — every one of them already spoken for. An
     * app that offers you back the plan you already have has not found you
     * anything; it has repeated itself and called it a suggestion.
     *
     * A found hour is worth having precisely because it is *extra*, so what
     * belongs here is what the day could not fit, what the week still owes,
     * and what nobody has agreed to yet.
     *
     * Measured against what the day actually *drew*, not against everything
     * it considered. The two differ constantly — a day has room for one or
     * two things and the ranker hands it a dozen — and the ones that did not
     * fit are the best answer this card has. Excluding them as well emptied
     * the sheet and replaced a wrong suggestion with no suggestion, which is
     * not obviously the better failure.
     *
     * This is why the whole block sits below `shape` rather than above it.
     */
    const claimed = new Set<string>([
      ...shape.placements.map((p) => norm(p.action)),
      ...scheduled,
      ...[...onTheList],
    ]);
    const claimedKeys = new Set<string>([
      ...shape.placements.map((p) => p.key),
      ...scheduled,
    ]);

    return [...fromRhythms, ...fromStacks, ...fromProposals]
      .filter((c) => !claimed.has(norm(c.action)) && !claimedKeys.has(c.key))
      .filter((c, i, all) => all.findIndex((o) => o.action === c.action) === i);
  })();

  const found = foundMinutes
    ? foundTime({
      minutes: foundMinutes,
      where: setting(foundWhere),
      candidates: foundCandidates,
    })
    : null;

  const dayHoursKnown = me.workStartHour != null && me.workEndHour != null;
  /* Where the placed things came from, said once and quietly. A card that puts
     something in your evening which is not in the list directly above it owes
     the reader that much. */
  const fromCycle = shape.placements.some((p) => p.key.startsWith('proposal:'));
  const dayNotes = [
    ...shape.assumptions,
    fromCycle ? `Drawn from today's read of the whole system, not only the moves above` : null,
  ].filter((n): n is string => n != null);

  const hs = healthspan(age, leverSignals, me?.country);
  /* The sharp-hours number is only worth showing if it is theirs, so it is
     built from the two things actually known about them: the working week
     they gave at onboarding, and where they stand on protecting sleep. */
  const sleepLever = hs.levers.find((l) => l.key === 'sleep');
  const energy = energyBudget({
    workHoursPerWeek: me.workHoursPerWeek ?? undefined,
    plannedWorkYearsMore: moreYears,
    sleep: sleepLever?.state,
    sleepLabel: sleepLever?.habitLabel,
    committedSharpHours: sharpCommitted,
    committedSharpCount: sharpHeld.length,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={s.wrap}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={type.display}>Time Reality</Text>
        <Text style={type.dim}>
          Your numbers, at your current pace — every one of them moves when you do.
        </Text>
      </View>

      {intensityOff ? (
        <Card>
          <Label>Horizon numbers are off</Label>
          <Text style={type.body}>
            You've turned off finite-time framing (You → Time reality insights).
            The money and craft calculators below still work.
          </Text>
        </Card>
      ) : (
        <>
          {/* THE LIFE TILE — the headline number, first thing seen.
              *
              * The canvas stays a hundred squares while the *arithmetic* moved
              * to the reader's country, and the split is deliberate. Drawn to
              * the country horizon instead, the grid would say the most
              * consequential thing on the card along its own edge — a reader in
              * Chennai would get a visibly shorter picture than one in Osaka
              * and no way to see why, because the missing squares are not
              * anywhere to be looked at. A fixed frame with the average marked
              * inside it puts the same fact somewhere it can be read, and left
              * of the mark is not a wall: the whole card below is about the
              * rhythms that move it. */}
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="grid-outline" size={14} color={colors.textDim} />
              <Label>Your life in years</Label>
            </View>
            <View style={s.lifeGrid}>
              {/* The canvas, or one square past this reader if they have gone
                  further than it. A hundred is a frame, not a limit, and a
                  centenarian whose "now" square had nowhere to be drawn would
                  be the one person on the tab the picture left out. */}
              {Array.from({
                length: Math.max(PLANNING_HORIZON_AGE, weeks.yearsLived + 1),
              }).map((_, i) => {
                // Cell i is the year the person turned i, so it maps to a real
                // calendar year and can be opened.
                const calendarYear = birthYear != null ? birthYear + i : null;
                const lived = i <= weeks.yearsLived;
                const hasEvents = calendarYear != null && activeYears.includes(calendarYear);
                const isOpen = calendarYear != null && calendarYear === openYear;
                /* The country average, marked rather than cropped to. One cell
                   carries it so the grid can show where the averages sit
                   without the picture itself becoming the claim. */
                const atAverage = i === averageAge;
                /* Past the horizon this reader is actually counted on. Drawn,
                   because a hundred squares that stop meaning anything at
                   sixty-eight would be a worse lie than not drawing them. */
                const beyond = i > weeks.yearsLived + weeks.yearsAhead;
                /* `sized` decides who owns the 4.2% width. A tappable year puts
                   it on the Pressable and lets the square fill it — nesting two
                   percentage widths collapses the inner one to nothing. */
                const cell = (sized: boolean) => (
                  <View
                    style={[
                      sized ? s.lifeCell : s.lifeCellFill,
                      i < weeks.yearsLived && s.lifeCellLived,
                      i === weeks.yearsLived && s.lifeCellNow,
                      beyond && s.lifeCellBeyond,
                      atAverage && s.lifeCellAverage,
                      // A year holding recorded life gets a visible edge, so the
                      // grid shows where there is something to open.
                      hasEvents && s.lifeCellHasEvents,
                      isOpen && s.lifeCellOpen,
                    ]}
                  />
                );
                if (!lived || calendarYear == null) {
                  return <React.Fragment key={i}>{cell(true)}</React.Fragment>;
                }
                return (
                  <Pressable
                    key={i}
                    onPress={() => setOpenYear(isOpen ? null : calendarYear)}
                    hitSlop={3}
                    style={({ pressed }) => [s.lifeCellHit, pressed && { opacity: 0.6 }]}
                  >
                    {cell(false)}
                  </Pressable>
                );
              })}
            </View>
            {/* How to read the grid, and nothing else. This caption used to
                also state the weeks lived and the weeks ahead — then the serif
                line directly below restated the same count as the emotional
                point. The reader met "~3,444 ahead" twice in two sentences,
                once as a footnote and once as the thing that matters. The
                mechanics stay here; the meaning stays there. */}
            <Text style={type.faint}>
              Each square is a year, a hundred of them, so the picture means the same thing
              wherever you live. Filled ones are lived; the bright one is now
              {`; the marked one is the ${averageCountry ?? 'global'} average of ~${averageAge}`}.
              {' '}The average is where most people are, not where you have to stop — everything
              below this card is about moving it.
              {birthYear != null ? ' Tap a lived year to open its days.' : ''}
            </Text>
            <Text style={type.serif}>{weeks.framingText}</Text>
          </Card>

          {/**
            * The second zoom level — a year as days, opened from the grid above.
            *
            * One component for every state of it, including waiting and
            * failing. Swapping in a separate card while a year loaded meant
            * unmounting this one, so stepping from 2026 to 2025 quietly threw
            * away the filter, the zoom level and the open day. The shell now
            * stays put and the year changes underneath it.
            */}
          {openYear != null ? (
            <YearGrid
              year={openYear}
              data={yearData && yearData.year === openYear ? yearData : null}
              years={activeYears}
              onYear={setOpenYear}
              onClose={() => setOpenYear(null)}
              offline={yearWaitingForNetwork}
              failed={yearFailed}
              onRetry={() => refetchYear()}
            />
          ) : null}

          <Section
            icon="hourglass-outline"
            title="The week you actually have"
            preview={`${windows.freeTime.freeHoursPerWeek} h · ~${windows.weekendsRemaining.toLocaleString()} weekends`}
          >
            <Card accent={colors.amberSoft} style={{ gap: space(4), paddingVertical: space(5) }}>
              <View style={{ flexDirection: 'row' }}>
                <Big
                  value={String(windows.freeTime.freeHoursPerWeek)}
                  unit="free hours / week"
                  caption="after sleep, work, and life admin"
                />
                <Big
                  value={`~${windows.weekendsRemaining.toLocaleString()}`}
                  unit="weekends ahead"
                  caption={averageCountry ? `on the averages for ${averageCountry}` : 'on a global average'}
                />
              </View>
              <Text style={[type.faint, { textAlign: 'center' }]}>{windows.freeTime.detail}</Text>
            </Card>
          </Section>

          {/* FIT IT ALL IN — the synthesis: how to serve every domain in limited hours */}
          {activeDomains.length > 0 && (
            <Section
              icon="git-merge-outline"
              title="Fit it all in"
              preview={
                shortDomains.length > 0
                  ? `${stacks.length} moves · ${stackHelps.length} of ${shortDomains.length} gaps`
                  : `${stacks.length} moves · nothing short`
              }
            >
              <Text style={type.dim}>
                You can't buy separate hours for eight lives. You steal them — one hour serving
                two or three parts at once — and you don't fire everything at the same time.
              </Text>

              {/* 1. Time-stacking */}
              <Card style={{ gap: space(3) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="git-merge-outline" size={14} color={colors.textDim} />
                  <Label>Steal the time — one action, several domains</Label>
                </View>
                {stacks.map((st) => (
                  <View key={st.key} style={s.windowRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Text style={[type.body, { flex: 1, fontWeight: '600' }]}>{st.action}</Text>
                      {/* A domain this move does not actually help is drawn
                          faint. A full-strength dot for a domain already
                          getting more than it was promised is the same
                          overselling the summary line used to do. */}
                      <View style={{ flexDirection: 'row', gap: 4, paddingTop: 5 }}>
                        {st.domains.map((d) => (
                          <View key={d} style={st.covers.includes(d) ? undefined : { opacity: 0.3 }}>
                            <DomainDot domain={d} size={9} />
                          </View>
                        ))}
                      </View>
                    </View>
                    {/* Why this one, in numbers the person can check against
                        their own dashboard. A suggestion that cannot say why
                        it is a suggestion is a slogan. */}
                    {st.reason ? (
                      <Text style={[type.faint, { color: domainColor(st.reasonDomain!) }]}>
                        {st.reason}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(3) }}>
                      <Text style={[type.faint, { flex: 1 }]}>{st.framing}</Text>
                      <Pressable
                        onPress={() => planStack.mutate(st)}
                        disabled={planStack.isPending}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Plan it: ${st.action}`}
                        style={({ pressed }) => [
                          s.planChip,
                          planStack.isPending && { opacity: 0.5 },
                          pressed && { backgroundColor: colors.surfaceRaised, transform: [{ scale: 0.96 }] },
                        ]}
                      >
                        <Ionicons name="add" size={14} color={colors.amber} />
                        <Text style={{ color: colors.amber, fontWeight: '600', fontSize: 12.5 }}>Plan it</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                {/* Said once, plainly, and on the tap rather than on the
                    round trip — the row above is already gone. */}
                {justPlanned ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.green} style={{ marginTop: 1 }} />
                    <Text style={[type.faint, { flex: 1, color: colors.green }]}>
                      “{justPlanned}” is on your missions.
                    </Text>
                  </View>
                ) : null}
                {planFailed ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <Ionicons name="alert-circle" size={15} color={colors.rose} style={{ marginTop: 1 }} />
                    <Text style={[type.faint, { flex: 1, color: colors.rose }]}>
                      “{planFailed}” did not save. It is still on the list above.
                    </Text>
                  </View>
                ) : null}
                {planStack.isError ? (
                  <ErrorNote error={planStack.error} onRetry={() => planStack.reset()} />
                ) : null}
                {/* Counts what these moves would feed, not what they brush
                    past. The old line said "touch 5 of your life domains" when
                    four of the five were already getting more attention than
                    they were promised — true, and useless. */}
                <Text style={[type.faint, { color: colors.green }]}>
                  {shortDomains.length === 0
                    ? 'Nothing is short of what you asked for right now — these are simply good uses of an hour.'
                    : `These ${stacks.length} moves reach ${stackHelps.length} of the ${shortDomains.length} ${
                        shortDomains.length === 1 ? 'domain' : 'domains'
                      } getting less attention than you asked for.`}
                </Text>
              </Card>

              {/* 1b. The day that move has to fit into.
                  A stack is only advice until it has an hour. This draws the
                  hours that are already spoken for and puts the top move in
                  the largest thing left — one move, not an agenda, and never
                  presented as today's plan, because the day it is wrong about
                  a 6pm meeting is the day it stops being read. */}
              <Card style={{ gap: space(3) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time-outline" size={14} color={colors.textDim} />
                  <Label>Where the hour is</Label>
                  <View style={{ flex: 1 }} />
                  {/* Without a role this is a bare div on web — the one door
                      to the hours, invisible to a screen reader and to
                      anything else walking the page. */}
                  <Pressable
                    onPress={() => setEditingDay((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: editingDay }}
                    accessibilityLabel={editingDay ? 'Done editing your hours' : 'Set the hours of your day'}
                  >
                    <Text style={[type.faint, { color: colors.amber }]}>
                      {editingDay ? 'done' : dayHoursKnown ? 'adjust' : 'set hours'}
                    </Text>
                  </Pressable>
                </View>

                {/**
                  * Which day is being looked at.
                  *
                  * One step, not a date picker. The card started sending
                  * passed hours to tomorrow and had no way of showing tomorrow,
                  * so the reader was asked to trust a day the app would not
                  * draw. Two days out is a planner and a different promise;
                  * this only has to answer "so where did that go".
                  */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                  <Pressable
                    onPress={() => setDayOffset(0)}
                    disabled={showingToday}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Show today"
                    style={{ opacity: showingToday ? 0.25 : 1 }}
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.textDim} />
                  </Pressable>
                  <Text style={[type.body, { fontWeight: '700', color: colors.amber }]}>
                    {showingToday ? 'Today' : `Tomorrow · ${WEEKDAY_NAMES[viewWeekday]}`}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => setDayOffset(1)}
                    disabled={!showingToday}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Show tomorrow"
                    style={{ opacity: showingToday ? 1 : 0.25 }}
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                  </Pressable>
                </View>

                {/**
                  * The day's real bookings, offered and never taken.
                  *
                  * Reading a calendar costs a permission dialog, so it stays a
                  * tap rather than something that happens to you — but the
                  * result now goes into the day itself instead of only sizing
                  * a found hour, which is the difference between an app that
                  * knows your evening is spoken for and one that offers it to
                  * you anyway. Nothing leaves the device and nothing is ever
                  * written back.
                  */}
                {calendarSupported && !(
                  calendar?.status === 'ready' && calendar.dayKey === viewDate.toDateString()
                ) ? (
                  <Pressable
                    onPress={async () => {
                      const state = await readFreeGaps({
                        workStartHour: me.workStartHour ?? 9,
                        workEndHour: me.workEndHour ?? 17,
                        date: viewDate,
                      });
                      setCalendar(state);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Read what is already booked ${showingToday ? 'today' : 'tomorrow'}`}
                    style={({ pressed }) => [s.chip, { alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[type.body, { color: colors.amber }]}>
                      What's already booked?
                    </Text>
                  </Pressable>
                ) : null}
                {calendar?.status === 'denied' ? (
                  <Text style={type.faint}>
                    No calendar access — the day below is the shape of a typical one, as before.
                  </Text>
                ) : null}

                {/* Today is different — one tap, no round trip, gone tomorrow.
                    The shape below is derived from facts asked once, which is
                    what keeps it from becoming a calendar to maintain; this is
                    the one thing it cannot derive, and the one day it draws an
                    evening at home for someone in an airport is the day it
                    stops being worth reading.

                    Only offered for today, because it is stored against today
                    and cleared at midnight — a "travelling" chip on tomorrow
                    would be an answer the app forgets before the day arrives. */}
                {showingToday ? (
                  <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
                    <Text style={[type.faint, { paddingTop: 7 }]}>Today:</Text>
                    {DAY_TYPE_LABELS.map((d) => {
                      const on = dayType === d.key;
                      return (
                        <Pressable
                          key={d.key}
                          onPress={() => chooseDayType(d.key)}
                          /* Four controls that redraw the entire day, and to
                             anything but a sighted finger they were unlabelled
                             divs — not announced as controls, and with no way
                             to tell which of them was the one in force. */
                          accessibilityRole="button"
                          aria-selected={on}
                          accessibilityLabel={`Today is ${d.label}${on ? ', selected' : ''}`}
                          style={[s.chip, on && s.chipOn]}
                        >
                          <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                            {d.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {/* Collapsed unless asked for, even before anything is set.
                    The shape is drawn from the week they already gave at
                    onboarding, so three rows of chips greeting someone who has
                    answered nothing new is a form where a read-out should be —
                    and the card is worth reading before it is worth editing. */}
                {editingDay ? (
                  <View style={{ gap: space(3) }}>
                    <Text style={type.faint}>
                      {dayHoursKnown
                        ? 'Change these and the shape below moves with them.'
                        : 'Only the start really matters — the length comes from the week you already gave.'}
                    </Text>
                    {/* A field, not a grid. The first cut of this was
                        twenty-four pills per question — four grids on one
                        sheet — because the range problem (an ICU nurse could
                        not say 7pm) got solved by multiplying buttons. The
                        person who needs 7pm already has the words: the field
                        takes "7pm", "19", "7:30 pm". `dayShape` has always
                        handled a shift that ends before it starts — "a shift
                        ending before it starts is a night shift, not bad
                        data". */}
                    <HourField
                      label={lifeShape(me.workType).careWorkIsWork ? 'The household day starts' : 'Work starts'}
                      value={me.workStartHour}
                      disabled={saveDay.isPending}
                      onCommit={(h) => saveDay.mutate({ workStartHour: h })}
                    />
                    <HourField
                      label={lifeShape(me.workType).careWorkIsWork ? 'The household day ends' : 'Work ends'}
                      value={me.workEndHour}
                      placeholder="e.g. 5pm"
                      disabled={saveDay.isPending}
                      onCommit={(h) => saveDay.mutate({ workEndHour: h })}
                    />
                    {/**
                      * Which days those hours apply to.
                      *
                      * Until this existed the card drew a commute into every
                      * Saturday and left the reader to say otherwise with a
                      * "day off" chip that reset at midnight — fifty-two
                      * weekends a year of correcting a thing that was true the
                      * first time. Untouched means unasked, and the shape
                      * behaves exactly as it always did.
                      */}
                    <View style={{ gap: 6 }}>
                      <Text style={type.dim}>Days you work:</Text>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        {WEEK_COLUMNS.map((d) => {
                          const week: number[] = me.workDays ?? [];
                          const on = week.includes(d);
                          return (
                            <Pressable
                              key={d}
                              disabled={saveDay.isPending}
                              onPress={() => saveDay.mutate({
                                workDays: on ? week.filter((x) => x !== d) : [...week, d],
                              })}
                              accessibilityRole="button"
                              aria-selected={on}
                              accessibilityLabel={`${WEEKDAY_NAMES[d]}${on ? ', a working day' : ', not a working day'}`}
                              style={[s.dayChip, on && s.chipOn]}
                            >
                              <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                                {WEEKDAY_INITIALS[d]}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {!(me.workDays ?? []).length ? (
                        <Text style={type.faint}>
                          Not set — every day is drawn as a working one until you say otherwise.
                        </Text>
                      ) : null}
                    </View>
                    {/* A duration estimate, not a clock time — six honest
                        buckets remain the right shape for it. Judged on the
                        work type alone, not the stored minutes: an office
                        worker who set commute to 0 must keep the row to set
                        it back; a homemaker has no row to need. */}
                    {lifeShape(me.workType).hasCommute && (
                      <View style={{ gap: 6 }}>
                        <Text style={type.dim}>Commute each way:</Text>
                        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
                          {[0, 15, 30, 45, 60, 90].map((n) => {
                            const on = me.commuteMinutes === n;
                            return (
                              <Pressable
                                key={n}
                                disabled={saveDay.isPending}
                                onPress={() => saveDay.mutate({ commuteMinutes: n })}
                                accessibilityRole="button"
                                accessibilityLabel={`Commute ${n === 0 ? 'none' : `${n} minutes`} each way`}
                                aria-selected={on}
                                style={[s.chip, on && s.chipOn]}
                              >
                                <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                                  {n === 0 ? 'none' : `${n}m`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Sleep, which nothing in this app had ever asked about.
                        `dayShape` reads it and falls back to ten-at-night, so
                        a nurse who sleeps from nine in the morning had her day
                        drawn against a night she does not have. */}
                    <HourField
                      label="Sleep starts"
                      value={prefs?.quietHoursStart}
                      placeholder="e.g. 10pm"
                      disabled={saveRest.isPending}
                      onCommit={(h) => saveRest.mutate({ quietHoursStart: h })}
                    />
                    <HourField
                      label="You wake"
                      value={prefs?.quietHoursEnd}
                      placeholder="e.g. 7am"
                      disabled={saveRest.isPending}
                      onCommit={(h) => saveRest.mutate({ quietHoursEnd: h })}
                    />
                    {/* These columns are non-nullable with defaults, so there
                        is no "unset" state to describe — everybody starts at
                        ten and seven whether they chose it or not, which is
                        precisely why the rows had to exist. */}
                    <Text style={type.faint}>
                      Type an hour as you'd say it — 7pm, 19, 6:30am. The shape
                      is drawn against these, nights included.
                    </Text>
                    <Button title="Done" small kind="ghost" onPress={() => setEditingDay(false)} />
                  </View>
                ) : null}

                {/* Two answers that cannot both be true, above the day rather
                    than in the provenance list under it — a reader who meets
                    the contradiction first can read the day as a consequence
                    instead of as a mistake. It names both hours and asks for
                    a correction; it does not guess which one was meant. */}
                {shape.conflict ? (
                  <Pressable
                    onPress={() => setEditingDay(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`${shape.conflict.text} Open the hours to fix it.`}
                    style={s.conflictNote}
                  >
                    <Text style={[type.body, { color: colors.text }]}>{shape.conflict.text}</Text>
                  </Pressable>
                ) : null}

                {/* The day as a column of blocks. Fixed things are quiet; the
                    one suggestion is the only thing drawn in brass. */}
                <View style={{ gap: 2 }}>
                  {shape.blocks.map((b: DayBlock, i: number) => {
                    const key = `${b.kind}-${b.startMinutes}-${i}`;
                    /**
                     * Where the reader actually is on their own day.
                     *
                     * The card drew a whole day with no mark on it, so working
                     * out whether the seven o'clock row was four hours ago or
                     * four hours away was arithmetic the reader had to do
                     * against a clock the card never showed. One line, one
                     * time, and the hours behind it set back — which is also
                     * what makes the passed-hour rule visible instead of a
                     * surprise waiting inside a block nobody has opened.
                     */
                    const past = nowInDay != null && !dayNotStarted && nowInDay >= b.endMinutes;
                    /* Before the day begins the mark goes above all of it,
                       which is the truth: it is quarter to one, and the
                       morning below has not happened. */
                    const nowHere = nowInDay != null && (dayNotStarted
                      ? i === 0
                      : nowInDay >= b.startMinutes && nowInDay < b.endMinutes);
                    const marker = nowHere ? (
                      <View
                        style={s.nowLine}
                        accessibilityRole="text"
                        accessibilityLabel={`Now, ${formatClock(now.minutes)}`}
                      >
                        <View style={s.nowDot} />
                        <View style={s.nowRule} />
                        <Text style={[type.faint, { color: colors.amber }]}>
                          {formatClock(now.minutes)}
                        </Text>
                      </View>
                    ) : null;
                    /* By position rather than by clock. Both lists are built in
                       time order, so the nth placed block is the nth placement
                       by construction — where matching on `startMinutes` holds
                       only until two things share a minute. */
                    const p = b.kind === 'suggested'
                      ? shape.placements[
                        shape.blocks.slice(0, i).filter((x: DayBlock) => x.kind === 'suggested').length
                      ]
                      : undefined;

                    /* `flex: 1` because without it this sizes to its content
                       and the row it sits in has no width to give the text
                       column — which nothing noticed while every unplaced row
                       said "Yours" or "Work", and which cut the bedtime note
                       off mid-sentence the moment one of them had something
                       to say. */
                    /**
                     * A proposal is not a diary line, and it stopped being laid
                     * out like one.
                     *
                     * Both used to share a row: a fixed 96px of clock, then the
                     * label, then dots, then a chevron — which leaves a phone
                     * about 150px of column. "Walk somewhere new with the
                     * family, phones away" came out five lines tall and read as
                     * a wall. The facts of a day ("Work", "Yours") are short and
                     * belong beside their hour; a proposal is a sentence and
                     * gets the width of the card, with its hour above it as a
                     * caption.
                     */
                    const suggested = b.kind === 'suggested';
                    const face = suggested ? (
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[type.faint, { letterSpacing: 0.6 }]}>
                            {formatSpan(b.startMinutes, b.endMinutes)}
                          </Text>
                          {b.domains?.length ? (
                            <View style={{ flexDirection: 'row', gap: 3 }}>
                              {b.domains.slice(0, 3).map((d: string) => (
                                <DomainDot key={d} domain={d} size={7} />
                              ))}
                            </View>
                          ) : null}
                          <View style={{ flex: 1 }} />
                          {p ? (
                            <Ionicons
                              name={openBlock === p.key ? 'chevron-up' : 'chevron-down'}
                              size={14}
                              color={colors.textDim}
                            />
                          ) : null}
                        </View>
                        <Text style={[type.body, { color: colors.amber, fontWeight: '600' }]}>
                          {b.label}
                        </Text>
                        {b.note ? <Text style={type.faint}>{b.note}</Text> : null}
                      </View>
                    ) : (
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={[type.faint, s.dayTime]}>
                          {formatSpan(b.startMinutes, b.endMinutes)}
                        </Text>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[type.body, (b.kind === 'open' || b.kind === 'sleep') && type.dim]}>
                            {b.label}
                          </Text>
                          {b.note ? <Text style={type.faint}>{b.note}</Text> : null}
                        </View>
                        {b.domains?.length ? (
                          <View style={{ flexDirection: 'row', gap: 3 }}>
                            {b.domains.slice(0, 3).map((d: string) => (
                              <DomainDot key={d} domain={d} size={7} />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );

                    /* Only the placed things move or open. Work, sleep and the
                       hours that are already yours are facts about the day, and
                       a fact that slides under a finger is a toy. */
                    if (!p) {
                      /* Sleep is drawn faintly because it is the part of the
                         day nobody needs reminding of — unless something has
                         been kept against it, in which case fading the one
                         commitment on the row to 45% is the fix for the
                         seven o'clock bedtime undone by its own styling. */
                      const askHeld = b.kind === 'sleep' && alldayRows.length > 0;
                      const faded = b.kind === 'sleep' && !b.note && !askHeld;
                      return (
                        <React.Fragment key={key}>
                        {marker}
                        <View
                          style={[
                            s.dayRow,
                            faded && { opacity: 0.45 },
                            /* An hour that is over. Set back, never crossed
                               out — the day behind you is not a list of
                               failures, it is just the part that has been
                               lived. */
                            !faded && past && { opacity: 0.5 },
                            askHeld && { flexDirection: 'column', alignItems: 'stretch', gap: space(2) },
                          ]}
                        >
                          {face}
                          {/* The all-day habits, asked about once, here at the
                              day's edge. Held is a tap; silence is free — an
                              unanswered evening is not evidence of anything,
                              and no cross is ever drawn. */}
                          {askHeld ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginLeft: 96 + 10 }}>
                              {alldayRows.map((r: { id: string; title: string; done: boolean }) => (
                                <Pressable
                                  key={r.id}
                                  onPress={() => toggleHeld(r.id, r.done)}
                                  disabled={holdDay.isPending}
                                  hitSlop={6}
                                  accessibilityRole="button"
                                  aria-selected={r.done}
                                  accessibilityLabel={r.done ? `${r.title}, held today — tap to undo` : `${r.title} — held today?`}
                                  style={({ pressed }) => [
                                    s.heldChip,
                                    r.done && s.heldChipOn,
                                    pressed && { transform: [{ scale: 0.96 }] },
                                  ]}
                                >
                                  {r.done ? (
                                    <Ionicons name="checkmark" size={12} color={colors.green} />
                                  ) : null}
                                  <Text
                                    style={[
                                      type.faint,
                                      r.done && { color: colors.green, fontWeight: '600' },
                                    ]}
                                  >
                                    {r.done ? `${r.title} — held` : `${r.title} — held?`}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          ) : null}
                        </View>
                        </React.Fragment>
                      );
                    }

                    const open = openBlock === p.key;
                    /* From the record, not only from this session — a reload
                       used to forget and offer to add it a second time. */
                    const done = scheduled.includes(p.key) || onTheList.has(norm(p.action));
                    const mins = p.endMinutes - p.startMinutes;
                    /**
                     * Whether this block's hour is behind the clock.
                     *
                     * The day is drawn whole, so at ten at night the seven
                     * o'clock walk is still on it — and the button under it
                     * said "Add to today", which writes a mission due fifteen
                     * hours ago. It lands on the list already late, and the
                     * reader is holding a failure the app handed them.
                     *
                     * A rhythm goes to the next day it actually runs; anything
                     * else goes to tomorrow.
                     *
                     * Nothing on a day still ahead has gone: `nowInDay` is null
                     * there, and a number from today compared against tomorrow's
                     * hours would call the whole morning missed before it began.
                     */
                    const gone = passedSlot({
                      startMinutes: p.startMinutes,
                      nowMinutes: nowInDay ?? -1,
                      today: viewWeekday,
                      days: rhythmDaysFor(p.key),
                    });

                    return (
                      <React.Fragment key={key}>
                      {marker}
                      <DraggableBlock
                        block={b}
                        offset={p.nudgedBy}
                        onMove={(offset) => moveTo(p.key, offset, p.startMinutes - p.nudgedBy)}
                      >
                        {({ handlers, dragging, preview }) => (
                        /* Everything about this hour, on the hour itself.
                           The controls used to live in a second list below the
                           day, which meant reading a row, finding its twin,
                           and working on the copy — two places showing the
                           same thing, and the one you could touch was not the
                           one you were looking at. */
                        <View style={[
                          s.dayRow, s.dayRowOn,
                          { flexDirection: 'column', alignItems: 'stretch', gap: space(3) },
                          dragging && { borderColor: colors.amber },
                        ]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {/* The grip. Its only job is to be dragged, which
                                is what lets it take the finger the instant it
                                is touched without arguing with the tap or the
                                scroll. */}
                            <View {...handlers} style={s.grip}>
                              <Ionicons name="reorder-two-outline" size={16} color={colors.textDim} />
                            </View>
                            {/* The row that opens the editor reached assistive
                                tech as an unnamed div — the chevron implied a
                                control that was never announced as one. */}
                            <Pressable
                              style={{ flex: 1 }}
                              onPress={() => setOpenBlock(open ? null : p.key)}
                              accessibilityRole="button"
                              accessibilityState={{ expanded: open }}
                              accessibilityLabel={
                                open
                                  ? `${b.label} — close time options`
                                  : `${b.label}, ${formatSpan(b.startMinutes, b.endMinutes)} — change the time`
                              }
                            >
                              {face}
                            </Pressable>
                          </View>
                          {dragging && preview != null ? (
                            <Text style={[type.faint, { color: colors.amber, textAlign: 'center' }]}>
                              {formatClock(preview)} — let go to put it here
                            </Text>
                          ) : null}
                          {open ? (
                            /**
                             * One sentence, and both of its numbers can be
                             * changed where they are written.
                             *
                             * This was three stacked control groups — a labelled
                             * stepper, six duration chips wrapping onto two
                             * rows, and a button — about ten targets to set two
                             * values, in a layout that read as a settings form
                             * bolted under a calendar entry. It also taught two
                             * ways to do one thing and had to say so in words
                             * ("or drag it"), which is the tell that neither was
                             * obvious.
                             *
                             * Now the values are the interface: the hour and the
                             * length sit in the line that describes the plan, and
                             * the arrows adjust the number they sit beside.
                             * Dragging still works and is no longer explained —
                             * the grip says it, and the preview confirms it.
                             */
                            <View style={s.blockEdit}>
                              <View style={[s.editLine, tightEditor && s.editLineStacked]}>
                                <Stepper
                                  onLess={() => moveTo(p.key, p.nudgedBy - TIME_STEP, p.startMinutes - p.nudgedBy)}
                                  onMore={() => moveTo(p.key, p.nudgedBy + TIME_STEP, p.startMinutes - p.nudgedBy)}
                                  lessLabel="15 minutes earlier"
                                  moreLabel="15 minutes later"
                                  value={formatClock(p.startMinutes)}
                                />
                                {/* No connector word between the two pills.
                                    "for" read nicely but it was the 32px that
                                    tipped "7:15 am" and "1½ hours" onto two
                                    rows on an ordinary 375px phone — a
                                    conjunction that breaks the sentence it is
                                    joining has argued itself out of the job. A
                                    clock value beside a duration needs no help
                                    being read as one then the other. */}
                                {/* The engine sizes a proposal by what it costs
                                    to *start* — fifteen minutes for a call,
                                    because the barrier is picking up the phone
                                    and not the talking. Nobody rings their
                                    father for a quarter of an hour, and the day
                                    should hold what was really claimed. */}
                                <Stepper
                                  onLess={() => setDuration(p.key, LENGTHS[Math.max(0, lengthIndex(mins) - 1)])}
                                  onMore={() => setDuration(p.key, LENGTHS[Math.min(LENGTHS.length - 1, lengthIndex(mins) + 1)])}
                                  lessLabel="Shorter"
                                  moreLabel="Longer"
                                  atLess={lengthIndex(mins) === 0}
                                  atMore={lengthIndex(mins) === LENGTHS.length - 1}
                                  value={formatLength(mins)}
                                />
                              </View>
                              {/* The hour is a fact. Say it, and offer the
                                  next one that is actually available — a
                                  passed slot that still reads "Add to today"
                                  is the app asking somebody to agree to
                                  something that already cannot happen. No
                                  reproach in it: the sentence names the day
                                  it goes to, and that is all. */}
                              {gone.passed && !done && (
                                <Text style={[type.faint, { marginBottom: 4 }]}>
                                  {gone.when === 'tomorrow'
                                    ? 'That hour has gone for today. Put it on tomorrow instead.'
                                    : `That hour has gone for today. The next one this lands on is ${WEEKDAY_NAMES[gone.weekday]}.`}
                                </Text>
                              )}
                              <Button
                                kind={done ? 'ghost' : 'primary'}
                                disabled={done || scheduleBlock.isPending}
                                title={
                                  done
                                    ? 'On your list'
                                    : !showingToday
                                      ? 'Add to tomorrow'
                                      : gone.passed
                                        ? (gone.when === 'tomorrow'
                                          ? 'Add to tomorrow'
                                          : `Add to ${WEEKDAY_NAMES[gone.weekday]}`)
                                        : 'Add to today'
                                }
                                onPress={() => scheduleBlock.mutate({
                                  key: p.key,
                                  action: p.action,
                                  reason: p.reason,
                                  domains: p.domains,
                                  startMinutes: p.startMinutes,
                                  minutes: mins,
                                  /* The day being looked at, plus whatever the
                                     passed-hour rule adds on top of it. */
                                  daysAhead: dayOffset + gone.daysAhead,
                                })}
                              />
                            </View>
                          ) : null}
                        </View>
                        )}
                      </DraggableBlock>
                      </React.Fragment>
                    );
                  })}
                </View>

                {/* The controls, one row per placed thing.
                    The shape puts each where the evidence says it goes and the
                    reader knows what the evidence cannot: that the school run
                    is at four. Moving something is a correction to today, not
                    a fact about next Tuesday, so it lives and dies with the
                    day. "Put it on the list" is the only thing here that
                    writes anything down. */}
                <Text style={type.serif}>{shape.framingText}</Text>
                <Text style={type.faint}>{dayNotes.join('. ')}.</Text>
              </Card>

              {/* 1a. An hour that appeared.
                  Above the day card on purpose: when a meeting dies, the
                  typical Tuesday drawn below is no longer the question. */}
              <Card style={{ gap: space(3) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="flash-outline" size={14} color={colors.textDim} />
                  <Label>Something got cancelled</Label>
                </View>
                <Text style={type.dim}>
                  How long are you free? Where you are decides what is actually possible —
                  an hour at a desk is not an hour at home.
                </Text>

                {/* Offered, never taken. Reading a calendar costs a
                    permission dialog, and an app that demands one before it
                    has been useful gets the answer it deserves. */}
                {calendarSupported && (
                  <Pressable
                    onPress={async () => {
                      const state = await readFreeGaps({
                        workStartHour: me.workStartHour ?? 9,
                        workEndHour: me.workEndHour ?? 17,
                      });
                      setCalendar(state);
                      if (state.status === 'ready' && state.best) {
                        setFoundMinutes(Math.min(state.best.minutes, 120));
                      }
                      /* A found hour is about now, so the read is about today
                         — put the card back on today rather than drawing
                         today's bookings under tomorrow's heading. */
                      setDayOffset(0);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Find it from my calendar"
                    style={({ pressed }) => [s.chip, { alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[type.body, { color: colors.amber }]}>
                      Find it from my calendar
                    </Text>
                  </Pressable>
                )}
                {calendar?.status === 'denied' && (
                  <Text style={type.faint}>
                    No calendar access — no matter, the question below is the same one.
                  </Text>
                )}
                {calendar?.status === 'ready' && !calendar.best && (
                  <Text style={type.faint}>
                    Nothing free in your working day that is long enough to plan around.
                  </Text>
                )}
                {calendar?.status === 'ready' && calendar.best && (
                  <Text style={type.faint}>
                    Your longest free stretch today is {formatSpan(
                      calendar.best.startMinutes, calendar.best.endMinutes,
                    )}.
                  </Text>
                )}

                <View style={s.chips}>
                  {[15, 30, 60, 120].map((m) => {
                    const on = foundMinutes === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setFoundMinutes(on ? null : m)}
                        accessibilityRole="button"
                        accessibilityLabel={m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}
                        aria-selected={on}
                        style={[s.chip, on && s.chipOn]}
                      >
                        <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                          {m < 60 ? `${m}m` : `${m / 60}h`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {foundMinutes != null && (
                  <>
                    <View style={s.chips}>
                      {(Object.keys(SETTING_LABELS) as SettingKey[]).map((k) => {
                        const on = foundWhere === k;
                        return (
                          <Pressable
                            key={k}
                            onPress={() => setFoundWhere(k)}
                            accessibilityRole="button"
                            accessibilityLabel={SETTING_LABELS[k]}
                            aria-selected={on}
                            style={[s.chip, on && s.chipOn]}
                          >
                            <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                              {SETTING_LABELS[k]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/**
                      * Three things offered, and each one takeable.
                      *
                      * There was a single "Put it in my day" under all three,
                      * which answered a question nobody had asked — the
                      * reader has already decided *which* of them they want,
                      * and the one control could not hear it. A list of
                      * options with one button is a list pretending to be a
                      * choice.
                      *
                      * The row is the control now. Taking one writes it to
                      * the hour that just came free and leaves the other two
                      * standing, because a found hour that fits one of them
                      * may well fit another.
                      */}
                    {found?.primary ? (
                      <View style={{ gap: space(2) }}>
                        {[found.primary, ...found.alternates].map((opt, i) => {
                          const taken = scheduled.includes(opt.key) || onTheList.has(norm(opt.action));
                          return (
                            <Pressable
                              key={opt.key}
                              disabled={taken || scheduleBlock.isPending}
                              onPress={() => {
                                /* The hour is genuinely free now, so the day
                                   below should show it as free — and hold
                                   the thing that was just put into it. */
                                setFoundWindow(foundMinutes);
                                scheduleBlock.mutate({
                                  key: opt.key,
                                  action: opt.action,
                                  reason: opt.because,
                                  domains: [opt.domain],
                                  startMinutes: now.minutes,
                                  minutes: opt.minutes,
                                });
                              }}
                              accessibilityRole="button"
                              aria-selected={taken}
                              accessibilityLabel={taken
                                ? `${opt.action} — already in your day`
                                : `Put ${opt.action} in my day, ${opt.minutes} minutes`}
                              style={({ pressed }) => [
                                s.priorityRow,
                                s.foundOption,
                                i > 0 && !taken && { opacity: 0.75 },
                                taken && s.chipOn,
                                pressed && { opacity: 0.6 },
                              ]}
                            >
                              <DomainDot domain={opt.domain} size={i === 0 ? 10 : 8} />
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text
                                  style={i === 0
                                    ? [type.heading, { color: colors.amber }]
                                    : type.body}
                                  numberOfLines={2}
                                >
                                  {opt.action}
                                </Text>
                                {i === 0 && !!opt.because && (
                                  <Text style={type.faint}>{opt.because}</Text>
                                )}
                              </View>
                              <Text style={[type.faint, taken && { color: colors.amber }]}>
                                {taken ? 'in your day' : `${opt.minutes}m`}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={type.serif}>{found?.restNote}</Text>
                    )}

                    {/* Said out loud rather than silently demoted — the reader
                        should know the starved part of their life lost to the
                        room, not to the app's opinion of it. */}
                    {found?.ruledOut && (
                      <Text style={type.faint}>
                        {found.ruledOut.domain} is what is drifting most, but not from here —
                        {' '}{found.ruledOut.limits[0]}. It keeps its own hour later.
                      </Text>
                    )}

                    {/* The window itself, separately from what goes in it.
                        Not a one-way door: an hour marked free by mistake has
                        to come back out, and a cancelled meeting is sometimes
                        un-cancelled. Only worth offering once the hour is
                        actually drawn — before that the rows above are the
                        way in, and two buttons meaning almost the same thing
                        is how the single ambiguous one got here. */}
                    {foundWindow ? (
                      <Pressable
                        onPress={() => setFoundWindow(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Take the free hour back out of my day"
                        style={({ pressed }) => [
                          s.chip, { alignSelf: 'flex-start' }, pressed && { opacity: 0.6 },
                        ]}
                      >
                        <Text style={type.faint}>
                          That hour is drawn in your day — tap to take it out
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </Card>

              {/* 1b. The week the standing commitments run on.
                  A frequency raises a question a single day cannot answer —
                  three times a week, but which three — and this is the only
                  surface where the answer can be corrected. Ticks, never
                  crosses: a planned day that passed unused is drawn as an
                  ordinary empty box, because the week counts to the target
                  and missing a Tuesday is not a fact about the person. */}
              {weekRows.length > 0 && (
                <Card style={{ gap: space(3) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="repeat-outline" size={14} color={colors.textDim} />
                    <Label>The week your rhythms run on</Label>
                    <View style={{ flex: 1 }} />
                    {/* The one door to the full catalog. Rhythms are dealt one
                        at a time everywhere else, which is right for deciding
                        and useless for wondering — a person cannot want what
                        they have never seen. */}
                    <Pressable
                      onPress={() => router.push('/catalog')}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Browse the full catalog"
                      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[type.faint, { color: colors.amber }]}>browse all</Text>
                    </Pressable>
                  </View>

                  <View style={s.weekHead}>
                    <View style={{ flex: 1 }} />
                    {WEEK_COLUMNS.map((d, i) => (
                      <Text
                        key={`${d}-${i}`}
                        style={[
                          type.faint,
                          s.weekCellText,
                          d === todayWeekday && { color: colors.amber, fontWeight: '800' },
                        ]}
                      >
                        {WEEKDAY_INITIALS[d]}
                      </Text>
                    ))}
                  </View>

                  {weekRows.map((row) => (
                    <View key={row.key} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <DomainDot domain={row.domain} size={8} />
                        <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{row.title}</Text>
                        {/* The hour, and only when it was earned rather than
                            assumed. A catalog default said out loud reads as
                            a claim about this person that nothing supports. */}
                        {row.time.minutes != null && row.time.source !== 'catalog' && (
                          <Pressable
                            onPress={() => row.time.source === 'chosen' && clearRhythmHour(row.key)}
                            accessibilityRole={row.time.source === 'chosen' ? 'button' : undefined}
                            accessibilityLabel={
                              row.time.source === 'chosen'
                                ? `${row.title} at ${formatClock(row.time.minutes)}, tap to reset`
                                : undefined
                            }
                            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                          >
                            <Text style={[type.faint, { color: colors.amber }]}>
                              {formatClock(row.time.minutes)}
                              {row.time.source === 'chosen' ? ' ×' : ''}
                            </Text>
                          </Pressable>
                        )}
                        <Text style={type.faint}>
                          {row.doneThisWeek}/{row.perWeek}
                        </Text>
                      </View>
                      <View style={s.weekRow}>
                        <View style={{ flex: 1 }} />
                        {WEEK_COLUMNS.map((d, i) => {
                          const planned = row.days.includes(d);
                          const done = row.doneDays.includes(d);
                          const c = domainColor(row.domain);
                          return (
                            <Pressable
                              key={`${row.key}-${d}-${i}`}
                              onPress={() => toggleRhythmDay(row.key, d, row.days)}
                              accessibilityRole="button"
                              accessibilityLabel={`${row.title}, ${WEEKDAY_NAMES[d]}`}
                              aria-selected={planned}
                              style={({ pressed }) => [
                                s.weekCell,
                                planned && { borderColor: c, backgroundColor: alpha(c, 0.14) },
                                done && { backgroundColor: c, borderColor: c },
                                d === todayWeekday && !done && { borderColor: colors.amber },
                                pressed && { transform: [{ scale: 0.9 }] },
                              ]}
                            >
                              {done && <Ionicons name="checkmark" size={12} color={colors.bg} />}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}

                  {/* The last day is not removable in any meaningful sense —
                      a rhythm with no days is not a rhythm, and the due
                      check would read an empty week as "offer it every day",
                      which is the opposite of what the tap asked for. So
                      clearing a row hands it back to the engine, and the
                      copy says which of the two just happened. */}
                  <Text style={type.faint}>
                    Tap a day to move a rhythm; clear them all to hand it back to Priority.
                    Filled days are kept, outlined ones are where it is offered — the week
                    counts to the number, not to the boxes.
                    {weekRows.some((r) => r.basis === 'observed')
                      ? ' Some are the days you already use.'
                      : ''}
                    {weekRows.some((r) => r.basis === 'chosen')
                      ? ' Some you chose yourself.'
                      : ''}
                    {weekRows.some((r) => r.time.source === 'chosen')
                      ? ' An hour with a × beside it is one you moved — tap it to hand that back too.'
                      : weekRows.some((r) => r.time.source === 'observed')
                        ? ' An hour shown is where you actually keep it.'
                        : ''}
                  </Text>
                </Card>
              )}

              {/* 2. Weekly allocation */}
              <Card style={{ gap: space(3) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="pie-chart-outline" size={14} color={colors.textDim} />
                  {/* The old heading — "so nothing sits at zero" — described a
                      floor that is trivially met and was the least interesting
                      thing here. The card is about the distance between a
                      ranking and what has been set up against it. */}
                  <Label>What you ranked, against what you have set up</Label>
                </View>
                <RankableAllocation
                  allotments={rankedAllotments}
                  pending={reorderDomains.isPending}
                  onReorder={(order) => reorderDomains.mutate(order)}
                >
                {({ index, domainType, handlers, dragging }) => {
                  const a = rankedAllotments[index];
                  /* The committed bar is drawn inside the claimed one, on the
                     same scale, so the empty remainder IS the gap. Two bars
                     side by side would have made them look like two separate
                     facts rather than one measured against the other. */
                  const claimedPct = a.share;
                  const committedPct = a.hours > 0
                    ? Math.min(a.committedHours / a.hours, 1) * claimedPct
                    : 0;
                  return (
                    <View key={domainType} style={{ gap: 4, height: RANK_ROW_H }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <DomainDot domain={a.domainType} size={9} />
                        <Text style={[type.body, { flex: 1, textTransform: 'capitalize' }]}>{a.domainType}</Text>
                        <Text style={[type.dim, { fontWeight: '700' }]}>
                          {a.committedHours}
                          <Text style={type.faint}> of {a.hours}h</Text>
                        </Text>
                        {/* The grip. On its own surface for the reason the day
                            card's blocks have one — a row draggable everywhere
                            fights the scroll carrying the page. */}
                        <View
                          {...handlers}
                          accessibilityRole="adjustable"
                          accessibilityLabel={`${a.domainType}, ranked ${index + 1} of ${rankedAllotments.length}`}
                          accessibilityHint="Drag to change where this sits in your ranking"
                          accessibilityActions={[
                            { name: 'increment', label: 'Move up' },
                            { name: 'decrement', label: 'Move down' },
                          ]}
                          /* A drag is unusable with a switch or a screen
                             reader, so the same move is reachable as two
                             discrete actions on the same control. */
                          onAccessibilityAction={(e) => {
                            const to = e.nativeEvent.actionName === 'increment'
                              ? index - 1
                              : index + 1;
                            if (to < 0 || to >= rankedAllotments.length) return;
                            reorderDomains.mutate(moveItem(
                              rankedAllotments.map((x) => x.domainType), index, to,
                            ));
                          }}
                          style={{ paddingHorizontal: 4, paddingVertical: 2 }}
                        >
                          <Ionicons
                            name="reorder-two-outline"
                            size={16}
                            color={dragging ? colors.amber : colors.textFaint}
                          />
                        </View>
                      </View>
                      <View style={s.allocTrack}>
                        {/* What the ranking implies — the outline of the claim. */}
                        <View style={[s.allocFill, {
                          width: `${claimedPct}%`,
                          backgroundColor: domainColor(a.domainType),
                          opacity: 0.22,
                        }]} />
                        {/* What is actually set up, filled solid inside it.
                            A floor of 3px because half an hour against
                            fourteen renders about five pixels wide, and at
                            that size "barely any" and "none at all" look the
                            same — which is the one distinction this card
                            exists to draw. Nothing committed still draws
                            nothing. */}
                        {a.committedHours > 0 ? (
                          <View style={[s.allocFill, {
                            position: 'absolute',
                            left: 0,
                            width: `${committedPct}%`,
                            minWidth: 3,
                            backgroundColor: domainColor(a.domainType),
                          }]} />
                        ) : null}
                      </View>
                    </View>
                  );
                }}
                </RankableAllocation>
                {/*
                  Rows are a fixed height because the drag maps travel to
                  positions at a fixed rate, so anything of variable length
                  belongs outside them. A per-row note about rhythms of
                  unknown length was overflowing its row and landing on top of
                  the name below it — and it is a footnote about the app's own
                  blind spot rather than a fact about that domain, so it reads
                  better collected here anyway.
                */}
                {unmeasured > 0 ? (
                  <Text style={type.faint}>
                    {`${unmeasured} rhythm${unmeasured > 1 ? 's are' : ' is'} not counted above — nothing here knows how long ${unmeasured > 1 ? 'they take' : 'it takes'}.`}
                  </Text>
                ) : null}
                <Text style={type.faint}>{allocation.framing}</Text>
                {allocation.moveText ? (
                  <Text style={type.body}>{allocation.moveText}</Text>
                ) : null}
                <Text style={type.faint}>
                  Drag a row to change the order. The hours follow — this is the
                  ranking you gave at the start, and it is allowed to change.
                </Text>
              </Card>

              {/* 3. Season */}
              <Card accent={colors.amberSoft} style={{ gap: space(2) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="leaf-outline" size={14} color={colors.amber} />
                  <Label color={colors.amber}>This season's focus</Label>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <DomainDot domain={season.focusDomain} size={12} />
                  <Text style={[type.title, { textTransform: 'capitalize' }]}>{season.focusDomain}</Text>
                  <Text style={type.faint}>· next 90 days</Text>
                </View>
                <Text style={type.serif}>{season.framingText}</Text>
                <Button
                  title={`Open ${season.focusDomain}`}
                  small
                  kind="ghost"
                  onPress={() => router.push(`/domain/${season.focusDomain}`)}
                />
              </Card>
            </Section>
          )}

          <Section
            icon="pulse-outline"
            title="Health and energy"
            preview={hs.yearsHeld > 0
              ? `~${hs.yearsHeld}/${hs.potentialYearsGained} yrs held · ~${energy.peakHoursYours} sharp h/wk yours`
              : `~${hs.healthyYearsLeft} able years · ~${energy.peakHoursYours} sharp h/wk yours`}
          >
          {/* Healthspan — the years that actually matter */}
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="pulse-outline" size={14} color={colors.textDim} />
              <Label>Healthy years, not just years</Label>
            </View>
            {/* The headline is whichever number is currently the live one.
                ~55 never moves — it is the frame, and once it has been read
                once a card that only ever shows it stops being opened. The
                moment a rhythm is being kept there is a number that responds
                to what this person does, and that one takes the front. The
                frame is not lost: the sentence under it still opens with it. */}
            {hs.yearsHeld > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={[type.stat, { fontSize: 30, color: colors.green }]}>
                  ~{hs.yearsHeld}
                </Text>
                <Text style={type.dim}>
                  of the ~{hs.potentialYearsGained} rhythm years are yours
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={[type.stat, { fontSize: 30, color: colors.green }]}>~{hs.healthyYearsLeft}</Text>
                <Text style={type.dim}>years on the planning horizon</Text>
              </View>
            )}
            <Text style={type.serif}>{hs.framingText}</Text>

            {/* Four rhythms, each showing where this life actually stands on
                it — kept, slipping, or not started. The card used to pitch all
                four as hypotheticals to everyone, which meant it could not
                tell someone walking four times a week from someone doing
                nothing, and never credited the one they were keeping. */}
            <View style={{ gap: 9 }}>
              {hs.levers.map((l) => {
                const started = startedLevers.includes(l.key);
                const state = started ? 'new' : l.state;
                const tone = state === 'held' ? colors.green
                  : state === 'slipping' ? colors.amber : colors.textDim;
                return (
                  <View key={l.key} style={{ gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons
                        name={state === 'held' ? 'checkmark-circle'
                          : state === 'slipping' ? 'alert-circle-outline'
                            : state === 'new' ? 'ellipse-outline' : 'add-circle-outline'}
                        size={14}
                        color={tone}
                      />
                      {/* Their own name for the rhythm, where they gave it one
                          — "20-minute walk" is what they will recognise, not
                          "Zone-2 cardio". Social has no habit behind it, so it
                          keeps the canonical label and puts its count below. */}
                      <Text style={[type.dim, { flex: 1, color: state === 'open' ? colors.textDim : colors.text }]}>
                        {l.habitLabel && state !== 'open' && l.key !== 'social' ? l.habitLabel : l.label}
                      </Text>
                      {state === 'open' ? (
                        <Pressable
                          onPress={() => startLever.mutate({
                            key: l.key,
                            title: l.label,
                            target: l.key === 'strength' ? 2 : l.key === 'cardio' ? 4 : 5,
                          })}
                          disabled={startLever.isPending || l.key === 'social'}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Start it: ${l.label}`}
                          style={({ pressed }) => [
                            s.planChip,
                            (startLever.isPending || l.key === 'social') && { opacity: 0.45 },
                            pressed && { backgroundColor: colors.surfaceRaised, transform: [{ scale: 0.96 }] },
                          ]}
                        >
                          <Ionicons name="add" size={13} color={colors.amber} />
                          <Text style={{ color: colors.amber, fontWeight: '600', fontSize: 12 }}>Start it</Text>
                        </Pressable>
                      ) : (
                        <Chip label={`+${l.yearsGained} yrs`} color={tone} />
                      )}
                    </View>
                    {/* Their own numbers, said back plainly. This is the line
                        the old card had no way to write. */}
                    {state === 'slipping' && l.target != null ? (
                      <Text style={[type.faint, { marginLeft: 22, color: colors.amber }]}>
                        {l.key === 'social'
                          ? `${l.actual} of ${l.target} are within the cadence you set`
                          : `You set ${l.target} a week — you are at ${l.actual}`}
                      </Text>
                    ) : null}
                    {state === 'held' && l.key === 'social' ? (
                      <Text style={[type.faint, { marginLeft: 22 }]}>{l.habitLabel} are current</Text>
                    ) : null}
                    {/* A rhythm agreed to this morning is not graded this
                        afternoon. It says what it is: begun, not yet kept. */}
                    {state === 'new' ? (
                      <Text style={[type.faint, { marginLeft: 22, color: colors.green }]}>
                        {started ? 'Added to your habits — ' : ''}
                        {l.target != null ? `${l.target} a week, starting now` : 'Just started'}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* The ledger, then the point of it. The ledger alone was the
                whole close before, and it said the same shape of thing whether
                someone had started nothing or was keeping all four. */}
            <Text style={[type.faint, { color: hs.yearsHeld > 0 ? colors.green : colors.textDim }]}>
              {hs.yearsHeld > 0 ? `~${hs.yearsHeld} yours` : `~${hs.potentialYearsGained} on the table`}
              {hs.yearsSlipping > 0 ? ` · ~${hs.yearsSlipping} slipping` : ''}
              {hs.yearsNew > 0 ? ` · ~${hs.yearsNew} just begun` : ''}
              {hs.yearsOpen > 0 ? ` · ~${hs.yearsOpen} not started` : ''}.
            </Text>
            <Text style={[type.serif, hs.mode === 'holding' && { color: colors.text }]}>
              {hs.summaryText}
            </Text>
            {/* Where the numbers came from, named. This was a fixed sentence
                that could not say which country it meant, because nothing on
                this card knew — the horizon was a flat hundred for everybody.
                Now it is the reader's own, so the footnote both cites it and
                gives them the one word they might need to correct. */}
            <Text style={type.faint}>{hs.basisText}</Text>
            {me?.country ? (
              <Pressable
                onPress={() => router.push('/(tabs)/you')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Change the country these estimates use"
              >
                <Text style={[type.faint, { color: colors.amber }]}>
                  Not where you live? Change it in You →
                </Text>
              </Pressable>
            ) : null}
          </Card>

          {/* The windows, folded in from the section they used to be.
              "Windows open right now" was a card of population facts — every
              reader the same age saw the same four sentences and nothing to
              do about any of them. A closing window earns its place here by
              naming the standing rhythm that uses it while it is open; one
              already in the week says so instead of re-offering it. */}
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="fitness-outline" size={14} color={colors.textDim} />
              <Label>Windows still open</Label>
            </View>
            {windows.body.map((w) => {
              const use = w.rhythmKey ? rhythmByKey(w.rhythmKey) : null;
              const kept = use != null && heldRhythmKeys.has(use.key);
              const begun = startedLevers.includes(w.key);
              return (
                <View key={w.key} style={s.windowRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[type.heading, { flex: 1 }]}>{w.label}</Text>
                    {/* A closed window is drawn quiet, never absent. The card
                        used to filter these out and decayed with age — four
                        rows and three actions at 25, one row and nothing to
                        do at 71 — which handed the reader with the least
                        time to waste the emptiest card. The framing under a
                        closed one already says what the closure means now,
                        so the chip only has to state it without ceremony. */}
                    <Chip
                      label={w.state === 'closed' ? 'has passed'
                        : w.yearsLeft === null ? 'always open' : `~${w.yearsLeft} yrs`}
                      color={w.state === 'closed' ? colors.textDim
                        : w.yearsLeft === null ? colors.green : colors.amber}
                    />
                  </View>
                  <Text style={type.faint}>{w.framingText}</Text>
                  {use && (kept || begun) ? (
                    <Text style={[type.faint, { color: colors.green }]}>
                      {kept
                        ? 'Already in your week — this window is being used.'
                        : 'Added to your habits — begun, not yet kept.'}
                    </Text>
                  ) : use ? (
                    <Pressable
                      onPress={() => startLever.mutate({
                        key: w.key,
                        title: use.title,
                        target: use.perWeek,
                        domain: w.domainType ?? undefined,
                      })}
                      disabled={startLever.isPending}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Use it: ${use.title}`}
                      style={({ pressed }) => [
                        s.planChip,
                        { alignSelf: 'flex-start' },
                        startLever.isPending && { opacity: 0.45 },
                        pressed && { backgroundColor: colors.surfaceRaised, transform: [{ scale: 0.96 }] },
                      ]}
                    >
                      <Ionicons name="add" size={13} color={colors.amber} />
                      <Text style={{ color: colors.amber, fontWeight: '600', fontSize: 12 }}>
                        Use it: {use.title.toLowerCase()}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </Card>

          {/* Energy — the peak hours are the real budget */}
          <Card style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flash-outline" size={14} color={colors.textDim} />
              <Label>Where your sharp hours go</Label>
            </View>
            {/* The headline is the leftover, not the total. Twenty-one is the
                same for everyone; what is left after their working week is
                the only number on this card that belongs to them. */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              {/* Past a long enough working week the leftover is the floor
                  rather than a measurement, so it is shown as a bound. "~1"
                  read as though one hour had been counted. */}
              <Text style={[type.stat, { fontSize: 28, color: colors.amber }]}>
                {energy.workClaimsAll ? '<1' : `~${energy.peakHoursYours}`}
              </Text>
              <Text style={type.dim}>
                {energy.peakHoursAtWork > 0
                  ? `of ~${energy.peakHoursPerWeek} sharp hours a week are yours`
                  : 'peak-focus hours a week, none of them claimed'}
              </Text>
            </View>
            {energy.peakHoursAtWork > 0 ? (
              <View style={{ gap: 6 }}>
                <View style={s.energyBar}>
                  <View
                    style={[
                      s.energyBarFill,
                      { flex: energy.peakHoursAtWork, backgroundColor: alpha(colors.textDim, 0.45) },
                    ]}
                  />
                  <View style={[s.energyBarFill, { flex: energy.peakHoursYours, backgroundColor: colors.amber }]} />
                </View>
                <Text style={type.faint}>
                  ~{energy.peakHoursAtWork} claimed by your {me.workHoursPerWeek ?? 45}-hour week ·
                  {' '}~{energy.peakHoursYours} outside it
                </Text>
              </View>
            ) : null}
            <Text style={type.serif}>{energy.framingText}</Text>
            {/* What the sharp hours are already promised to.
                Without this the card is a population constant with a
                working-hours dial — true for everyone with a 45-hour week,
                and a thing nobody can act on. */}
            {energy.loadText ? (
              <Text style={[type.body, energy.overCommitted && { color: colors.rose }]}>
                {energy.loadText}
              </Text>
            ) : null}
            {/* Sleep moves this number more than anything else, which is
                exactly why the card is not allowed to claim it knows. */}
            <Text
              style={[
                type.faint,
                energy.sleepBasis === 'kept' && { color: colors.green },
                energy.sleepBasis === 'slipping' && { color: colors.rose },
              ]}
            >
              {energy.sleepText}
            </Text>
            {energy.sleepBasis === 'unknown' ? (
              <Text style={type.faint}>Set a sleep rhythm in the card above and this line starts telling you the truth.</Text>
            ) : null}
            <Text style={type.faint}>{energy.assumptions.join('. ')}.</Text>
          </Card>
          </Section>

          {/* The books-and-trips card that used to open this section is gone.
              It offered two fixed categories on a pace taken from a chip, one
              card above a tile that counts anything this person names on a
              pace their archive proves. Books and trips did not disappear with
              it — they are domain-sourced suggestions in `suggestCountables`
              now, offered to someone who rates growth or experiences highly
              and counts nothing in them, which is the only reader they were
              ever the right answer for. */}
          <Section
            icon="library-outline"
            title="The countable life"
            preview={countPreview || 'nothing counted yet'}
          >
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="phone-portrait-outline" size={14} color={colors.textDim} />
              <Label>The screen trade</Label>
            </View>
            <Text style={type.dim}>Hours on screens a day (outside work):</Text>
            {/* Nothing is pre-selected. The ring used to sit on 5h for every
                reader who had never touched this, and the sentence below read
                it back as theirs. */}
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              {[2, 3, 5, 7].map((n) => (
                <Pressable
                  key={n}
                  disabled={saveScreenHours.isPending}
                  onPress={() => {
                    setScreenDraft(n);
                    saveScreenHours.mutate(n, { onError: () => setScreenDraft(null) });
                  }}
                  style={[s.chip, screenHours === n && s.chipOn]}
                >
                  <Text style={[type.body, screenHours === n && { color: colors.amber, fontWeight: '700' }]}>{n}h</Text>
                </Pressable>
              ))}
            </View>
            <Text style={type.serif}>{screens.framingText}</Text>
            <Text style={type.faint}>{screens.assumptions.join('. ')}.</Text>
            {/* The door.
                The reclaim line was the only sentence on this card anyone
                could act on, and it ended in a full stop — a price quoted for
                an hour with nothing to spend it on. An hour handed back is
                only worth the thing it is handed back to, so the offer names
                one: a standing rhythm in whichever domain is furthest behind
                what this person asked of it. */}
            {reclaimed ? (
              <Text style={[type.faint, { color: colors.green }]}>
                The hour has somewhere to go — {reclaimed.perWeek} a week
                in <Text style={{ textTransform: 'capitalize' }}>{reclaimed.domainType}</Text>, starting now.
              </Text>
            ) : reclaimOffer ? (
                <Pressable
                  disabled={startRhythm.isPending}
                  onPress={() => {
                    setReclaimed({
                      domainType: reclaimOffer.domainType,
                      perWeek: reclaimOffer.rhythm.perWeek,
                    });
                    startRhythm.mutate({
                      domainType: reclaimOffer.domainType,
                      title: reclaimOffer.rhythm.title,
                      perWeek: reclaimOffer.rhythm.perWeek,
                    });
                  }}
                  style={({ pressed }) => [s.reclaimRow, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="arrow-undo-outline" size={14} color={colors.amber} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, { color: colors.amber }]}>{reclaimOffer.rhythm.title}</Text>
                    {/* Shares, not the raw shortfall. Shortfall is tenths of
                        a percentage point and rounded to a whole number it
                        said "the furthest behind — 0 points short", which is
                        both meaningless and self-contradicting. This is the
                        sentence `domainShares` exists to make sayable. */}
                    <Text style={type.faint}>
                      <Text style={{ textTransform: 'capitalize' }}>{reclaimOffer.domainType}</Text> gets{' '}
                      {reclaimOffer.share.received}% of your attention against the{' '}
                      {reclaimOffer.share.claimed}% you asked of it — the widest gap you have,
                      and no rhythm here yet.
                    </Text>
                  </View>
                  <Chip label={`${reclaimOffer.rhythm.perWeek}/wk`} />
                </Pressable>
            ) : null}
          </Card>

          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="infinite-outline" size={14} color={colors.textDim} />
              <Label>Count what counts</Label>
            </View>
            {/* The examples that used to sit here were the same three for
                everybody, and so is anything written into this string. What
                belongs to this person is below, drawn from what they told the
                app and what their archive already holds. */}
            <Text style={type.dim}>
              Your own rituals, at your own pace — and how many of each are still ahead.
            </Text>
            {/* One row per ritual, not one per spelling. The twins predate
                any check on new names, so grouping happens at read time —
                collapsing a display costs nothing, and deleting the wrong one
                of a pair costs moments. */}
            {dedupeRituals(savedCounts, (c) => countsLived?.[c.key]?.count ?? 0).map((group) => {
              const c = group.item;
              /* Both spellings' archives count toward the one row. */
              const merged = group.keys
                .map((k) => countsLived?.[k])
                .filter(Boolean) as CountsLived[];
              const lived: CountsLived | undefined = merged.length
                ? {
                  count: merged.reduce((n, m) => n + m.count, 0),
                  firstAt: merged.map((m) => m.firstAt).sort()[0],
                  lastAt: merged.map((m) => m.lastAt).sort().reverse()[0],
                  people: [...new Set(merged.flatMap((m) => m.people))],
                }
                : undefined;
              /* Who this ritual is with — the same derivation the collapsed
                 preview uses, so the two readings of one row agree. */
              const people = peopleForCount(c, lived);

              const cc = countable({
                age,
                country: me?.country,
                label: c.label,
                declaredPerYear: c.perYear,
                observation: lived ? { count: lived.count, firstAt: lived.firstAt } : undefined,
                people,
              });
              /* Both spellings match the same archive moments, so the same
                 memory arrives once per key. Counting it twice would tell
                 someone four things are waiting when two are. */
              const waiting = [...new Map(
                group.keys
                  .flatMap((k) => countCandidates?.[k] ?? [])
                  .filter((m: CandidateMemory) => !foldedIn.includes(m.id))
                  .map((m: CandidateMemory) => [m.id, m] as const),
              ).values()];

              return (
                <View key={c.key} style={s.windowRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[type.stat, { fontSize: 22, color: colors.amber }]}>~{cc.remaining}</Text>
                    <Text style={[type.heading, { flex: 1 }]}>more {c.label}</Text>
                    {cc.lived > 0 && <Chip label={`${cc.lived} kept`} color={colors.green} />}
                    {/* The pace, and where it came from. A rate the archive
                        proved reads differently from a button once tapped. */}
                    <Chip
                      label={cc.paceBasis === 'observed' ? `~${cc.observedPerYear}/yr real` : `${c.perYear}/yr aim`}
                      color={cc.paceBasis === 'observed' ? colors.green : undefined}
                    />
                  </View>
                  <Text style={type.faint}>{cc.detailText}</Text>
                  {/* Says what was folded together, rather than silently
                      dropping a name someone typed. */}
                  {group.aliasLabels.length > 0 ? (
                    <Text style={type.faint}>
                      Also saved as “{group.aliasLabels.join('”, “')}” — counted here as one.
                    </Text>
                  ) : null}
                  {/* The archive already holds moments that belong to this
                      ritual and were never tagged. Offered, never assumed. */}
                  {waiting.length > 0 ? (
                    <Pressable
                      disabled={foldIn.isPending}
                      onPress={() => {
                        setFoldedIn((p) => [...p, ...waiting.map((m: CandidateMemory) => m.id)]);
                        foldIn.mutate(
                          { countKey: c.key, memoryIds: waiting.map((m: CandidateMemory) => m.id) },
                          { onError: () => setFoldedIn((p) => p.filter((id) => !waiting.some((m: CandidateMemory) => m.id === id))) },
                        );
                      }}
                      style={({ pressed }) => [s.foldRow, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="git-merge-outline" size={13} color={colors.amber} />
                      <Text style={[type.faint, { flex: 1, color: colors.amber }]}>
                        {waiting.length} in your archive {waiting.length === 1 ? 'looks' : 'look'} like
                        this — “{waiting[0].title}”{waiting.length > 1 ? ` +${waiting.length - 1}` : ''}. Count {waiting.length === 1 ? 'it' : 'them'}?
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <View style={{ gap: space(2) }}>
              {/* Starters from this life, not from a list. The five that
                  used to sit here — ocean swims, Diwalis at home, concerts —
                  were the same five for everybody, while the app already held
                  what this person said mattered and with whom. Each one says
                  why it is being offered; tapping fills the whole row. */}
              {countSuggestions.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={type.faint}>From your own life:</Text>
                  {countSuggestions.map((sug) => (
                    <Pressable
                      key={sug.label}
                      onPress={() => {
                        setCountName(sug.label);
                        setCountPerYear(sug.perYear);
                        setCountPeople(sug.peopleIds);
                      }}
                      style={({ pressed }) => [s.suggestRow, pressed && { opacity: 0.7 }]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={type.body}>{sug.label}</Text>
                        <Text style={type.faint}>{sug.because}</Text>
                      </View>
                      <Chip label={`${sug.perYear}/yr`} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Input
                placeholder="Name the moment worth counting…"
                value={countName}
                onChangeText={setCountName}
              />
              {/* Says so before the twin exists, rather than showing two
                  identical rows afterwards and leaving them there. */}
              {dupe ? (
                <Text style={[type.faint, { color: dupe.match === 'same' ? colors.amber : colors.textDim }]}>
                  {dupe.match === 'same'
                    ? `You already count this as “${dupe.against.label}” — counting it again updates that row rather than adding a second.`
                    : `Close to “${dupe.against.label}”. Keep going if this is its own ritual.`}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
                <Text style={type.faint}>times a year:</Text>
                {[1, 2, 4, 12].map((n) => (
                  <Pressable key={n} onPress={() => setCountPerYear(n)} style={[s.chip, countPerYear === n && s.chipOn]}>
                    <Text style={[type.body, countPerYear === n && { color: colors.amber, fontWeight: '700' }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              {/* Who it is with. A road trip is a road trip; a road trip with
                  Amma and Appa is a number that changes what someone does
                  this year, and their window is the shorter one. */}
              {(relationships ?? []).length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={type.faint}>with (optional):</Text>
                  <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
                    {(relationships ?? []).slice(0, 8).map((r: any) => {
                      const on = countPeople.includes(r.id);
                      return (
                        <Pressable
                          key={r.id}
                          onPress={() => setCountPeople((p) => (
                            on ? p.filter((id) => id !== r.id) : [...p, r.id]
                          ))}
                          style={[s.chip, on && s.chipOn]}
                        >
                          <Text style={[type.faint, on && { color: colors.amber, fontWeight: '700' }]}>
                            {r.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              <Button
                title={dupe?.match === 'same' ? 'Update that count' : 'Count it'}
                small
                kind="ghost"
                onPress={() => addCount.mutate()}
                disabled={!countName.trim() || addCount.isPending}
              />
            </View>
          </Card>
          </Section>

        </>
      )}

      {/* "Your working window" used to be a Section of its own here, a card
          whose whole output was a countdown of working weeks. The years
          question survives inside Money and craft below, where tapping an
          answer visibly changes something; the countdown does not. */}

      {/* Money and craft stay outside the horizon block on purpose: they are
          the two calculators that still work when finite-time framing is off. */}
      <Section
        icon="trending-up-outline"
        title="Money and craft"
        // "by 60" carries the unit the bare number lacked: collapsed, this row
        // used to read "~2,323,391" of nothing in particular. The figure is in
        // whatever currency the person types below — same as the body copy.
        preview={`~${formatMoney(money.corpusStartingNow, me?.country)} by ${age + moreYears} · ${minutes} min/day`}
      >
      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="trending-up-outline" size={14} color={colors.textDim} />
          <Label>The compounding window</Label>
        </View>
        {/* The years question lives here rather than in a card of its own,
            because here the answer does something you can watch: the horizon
            of the compounding number is age plus this. Its old home printed
            "~480 working weeks left", which was a countdown wearing a
            question as a disguise. */}
        <Text style={type.dim}>
          {stillWorking
            ? 'How many more years do you want to work?'
            : 'How many more years do you want to keep adding to this?'}
        </Text>
        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
          {[5, 10, 15, 20, 25].map((y) => (
            <Pressable
              key={y}
              onPress={() => setMoreYears(y)}
              style={[s.chip, moreYears === y && s.chipOn]}
            >
              <Text style={[type.body, moreYears === y && { color: colors.amber, fontWeight: '700' }]}>
                {y} yrs
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
          <Text style={type.dim}>Investing</Text>
          <Input
            keyboardType="number-pad"
            value={monthly}
            onChangeText={(v) => setMonthly(v.replace(/[^0-9]/g, ''))}
            style={{ maxWidth: 110 }}
          />
          <Text style={type.dim}>a month until {age + moreYears}</Text>
        </View>
        <Text style={type.serif}>
          grows to ~{formatMoney(money.corpusStartingNow, me?.country)}.
        </Text>
        <Text style={[type.dim, { color: colors.green }]}>{money.framingText}</Text>
        {/* What the working years are for, in one quiet line — the part of
            the old card worth keeping. */}
        {/* "After that, N years that are almost entirely yours" is a sentence
            about a career ending. Said to somebody whose already has, it
            describes a wait they are not in. */}
        {!intensityOff && stillWorking && (
          <Text style={type.faint}>
            After that, ~{windows.career.postCareerYears} years that are almost
            entirely yours — the plan is for both halves.
          </Text>
        )}
        <Text style={type.faint}>{money.assumptions[0]}.</Text>
      </Card>

      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="color-palette-outline" size={14} color={colors.textDim} />
          <Label>The 30-minute calculator</Label>
        </View>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          {[15, 30, 60].map((m) => (
            <Pressable key={m} onPress={() => setMinutes(m)} style={[s.chip, minutes === m && s.chipOn]}>
              <Text style={[type.body, minutes === m && { color: colors.amber, fontWeight: '700' }]}>
                {m} min/day
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={type.serif}>{creative.framingText}</Text>
      </Card>
      </Section>

      {!intensityOff && peopleInsights.length > 0 && (
        <Section
          icon="people-outline"
          title="Your people, in numbers"
          preview={
            // Insights are not guaranteed to name a relationship; when none
            // do, count what we actually have rather than claiming 0 people.
            peopleCounted === 0
              ? `${peopleInsights.length} counted`
              : peopleCounted === 1 ? '1 person' : `${peopleCounted} people`
          }
        >
        <Card style={{ gap: space(3) }}>
          {peopleInsights.slice(0, 4).map((i) => (
            <View key={i.id} style={s.windowRow}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <DomainDot domain={i.domainType} size={9} />
                <Text style={[type.body, { flex: 1 }]}>{i.headline}</Text>
              </View>
              <Text style={type.faint}>{i.detail}</Text>
            </View>
          ))}
        </Card>
        </Section>
      )}

      <Text style={[type.faint, { textAlign: 'center', paddingHorizontal: space(4) }]}>
        {windows.assumptions.join(' · ')}
      </Text>

      {/* Record's home. This screen is a life in numbers and the Record is the
          same life in sentences, so one leads to the other — which is what
          lets the tab bar stop carrying both. It used to be reachable only
          from a card on Today that renders when something grew while you were
          away, i.e. sometimes. */}
      <Pressable
        onPress={() => router.push('/record')}
        accessibilityRole="button"
        accessibilityLabel="Read your record"
        style={({ pressed }) => [s.recordLink, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name="book-outline" size={19} color={colors.amber} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>Your record</Text>
          <Text style={type.faint}>
            Everything Priority knows about you, in plain sentences — generated now, never stored.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  /** A wrapping row of chips — the duration and where-you-are pickers. */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  /** One offered thing, with room for its reason under the action. */
  priorityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: space(3),
  },
  /** Seven equal columns, so a rhythm's days line up with the header
      letters no matter how long its title is. */
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekCellText: { width: 30, textAlign: 'center' },
  weekCell: {
    width: 30, height: 30, borderRadius: 8,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  /** Sharp hours claimed by work against the ones left over — the split is
      the point, so it is drawn once rather than described twice. */
  energyBar: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.lineSoft },
  energyBarFill: { height: 8 },
  /** A starter drawn from this life. Carries its reason, so it needs a row
      rather than a chip — a suggestion nobody can account for is the same
      failure as a number nobody can explain. */
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surfaceSunken,
  },
  /** One block of a day. The clock column is fixed-width so the rows read as
      a timetable rather than as ragged sentences. */
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7, paddingHorizontal: 9, borderRadius: 9,
  },
  dayRowOn: {
    borderWidth: 1, borderColor: alpha(colors.amber, 0.35),
    backgroundColor: alpha(colors.amber, 0.06),
  },
  dayTime: { width: 96 },
  /** The day-end question for a habit kept by nothing happening. */
  heldChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.line, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  heldChipOn: { borderColor: colors.green, backgroundColor: alpha(colors.green, 0.08) },
  /**
   * Two stated hours that disagree.
   *
   * Rose rather than brass: brass on this screen means "here is something to
   * do", and this is not a proposal — it is the app admitting it was given
   * two facts it cannot both draw. Quiet enough not to alarm, distinct enough
   * not to be read as one more note about how the day was built.
   */
  conflictNote: {
    gap: space(2), padding: space(3),
    borderWidth: 1, borderColor: alpha(colors.rose, 0.35), borderRadius: 12,
    backgroundColor: alpha(colors.rose, 0.06),
  },
  /**
   * "You are here", on a day drawn as a column rather than a timeline.
   *
   * The rows are not to scale — a two-hour block and a twenty-minute one are
   * the same height — so a line cannot be placed proportionally and has to sit
   * between rows instead. Which is enough: what the reader needs is which side
   * of now a row is on, and the exact hour is written on the line.
   */
  nowLine: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 5, paddingHorizontal: 2,
  },
  nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amber },
  nowRule: { flex: 1, height: 1, backgroundColor: alpha(colors.amber, 0.45) },
  /** One takeable option in the found-hour sheet — a row that is a control. */
  foundOption: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: space(2), paddingHorizontal: space(3),
  },
  /** One weekday in the working-week row. Square, so seven fit a narrow phone. */
  dayChip: {
    minWidth: 40, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 10,
  },
  /** The one surface on a block whose only meaning is "drag me". */
  grip: {
    width: 28, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch', marginLeft: -4,
  },
  /** The editor that opens inside a placed block. */
  blockEdit: {
    gap: space(3), paddingTop: space(3),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  /**
   * The one line the editor is: a time, the word "for", and a length.
   *
   * Sized to survive a 375px phone intact. Two pills at their comfortable
   * width plus the connector overflow it, and a wrapped line leaves "for"
   * stranded at the end of the first row pointing at nothing — so the pills
   * are trimmed to fit rather than allowed to break the sentence.
   */
  editLine: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, flexWrap: 'wrap',
  },
  /** The same two controls on a phone too narrow to hold them side by side. */
  editLineStacked: {
    flexDirection: 'column', alignItems: 'center', gap: space(2), flexWrap: 'nowrap',
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999,
    backgroundColor: alpha(colors.amber, 0.07),
    borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(colors.amber, 0.28),
  },
  stepArrow: {
    width: 28, height: 38, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  stepValue: {
    ...type.body,
    color: colors.amber, fontWeight: '700',
    minWidth: 56, textAlign: 'center',
    fontVariant: liningNums,
  },
  /** Where the reclaimed hour goes. The only pressable thing on the screen
      card, so it is drawn as an offer rather than as another line of data. */
  reclaimRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2,
    borderWidth: 1, borderColor: alpha(colors.amber, 0.35), borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  /** The archive offering itself to a count. An invitation, not a notice. */
  foldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
    borderWidth: 1, borderColor: alpha(colors.amber, 0.3), borderRadius: 12,
    paddingHorizontal: 11, paddingVertical: 9,
  },
  /** A closed section is a single tappable line, not a card — the cards
      inside are the content, and nesting one in another reads as clutter. */
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: space(3), paddingHorizontal: space(2),
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  /* Small and quiet. The action is the thing to read; this is the thing to
     press once you have decided, so it should not compete with it. */
  planChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: alpha(colors.amber, 0.35), borderRadius: 999,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  windowRow: {
    gap: 4, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: space(2),
  },
  recordLink: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    marginTop: space(2),
    borderWidth: 1, borderColor: colors.line, borderRadius: 14,
    backgroundColor: colors.surface, padding: space(3),
  },
  allocTrack: {
    height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden',
  },
  allocFill: { height: 6, borderRadius: 3 },
  lifeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
  },
  lifeCell: {
    width: '4.2%', aspectRatio: 1, borderRadius: 3,
    borderWidth: 1, borderColor: colors.line, backgroundColor: 'transparent',
  },
  lifeCellLived: {
    // Lived years are brass at half strength — present and countable, but
    // quieter than "now". The old border-tint token was too dark to read
    // as a fill against the night ground.
    backgroundColor: alpha(colors.amber, 0.45),
    borderColor: alpha(colors.amber, 0.55),
  },
  lifeCellNow: {
    backgroundColor: colors.amber, borderColor: colors.amber,
  },
  /**
   * The squares past the horizon this reader is counted on.
   *
   * Faded, never removed. They are the part of the frame the averages do not
   * reach, and the card directly below is an argument that they are reachable
   * — so the picture has to leave them on the page. A grid that simply stopped
   * at the country average would be making the opposite claim silently.
   */
  lifeCellBeyond: { borderColor: alpha(colors.line, 0.4) },
  /**
   * Where the country average falls. A quiet edge, not a barrier: it is one
   * cell's border, in the same brass as everything else on this tab, and it
   * carries no fill so it never reads as a stopping point.
   */
  lifeCellAverage: { borderColor: colors.textDim, borderWidth: 1.5 },
  // A year with recorded life reads as openable; the current year still wins.
  lifeCellHasEvents: { borderColor: colors.amber },
  lifeCellOpen: { borderColor: colors.text, borderWidth: 1.5 },
  lifeCellHit: { width: '4.2%', aspectRatio: 1 },
  /** Same square, but filling a parent that already owns the width. */
  lifeCellFill: {
    width: '100%', height: '100%', borderRadius: 3,
    borderWidth: 1, borderColor: colors.line, backgroundColor: 'transparent',
  },
});
