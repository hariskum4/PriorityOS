/**
 * Today — Observatory direction 001.
 *
 * Same engine, same mutations, same numbers as before; a different way of
 * being read. The sky is the hero and the menu: tap a star and the read-out
 * strip and Now Card retune to that domain. Everything below the fold is
 * support, kept quiet.
 *
 * Tokens come from `src/observatory.ts`, which no other tab imports — this
 * screen can be reverted with a single `git checkout` without touching the
 * rest of the app.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, Animated, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { tinyStep, lifeAlignment, cadenceDays } from '@priority/scoring-engine';
import { useRouter } from 'expo-router';
import { useMemoryDraft } from '@/store/memoryDraft';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import { levelProgress } from '@/theme';
import { DomainType, DOMAIN_TO_LIFE } from '@priority/types';
import { obs, obsDomain, obsType, obsSky, obsGreeting, alpha } from '@/observatory';
import { Constellation, driftOf, mostAdrift } from '@/components/Constellation';

function relativeDays(iso: string | Date): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/**
 * Alignment now comes from the kernel.
 *
 * The version that lived here subtracted an importance-weighted average gap
 * from 100 and returned 98.8 for a life with `purpose` declared 12 and lived
 * 0 — it weighted the gap by the very number that is smallest where neglect
 * is worst, and scored over-attention as perfect. `lifeAlignment` compares
 * shares instead. See packages/scoring-engine/src/alignment.ts.
 */

