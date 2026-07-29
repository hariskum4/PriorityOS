import React, { useState } from 'react';
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
  domainsCovered,
  weeklyAllocation,
  healthspan,
  energyBudget,
  suggestSeason,
  PLANNING_HORIZON_AGE,
} from '@priority/scoring-engine';
import { api } from '@/services/api';
import { useRefresh } from '@/hooks/useRefresh';
import { Button, Card, Chip, DomainDot, Input, Label } from '@/components/ui';
import { YearGrid } from '@/components/YearGrid';
import { colors, type, space, domainColor, alpha } from '@/theme';

/**
 * Time Reality — the user's own finite windows, computed live from their
 * onboarding facts. Everything is a planning lens: numbers move the
 * moment patterns move, and the whole tab respects insightIntensity=off.
 */

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
  const neglected = activeDomains
    .filter((d: any) => d.neglectRisk >= 40 || d.importance - d.attention >= 25)
    .map((d: any) => d.domainType);
  const stacks = suggestStacks(neglected.length ? neglected : activeDomains.map((d: any) => d.domainType), 3);
  const stackReach = domainsCovered(stacks);
  const allocation = weeklyAllocation(
    windows.freeTime.freeHoursPerWeek,
    activeDomains.map((d: any) => ({ domainType: d.domainType, importance: d.importance })),
  );
  const season = suggestSeason(
    activeDomains.map((d: any) => ({ domainType: d.domainType, importance: d.importance, neglectRisk: d.neglectRisk })),
  );
  const hs = healthspan(age);
  const energy = energyBudget(age, moreYears);

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
              preview={`${stacks.length} moves · ${stackReach.length} domains`}
            >
              <Text style={type.dim}>
                You can't buy separate hours for eight lives. You steal them — one hour, two domains — and you don't fire everything at once.
              </Text>

              {/* 1. Time-stacking */}
              <Card style={{ gap: space(3) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="git-merge-outline" size={14} color={colors.textDim} />
                  <Label>Steal the time — one action, two domains</Label>
                </View>
                {stacks.map((st) => (
                  <View key={st.key} style={s.windowRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Text style={[type.body, { flex: 1, fontWeight: '600' }]}>{st.action}</Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {st.domains.map((d) => <DomainDot key={d} domain={d} size={9} />)}
                      </View>
                    </View>
                    <Text style={type.faint}>{st.framing}</Text>
                  </View>
                ))}
                <Text style={[type.faint, { color: colors.green }]}>
                  These {stacks.length} actions alone touch {stackReach.length} of your life domains.
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
            preview={`~${hs.healthyYearsLeft} able years · ~${energy.peakHoursPerWeek} sharp h/wk`}
          >
          {/* Healthspan — the years that actually matter */}
          <Card style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="pulse-outline" size={14} color={colors.textDim} />
              <Label>Healthy years, not just years</Label>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={[type.stat, { fontSize: 30, color: colors.green }]}>~{hs.healthyYearsLeft}</Text>
              <Text style={type.dim}>fully able years ahead</Text>
            </View>
            <Text style={type.serif}>{hs.framingText}</Text>
            <View style={{ gap: 6 }}>
              {hs.levers.map((l) => (
                <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="add-circle-outline" size={14} color={colors.green} />
                  <Text style={[type.dim, { flex: 1 }]}>{l.label}</Text>
                  <Chip label={`+${l.yearsGained} yrs`} color={colors.green} />
                </View>
              ))}
            </View>
            <Text style={[type.faint, { color: colors.green }]}>
              Together, up to ~{hs.potentialYearsGained} more good years — the window widens when you push on it.
            </Text>
          </Card>

          {/* Energy — the peak hours are the real budget */}
          <Card style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flash-outline" size={14} color={colors.textDim} />
              <Label>Where your sharp hours go</Label>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={[type.stat, { fontSize: 28, color: colors.amber }]}>~{energy.peakHoursPerWeek}</Text>
              <Text style={type.dim}>peak-focus hours a week</Text>
            </View>
            <Text style={type.serif}>{energy.framingText}</Text>
            <Text style={type.faint}>{energy.assumptions[1]}.</Text>
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
  /** A closed section is a single tappable line, not a card — the cards
      inside are the content, and nesting one in another reads as clutter. */
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: space(3), paddingHorizontal: space(2),
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
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
