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
import { tinyStep, lifeAlignment } from '@priority/scoring-engine';
import { useRouter } from 'expo-router';
import { useMemoryDraft } from '@/store/memoryDraft';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import { Input, DomainDot } from '@/components/ui';
import { DomainType, DOMAIN_TO_LIFE } from '@priority/types';
import { obs, obsDomain, obsType, obsSky, obsGreeting, alpha } from '@/observatory';
/* The one thing this screen borrows from outside its own palette: brass is
   the only accent here, and a write that failed is not an accent. */
import { colors as base } from '@/theme';
import { useNow } from '@/hooks/useNow';
import { usePlanStack } from '@/hooks/usePlanStack';
import { Constellation, driftOf, mostAdrift } from '@/components/Constellation';
import { rhythmFor, rhythmByKey, anchorFor, evidenceForGenerated } from '@priority/scoring-engine';

/**
 * A rhythm whose catalog entry cannot be found gets no if-then, which is what
 * `anchorFor` already does with an empty input. Named rather than inlined so
 * the silence is a decision on the page instead of a fallback nobody reads.
 */
const NO_ANCHOR = {} as const;
import { WhyThisWorks } from '@/components/WhyThisWorks';

/** Days each desired cadence represents — for the "people waiting" glance. */
const CADENCE_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

/**
 * What to call the moment the hero card claims.
 *
 * The card said "Now" at every hour, so at ten to one in the morning the
 * screen whose own greeting reads "Still awake" was instructing someone to
 * call their mother — NOW. The proposal is right (call her today); the frame
 * was wrong. Late at night the same card points at tomorrow morning instead.
 * Same hour source as the greeting, so the two can never disagree.
 */
function nowWord(at: Date): string {
  const h = at.getHours();
  if (h >= 22) return 'Tomorrow';
  if (h < 7) return 'First thing';
  return 'Now';
}

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
interface HeldContents {
  label: string;
  groups: Array<{
    kind: string;
    heading: string;
    items: Array<{ label: string; when: string }>;
    more: number;
  }>;
}

/**
 * The contents of the open domain, in words.
 *
 * Ordered by what a life is least able to repeat — the same weighting the
 * Record's organism is grown from — so a kept moment leads and the errands
 * come last, however many of them there are. The count on each heading is the
 * true one; only the rows are capped.
 *
 * Plain function rather than a hook: the read-out is computed below the
 * screen's early returns, where a hook would change the hook order between a
 * loading render and a loaded one.
 */
/**
 * Was this written for this person, or does everybody get it?
 *
 * The blueprint issues its keys under one prefix, which is the only thing
 * that distinguishes a rhythm the app composed for you from one of the 36 the
 * catalog ships. It decides whether "not this one" is offered: withdrawing a
 * built-in would mean nothing, since there is no personal claim to take back.
 */
const isBlueprint = (key: unknown): boolean =>
  typeof key === 'string' && key.startsWith('gen.');

