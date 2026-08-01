import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  lifeWindows,
  lifeInWeeks,
  booksRemaining,
  tripsRemaining,
  annualMoments,
  customCountRemaining,
  screenTrade,
  estimateCostOfWaiting,
  estimateCreativeCompounding,
  suggestStacks,
  shortfallsCovered,
  domainShares,
  weeklyAllocation,
  healthspan,
  energyBudget,
  suggestSeason,
  classifyLever,
  PLANNING_HORIZON_AGE,
  type StackSuggestion,
  type LeverSignal,
} from '@priority/scoring-engine';
import { api } from '@/services/api';
import { useRefresh } from '@/hooks/useRefresh';
import { Button, Card, Chip, DomainDot, ErrorNote, Input, Label } from '@/components/ui';
import { YearGrid } from '@/components/YearGrid';
import { colors, type, space, domainColor, alpha } from '@/theme';

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

function Big({ value, unit, caption }: { value: string; unit: string; caption: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={[type.stat, { fontSize: 30, color: colors.amber }]}>{value}</Text>
      <Text style={[type.faint, { fontWeight: '600' }]}>{unit}</Text>
      <Text style={[type.faint, { textAlign: 'center', fontSize: 10 }]}>{caption}</Text>
    </View>
  );
}

export default function TimeReality() {
  const qc = useQueryClient();
  const router = useRouter();
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
    mutationFn: (l: { key: string; title: string; target: number }) =>
      api('/habits', {
        method: 'POST',
        body: {
          title: l.title,
          domainType: l.key === 'social' ? 'friends' : 'health',
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

  const [moreYears, setMoreYears] = useState<number>(10);
  const [monthly, setMonthly] = useState('10000');
  const [minutes, setMinutes] = useState<number>(30);
  const [booksPerYear, setBooksPerYear] = useState<number>(12);
  const [tripsPerYear, setTripsPerYear] = useState<number>(2);
  const [screenHours, setScreenHours] = useState<number>(5);

  // Custom counts — the user's own rituals, persisted as onboarding answers.
  const { data: answers } = useQuery({
    queryKey: ['onboarding-answers'],
    queryFn: () => api<any[]>('/onboarding/answers'),
  });
  const { data: countsLived } = useQuery({
    queryKey: ['memories-counts'],
    queryFn: () => api<Record<string, number>>('/memories/counts-summary'),
  });
  const [countName, setCountName] = useState('');
  const [countPerYear, setCountPerYear] = useState<number>(1);
  const savedCounts = (answers ?? [])
    .filter((a) => a.section === 'counts' && a.value?.label)
    .map((a) => ({ ...(a.value as { label: string; perYear: number }), key: a.key as string }));
  const addCount = useMutation({
    mutationFn: () =>
      api('/onboarding/answers', {
        method: 'POST',
        body: {
          answers: [{
            section: 'counts',
            key: countName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40),
            value: { label: countName.trim(), perYear: countPerYear },
          }],
        },
      }),
    onSuccess: () => {
      setCountName('');
      qc.invalidateQueries({ queryKey: ['onboarding-answers'] });
    },
  });

  const { refreshing, onRefresh } = useRefresh();

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
  });
  const money = estimateCostOfWaiting({
    monthlyAmount: parseInt(monthly, 10) || 0,
    currentAge: age,
    targetAge: age + moreYears,
  });
  const creative = estimateCreativeCompounding(minutes);
  const weeks = lifeInWeeks(age);
  const books = booksRemaining(age, booksPerYear);
  const trips = tripsRemaining(age, tripsPerYear);
  const moments = annualMoments(age);
  const screens = screenTrade(age, screenHours);
  const peopleInsights = (insights ?? []).filter((i) =>
    ['visits_remaining', 'childhood_windows', 'calls_per_year'].includes(i.kind),
  );

  // "Fit it all in" — the synthesis layer.
  const activeDomains = (dashboard?.domains ?? []).filter((d: any) => d.importance > 0);

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
  ]);
  /* Anything already agreed to is gone from here, whether or not the server
     has caught up — the list is what is still on offer, never a history. */
  const offered: StackSuggestion[] = craftedStacks?.stacks?.length
    ? craftedStacks.stacks
    : localStacks;
  const stacks: StackSuggestion[] = offered.filter(
    (st: StackSuggestion) => !planned.includes(st.action),
  );
  /** What these moves would actually feed — not merely touch. */
  const stackHelps = craftedStacks?.stacks?.length
    ? craftedStacks.helps ?? []
    : shortfallsCovered(localStacks);
  const allocation = weeklyAllocation(
    windows.freeTime.freeHoursPerWeek,
    activeDomains.map((d: any) => ({ domainType: d.domainType, importance: d.importance })),
  );
  const season = suggestSeason(
    activeDomains.map((d: any) => ({ domainType: d.domainType, importance: d.importance, neglectRisk: d.neglectRisk })),
  );

  const hs = healthspan(age, leverSignals);
  /* The sharp-hours number is only worth showing if it is theirs, so it is
     built from the two things actually known about them: the working week
     they gave at onboarding, and where they stand on protecting sleep. */
  const sleepLever = hs.levers.find((l) => l.key === 'sleep');
  const energy = energyBudget({
    workHoursPerWeek: me.workHoursPerWeek ?? undefined,
    plannedWorkYearsMore: moreYears,
    sleep: sleepLever?.state,
    sleepLabel: sleepLever?.habitLabel,
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
          {/* THE LIFE TILE — the headline number, first thing seen. The
              horizon is generous (100 years, not a countdown to 80) and
              moves as you age: past 90 it simply extends past 100. */}
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="grid-outline" size={14} color={colors.textDim} />
              <Label>Your life in years</Label>
            </View>
            <View style={s.lifeGrid}>
              {Array.from({ length: weeks.yearsLived + weeks.yearsAhead }).map((_, i) => {
                // Cell i is the year the person turned i, so it maps to a real
                // calendar year and can be opened.
                const calendarYear = birthYear != null ? birthYear + i : null;
                const lived = i <= weeks.yearsLived;
                const hasEvents = calendarYear != null && activeYears.includes(calendarYear);
                const isOpen = calendarYear != null && calendarYear === openYear;
                /* `sized` decides who owns the 4.2% width. A tappable year puts
                   it on the Pressable and lets the square fill it — nesting two
                   percentage widths collapses the inner one to nothing. */
                const cell = (sized: boolean) => (
                  <View
                    style={[
                      sized ? s.lifeCell : s.lifeCellFill,
                      i < weeks.yearsLived && s.lifeCellLived,
                      i === weeks.yearsLived && s.lifeCellNow,
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
            <Text style={type.faint}>
              Each square is a year on a {PLANNING_HORIZON_AGE}-year horizon — generous on purpose, and it
              extends further the closer you get. Filled ones are lived; the bright one is now —
              {' '}{weeks.weeksLived.toLocaleString()} weeks in, ~{weeks.weeksAhead.toLocaleString()} ahead.
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
                  caption={`on a ${PLANNING_HORIZON_AGE}-year horizon`}
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

              {/* 2. Weekly allocation */}
              <Card style={{ gap: space(3) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="pie-chart-outline" size={14} color={colors.textDim} />
                  <Label>Your week, so nothing sits at zero</Label>
                </View>
                {allocation.allotments.map((a) => (
                  <View key={a.domainType} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <DomainDot domain={a.domainType} size={9} />
                      <Text style={[type.body, { flex: 1, textTransform: 'capitalize' }]}>{a.domainType}</Text>
                      <Text style={[type.dim, { fontWeight: '700' }]}>{a.hours}h</Text>
                    </View>
                    <View style={s.allocTrack}>
                      <View style={[s.allocFill, { width: `${a.share}%`, backgroundColor: domainColor(a.domainType) }]} />
                    </View>
                  </View>
                ))}
                <Text style={type.faint}>{allocation.framing}</Text>
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
            <Text style={type.faint}>
              These are population estimates from the research on compressing illness into fewer
              years — not a prediction about you. What is yours is which ones you keep.
            </Text>
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
              <Text style={[type.stat, { fontSize: 28, color: colors.amber }]}>~{energy.peakHoursYours}</Text>
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
                  {' '}~{energy.peakHoursYours} for everything you chose
                </Text>
              </View>
            ) : null}
            <Text style={type.serif}>{energy.framingText}</Text>
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

          <Section
            icon="library-outline"
            title="The countable life"
            preview={`~${books.remaining} books · ~${trips.remaining} trips`}
          >
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="library-outline" size={14} color={colors.textDim} />
              <Label>Books, trips, and what else is countable</Label>
            </View>
            <Text style={type.dim}>Books a year:</Text>
            <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
              {[6, 12, 26, 52].map((n) => (
                <Pressable key={n} onPress={() => setBooksPerYear(n)} style={[s.chip, booksPerYear === n && s.chipOn]}>
                  <Text style={[type.body, booksPerYear === n && { color: colors.amber, fontWeight: '700' }]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={type.serif}>{books.framingText}</Text>
            <Text style={type.dim}>Real trips a year:</Text>
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              {[1, 2, 4, 6].map((n) => (
                <Pressable key={n} onPress={() => setTripsPerYear(n)} style={[s.chip, tripsPerYear === n && s.chipOn]}>
                  <Text style={[type.body, tripsPerYear === n && { color: colors.amber, fontWeight: '700' }]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={type.serif}>{trips.framingText}</Text>
            <View style={s.momentsRow}>
              <Text style={type.faint}>
                Also ahead at this horizon: ~{moments.summers} summers · ~{moments.birthdays} birthdays · ~{moments.fullMoons} full moons.
              </Text>
            </View>
          </Card>

          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="phone-portrait-outline" size={14} color={colors.textDim} />
              <Label>The screen trade</Label>
            </View>
            <Text style={type.dim}>Hours on screens a day (outside work):</Text>
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              {[2, 3, 5, 7].map((n) => (
                <Pressable key={n} onPress={() => setScreenHours(n)} style={[s.chip, screenHours === n && s.chipOn]}>
                  <Text style={[type.body, screenHours === n && { color: colors.amber, fontWeight: '700' }]}>{n}h</Text>
                </Pressable>
              ))}
            </View>
            <Text style={type.serif}>{screens.framingText}</Text>
            <Text style={type.faint}>{screens.assumptions[1]}.</Text>
          </Card>

          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="infinite-outline" size={14} color={colors.textDim} />
              <Label>Count what counts</Label>
            </View>
            <Text style={type.dim}>
              Your own ritual, your own pace — ocean swims, Diwalis at home, treks with an old friend.
            </Text>
            {savedCounts.map((c) => {
              const cc = customCountRemaining(age, c.label, c.perYear);
              const lived = countsLived?.[c.key] ?? 0;
              return (
                <View key={c.label} style={s.windowRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[type.stat, { fontSize: 22, color: colors.amber }]}>~{cc.remaining}</Text>
                    <Text style={[type.heading, { flex: 1 }]}>more {c.label}</Text>
                    {lived > 0 && <Chip label={`${lived} kept`} color={colors.green} />}
                    <Chip label={`${c.perYear}/yr`} />
                  </View>
                  <Text style={type.faint}>
                    {cc.framingText}
                    {lived > 0 ? ` ${lived} already in your archive.` : ''}
                  </Text>
                </View>
              );
            })}
            <View style={{ gap: space(2) }}>
              <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
                {['ocean swims', 'Diwalis at home', 'concerts', 'treks', 'movie nights with the kids'].map((sug) => (
                  <Pressable key={sug} onPress={() => setCountName(sug)} style={s.chip}>
                    <Text style={type.faint}>{sug}</Text>
                  </Pressable>
                ))}
              </View>
              <Input
                placeholder="Name the moment worth counting…"
                value={countName}
                onChangeText={setCountName}
              />
              <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
                <Text style={type.faint}>times a year:</Text>
                {[1, 2, 4, 12].map((n) => (
                  <Pressable key={n} onPress={() => setCountPerYear(n)} style={[s.chip, countPerYear === n && s.chipOn]}>
                    <Text style={[type.body, countPerYear === n && { color: colors.amber, fontWeight: '700' }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              <Button
                title="Count it"
                small
                kind="ghost"
                onPress={() => addCount.mutate()}
                disabled={!countName.trim() || addCount.isPending}
              />
            </View>
          </Card>
          </Section>

          <Section
            icon="briefcase-outline"
            title="Your working window"
            preview={`~${windows.career.workingWeeksLeft} working weeks`}
          >
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="briefcase-outline" size={14} color={colors.textDim} />
              <Label>How long you plan to work</Label>
            </View>
            <Text style={type.dim}>How many more years do you want to work?</Text>
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
            <Text style={type.serif}>{windows.career.framingText}</Text>
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <Chip label={`~${windows.career.workingWeeksLeft} working weeks`} color={colors.blue} />
              <Chip label={`then ~${windows.career.postCareerYears} free years`} color={colors.green} />
            </View>
          </Card>
          </Section>

          <Section
            icon="fitness-outline"
            title="Windows open right now"
            preview={`${windows.body.length} still open`}
          >
          <Card style={{ gap: space(2) }}>
            {windows.body.map((w) => (
              <View key={w.key} style={s.windowRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[type.heading, { flex: 1 }]}>{w.label}</Text>
                  <Chip
                    label={w.yearsLeft === null ? 'always open' : `~${w.yearsLeft} yrs`}
                    color={w.yearsLeft === null ? colors.green : colors.amber}
                  />
                </View>
                <Text style={type.faint}>{w.framingText}</Text>
              </View>
            ))}
          </Card>
          </Section>
        </>
      )}

      {/* Money and craft stay outside the horizon block on purpose: they are
          the two calculators that still work when finite-time framing is off. */}
      <Section
        icon="trending-up-outline"
        title="Money and craft"
        preview={`~${money.corpusStartingNow.toLocaleString()} · ${minutes} min/day`}
      >
      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="trending-up-outline" size={14} color={colors.textDim} />
          <Label>The compounding window</Label>
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
          grows to ~{money.corpusStartingNow.toLocaleString()}.
        </Text>
        <Text style={[type.dim, { color: colors.green }]}>{money.framingText}</Text>
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
          preview={`${peopleInsights.length} counted`}
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
  /** Sharp hours claimed by work against the ones left over — the split is
      the point, so it is drawn once rather than described twice. */
  energyBar: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.lineSoft },
  energyBarFill: { height: 8 },
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
  // A year with recorded life reads as openable; the current year still wins.
  lifeCellHasEvents: { borderColor: colors.amber },
  lifeCellOpen: { borderColor: colors.text, borderWidth: 1.5 },
  lifeCellHit: { width: '4.2%', aspectRatio: 1 },
  /** Same square, but filling a parent that already owns the width. */
  lifeCellFill: {
    width: '100%', height: '100%', borderRadius: 3,
    borderWidth: 1, borderColor: colors.line, backgroundColor: 'transparent',
  },
  momentsRow: {
    borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: space(2),
  },
});