/** Rises and settles on a spring. The screen's only entrance motion. */
function Rise({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, {
      toValue: 1, delay, damping: 18, stiffness: 110, mass: 0.9,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function Tick({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[obsType.tick, color ? { color } : null]}>{children}</Text>;
}

/** The Now marker's slow blink — a pilot light, not an alert. */
function PulseDot({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(v, { toValue: 0.45, duration: 1700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, opacity: v }}
    />
  );
}

/**
 * Twelve weeks of one domain, as a line.
 *
 * The read-out says where a domain stands; this says where it has been. Drawn
 * without axes or numbers on purpose — the shape is the whole message, and a
 * gridded chart on this screen would turn a life into a dashboard.
 */
function Trail({ points, color, width = 96, height = 22 }: {
  points: number[]; color: string; width?: number; height?: number;
}) {
  if (points.length < 3) return null;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = Math.max(6, hi - lo);          // a flat line stays flat, not jagged
  const stepX = width / (points.length - 1);
  const y = (v: number) => height - ((v - lo) / span) * height;
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const rising = points[points.length - 1] >= points[0];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={1.2} fill="none" opacity={rising ? 0.9 : 0.5} />
      <SvgCircle cx={width} cy={y(points[points.length - 1])} r={1.8} fill={color} />
    </Svg>
  );
}

/**
 * A door the Life OS is holding open.
 *
 * Everything an engine proposes arrives in this shape: the action, the honest
 * reason it was raised, and the laughably small version for the days the action
 * is too big. Two ways out — take it, or decline it without explaining.
 */
function ProposalCard({ proposal, onAccept, onDismiss }: {
  proposal: any;
  onAccept: () => void;
  onDismiss: (forever?: boolean) => void;
}) {
  const color = proposal.domain ? obsDomain(proposal.domain) : obs.brass;
  const [showTiny, setShowTiny] = useState(false);
  return (
    <View style={[s.proposal, { borderColor: alpha(color, 0.3) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[s.orb, { backgroundColor: color, marginTop: 0 }]} />
        <Tick color={color}>
          {proposal.engine}
          {proposal.effortMinutes ? ` · ${proposal.effortMinutes} min` : ''}
        </Tick>
      </View>
      <Text style={[obsType.strong, { marginTop: 9, fontSize: 15.5 }]}>{proposal.action}</Text>
      <Text style={[obsType.dim, { marginTop: 5 }]}>{proposal.because}</Text>

      {showTiny && proposal.tinyStep ? (
        <Text style={[obsType.dim, { marginTop: 8, color: obs.ink }]}>{proposal.tinyStep}</Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 13, alignItems: 'center' }}>
        <Pressable
          onPress={onAccept}
          style={({ pressed }) => [s.pBtn, { backgroundColor: color }, pressed && { opacity: 0.85 }]}
        >
          <Text style={{ color: obs.onBrass, fontWeight: '700', fontSize: 13.5 }}>I'll do it</Text>
        </Pressable>
        <Pressable
          onPress={() => onDismiss(false)}
          style={({ pressed }) => [s.pBtnGhost, pressed && { opacity: 0.6 }]}
        >
          <Text style={{ color: obs.inkDim, fontWeight: '600', fontSize: 13.5 }}>Not this</Text>
        </Pressable>
        {proposal.tinyStep ? (
          <Pressable onPress={() => setShowTiny((v) => !v)} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Tick>{showTiny ? 'hide' : 'too big?'}</Tick>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A quiet aside — coloured orb, measured kicker, one sentence. The deck's
 * mini-card: enough to notice, never enough to demand.
 */
function Mini({ color, kicker, children }: {
  color: string; kicker: string; children: React.ReactNode;
}) {
  return (
    <View style={s.mini}>
      <View style={[s.orb, { backgroundColor: color }]} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Tick>{kicker}</Tick>
        <Text style={[obsType.body, { fontSize: 13.5, lineHeight: 20 }]}>{children}</Text>
      </View>
    </View>
  );
}

export default function Today() {
  const qc = useQueryClient();
  const router = useRouter();
  const setMemoryDraft = useMemoryDraft((st) => st.setDraft);

  const {
    data, refetch, isRefetching, isLoading, isError,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<any>('/dashboard'),
  });
  const { data: review } = useQuery({
    queryKey: ['weekly-review'],
    queryFn: () => api<any>('/weekly-review/current'),
  });
  const { data: relationships } = useQuery({
    queryKey: ['relationships'],
    queryFn: () => api<any[]>('/relationships'),
  });
  const { data: obAnswers } = useQuery({
    queryKey: ['onboarding-answers'],
    queryFn: () => api<any[]>('/onboarding/answers'),
    staleTime: 5 * 60_000,
  });
  // The greeting says the person's name. It costs one cached request and it
  // is the difference between a dashboard and someone talking to you.
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('/me'),
    staleTime: 10 * 60_000,
  });
  /**
   * The Life OS cycle — every engine's reduced verdict for today.
   *
   * Requested with `preview=1` so that merely opening the screen does not spend
   * the week's one profound truth or mark findings as delivered. The ration is
   * committed only when the person actually acts on something.
   */
  const { data: lifeOs } = useQuery({
    queryKey: ['life-os-today'],
    queryFn: () => api<any>('/life-os/today?preview=1'),
    staleTime: 5 * 60_000,
  });

  /**
   * Twelve weeks of sky, so the picture can show direction instead of only
   * position. Cheap, cached, and the screen is fully usable without it.
   */
  const { data: drift } = useQuery({
    queryKey: ['life-drift'],
    queryFn: () => api<any>('/life-os/drift?weeks=12'),
    staleTime: 30 * 60_000,
  });
  /** A moment from this day in an earlier year. The best thing the app owns. */
  const { data: onThisDay } = useQuery({
    queryKey: ['memories-otd'],
    queryFn: () => api<any[]>('/memories/on-this-day'),
    staleTime: 30 * 60_000,
  });
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  useEffect(() => {
    /**
     * Continuity. Read the previous visit, then stamp this one — so the line
     * describes the gap the person just came back across, not this instant.
     */
    let alive = true;
    AsyncStorage.getItem('priority.lastOpenedAt').then((prev) => {
      if (alive) setLastOpened(prev);
      AsyncStorage.setItem('priority.lastOpenedAt', new Date().toISOString());
    });
    return () => { alive = false; };
  }, []);
  const { data: since } = useQuery({
    queryKey: ['life-since', lastOpened],
    queryFn: () => api<any>(`/life-os/since?at=${encodeURIComponent(lastOpened!)}`),
    enabled: !!lastOpened,
    staleTime: 60 * 60_000,
  });

  const [justCompleted, setJustCompleted] = useState<any | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const hasAnswer = (key: string) =>
    (obAnswers ?? []).some((a: any) => {
      if (a.key !== key) return false;
      const v = a.value;
      return typeof v === 'string'
        ? v.trim().length > 0
        : v && typeof v === 'object' && Object.keys(v).length > 0;
    });
  const needsDepth =
    Array.isArray(obAnswers) && obAnswers.length > 0 &&
    !hasAnswer('futureSelf') && !hasAnswer('currentReality');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['missions'] });
    qc.invalidateQueries({ queryKey: ['missions-completed'] });
    // The year grid, the drift behind the sky, the Record — all derived from
    // the act just written, and none of them refreshed before this.
    invalidateLifeRecord(qc);
  };
  const complete = useMutation({
    mutationFn: (m: any) => api<any>(`/missions/${m.id}/complete`, { method: 'POST' }),
    onSuccess: (res, m) => {
      setJustCompleted({ ...m, next: res?.next ?? null });
      invalidate();
    },
  });
  const snooze = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/snooze`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}`, { method: 'PATCH', body: { status: 'dismissed' } }),
    onSuccess: invalidate,
  });
  const tickHabit = useMutation({
    mutationFn: (id: string) => api(`/habits/${id}/complete`, { method: 'POST', body: {} }),
    onSuccess: invalidate,
  });

  /** Taking a door. Optimistically hidden so the screen gets quieter, not busier. */
  const [actedOn, setActedOn] = useState<string[]>([]);

  /**
   * Who or what a proposal is about, resolved through the observations it
   * answers. Mirrors the orchestrator's own `subjectsOf` — engines tag subjects
   * on findings rather than on doors.
   */
  const subjectsFor = (p: any): string[] => {
    const byId = new Map<string, any>(
      ((lifeOs?.observations ?? []) as any[]).map((o) => [o.id, o]),
    );
    const ids = (p.addresses ?? []).flatMap((id: string) => byId.get(id)?.subjects ?? []);
    return [...new Set(ids as string[])];
  };
  const acceptProposal = useMutation({
    mutationFn: (p: any) => api(`/life-os/proposals/${encodeURIComponent(p.id)}/accept`, {
      method: 'POST',
      body: {
        engine: p.engine,
        domain: p.domain,
        action: p.action,
        because: p.because,
        tinyStep: p.tinyStep,
        effortMinutes: p.effortMinutes,
        // Engines tag the subject on the *finding*, not the door, so resolve it
        // through the observations this proposal answers. Without this the
        // server can only fall back to a representative domain, and a message
        // to a friend gets filed under family.
        subjects: subjectsFor(p),
      },
    }),
    onMutate: (p: any) => setActedOn((prev) => [...prev, p.id]),
    // Accepting creates a real mission, so the Now Card must re-derive — that is
    // the whole point of routing proposals through the mission table.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['life-os-today'] });
    },
  });
  /**
   * "Not this." A plain dismiss is for today; `forever` retires the whole topic
   * permanently. Neither ever asks why.
   */
  const dismissProposal = useMutation({
    mutationFn: ({ p, forever }: { p: any; forever?: boolean }) =>
      api(`/life-os/proposals/${encodeURIComponent(p.id)}/dismiss`, {
        method: 'POST',
        body: { domain: p.domain, forever: !!forever },
      }),
    onMutate: ({ p }) => setActedOn((prev) => [...prev, p.id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['life-os-today'] }),
  });

  const allDomains = useMemo(
    () => (data?.domains ?? []).slice().sort((a: any, b: any) => b.importance - a.importance),
    [data],
  );

  /* The opening read-out is whatever is most adrift — the thing the sky is
     already trying to tell you. The user's own tap always wins after that. */
  const adrift = useMemo(() => mostAdrift(allDomains), [allDomains]);
  const activeKey = picked ?? adrift?.domainType ?? allDomains[0]?.domainType ?? null;
  const active = allDomains.find((d: any) => d.domainType === activeKey) ?? null;

  /**
   * Three ways to have nothing, and they are not the same thing.
   *
   * This used to return an empty View for all of them, so a first launch, a
   * dead network and a broken request were indistinguishable: a dark
   * rectangle with no explanation and nothing to press. Whatever is wrong,
   * saying so is better than a screen that looks like the app failed to load.
   */
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: obs.ground }}>
        <LinearGradient colors={obsSky()} style={s.skyWash} pointerEvents="none" />
        <View style={s.blankWrap}>
          {isLoading ? (
            <Text style={obsType.dim}>Reading your record…</Text>
          ) : (
            <>
              <Text style={[obsType.said, { textAlign: 'center' }]}>
                {isError ? 'Can’t reach your record.' : 'Nothing here yet.'}
              </Text>
              <Text style={[obsType.dim, { textAlign: 'center', marginTop: 8 }]}>
                {isError
                  ? 'Everything you have written is safe on the server — this is only '
                    + 'the connection. It will come back on its own.'
                  : 'Once you have answered a few things about your life, today '
                    + 'will have something to ask for.'}
              </Text>
              <Pressable
                onPress={() => refetch()}
                style={({ pressed }) => [s.blankButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={[obsType.tick, { color: obs.brass }]}>
                  {isError ? 'Try again' : 'Refresh'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  const m = data.todayMission;
  const liveDomains = allDomains.filter((d: any) => d.importance > 0);
  const reading = lifeAlignment(liveDomains);
  const score = reading.score;

  /**
   * The sky as it stood twelve weeks ago — the oldest sample held for each
   * domain. Absent history simply means no ghosts, never a broken picture.
   */
  const pastDomains = useMemo(() => {
    const series = drift?.series as Record<string, any[]> | undefined;
    if (!series) return undefined;
    const out = Object.entries(series)
      .map(([domainType, points]) => points?.length ? {
        domainType,
        importance: points[0].importance,
        attention: points[0].attention,
      } : null)
      .filter(Boolean) as any[];
    return out.length ? out : undefined;
  }, [drift]);

  /** The selected star's own twelve weeks, for the trail under the read-out. */
  const activeSeries: number[] = useMemo(() => {
    const points = (drift?.series as Record<string, any[]> | undefined)?.[activeKey ?? ''] ?? [];
    return points.map((p) => Math.max(0, Math.min(100, p.attention)));
  }, [drift, activeKey]);
  const gam = data.gamification;
  const lvl = gam ? levelProgress(gam.totalXp ?? 0) : null;
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const firstName = (me?.fullName ?? '').trim().split(/\s+/)[0] || '';

  const peopleWaiting = (relationships ?? []).filter((r: any) => {
    if (!r.wantsMoreTime) return false;
    const target = cadenceDays(r.desiredCallFrequency);
    const d = r.lastContactAt
      ? (Date.now() - new Date(r.lastContactAt).getTime()) / 86_400_000
      : Infinity;
    return d / target >= 1.5;
  }).length;
  const habitsTotal = (data.todayHabits ?? []).length;
  const habitsDone = (data.todayHabits ?? []).filter((h: any) => h.doneToday).length;

  /** How much of this year is left — the Today screen's one tie to the Time tab. */
  const weeksLeftThisYear = Math.max(0, Math.round(
    (Date.UTC(new Date().getUTCFullYear() + 1, 0, 1) - Date.now()) / (7 * 86_400_000),
  ));

  const activeColor = active ? obsDomain(active.domainType) : obs.brass;
  const activeDrift = active ? driftOf(active) : 0;
  const nowColor = m ? obsDomain(m.domainType) : obs.brass;

  /**
   * The lens.
   *
   * Tapping a star does not just retune the read-out — it narrows the whole
   * screen to that part of the life. Looking at Finance should answer "what does
   * Finance need from me", not show a Finance label above a health proposal.
   *
   * `lens` is null until the person actually taps, so the default view stays the
   * whole sky. The engines' own ordering decides what leads there; the lens only
   * ever filters, never reorders.
   */
  const lens = picked;                                   // app domain, or null
  const lensLife = lens ? DOMAIN_TO_LIFE[lens as DomainType] : null; // kernel domain

  const allOpen = ((lifeOs?.proposals ?? []) as any[])
    .filter((p) => !actedOn.includes(p.id));
  const openProposals = lensLife
    ? allOpen.filter((p) => p.domain === lensLife)
    : allOpen;

  /**
   * Under a lens the mission only stays the hero if it belongs to that domain;
   * otherwise the lens's own top proposal leads. Without this, tapping Finance
   * would leave a health mission sitting at the top of a Finance view.
   */
  const missionInLens = m
    ? (!lensLife || DOMAIN_TO_LIFE[m.domainType as DomainType] === lensLife)
    : false;
  const heroProposal = missionInLens ? null : openProposals[0] ?? null;
  const restProposals = heroProposal ? openProposals.slice(1) : openProposals;
  /** True when a lens is on and that part of the life is genuinely quiet. */
  const lensEmpty = Boolean(lensLife) && !missionInLens && openProposals.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: obs.ground }}>
      <LinearGradient colors={obsSky()} style={s.skyWash} pointerEvents="none" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.wrap}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={obs.brass} />
        }
      >
        {/* ── the greeting ─────────────────────────────────────────── */}
        <Rise>
          <View style={s.header}>
            <View style={{ flex: 1, gap: 6 }}>
              <Tick>{dateLine}</Tick>
              <Text style={obsType.display}>
                {obsGreeting()}{firstName ? `, ${firstName}` : ''}.
              </Text>
              <Text style={obsType.dim}>Today matters. Here's what it's asking for.</Text>
            </View>
            {gam ? (
              <View style={s.streak}>
                <Ionicons name="flame" size={13} color={obs.brass} />
                <Text style={{ color: obs.brass, fontWeight: '600', fontSize: 13 }}>{gam.dailyStreak}</Text>
              </View>
            ) : null}
          </View>
        </Rise>

        {/* ── what happened while you were gone ────────────────────── */}
        {since && since.days >= 1
          && (since.missionsCompleted > 0 || since.momentsKept > 0
              || since.entriesWritten > 0 || since.slipped.length > 0) ? (
          <Rise delay={60}>
            <View style={s.sinceRow}>
              <Tick>
                {since.days === 1 ? 'Since yesterday' : `In the ${since.days} days since you looked`}
              </Tick>
              <Text style={[obsType.dim, { marginTop: 4 }]}>
                {[
                  since.missionsCompleted > 0
                    ? `${since.missionsCompleted} thing${since.missionsCompleted === 1 ? '' : 's'} done`
                    : null,
                  since.momentsKept > 0 ? `${since.momentsKept} moment${since.momentsKept === 1 ? '' : 's'} kept` : null,
                  since.entriesWritten > 0 ? `${since.entriesWritten} written` : null,
                ].filter(Boolean).join(' · ') || 'Nothing logged — which is also a week.'}
                {since.slipped.length
                  ? `. ${since.slipped.map((p: any) => p.name).join(' and ')} slipped past ${since.slipped.length === 1 ? 'their' : 'their'} usual.`
                  : ''}
              </Text>
            </View>
          </Rise>
        ) : null}

        {/* ── the sky ──────────────────────────────────────────────── */}
        <Rise delay={90}>
          <View style={{ marginTop: 10 }}>
            <Constellation
              domains={allDomains}
              past={pastDomains}
              selected={activeKey ?? undefined}
              onSelect={(k) => setPicked(k)}
              size={300}
            />
            {/* The hint becomes the lens control once a star is tapped, so the
                way out of a filtered view is exactly where the way in was. */}
            {lens ? (
              <Pressable
                onPress={() => setPicked(null)}
                style={({ pressed }) => [s.lensRow, pressed && { opacity: 0.7 }]}
              >
                <View style={[s.orb, { backgroundColor: activeColor, marginTop: 0 }]} />
                <Tick color={activeColor}>Showing {lens} only</Tick>
                <View style={s.lensClear}><Tick>Show all</Tick></View>
              </Pressable>
            ) : (
              <Tick>
                {pastDomains
                  ? 'Outward = neglected · rings show 12 weeks ago · tap a star'
                  : 'Outward = neglected · tap a star'}
              </Tick>
            )}
          </View>
        </Rise>

        {/* ── the read-out ─────────────────────────────────────────── */}
        {active ? (
          <Rise delay={150}>
            <Pressable
              onPress={() => router.push(`/domain/${active.domainType}`)}
              style={({ pressed }) => [s.readout, pressed && { opacity: 0.75 }]}
            >
              <View style={[s.stripe, { backgroundColor: activeColor }]} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[obsType.strong, { textTransform: 'capitalize' }]}>{active.domainType}</Text>
                <Tick>
                  {active.importance <= 0
                    ? 'not in your plan yet'
                    : `you say ${Math.round(active.importance)} · you do ${Math.round(active.attention)}`}
                </Tick>
              </View>
              {/* Where it has been, beside where it is. */}
              <Trail points={activeSeries} color={activeColor} />
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={[obsType.stat, { fontSize: 21, color: activeColor }]}>
                  {Math.round((1 - activeDrift) * 100)}
                </Text>
                <Tick color={alpha(obs.inkFaint, 0.9)}>
                  {activeDrift > 0.55 ? 'drifting' : activeDrift > 0.25 ? 'a gap' : 'held'}
                </Tick>
              </View>
              <Ionicons name="chevron-forward" size={15} color={obs.inkFaint} />
            </Pressable>
          </Rise>
        ) : null}

        {/* ── this week's one thing ────────────────────────────────── */}
        {review?.oneThing ? (
          <Rise delay={190}>
            <View style={s.weekRow}>
              <Ionicons name="pin" size={12} color={obs.brass} />
              <Text style={[obsType.dim, { flex: 1 }]}>
                <Text style={{ color: obs.brass }}>This week: </Text>
                {review.oneThing}
                {review.intentionWord ? `  ·  ${review.intentionWord}` : ''}
              </Text>
            </View>
          </Rise>
        ) : null}

        {/* ── the completion moment ────────────────────────────────── */}
        {justCompleted ? (
          <View style={s.doneBanner}>
            <Ionicons name="checkmark-circle" size={17} color={obs.brass} />
            <Text style={[obsType.dim, { flex: 1 }]}>
              <Text style={{ color: obs.ink }}>Done, +{justCompleted.xpReward} XP. </Text>
              {justCompleted.next
                ? 'The engine lined up what comes next.'
                : 'Your plate already holds what matters.'}
            </Text>
            <Pressable
              onPress={() => {
                setMemoryDraft({
                  title: justCompleted.title,
                  missionId: justCompleted.id,
                  relationshipId: justCompleted.relationshipId ?? undefined,
                  domainType: justCompleted.domainType,
                  personName: justCompleted.relationship?.name,
                });
                router.push('/(tabs)/journal');
              }}
              hitSlop={8}
            >
              <Tick color={obs.brass}>Save it</Tick>
            </Pressable>
            <Pressable onPress={() => setJustCompleted(null)} hitSlop={8}>
              <Ionicons name="close" size={15} color={obs.inkFaint} />
            </Pressable>
          </View>
        ) : null}

        {/* ── the Now Card — the entire product ────────────────────── */}
        <Rise delay={230}>
          {lensEmpty ? (
            /* A quiet domain is good news, and saying so is better than showing
               an unrelated proposal under a Finance heading. */
            <View style={[s.now, s.nowRest]}>
              <Tick color={activeColor}>{lens} · nothing right now</Tick>
              <Text style={[obsType.said, { marginTop: 10 }]}>
                Nothing here is asking for you today.
              </Text>
              <Text style={[obsType.dim, { marginTop: 6 }]}>
                Tap “Show all” to see the rest of your life.
              </Text>
            </View>
          ) : missionInLens && m ? (
            <View style={[s.now, { borderColor: alpha(nowColor, 0.35) }]}>
              <LinearGradient
                colors={[alpha(nowColor, 0.14), 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={s.nowLbl}>
                <PulseDot color={nowColor} />
                <Tick color={nowColor}>
                  Now
                  {m.estimatedMinutes ? ` · ${m.estimatedMinutes} min` : ''}
                  {m.relationship?.name ? ` · with ${m.relationship.name}` : ''}
                </Tick>
              </View>

              <Text style={[obsType.said, { marginTop: 12 }]} numberOfLines={4}>{m.title}</Text>

              {data.whyToday?.whyToday ? (
                <Text style={[obsType.dim, { marginTop: 8 }]}>{data.whyToday.whyToday}</Text>
              ) : null}

              {data.resurfacedMemory ? (
                <Text style={[obsType.dim, { marginTop: 8 }]}>
                  <Text style={{ color: obs.ink }}>
                    Last time with {data.resurfacedMemory.personName}:{' '}
                  </Text>
                  “{data.resurfacedMemory.title}” — {relativeDays(data.resurfacedMemory.occurredAt)}.
                </Text>
              ) : null}

              <View style={s.btnRow}>
                {/* Guarded: two taps used to mean two completions and double
                    XP, with nothing on screen to say the first one had landed. */}
                <Pressable
                  disabled={complete.isPending || snooze.isPending}
                  onPress={() => complete.mutate(m)}
                  style={({ pressed }) => [
                    s.btn, s.btnGo,
                    (complete.isPending || snooze.isPending) && { opacity: 0.55 },
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={s.btnGoText}>{complete.isPending ? 'Saving…' : 'Done'}</Text>
                </Pressable>
                <Pressable
                  disabled={complete.isPending || snooze.isPending}
                  onPress={() => snooze.mutate(m.id)}
                  style={({ pressed }) => [
                    s.btn, s.btnGhost,
                    (complete.isPending || snooze.isPending) && { opacity: 0.55 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={s.btnGhostText}>Not today</Text>
                </Pressable>
              </View>

              <Text style={[obsType.dim, { marginTop: 12, fontSize: 12.5 }]}>
                <Text style={{ color: obs.ink }}>Too big right now? </Text>
                {m.description || tinyStep({
                  title: m.title,
                  domainType: m.domainType,
                  missionType: m.missionType,
                  personName: m.relationship?.name,
                })}
              </Text>

              {m.snoozeCount >= 2 ? (
                <View style={s.recal}>
                  <Text style={[obsType.dim, { flex: 1, fontSize: 12.5 }]}>
                    You've moved this {m.snoozeCount} times. Priorities are allowed to change.
                  </Text>
                  <Pressable onPress={() => dismiss.mutate(m.id)} hitSlop={8}>
                    <Tick color={obsDomain('partner')}>Let it go</Tick>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : heroProposal ? (
            /* No mission, but the engines found something. "Nothing pending" is
               only true when nothing in a life is asking, and it usually is. */
            <View
              style={[
                s.now,
                { borderColor: alpha(heroProposal.domain ? obsDomain(heroProposal.domain) : obs.brass, 0.35) },
              ]}
            >
              <LinearGradient
                colors={[alpha(heroProposal.domain ? obsDomain(heroProposal.domain) : obs.brass, 0.14), 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={s.nowLbl}>
                <PulseDot color={heroProposal.domain ? obsDomain(heroProposal.domain) : obs.brass} />
                <Tick color={heroProposal.domain ? obsDomain(heroProposal.domain) : obs.brass}>
                  Now · {heroProposal.effortMinutes} min · {heroProposal.engine}
                </Tick>
              </View>
              <Text style={[obsType.said, { marginTop: 12 }]}>{heroProposal.action}</Text>
              <Text style={[obsType.dim, { marginTop: 8 }]}>{heroProposal.because}</Text>
              <View style={s.btnRow}>
                <Pressable
                  disabled={acceptProposal.isPending || dismissProposal.isPending}
                  onPress={() => acceptProposal.mutate(heroProposal)}
                  style={({ pressed }) => [
                    s.btn, s.btnGo,
                    (acceptProposal.isPending || dismissProposal.isPending) && { opacity: 0.55 },
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={s.btnGoText}>{acceptProposal.isPending ? 'Saving…' : "I'll do it"}</Text>
                </Pressable>
                <Pressable
                  disabled={acceptProposal.isPending || dismissProposal.isPending}
                  onPress={() => dismissProposal.mutate({ p: heroProposal })}
                  style={({ pressed }) => [
                    s.btn, s.btnGhost,
                    (acceptProposal.isPending || dismissProposal.isPending) && { opacity: 0.55 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={s.btnGhostText}>Not this</Text>
                </Pressable>
              </View>
              {heroProposal.tinyStep ? (
                <Text style={[obsType.dim, { marginTop: 12, fontSize: 12.5 }]}>
                  <Text style={{ color: obs.ink }}>Too big right now? </Text>
                  {heroProposal.tinyStep}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={[s.now, s.nowRest]}>
              <Tick color={obs.brass}>Nothing pending</Tick>
              <Text style={[obsType.said, { marginTop: 10 }]}>
                That is alignment. Enjoy the calm.
              </Text>
              <Text style={[obsType.dim, { marginTop: 6 }]}>
                The best thing this app can do right now is get out of your way.
              </Text>
            </View>
          )}
        </Rise>

        {/* ── what the rest of a life is asking for ─────────────────── */}
        {restProposals.length > 0 ? (
          <Rise delay={255}>
            <View style={{ gap: 10 }}>
              <Tick>
                Also asking
                {lifeOs?.observations?.length
                  ? ` · ${restProposals.length} of ${lifeOs.observations.length} noticed`
                  : ''}
              </Tick>
              {restProposals.map((p: any) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  onAccept={() => acceptProposal.mutate(p)}
                  onDismiss={(forever) => dismissProposal.mutate({ p, forever })}
                />
              ))}
            </View>
          </Rise>
        ) : null}

        {/* ── the glance row ───────────────────────────────────────── */}
        <Rise delay={280}>
          <View style={s.glance}>
            <View style={s.tile}>
              <Text style={[obsType.stat, { color: obs.brass }]}>{Math.round(score)}</Text>
              <Tick>alignment</Tick>
            </View>
            {/* `waiting` sat at 0 most days, holding a third of the fold to say
                nothing. It appears when there is someone in it and gives the
                space back when there is not. */}
            {peopleWaiting > 0 ? (
              <Pressable style={s.tile} onPress={() => router.push('/(tabs)/people')}>
                <Text style={[obsType.stat, { color: obsDomain('partner') }]}>{peopleWaiting}</Text>
                <Tick>waiting</Tick>
              </Pressable>
            ) : (
              <Pressable style={s.tile} onPress={() => router.push('/(tabs)/time')}>
                <Text style={[obsType.stat, { color: obs.ink }]}>{weeksLeftThisYear}</Text>
                <Tick>weeks left in {new Date().getFullYear()}</Tick>
              </Pressable>
            )}
            <View style={s.tile}>
              <Text style={[obsType.stat, { color: obs.ink }]}>
                {habitsTotal > 0 ? `${habitsDone}/${habitsTotal}` : (gam?.dailyStreak ?? 0)}
              </Text>
              <Tick>{habitsTotal > 0 ? 'habits today' : 'day streak'}</Tick>
            </View>
          </View>
          {/* One sentence saying what the number above is actually about.
              A bare 75 is trivia; "friends is the one paying for it" is not. */}
          {reading.starved && reading.worstGapPoints >= 3 ? (
            <Pressable
              onPress={() => setPicked(reading.starved!.domainType)}
              style={({ pressed }) => [s.alignNote, pressed && { opacity: 0.7 }]}
            >
              <View style={[s.orb, { backgroundColor: obsDomain(reading.starved.domainType), marginTop: 0 }]} />
              <Text style={[obsType.dim, { flex: 1 }]}>
                <Text style={{ textTransform: 'capitalize' }}>{reading.starved.domainType}</Text>
                {' '}is getting the least of what you said it was worth
                {reading.fed ? `, and ${reading.fed.domainType} the most` : ''}.
              </Text>
            </Pressable>
          ) : null}

          {/* ── this day, in an earlier year ───────────────────────── */}
          {onThisDay && onThisDay.length > 0 ? (
            <Pressable
              onPress={() => router.push('/(tabs)/journal')}
              style={({ pressed }) => [s.onThisDay, pressed && { opacity: 0.75 }]}
            >
              <Tick color={obs.brass}>On this day</Tick>
              <Text style={[obsType.said, { marginTop: 5, fontSize: 15.5 }]}>
                “{onThisDay[0].title}”
              </Text>
              <Text style={[obsType.dim, { marginTop: 3 }]}>
                {new Date(onThisDay[0].occurredAt).getFullYear()}
                {onThisDay.length > 1 ? ` · and ${onThisDay.length - 1} more` : ''}
              </Text>
            </Pressable>
          ) : null}
          {gam && lvl ? (
            <View style={s.levelRow}>
              <Tick>Level {lvl.level}</Tick>
              <View style={s.xpTrack}>
                <View
                  style={[
                    s.xpFill,
                    { width: `${Math.min(100, (lvl.intoLevel / Math.max(1, lvl.neededForNext)) * 100)}%` },
                  ]}
                />
              </View>
              <Tick>{lvl.intoLevel}/{lvl.neededForNext} XP</Tick>
            </View>
          ) : null}
        </Rise>

        {/* ── worth knowing ────────────────────────────────────────── */}
        {data.insight ? (
          <Rise delay={320}>
            <View style={s.quiet}>
              <Tick>Worth knowing</Tick>
              <Text style={[obsType.serif, { marginTop: 8 }]}>{data.insight.headline}</Text>
              <Text style={[obsType.dim, { marginTop: 6 }]}>{data.insight.detail}</Text>
            </View>
          </Rise>
        ) : null}

        {/* ── habits ───────────────────────────────────────────────── */}
        {data.todayHabits?.length > 0 ? (
          <View style={s.quiet}>
            <Tick>Habits</Tick>
            {data.todayHabits.map((h: any) => (
              <Pressable
                key={h.id}
                disabled={h.doneToday}
                onPress={() => tickHabit.mutate(h.id)}
                style={({ pressed }) => [s.habitRow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons
                  name={h.doneToday ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={h.doneToday ? obs.brass : obs.inkFaint}
                />
                <Text
                  style={[
                    obsType.body, { flex: 1 },
                    h.doneToday && { color: obs.inkDim, textDecorationLine: 'line-through' },
                  ]}
                >
                  {h.title}
                </Text>
                {typeof h.currentStreak === 'number' && h.currentStreak > 0 ? (
                  <Tick>{h.currentStreak}d</Tick>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── if you have more in you ──────────────────────────────── */}
        {data.supportingMissions?.length > 0 ? (
          <View style={{ gap: 9 }}>
            {data.supportingMissions.map((sm: any) => (
              <Mini
                key={sm.id}
                color={obsDomain(sm.domainType)}
                kicker={`${sm.domainType} · if you have more in you`}
              >
                {sm.title}
              </Mini>
            ))}
          </View>
        ) : null}

        {/* ── the invitation back into depth ───────────────────────── */}
        {needsDepth && !justCompleted ? (
          <Pressable onPress={() => router.push('/onboarding?mode=deepen')}>
            <View style={[s.quiet, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <Ionicons name="telescope-outline" size={18} color={obs.brass} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={obsType.strong}>Deepen your reveal</Text>
                <Text style={[obsType.dim, { fontSize: 12.5 }]}>
                  Five quiet questions about who you're becoming. Your sky gets sharper.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={obs.inkFaint} />
            </View>
          </Pressable>
        ) : null}

        <Text style={[obsType.dim, s.closing]}>
          That's today. Close the app and go live it.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    padding: 22, paddingTop: 64, paddingBottom: 56, gap: 18,
    maxWidth: 560, width: '100%', alignSelf: 'center',
  },
  skyWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  blankWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, gap: 2,
  },
  blankButton: {
    marginTop: 22,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha(obs.brass, 0.45),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  streak: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: alpha(obs.brass, 0.35), borderRadius: 999,
    paddingVertical: 5, paddingHorizontal: 11,
  },

  readout: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: obs.ruleSoft,
    paddingVertical: 14,
  },
  stripe: { width: 3, height: 34, borderRadius: 2 },

  weekRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderWidth: 1, borderColor: alpha(obs.brass, 0.28), borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 12,
  },
  doneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: alpha(obs.brass, 0.3), borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 12,
  },

  now: {
    borderWidth: 1, borderColor: obs.rule, borderRadius: 22,
    padding: 20, backgroundColor: obs.raised, overflow: 'hidden',
  },
  nowRest: { alignItems: 'flex-start' },
  nowLbl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nowDot: { width: 5, height: 5, borderRadius: 3 },
  btnRow: { flexDirection: 'row', gap: 9, marginTop: 18 },
  btn: { paddingVertical: 13, borderRadius: 13, alignItems: 'center' },
  btnGo: { flex: 1, backgroundColor: obs.brass },
  btnGoText: { color: obs.onBrass, fontWeight: '700', fontSize: 15 },
  btnGhost: { paddingHorizontal: 20, borderWidth: 1, borderColor: obs.rule },
  btnGhostText: { color: obs.inkDim, fontWeight: '600', fontSize: 15 },
  recal: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: obs.ruleSoft, paddingTop: 12, marginTop: 14,
  },

  glance: { flexDirection: 'row', gap: 10 },
  sinceRow: {
    borderLeftWidth: 2, borderLeftColor: obs.ruleSoft,
    paddingLeft: 12, paddingVertical: 2, marginTop: 14,
  },
  alignNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 10, paddingHorizontal: 2,
  },
  onThisDay: {
    marginTop: 14, padding: 15, borderRadius: 16,
    borderWidth: 1, borderColor: alpha(obs.brass, 0.28),
    backgroundColor: obs.sunken,
  },
  tile: {
    flex: 1, alignItems: 'center', gap: 5, paddingVertical: 16,
    borderWidth: 1, borderColor: obs.ruleSoft, borderRadius: 16,
    backgroundColor: obs.sunken,
  },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  xpTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: obs.rule, overflow: 'hidden' },
  xpFill: { height: 3, borderRadius: 2, backgroundColor: obs.brass },

  quiet: {
    borderWidth: 1, borderColor: obs.ruleSoft, borderRadius: 18,
    padding: 18, backgroundColor: obs.sunken, gap: 2,
  },
  mini: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderWidth: 1, borderColor: obs.ruleSoft, borderRadius: 16,
    paddingVertical: 13, paddingHorizontal: 15, backgroundColor: obs.sunken,
  },
  orb: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  proposal: {
    borderWidth: 1, borderRadius: 18, padding: 16,
    backgroundColor: obs.sunken,
  },
  pBtn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 11 },
  pBtnGhost: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 11,
    borderWidth: 1, borderColor: obs.rule,
  },
  lensRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lensClear: {
    marginLeft: 'auto', borderWidth: 1, borderColor: obs.rule,
    borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11,
  },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  closing: { textAlign: 'center', marginTop: 14, fontSize: 12.5 },
});