function heldContents(picked: string | null, rhythm: any): HeldContents | null {
  const r = picked ? rhythm?.domains?.[picked] : null;
  if (!r?.kinds?.length) return null;
  const NOUN: Record<string, string> = {
    memory: 'kept', contact: 'time with people', reflection: 'written',
    habit: 'habits held', mission: 'done',
  };
  return {
    label: `${picked} · ${r.total} ${r.total === 1 ? 'thing' : 'things'}`,
    groups: (r.kinds as any[]).map((k) => ({
      kind: k.kind,
      heading: `${k.count} ${NOUN[k.kind] ?? k.kind}`,
      items: (k.items as any[]).slice(0, 4).map((it) => ({
        label: it.label,
        when: relativeDays(it.at),
      })),
      more: Math.max(0, k.count - 4),
    })),
  };
}

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
          accessibilityRole="button"
          accessibilityLabel={`I'll do it: ${proposal.action}`}
          style={({ pressed }) => [s.pBtn, { backgroundColor: color }, pressed && { opacity: 0.85 }]}
        >
          <Text style={{ color: obs.onBrass, fontWeight: '700', fontSize: 13.5 }}>I'll do it</Text>
        </Pressable>
        <Pressable
          onPress={() => onDismiss(false)}
          accessibilityRole="button"
          accessibilityLabel={`Not this: ${proposal.action}`}
          style={({ pressed }) => [s.pBtnGhost, pressed && { opacity: 0.6 }]}
        >
          <Text style={{ color: obs.inkDim, fontWeight: '600', fontSize: 13.5 }}>Not this</Text>
        </Pressable>
        {/* Same words as the Now Card's lead-in ("Too big right now?") —
            the one concept wore two costumes, static text there and a mono
            cap here that didn't look tappable. And a role, so this is a
            button to assistive tech rather than an anonymous div. */}
        {proposal.tinyStep ? (
          <Pressable
            onPress={() => setShowTiny((v) => !v)}
            hitSlop={8}
            style={{ marginLeft: 'auto' }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showTiny }}
            accessibilityLabel={showTiny ? 'Hide the smaller version' : 'Too big right now? Show a smaller version'}
          >
            <Text style={[obsType.note, { color: obs.ink }]}>
              {showTiny ? 'hide' : 'Too big right now?'}
            </Text>
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
  /** Missions whose moment is already in the archive — see the banner below. */
  const keptMoments = useMemoryDraft((st) => st.kept);
  /**
   * The clock this screen speaks from — the date line, the greeting, and the
   * word on the hero card all turn on the hour.
   *
   * Without it they were fixed at whatever moment the screen last repainted:
   * a Today tab left open overnight said "Still awake" at eight in the
   * morning under yesterday's date, and went on saying it until something
   * unrelated forced a render. See `useNow`.
   */
  const now = useNow();

  const {
    data, refetch, isRefetching, isLoading, isError,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<any>('/dashboard'),
  });
  /**
   * No spinner is allowed to be permanent.
   *
   * "Reading your record…" had no way out: a query that never settles — paused
   * by the offline manager, retrying behind a captive portal, or a render that
   * throws right after this one paints — left the front page saying it was
   * reading, forever, with nothing to press. The request itself gives up after
   * fifteen seconds (TIMEOUT_MS), so anything still "loading" well past that
   * is not loading, and the honest screen is the one with the button on it.
   */
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  useEffect(() => {
    if (!isLoading) { setWaitedTooLong(false); return; }
    const t = setTimeout(() => setWaitedTooLong(true), 20_000);
    return () => clearTimeout(t);
  }, [isLoading]);
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
  /* Quiet hours, which are where waking and stopping actually live. Read
     only so a new rhythm can be handed an if-then pinned to this person's
     day rather than to a generic one. */
  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api<any>('/me/preferences'),
    staleTime: 10 * 60_000,
  });
  /**
   * The Life OS cycle — every engine's reduced verdict for today.
   *
   * The read spends nothing; `GET /life-os/today` is safe now, and the
   * screen tells the server separately what it actually put in front of
   * somebody. That used to be one call — a GET that persisted unless asked
   * not to — and this file asked not to, which is how the dedup came to be
   * switched off entirely: both callers passed `preview=1`, so nothing ever
   * recorded a delivered proposal and `seenObservationIds` stayed empty for
   * every account the app itself created. The comment here claimed the
   * ration was "committed only when the person actually acts", and nothing
   * committed it at all.
   */
  const { data: lifeOs } = useQuery({
    queryKey: ['life-os-today'],
    queryFn: () => api<any>('/life-os/today'),
    staleTime: 5 * 60_000,
  });

  /**
   * Tell the server what was shown, once per cycle.
   *
   * Keyed on `ranAt` so a re-render, a refocus or a cache rehydration does
   * not report the same proposals twice — the write is idempotent anyway,
   * but a request per render is a request per render.
   *
   * Deliberately after the data arrives rather than after any interaction:
   * "seen" here means the card was on screen, which is what stops the same
   * suggestion arriving every morning. Waiting for a tap would mean anything
   * a person reads and ignores comes back forever, which is the behaviour
   * this exists to prevent.
   */
  const reportedCycle = React.useRef<string | null>(null);
  const markSeen = useMutation({
    mutationFn: (body: { observationIds: string[]; usedProfound: boolean }) =>
      api('/life-os/today/seen', { method: 'POST', body }),
  });
  React.useEffect(() => {
    const ranAt = lifeOs?.ranAt;
    const proposals = (lifeOs?.proposals ?? []) as any[];
    if (!ranAt || reportedCycle.current === ranAt || proposals.length === 0) return;
    reportedCycle.current = ranAt;
    markSeen.mutate({
      observationIds: [...new Set(proposals.flatMap((p) => p.addresses ?? []))],
      /* The rationed engines, which the client can see on what it received. */
      usedProfound: proposals.some((p) => p.engine === 'regret' || p.engine === 'time'),
    });
  }, [lifeOs?.ranAt]);

  /**
   * The rhythms each part of this life is still missing, in its own words.
   *
   * The catalog is twelve domains × three fixed sentences and cannot know that
   * "an hour a week on what comes next" means three old colleagues for someone
   * who wrote at onboarding that they are trying to get out, and a
   * certification for someone who wants to stay and go deeper. Those answers
   * were collected on day one and had never been read on this path.
   *
   * Prefetched for every domain rather than on tap, because a lens should open
   * finished. The local catalog answers instantly from cached habits either
   * way, so this only ever upgrades the wording.
   */
  const { data: craftedRhythms } = useQuery({
    queryKey: ['life-rhythms'],
    queryFn: () => api<{
      rhythms: Array<{
        key: string; domainType: string; title: string; perWeek: number; because: string;
      }>;
      source: 'ai' | 'catalog';
    }>('/life-os/rhythms'),
    staleTime: 30 * 60_000,
  });

  /**
   * Twelve weeks of sky, so the picture can show direction instead of only
   * position. Cheap, cached, and the screen is fully usable without it.
   */
  const { data: drift } = useQuery({
    queryKey: ['life-drift'],
    // No window: the sky compares against the oldest week on record, so it
    // starts as small as the account is and widens as a life accumulates.
    queryFn: () => api<any>('/life-os/drift'),
    staleTime: 30 * 60_000,
  });
  /**
   * How fast each part of the life turns, and what is in it.
   *
   * Fetched up front rather than on tap: the sky cannot place anything until
   * it knows the periods, and a domain has to open the instant it is pressed.
   * Without it the sky still draws — it falls back to declared intent — so
   * this never blocks the screen.
   */
  const { data: rhythm } = useQuery({
    queryKey: ['life-rhythm'],
    queryFn: () => api<any>('/life-os/rhythm'),
    staleTime: 15 * 60_000,
  });
  /**
   * Every rhythm this person keeps, retired ones included.
   *
   * The dashboard already sends today's habits, but only the live ones — and
   * the sky has to know about the ended ones too, or opening a domain offers
   * back the exact rhythm someone deliberately stopped.
   */
  const { data: allHabits } = useQuery({
    queryKey: ['habits', 'all'],
    queryFn: () => api<any[]>('/habits?all=1'),
    staleTime: 5 * 60_000,
  });
  /** A moment from this day in an earlier year. The best thing the app owns. */
  const { data: onThisDay } = useQuery({
    queryKey: ['memories-otd'],
    queryFn: () => api<any[]>('/memories/on-this-day'),
    staleTime: 30 * 60_000,
  });
  /**
   * The best move that pays two parts of a life at once.
   *
   * Read here rather than only in the Time tab, where it has always been —
   * and only ever the first one. A stack is a way to spend an hour, not a
   * second to-do list, so the card below shows one and links to the rest.
   * Covering two domains is the bar: a "stack" that helps a single one is
   * an ordinary suggestion, and calling it a stack would be the overselling
   * this feature exists to avoid.
   *
   * Up here with the others, and not beside the card that reads it, because
   * this screen returns early when the record has not arrived. A hook below
   * that return runs on some renders and not others: React counted 177 hooks
   * one render and 178 the next, and tore the whole screen down with
   * "rendered fewer hooks than expected". Every hook on this screen must sit
   * above the early return at `if (!data)`.
   */
  const { data: stackData } = useQuery({
    queryKey: ['life-stacks'],
    queryFn: () => api<{ stacks: any[] }>('/life-os/stacks'),
    staleTime: 5 * 60_000,
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

  /**
   * The banner stops talking once it has nothing left to say.
   *
   * It stayed up after the engine put the next mission on screen, so the top
   * of the day read "Done — that counted · Kept" directly above a card asking
   * for something else entirely — a closing note for one task hanging over
   * the opening of another.
   *
   * But it is two things at once: an acknowledgement, and an offer to keep
   * the moment. Clearing it the instant the next mission arrives also took
   * the offer away, and the next mission lands within about a second — so a
   * first attempt at this fix removed the only route to the archive before
   * anybody could reach it. Only the finished half goes: once the moment is
   * kept (or waved away), the banner is pure residue and the new card owns
   * the top of the screen. While the offer is still open it stays, because
   * an unanswered question is not clutter.
   */
  const nextMissionId = data?.todayMission?.id;
  const keptThisOne = justCompleted ? keptMoments.includes(justCompleted.id) : false;
  useEffect(() => {
    if (!justCompleted || !nextMissionId || !keptThisOne) return;
    if (nextMissionId !== justCompleted.id) setJustCompleted(null);
  }, [nextMissionId, justCompleted, keptThisOne]);

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
  /**
   * "Not today" moves the due date and leaves the card exactly where it is.
   *
   * The mission is still pending, so the refetch hands it straight back as
   * the hero and nothing on the screen has changed — a successful tap and a
   * dead button look identical. Verified against the server: one tap gives
   * `snoozeCount: 1` and a due date of tomorrow, while the reader sees the
   * same words in the same place and reasonably taps again.
   *
   * The Missions tab already solved this with a receipt; this is the same
   * answer on the surface where most people will meet the button. The
   * existing note at `snoozeCount >= 2` stays — that one is about a pattern,
   * this one is about the tap that just happened.
   */
  const [snoozedTitle, setSnoozedTitle] = React.useState<string | null>(null);
  const snooze = useMutation({
    mutationFn: (m: { id: string; title?: string }) =>
      api(`/missions/${m.id}/snooze`, { method: 'POST' }),
    onSuccess: (_res, m) => {
      setSnoozedTitle(m.title ?? 'That one');
      invalidate();
    },
  });
  React.useEffect(() => {
    if (!snoozedTitle) return;
    /* Long enough to read a mission title and believe it — the same seven
       seconds the Missions tab settled on. */
    const t = setTimeout(() => setSnoozedTitle(null), 7000);
    return () => clearTimeout(t);
  }, [snoozedTitle]);
  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}`, { method: 'PATCH', body: { status: 'dismissed' } }),
    onSuccess: invalidate,
  });
  /**
   * The tick, and the thing that makes a toggle safe to tap quickly.
   *
   * The server keeps one log a day whatever happens, so *completing* is
   * idempotent. Untick is not, and a row that toggles reads its state from
   * the last render — so five quick taps each saw the same stale value,
   * alternated tick and untick, and settled on nothing recorded. A double
   * tap, which is what an impatient thumb does when a row does not answer
   * instantly, would silently undo itself.
   *
   * `tickDraft` is what this screen believes right now. It answers the tap
   * before the round trip, the next tap reads it rather than the server's
   * older answer, and the row is inert until its own request settles.
   */
  const [tickDraft, setTickDraft] = useState<Record<string, boolean>>({});
  const [tickBusy, setTickBusy] = useState<string[]>([]);
  const settle = (id: string) => {
    setTickBusy((p) => p.filter((x) => x !== id));
    setTickDraft((p) => { const { [id]: _drop, ...rest } = p; return rest; });
  };
  const tickHabit = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api(`/habits/${id}/complete`, { method: 'POST', body: note ? { note } : {} }),
    onSuccess: (_d, { id }) => { invalidate(); settle(id); },
    onError: (_e, { id }) => settle(id),
  });
  /** Untick today. Tapping the wrong row should not cost a day. */
  const untickHabit = useMutation({
    mutationFn: (id: string) => api(`/habits/${id}/uncomplete`, { method: 'POST', body: {} }),
    onSuccess: (_d, id) => { invalidate(); settle(id); },
    onError: (_e, id) => settle(id),
  });
  const toggleHabit = (id: string, doneNow: boolean) => {
    setTickBusy((p) => (p.includes(id) ? p : [...p, id]));
    setTickDraft((p) => ({ ...p, [id]: !doneNow }));
    if (doneNow) untickHabit.mutate(id);
    else tickHabit.mutate({ id });
  };
  /**
   * The one line about what was actually done.
   *
   * `HabitLog.note` has existed since the model was written and nothing has
   * ever sent one. It is the honest alternative to a proof photo: four
   * seconds to type, much harder to tap out of habit than a circle, and it
   * gives the archive something to hold. Optional, always — a rhythm kept
   * without a note is still kept.
   */
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  /** Giving a domain a rhythm, from the sky, in one tap. */
  const startRhythm = useMutation({
    mutationFn: ({ domainType, title, perWeek }: {
      domainType: string; title: string; perWeek: number;
    }) => api('/habits', {
      method: 'POST',
      body: { title, domainType, targetPerWeek: perWeek, sourceType: 'system' },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      /* A domain that now holds a rhythm is no longer asking for one, so the
         crafted set has to be re-cut around it. Without this the next lens
         would still offer what was just agreed to. */
      qc.invalidateQueries({ queryKey: ['life-rhythms'] });
      invalidate();
    },
  });
  /** So the row answers the tap immediately, not after a round trip. */
  const [startedHere, setStartedHere] = useState<string[]>([]);

  /**
   * Withdrawing a rhythm the app wrote for this person.
   *
   * Deactivated on the server rather than deleted, so the next generation
   * knows it was offered and refused. Re-proposing what somebody has just
   * rejected is the clearest way an app can show it was not listening.
   */
  const retireRhythm = useMutation({
    mutationFn: (key: string) => api(`/life-os/blueprint/${encodeURIComponent(key)}/retire`, {
      method: 'POST',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['life-rhythms'] }),
  });
  /** Hidden the moment it is tapped, restored if the server disagrees. */
  const [retired, setRetired] = useState<string[]>([]);

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

  /**
   * The stack card's accept — the same write the Time tab makes.
   *
   * Up here with the other mutations, and not beside `topStack` two hundred
   * lines down where it reads better, because there is an early return for
   * `!data` in between. Three `useState` calls behind a conditional return is
   * React error #310 on the render after the data lands, which took the whole
   * Today tab down to "This part didn't load." Hooks go above the guard.
   */
  const { plan: planStack, planned: stackPlanned, planFailed: stackFailed } = usePlanStack();

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
   * The sky as it stood twelve weeks ago — the oldest sample held for each
   * domain. Absent history simply means no ghosts, never a broken picture.
   *
   * These three sit above the `!data` return below, and must stay there.
   * Under it they are a rules-of-hooks violation that only bites when that
   * path is actually taken first — which is every cold start, and so every
   * new install. Warm from storage the screen never took it, so the crash
   * hid until a device arrived without a cache.
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

  /**
   * How far back the ghosts actually reach, said in words rather than a fixed
   * number of weeks. Under a fortnight it is "where you started", because that
   * is what it is for a new account and it reads as a beginning rather than as
   * missing data.
   */
  const driftSpan: string | null = useMemo(() => {
    const w = drift?.weeks ?? 0;
    if (!w) return null;
    if (w < 2) return 'where you started';
    if (w < 8) return `${w} weeks ago`;
    if (w < 52) return `${Math.round(w / 4.345)} months ago`;
    const years = w / 52.18;
    return years < 1.75 ? 'a year ago' : `${Math.round(years)} years ago`;
  }, [drift]);

  /** The selected star's own history, for the trail under the read-out. */
  const activeSeries: number[] = useMemo(() => {
    const points = (drift?.series as Record<string, any[]> | undefined)?.[activeKey ?? ''] ?? [];
    return points.map((p) => Math.max(0, Math.min(100, p.attention)));
  }, [drift, activeKey]);

  /**
   * Whether the gap is closing — the only number that proves the app works.
   *
   * Every figure on this screen was a snapshot: what your gap is, never what
   * it was. But the whole promise is that the gap narrows, and a reader had to
   * take that on faith across weeks of identical-looking numbers. The samples
   * to say it are already fetched for the ghost rings; this reads them.
   *
   * Two samples minimum, and a threshold, because week-to-week jitter of a
   * point or two is noise and announcing it as progress would be the same
   * dishonesty in the opposite direction.
   */
  const activeProgress = useMemo(() => {
    const points = (drift?.series as Record<string, any[]> | undefined)?.[activeKey ?? ''] ?? [];
    if (points.length < 2 || !active) return null;
    const gapAt = (imp: unknown, att: unknown) =>
      Math.max(0, Number(imp) - Number(att));
    const then = gapAt(points[0].importance, points[0].attention);
    // "Now" is the live score, not the newest sample. The sample is written on
    // recompute and can lag by hours, and this line sits directly under the
    // row showing the live figure — two numbers describing the same instant
    // and disagreeing is exactly the class of bug this pass exists to remove.
    const now = gapAt(active.importance, active.attention);
    const delta = Math.round(then - now);
    if (Math.abs(delta) < 5) return null;
    return { closed: delta > 0, points: Math.abs(delta), then: Math.round(then), now: Math.round(now) };
  }, [drift, activeKey, active]);

  /**
   * "over the last 5 weeks", not "since 5 weeks ago" — `driftSpan` is written
   * to follow "the faint ring is …", which is a different sentence shape.
   */
  const progressSpan: string | null = useMemo(() => {
    const w = drift?.weeks ?? 0;
    if (!w) return null;
    if (w < 2) return 'since you started';
    if (w < 8) return `over the last ${w} weeks`;
    if (w < 52) return `over the last ${Math.round(w / 4.345)} months`;
    const years = w / 52.18;
    return years < 1.75 ? 'over the last year' : `over the last ${Math.round(years)} years`;
  }, [drift]);

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
          {isLoading && !waitedTooLong ? (
            <Text style={obsType.dim}>Reading your record…</Text>
          ) : (
            <>
              <Text style={[obsType.said, { textAlign: 'center' }]}>
                {isError || waitedTooLong ? 'Can’t reach your record.' : 'Nothing here yet.'}
              </Text>
              <Text style={[obsType.dim, { textAlign: 'center', marginTop: 8 }]}>
                {isError || waitedTooLong
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
                  {isError || waitedTooLong ? 'Try again' : 'Refresh'}
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
   * A domain far enough behind its own ranking that "enjoy the calm" would be
   * the wrong sentence.
   *
   * Ten points of share, which is the gap at which the rest of this screen
   * already starts using the word "drifting" out loud — so the empty-list card
   * and the read-out under it stop disagreeing about the same life.
   */
  const drifting = reading.starved && reading.worstGapPoints >= 10
    ? reading.starved
    : null;

  const gam = data.gamification;
  const dateLine = now.date.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const firstName = (me?.fullName ?? '').trim().split(/\s+/)[0] || '';

  const peopleWaiting = (relationships ?? []).filter((r: any) => {
    if (!r.wantsMoreTime) return false;
    /**
     * Nobody you live with is waiting to hear from you.
     *
     * `desiredCallFrequency` defaults to weekly for everyone on create, and
     * nothing logs the hundred daily exchanges of a shared house, so a
     * 72-year-old was told two people were waiting on him: his son abroad,
     * and the wife in the next room. Contact cadence is a fact about distance;
     * applied across a kitchen table it only ever produces a false debt.
     */
    if (r.locationType === 'same_home') return false;
    const target = CADENCE_DAYS[r.desiredCallFrequency] ?? 30;
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

  const held = heldContents(picked, rhythm);

  /**
   * What the open domain does, week after week — and the one thing that would
   * give it a rhythm if it has none.
   *
   * The four healthspan levers were the only habits this app could ever
   * create, so eleven of the twelve parts of a life had no way to hold a
   * standing commitment at all. The sky is where a domain is looked at
   * directly, so it is where that is offered.
   */
  const rhythmHere = (() => {
    if (!picked) return null;
    const mine = (allHabits ?? []).filter((h: any) => h.domainType === picked);
    const active = mine.filter((h: any) => h.isActive !== false);
    if (active.length) return { kind: 'kept' as const, habits: active };
    /* The server's wording for this domain when it has one, the catalog's
       otherwise. Identical choice either way — the engine picks the rhythm on
       both sides and only the language differs — so an offline lens is a
       plainer offer rather than a missing one. */
    const crafted = (craftedRhythms?.rhythms ?? []).find((r: any) => (
      r.domainType === picked
      /* Withdrawn this session. The refetch will drop it server-side too, but
         the card has to change on the tap, not a round trip later. */
      && !retired.includes(r.key)
      && !mine.some((h: any) => (
        h.title.trim().toLowerCase() === String(r.title).trim().toLowerCase()
      ))
    ));
    const rhythm = crafted ?? rhythmFor(picked, mine.map((h: any) => h.title));
    return rhythm ? { kind: 'offer' as const, rhythm } : null;
  })();

  /** Agreed to this session, before the refetch has caught up. */
  const justStartedHere = rhythmHere?.kind === 'offer'
    && startedHere.includes(rhythmHere.rhythm.title);

  /**
   * The if-then plan for the rhythm on offer, pinned to hours this person
   * actually keeps. Null far more often than not, and silence is the right
   * answer then — see `anchor.ts`.
   */
  const rhythmAnchor = rhythmHere?.kind === 'offer'
    /**
     * The catalog entry the offer was written from, not the offer itself.
     *
     * A crafted rhythm is a catalog rhythm with the wording rewritten — same
     * `key`, same choice, only the language differs, as the comment above
     * says. What it does not carry is `when` or `anchorTemplate`, so passing
     * it straight to `anchorFor` handed over an object with no timing fields
     * at all and the function could only ever return null: the AI path
     * silently got no if-then plan, which is the entire point of the anchor.
     *
     * Invisible until now because every query result on this screen was typed
     * `any` — the compiler had the mismatch in its hands and no way to say so.
     */
    ? anchorFor(rhythmByKey(rhythmHere.rhythm.key) ?? NO_ANCHOR, {
      wakeHour: prefs?.quietHoursEnd,
      workStartHour: me?.workStartHour,
      workEndHour: me?.workEndHour,
      sleepHour: prefs?.quietHoursStart,
      isWorkday: !(me?.workDays?.length) || me.workDays.includes(now.weekday),
    })
    : null;

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

  const topStack = (stackData?.stacks ?? []).find(
    (st: any) => (st?.covers?.length ?? 0) >= 2,
  ) ?? null;
  /* What has been agreed to but not yet reflected by the server. The stacks
     query is invalidated on success, so within a fetch this card is showing a
     different stack anyway; between the tap and that, this is what stops the
     offer being made twice. The hook itself lives up with the other mutations
     — see the note there. */
  const stackTaken = Boolean(topStack && stackPlanned.includes(topStack.action));

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
                {obsGreeting(now.date)}{firstName ? `, ${firstName}` : ''}.
              </Text>
              <Text style={obsType.dim}>Today matters. Here's what it's asking for.</Text>
            </View>
            {/* A flame holding a zero is a verdict, not a greeting. The chip
                earns its place on the first kept day and not before. */}
            {gam && gam.dailyStreak > 0 ? (
              <View style={s.streak}>
                <Ionicons name="flame" size={13} color={obs.brass} />
                <Text style={{ color: obs.brass, fontWeight: '600', fontSize: 13 }}>{gam.dailyStreak}</Text>
              </View>
            ) : null}
          </View>
        </Rise>

        {/* The receipt for "Not today" — see the snooze mutation above for
            why a tap that worked needs one. Sits where the completion banner
            sits, because it answers the same question: did the thing I just
            pressed do anything. */}
        {snoozedTitle && !justCompleted ? (
          <View style={s.doneBanner}>
            <Ionicons name="time-outline" size={17} color={obs.brass} />
            <Text style={[obsType.dim, { flex: 1 }]}>
              <Text style={{ color: obs.ink }}>Moved to tomorrow. </Text>
              {snoozedTitle} will be waiting.
            </Text>
          </View>
        ) : null}

        {/* ── the completion moment ────────────────────────────────── */}
        {justCompleted ? (
          <View style={s.doneBanner}>
            <Ionicons name="checkmark-circle" size={17} color={obs.brass} />
            <Text style={[obsType.dim, { flex: 1 }]}>
              {/* "Done, +30 XP" was the arcade speaking at the app's most
                  human moment. The earn still lands — the You tab keeps the
                  ledger; this banner keeps the sentiment. */}
              <Text style={{ color: obs.ink }}>Done — that counted. </Text>
              {/**
                * And what the app offers next, which used to be the next
                * mission: "the engine lined up what comes next" is a tap
                * rewarded with more taps, printed at the one moment somebody
                * has something real to say. A tick is a tick. The line about
                * it is the part that will still be here in a year, and this
                * is the only moment it is easy to write.
                *
                * Still said once the moment is kept — the next thing genuinely
                * has changed by then, and there is nothing left to offer.
                */}
              {keptMoments.includes(justCompleted.id)
                ? (justCompleted.next
                  ? 'The engine lined up what comes next.'
                  : 'Your plate already holds what matters.')
                : 'What you write about it is what lasts.'}
            </Text>
            {/* Once the moment is kept, this says so instead of offering it
                again. It used to keep reading "Save it" forever, so the
                natural second tap wrote the archive a second copy of the
                same evening — and paid XP for it twice. */}
            {keptMoments.includes(justCompleted.id) ? (
              <Tick>Kept</Tick>
            ) : (
              /* A button rather than an 11px label. The archive is where a
                 completion is supposed to end up, and it was being offered
                 more quietly than the dismiss cross beside it. */
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
                accessibilityRole="button"
                accessibilityLabel={`Keep a moment for ${justCompleted.title}`}
                style={({ pressed }) => [s.keepBtn, pressed && { opacity: 0.85 }]}
              >
                <Tick color={obs.brass}>Keep the moment</Tick>
              </Pressable>
            )}
            <Pressable onPress={() => setJustCompleted(null)} hitSlop={8}>
              <Ionicons name="close" size={15} color={obs.inkFaint} />
            </Pressable>
          </View>
        ) : null}

        {/* ── the Now Card — the entire product ──────────────────────
            First, because it is the entire product. It used to render ninth,
            below a 300px sky and the whole domain read-out, which put the only
            button the app actually wants pressed below the fold: you opened
            Priority, read a chart and a red gap number, and had to scroll to
            act. The diagnosis is now the reward for scrolling, not the toll. */}
        <Rise delay={60}>
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
                  {/* Not the word "Now" nailed on. The same hour source as the
                      greeting three lines above it, which is how a screen
                      reading "Still awake" at half past midnight came to be
                      telling somebody to do a thing NOW. `nowWord` was written
                      for exactly this and this card never got it. */}
                  {nowWord(now.date)}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Done: ${m.title}`}
                  accessibilityState={{ disabled: complete.isPending || snooze.isPending }}
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
                  onPress={() => snooze.mutate({ id: m.id, title: m.title })}
                  accessibilityRole="button"
                  accessibilityLabel={`Not today: ${m.title}`}
                  accessibilityState={{ disabled: complete.isPending || snooze.isPending }}
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
                  // A step that puts you in their room is only a step when
                  // you are in it. See NEEDS_SAME_ROOM in tinySteps.
                  locationType: m.relationship?.locationType,
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
                  {nowWord(now.date)} · {heroProposal.effortMinutes} min · {heroProposal.engine}
                </Tick>
              </View>
              <Text style={[obsType.said, { marginTop: 12 }]}>{heroProposal.action}</Text>
              <Text style={[obsType.dim, { marginTop: 8 }]}>{heroProposal.because}</Text>
              <View style={s.btnRow}>
                <Pressable
                  disabled={acceptProposal.isPending || dismissProposal.isPending}
                  onPress={() => acceptProposal.mutate(heroProposal)}
                  accessibilityRole="button"
                  accessibilityLabel={`I'll do it: ${heroProposal.action}`}
                  accessibilityState={{ disabled: acceptProposal.isPending || dismissProposal.isPending }}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Not this: ${heroProposal.action}`}
                  accessibilityState={{ disabled: acceptProposal.isPending || dismissProposal.isPending }}
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
              {/**
               * Empty and aligned are not the same state.
               *
               * A brand-new account has nothing pending because nothing has
               * been measured yet, and this card congratulated it for that —
               * "That is alignment. Enjoy the calm." — four lines above its
               * own admission that health was getting 0% of an asked-for 35%.
               * `score` is 0 only when no attention is recorded anywhere,
               * which is the same rule the alignment tile already uses to
               * print a dash instead of a zero.
               */}
              {/**
                * And empty is not the same as aligned either.
                *
                * The `score > 0` guard above fixed the cold start and left the
                * other half standing: a reader with alignment at 29 and health
                * on 0% of an asked-for 24% was still told "That is alignment.
                * Enjoy the calm." — three lines above this same screen saying
                * "Health is getting the least of what you said it was worth."
                * One card, two answers, and the flattering one on top.
                *
                * An empty list means nothing is pending. Whether that is calm
                * depends on the reading, and the reading already knows: it
                * carries the starved domain and how many points short it is.
                */}
              <Tick color={obs.brass}>{score > 0 ? 'Nothing pending' : 'Nothing here yet'}</Tick>
              <Text style={[obsType.said, { marginTop: 10 }]}>
                {score <= 0
                  ? 'Nothing to show yet — that is a new account, not a quiet life.'
                  : drifting
                    ? `Nothing pending — and nothing going to ${drifting.domainType} either.`
                    : 'That is alignment. Enjoy the calm.'}
              </Text>
              <Text style={[obsType.dim, { marginTop: 6 }]}>
                {score <= 0
                  ? 'Keep one thing this week and the numbers below start meaning something.'
                  : drifting
                    ? 'An empty list and a life in balance are not the same thing.'
                    : 'The best thing this app can do right now is get out of your way.'}
              </Text>
            </View>
          )}
        </Rise>

        {/**
         * ── one move, two lives ───────────────────────────────────────
         *
         * The best thing this app does, and it lived three taps into the
         * Time tab. Nothing else on the market merges a walk and a phone
         * call to a friend into one thirty-minute action and can say, in
         * the reader's own numbers, why that particular pair — and almost
         * nobody using it had ever seen one, because the door to it was a
         * card most of the way down a different screen.
         *
         * One, never a list. This sits under the Now Card and must not
         * become a second one: the whole discipline of that card is that
         * today has a single most important thing. A stack is offered as a
         * way to *spend* an hour, and the rest stay where they were.
         */}
        {topStack ? (
          <Rise delay={80}>
            {/**
              * The whole card takes the offer, and the button says so.
              *
              * Two versions of this were wrong in opposite directions. It
              * began as one big `Pressable` that ran `router.push('/time')`:
              * somebody read the sentence, agreed with it, tapped, and was
              * moved to another screen to find the same card again. The fix
              * added explicit controls and made the body a plain `View` — and
              * that was wrong too, because the body still looks like a card
              * you can press, and now nothing at all happened when you did.
              * The instinct being served is the same one both times: you tap
              * the thing you just agreed with.
              *
              * So the body is pressable again and does what the button does.
              * The button stays because a card that acts on touch without
              * saying what it will do is the first version's problem again;
              * this way the label names the action and the whole card honours
              * it. "Find it an hour" sits inside and wins its own touch, so
              * the way to Time is still there.
              *
              * A mission written by accident costs one tap of "Not today".
              * A card that does nothing costs the offer.
              */}
            <Pressable
              onPress={() => { if (!stackTaken) planStack.mutate(topStack); }}
              disabled={stackTaken || planStack.isPending}
              accessibilityRole={stackTaken ? undefined : 'button'}
              accessibilityLabel={stackTaken
                ? undefined
                : `${topStack.action}. Put it on my missions.`}
              style={({ pressed }) => [s.stackCard, pressed && !stackTaken && { opacity: 0.8 }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Ionicons name="git-merge-outline" size={13} color={obs.brass} />
                {/* Sentence-shaped, so not a tick — as a mono cap this wrapped
                    at phone width and orphaned "LIFE" onto its own line. */}
                <Text style={[obsType.note, { color: obs.brass }]}>
                  one move · {topStack.covers.length} parts of your life
                </Text>
                <View style={{ flex: 1 }} />
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {topStack.domains.map((d: string) => (
                    <View key={d} style={topStack.covers.includes(d) ? undefined : { opacity: 0.3 }}>
                      <DomainDot domain={d} size={8} />
                    </View>
                  ))}
                </View>
              </View>
              <Text style={[obsType.said, { marginTop: 9, fontSize: 19 }]}>{topStack.action}</Text>
              {/* The reason, in numbers they can check against their own
                  dashboard. A suggestion that cannot say why it is one is
                  a slogan. */}
              {topStack.reason ? (
                <Text style={[obsType.dim, { marginTop: 6 }]}>{topStack.reason}</Text>
              ) : null}
              {/* Once it is taken the card says so and stops offering; the
                  next fetch of the stacks will have re-planned around it and
                  put a different one here. */}
              {stackTaken ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                  <Ionicons name="checkmark" size={14} color={obs.brass} />
                  <Text style={[obsType.dim, { color: obs.brass }]}>
                    On your missions. Give it an hour on Time whenever you like.
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 }}>
                  <Pressable
                    onPress={() => planStack.mutate(topStack)}
                    disabled={planStack.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Put "${topStack.action}" on my missions`}
                    hitSlop={8}
                    style={({ pressed }) => [s.stackTake, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="add" size={14} color={obs.ink} />
                    <Text style={[obsType.note, { color: obs.ink }]}>put it on my list</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/time')}
                    accessibilityRole="button"
                    accessibilityLabel="Open Time to give this an hour"
                    hitSlop={8}
                  >
                    <Text style={obsType.dim}>find it an hour</Text>
                  </Pressable>
                </View>
              )}
              {/* The one case where saying nothing would be a lie: a record
                  that did not land must never look like one that did. */}
              {stackFailed === topStack.action ? (
                <Text style={[obsType.dim, { marginTop: 8, color: base.rose }]}>
                  That did not save — it is still an offer. Try again, or open Time.
                </Text>
              ) : null}
            </Pressable>
          </Rise>
        ) : null}

        {/* ── what happened while you were gone ────────────────────── */}
        {since && since.days >= 1
          && (since.missionsCompleted > 0 || since.momentsKept > 0
              || since.entriesWritten > 0 || since.slipped.length > 0
              || (since.grew?.length ?? 0) > 0) ? (
          <Rise delay={90}>
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

              {/**
                * What grew while they were away.
                *
                * The one return-pull this product is allowed. A strategy game
                * brings people back by threatening what they will lose; the
                * honest version shows what they built and cannot lose. Said in
                * domains rather than counts on purpose — "family grew" is a
                * fact about a life, "3 tasks done" is a fact about a list —
                * and it names the drawing so the pull leads somewhere real.
                */}
              {since.grew?.length ? (
                <Pressable
                  onPress={() => router.push('/record')}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="See your record"
                  style={({ pressed }) => [s.grewRow, pressed && { opacity: 0.6 }]}
                >
                  {since.grew.slice(0, 4).map((g: any) => (
                    <View key={g.domain} style={[s.grewDot, { backgroundColor: obsDomain(g.domain) }]} />
                  ))}
                  <Text style={[obsType.dim, { flex: 1 }]}>
                    {(() => {
                      const names = since.grew.map((g: any) => g.domain);
                      const rest = names.length - 2;
                      const said = names.length === 1 ? names[0]
                        : names.length === 2 ? `${names[0]} and ${names[1]}`
                          : `${names[0]}, ${names[1]} and ${rest} more`;
                      return `${said} grew while you were away`;
                    })()}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={obs.inkFaint} />
                </Pressable>
              ) : null}
            </View>
          </Rise>
        ) : null}

        {/* ── the sky ──────────────────────────────────────────────── */}
        <Rise delay={90}>
          <View style={{ marginTop: 10 }}>
            <Constellation
              domains={allDomains}
              past={pastDomains}
              rhythm={rhythm?.domains}
              selected={activeKey ?? undefined}
              /* Only an actual tap grows branches. The read-out opens on
                 whatever is most adrift, and that must not unfurl a whole
                 domain before anyone has asked for it. */
              opened={picked}
              onSelect={(k) => setPicked(picked === k ? null : k)}
              size={300}
            />
            {/* The hint becomes the lens control once a star is tapped, so the
                way out of a filtered view is exactly where the way in was. */}
            {lens ? (
              <Pressable
                onPress={() => setPicked(null)}
                /* Reached the accessibility tree as a bare focusable div with
                   no role and no name — and the empty state two cards up says
                   'Tap "Show all" to see the rest of your life', which is an
                   instruction to press something a screen reader cannot find
                   or announce. The only way out of a filtered view. */
                accessibilityRole="button"
                accessibilityLabel={`Showing ${lens} only — show all`}
                style={({ pressed }) => [s.lensRow, pressed && { opacity: 0.7 }]}
              >
                <View style={[s.orb, { backgroundColor: activeColor, marginTop: 0 }]} />
                <Tick color={activeColor}>Showing {lens} only</Tick>
                <View style={s.lensClear}><Tick>Show all</Tick></View>
              </Pressable>
            ) : (
              <Text style={obsType.note}>
                {/* One instruction, not three clauses of notation.
                    "Outward = neglected · rings show where you started · tap a
                    domain" asked someone to hold a legend in their head before
                    the picture meant anything; a diagram needing that much
                    caption is encoding more than its shape can say. The rings
                    still mean what they meant — the invitation is what leads,
                    and the reading is what the tap teaches. Set as a note, not
                    a tick: as a mono cap this whole sentence wrapped twice. */}
                {pastDomains && driftSpan
                  ? `Tap a domain · the faint ring is ${driftSpan}`
                  : 'Tap a domain · the further out, the more it has been waiting'}
              </Text>
            )}
          </View>
        </Rise>

        {/* ── what the open domain holds ───────────────────────────────
            The branches draw the shape of a domain — mostly people, mostly
            errands — and they are a bad list. This is the list. Both, always:
            without it every tip is an unnamed dot, and there is no hover on a
            phone to fall back on. */}
        {held ? (
          <Rise delay={120}>
            <View style={s.held}>
              <View style={s.heldHead}>
                <View style={[s.orb, { backgroundColor: activeColor, marginTop: 0 }]} />
                <Tick color={activeColor}>{held.label}</Tick>
              </View>
              {held.groups.map((g) => (
                <View key={g.kind} style={s.heldGroup}>
                  <Tick color={activeColor}>{g.heading}</Tick>
                  {g.items.map((it, i) => (
                    <View key={`${g.kind}-${i}`} style={s.heldRow}>
                      <View style={[s.heldDot, { backgroundColor: activeColor }]} />
                      <Text style={s.heldWhat} numberOfLines={1}>{it.label}</Text>
                      <Text style={s.heldWhen}>{it.when}</Text>
                    </View>
                  ))}
                  {g.more > 0 ? (
                    <Text style={s.heldMore}>+{g.more} more</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </Rise>
        ) : null}

        {/* ── what this domain does every week ─────────────────────────
            Deliberately outside the `held` panel above, which renders only
            when a domain already holds something. A domain holding nothing
            is precisely the one that needs a rhythm, and it was the one with
            nothing on screen to offer it. */}
        {rhythmHere ? (
          <Rise delay={130}>
            <View style={s.held}>
              <View style={s.heldHead}>
                <View style={[s.orb, { backgroundColor: activeColor, marginTop: 0 }]} />
                {/* The heading has to answer the tap too. It read
                    `rhythmHere.kind`, which only flips once the refetch lands,
                    so the moment after agreeing to a rhythm the panel said
                    "No rhythm here yet" directly above "Added — 1 a week,
                    starting now". A card contradicting itself reads as a
                    failure, and the rhythm really had been created. */}
                <Tick color={activeColor}>
                  {rhythmHere.kind === 'kept' || justStartedHere ? 'Rhythm here' : 'No rhythm here yet'}
                </Tick>
              </View>
              {rhythmHere.kind === 'kept' ? (
                rhythmHere.habits.map((h: any) => (
                  <View key={h.id} style={s.heldRow}>
                    <View style={[s.heldDot, { backgroundColor: activeColor }]} />
                    <Text style={s.heldWhat} numberOfLines={1}>{h.title}</Text>
                    <Text style={s.heldWhen}>
                      {h.streakCurrent > 0 ? `${h.streakCurrent}w` : `${h.targetPerWeek}/wk`}
                    </Text>
                  </View>
                ))
              ) : startedHere.includes(rhythmHere.rhythm.title) ? (
                <>
                  <Text style={[s.heldMore, { color: obs.brass }]}>
                    Added — {rhythmHere.rhythm.perWeek} a week, starting now.
                  </Text>
                  {/**
                    * The plan, at the one moment it does anything.
                    *
                    * A when-where-how plan made before the moment arrives is
                    * the largest cheap effect in the behaviour-change
                    * literature — about d = 0.65 across ninety-four studies —
                    * and the app had every part of it except the sentence.
                    * It is said here, once, as somebody agrees to the rhythm,
                    * because that is when a plan is worth making. Never as a
                    * reminder later, which is where advice turns into
                    * nagging. Absent whenever it cannot be said honestly:
                    * see `anchorFor`.
                    */}
                  {rhythmAnchor ? (
                    <Text style={[s.heldMore, { color: obs.ink }]}>{rhythmAnchor.sentence}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Pressable
                    disabled={startRhythm.isPending}
                    onPress={() => {
                      setStartedHere((p) => [...p, rhythmHere.rhythm.title]);
                      startRhythm.mutate({
                        domainType: picked!,
                        title: rhythmHere.rhythm.title,
                        perWeek: rhythmHere.rhythm.perWeek,
                      }, {
                        onError: () => setStartedHere((p) => p.filter((t) => t !== rhythmHere.rhythm.title)),
                      });
                    }}
                    style={({ pressed }) => [s.rhythmOffer, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="repeat" size={14} color={obs.brass} />
                    <Text style={[obsType.body, { flex: 1 }]}>{rhythmHere.rhythm.title}</Text>
                    <Tick color={obs.brass}>{rhythmHere.rhythm.perWeek}/wk</Tick>
                  </Pressable>
                  {/* What this rhythm is for, in this domain's own terms. Its
                      absence is what made three domains offer three lines that
                      could have been swapped without anyone noticing. */}
                  <Text style={s.heldMore}>{rhythmHere.rhythm.because}</Text>
                  {/* And the other half, in the other register: whether
                      anybody has been and measured it. Collapsed, because the
                      reader deciding about Tuesday does not need a citation —
                      but the reader wondering whether this app is repeating
                      something off the internet deserves an answer. */}
                  <View style={{ marginTop: 2 }}>
                    <WhyThisWorks
                      idOrTitle={rhythmHere.rhythm.key}
                      evidence={isBlueprint(rhythmHere.rhythm.key)
                        ? evidenceForGenerated(rhythmHere.rhythm.title, rhythmHere.rhythm.key)
                        : undefined}
                    />
                  </View>
                  {/*
                    Only for a rhythm the app wrote for this person.

                    A built-in is a fixed idea that simply may not fit; one
                    written FOR you and wrong about you is a different feeling,
                    and saying so has to cost a single tap. Nothing appears for
                    catalog rhythms, which have no personal claim to withdraw.
                  */}
                  {isBlueprint(rhythmHere.rhythm.key) && !retired.includes(rhythmHere.rhythm.key) ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Not this one — stop suggesting it"
                      onPress={() => {
                        setRetired((p) => [...p, rhythmHere.rhythm.key]);
                        retireRhythm.mutate(rhythmHere.rhythm.key, {
                          onError: () => setRetired(
                            (p) => p.filter((k) => k !== rhythmHere.rhythm.key),
                          ),
                        });
                      }}
                      style={({ pressed }) => [{ paddingVertical: 6 }, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[s.heldMore, { color: obs.inkFaint }]}>Not this one</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </Rise>
        ) : null}

        {/* ── the read-out ─────────────────────────────────────────── */}
        {active ? (
          <Rise delay={150}>
            <View style={{ gap: 0 }}>
            <Pressable
              onPress={() => router.push(`/domain/${active.domainType}`)}
              style={({ pressed }) => [s.readout, pressed && { opacity: 0.75 }]}
            >
              <View style={[s.stripe, { backgroundColor: activeColor }]} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={[obsType.strong, { textTransform: 'capitalize' }]} numberOfLines={1}>
                  {active.domainType}
                </Text>
                {/* The status rides with the say/do figures it describes,
                    rather than under the score on the right — where, as a
                    caption to a number, "a gap" made 67 read as the size of
                    the gap when it is the opposite measure. */}
                {/* Three measurements and a verdict don't fit in a tick at
                    phone width — "DRIFTING" wrapped onto its own line. */}
                <Text style={obsType.note} numberOfLines={1}>
                  {active.importance <= 0
                    ? 'not in your plan yet'
                    : `you say ${Math.round(active.importance)} · you do ${Math.round(active.attention)}`
                      + (activeDrift > 0.55 ? ' · drifting' : activeDrift > 0.25 ? ' · a gap' : '')}
                </Text>
              </View>
              {/* Where it has been, beside where it is. */}
              <View style={{ flexShrink: 0 }}>
                <Trail points={activeSeries} color={activeColor} />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <Text style={[obsType.stat, { fontSize: 21, color: activeColor }]}>
                  {Math.round((1 - activeDrift) * 100)}
                </Text>
                <Tick color={alpha(obs.inkFaint, 0.9)}>held</Tick>
              </View>
              <Ionicons name="chevron-forward" size={15} color={obs.inkFaint} />
            </Pressable>

            {/* The proof. Nothing else on this screen says the app is working. */}
            {activeProgress ? (
              <View style={s.progressRow}>
                <Ionicons
                  name={activeProgress.closed ? 'trending-down' : 'trending-up'}
                  size={12}
                  color={activeProgress.closed ? obs.good : obs.inkFaint}
                />
                <Text style={[obsType.dim, { flex: 1, fontSize: 12.5 }]}>
                  {activeProgress.closed ? (
                    <>
                      <Text style={{ color: obs.good }}>
                        Gap closed {activeProgress.points} {activeProgress.points === 1 ? 'point' : 'points'}
                      </Text>
                      {` — ${activeProgress.then} to ${activeProgress.now}${progressSpan ? `, ${progressSpan}` : ''}.`}
                    </>
                  ) : (
                    `Gap widened ${activeProgress.points} — ${activeProgress.then} to ${activeProgress.now}${progressSpan ? `, ${progressSpan}` : ''}.`
                  )}
                </Text>
              </View>
            ) : null}
            </View>
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
              {/* Zero here means "attention unmeasured anywhere yet" —
                  lifeAlignment returns 0 only when totalAttention is 0. The
                  GapBar has always rendered unmeasured as a dash rather than
                  a zero; the app's own summary number follows its own rule. */}
              <Text style={[obsType.stat, { color: obs.brass }]}>
                {score > 0 ? Math.round(score) : '—'}
              </Text>
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
              {/* A streak of zero is not a measurement, it is an absence —
                  shown as one, per the same rule as alignment above. */}
              <Text style={[obsType.stat, { color: obs.ink }]}>
                {habitsTotal > 0
                  ? `${habitsDone}/${habitsTotal}`
                  : (gam?.dailyStreak ? gam.dailyStreak : '—')}
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
          {/* The level strip lived here uncarded — "LEVEL 1 ── 0/100 XP"
              floating between an observatory's readings in an arcade's
              vocabulary. The instrument still exists in full on the You tab,
              which is where a profile statistic belongs. */}
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
            {data.todayHabits.map((h: any) => {
              /* Struck through only when the week's commitment is actually
                 met. One tap on a twice-a-week rhythm used to strike the row
                 and disable it, which reads as finished when it is half done —
                 and the target was being sent to this screen all along and
                 never shown. */
              const target = h.targetPerWeek ?? 1;
              /* What this screen believes, which is the server's answer unless
                 a tap is still in the air. */
              const done = tickDraft[h.id] ?? h.doneToday;
              const serverKept = h.doneThisWeek ?? (h.doneToday ? 1 : 0);
              const kept = Math.max(serverKept + ((done ? 1 : 0) - (h.doneToday ? 1 : 0)), 0);
              const met = kept >= target;
              return (
                <View key={h.id}>
                  <Pressable
                    disabled={tickBusy.includes(h.id)}
                    onPress={() => toggleHabit(h.id, done)}
                    onLongPress={() => {
                      setNoteFor(noteFor === h.id ? null : h.id);
                      setNoteDraft(h.todayNote ?? '');
                    }}
                    style={({ pressed }) => [s.habitRow, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={done ? obs.brass : obs.inkFaint}
                    />
                    <Text
                      style={[
                        obsType.body, { flex: 1 },
                        met && { color: obs.inkDim, textDecorationLine: 'line-through' },
                        done && !met && { color: obs.inkDim },
                      ]}
                    >
                      {h.title}
                    </Text>
                    {/**
                      * What was agreed to, against what has happened — on
                      * every row, not only the ones asking for more than one.
                      *
                      * Hiding it at a target of one made the card unreadable
                      * in the way that matters: "Thirty minutes of learning,
                      * daily" carried "1/7 this week" and "One thing you have
                      * never done, weekly" carried nothing, so a row with no
                      * number was indistinguishable from a row whose number
                      * had gone missing. It also left a once-a-week rhythm
                      * with no way of saying it was once a week. "0/1 this
                      * week" is not clutter; it is the commitment.
                      */}
                    <Tick color={met ? obs.brass : undefined}>{kept}/{target} this week</Tick>
                    {typeof h.streak === 'number' && h.streak > 0 ? (
                      <Tick>{h.streak}w</Tick>
                    ) : null}
                  </Pressable>
                  {/* Their own line about it, kept with the log. */}
                  {h.todayNote && noteFor !== h.id ? (
                    <Text style={[obsType.dim, s.habitNote]}>“{h.todayNote}”</Text>
                  ) : null}
                  {noteFor === h.id ? (
                    <View style={s.habitNoteBox}>
                      <Input
                        placeholder="What did you actually do? (optional)"
                        value={noteDraft}
                        onChangeText={setNoteDraft}
                        onSubmitEditing={() => {
                          if (noteDraft.trim()) tickHabit.mutate({ id: h.id, note: noteDraft.trim() });
                          setNoteFor(null);
                        }}
                      />
                      <Text style={obsType.dim}>
                        Long-press any rhythm to add a line. Nothing is required — this is for
                        you to read later, not to prove anything.
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
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
  progressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    paddingTop: 9, paddingLeft: 16,
  },

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
  keepBtn: {
    borderWidth: 1, borderColor: alpha(obs.brass, 0.45), borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: alpha(obs.brass, 0.09),
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
  /* Quieter than the Now Card on purpose — a hairline and a wash rather
     than the gradient and the pulse. Today still has one most important
     thing, and this is a way to spend an hour, not a rival for it. */
  stackCard: {
    marginTop: 14, padding: 15, borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(obs.brass, 0.3),
    backgroundColor: alpha(obs.brass, 0.05),
  },
  /* The accept. Outlined rather than filled: this card already sits inside a
     brass tint, and a solid brass button on top of it would out-shout the Now
     Card above — which is the one thing on this screen allowed to shout. */
  stackTake: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(obs.brass, 0.55),
  },
  /* The growth line. A row, not a card: it is a sentence with dots, and
     making it a panel would turn an observation into an announcement. */
  grewRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  grewDot: { width: 6, height: 6, borderRadius: 3 },
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
  /** Their own words about the rhythm, sitting under it rather than in it. */
  habitNote: { marginLeft: 31, marginTop: -4, marginBottom: 6, fontStyle: 'italic' },
  habitNoteBox: { marginLeft: 31, marginTop: 2, marginBottom: 8, gap: 6 },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  held: {
    marginTop: 14, borderWidth: 1, borderColor: obs.rule, borderRadius: 16,
    backgroundColor: obs.raised, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 6,
  },
  heldHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heldGroup: { marginBottom: 12 },
  heldRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 3.5 },
  heldDot: { width: 6, height: 6, borderRadius: 3 },
  heldWhat: { ...obsType.body, flex: 1, fontSize: 13.5, color: obs.ink },
  heldWhen: { ...obsType.dim, fontSize: 11.5 },
  heldMore: { ...obsType.dim, fontSize: 11.5, marginTop: 3, marginLeft: 15 },
  /** The one offer a domain with no rhythm gets. Reads as an invitation,
      not as a row of data — it is the only thing here that is a button. */
  rhythmOffer: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: alpha(obs.brass, 0.35), borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },

  closing: { textAlign: 'center', marginTop: 14, fontSize: 12.5 },
});
