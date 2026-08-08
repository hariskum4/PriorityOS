import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bodyWindows,
  estimateCostOfWaiting,
  estimateCreativeCompounding,
  countable,
  matchRitual,
  costOfDelay,
  nextDomainAction,
  childrenAreRemote,
} from '@priority/scoring-engine';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import { driftOf, isPlanned } from '@/components/Constellation';
import { Button, Card, Chip, DomainDot, EmptyState, GapBar, Label } from '@/components/ui';
import { colors, type, space, domainColor, isLight, alpha } from '@/theme';

const DOMAIN_LABELS: Record<string, string> = {
  family: 'Family / Parents', partner: 'Partner', children: 'Children',
  health: 'Health', career: 'Career', finance: 'Financial freedom',
  growth: 'Personal growth', friends: 'Friends', experiences: 'Experiences',
  reflection: 'Inner life', purpose: 'Purpose / Creative work', impact: 'Giving back',
};

/**
 * The words that find this person's own ritual for a domain.
 *
 * Single tokens on purpose: `matchRitual` needs one side to be a subset of
 * the other, so probing with a whole phrase ("trips somewhere new") misses
 * "road trips with Sheetal" while "trips" finds it. Several per domain
 * because nobody agrees on the noun — one person counts treks, the next
 * counts trips, and both mean the same window.
 */
const DOMAIN_COUNT_PROBES: Record<string, string[]> = {
  experiences: ['trips', 'travels', 'treks', 'adventures', 'journeys'],
};

/** A ritual someone chose to count, as stored in their onboarding answers. */
interface SavedCount { key: string; label: string; perYear: number }

const RELATIONSHIP_DOMAINS = ['family', 'partner', 'children', 'friends'];
const relDomain: Record<string, string> = {
  mother: 'family', father: 'family', parent: 'family', sibling: 'family',
  spouse: 'partner', partner: 'partner', friend: 'friends',
  child: 'children', son: 'children', daughter: 'children', mentor: 'friends',
};

function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const y = (Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000);
  return y > 5 && y < 110 ? Math.floor(y) : null;
}

/**
 * What this domain is doing, in one word — the same reading as everywhere else.
 *
 * The thresholds are the Today read-out's, and the input is `driftOf`, so a
 * domain cannot be "drifting" on one screen and "flat" on another. Green is
 * spent only where the gap is genuinely small: a trend of "flat" describes
 * the direction, and saying so in green above a bar reading 63 against 0
 * congratulates somebody for holding still at the bottom.
 */
function verdictFor(domain: { importance: number; attention: number; neglectRisk?: number; trend?: string }) {
  /* Never rated is not the same as balanced. Five of the twelve domains sit
     at 0 importance for a new account, and "steady" in green told somebody
     they had this part of their life handled when they had never mentioned
     it. Today's read-out has always said "not in your plan yet"; this says
     the same thing in a chip. */
  if (!isPlanned(domain as Parameters<typeof isPlanned>[0])) return { label: 'not rated', color: colors.textDim };
  const drift = driftOf(domain as Parameters<typeof driftOf>[0]);
  if (drift > 0.55) return { label: 'drifting', color: colors.rose };
  if (drift > 0.25) return { label: 'a gap', color: colors.amber };
  if (domain.trend === 'up') return { label: 'rising', color: colors.green };
  if (domain.trend === 'down') return { label: 'slipping', color: colors.amber };
  return { label: 'steady', color: colors.green };
}

export default function DomainDetail() {
  const { type: domainType } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const c = domainColor(domainType);

  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('/me') });
  const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: () => api<any[]>('/goals') });
  const { data: missions } = useQuery({ queryKey: ['missions'], queryFn: () => api<any[]>('/missions?status=pending') });
  /**
   * What has already been done here. Without this the screen could only see
   * pending missions, so completing the one starter action made it look
   * untaken again and the identical suggestion came straight back.
   */
  const { data: doneMissions } = useQuery({
    queryKey: ['missions-completed'],
    queryFn: () => api<any[]>('/missions?status=completed'),
  });
  const { data: relationships } = useQuery({ queryKey: ['relationships'], queryFn: () => api<any[]>('/relationships') });

  const complete = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['missions-completed'] });
      invalidateLifeRecord(qc);
    },
  });
  /**
   * Every rhythm this person has here, retired ones included.
   *
   * Retired ones matter as much as active ones: a rung someone took up and
   * later ended must not be handed back to them the next morning as though
   * it had never happened.
   */
  const { data: allHabits } = useQuery({
    queryKey: ['habits', 'all'],
    queryFn: () => api<any[]>('/habits?all=1'),
  });
  /**
   * The rituals this person counts, and how many of each they have lived.
   *
   * Here for one reason: the Experiences card quoted "~130 more real trips at
   * your pace" from a literal `tripsRemaining(age, 2)`, on the same card whose
   * next line invited the reader to name their own rituals on the Time tab.
   * Either their number goes there or no number does.
   */
  const { data: answers } = useQuery({
    queryKey: ['onboarding-answers'],
    queryFn: () => api<any[]>('/onboarding/answers'),
  });
  const { data: countsLived } = useQuery({
    queryKey: ['memories-counts'],
    queryFn: () => api<Record<string, { count: number; firstAt: string }>>('/memories/counts-summary'),
  });

  /**
   * Ending a rhythm, and picking one back up.
   *
   * Not a delete. Someone who kept a rhythm for six months and no longer
   * needs it has not made a mistake to undo — the streak and everything
   * logged stay, and the app simply stops asking. Without this there was no
   * way to stop a habit at all, which was survivable when four existed and
   * is not now that every domain can offer one.
   */
  const retireOpts = {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  };
  const retire = useMutation({
    mutationFn: (id: string) => api(`/habits/${id}/retire`, { method: 'POST', body: {} }),
    ...retireOpts,
  });
  const restore = useMutation({
    mutationFn: (id: string) => api(`/habits/${id}/restore`, { method: 'POST', body: {} }),
    ...retireOpts,
  });

  /**
   * Taking the next rung. Most rungs are errands and become missions; the
   * ones marked recurring are standing commitments and become habits.
   *
   * They were all missions before, which meant "make the call a standing
   * weekly thing" was ticked once on a Tuesday, awarded its XP and never seen
   * again — the app agreeing the rhythm was finished before it had started.
   */
  const addStarter = useMutation({
    mutationFn: ({ title, minutes, recurring }: {
      title: string; minutes: number; recurring?: { perWeek: number };
    }) => (recurring
      ? api('/habits', {
        method: 'POST',
        body: {
          title,
          domainType,
          targetPerWeek: recurring.perWeek,
          // Marks it as the app's suggestion rather than something they
          // wrote, which is what the ladder is.
          sourceType: 'system',
        },
      })
      : api('/missions', {
        method: 'POST',
        body: { title, domainType, estimatedMinutes: minutes, xpReward: 30 },
      })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['missions-completed'] });
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  /**
   * Whether every child on this page lives away. The children ladder and
   * prompt switch on it: "One undivided hour with them this week" is not a
   * rung a parent in Vigo can take toward a 25-year-old in Madrid, and a
   * page of untakeable rungs reads as advice for a different life.
   */
  const remoteChildren = React.useMemo(
    () => childrenAreRemote(relationships ?? []),
    [relationships],
  );

  /**
   * Where this domain stands on its ladder — the first action not already
   * done and not already waiting on the list. When the ladder runs out the
   * card says so instead of starting again from the top.
   */
  const rung = React.useMemo(() => nextDomainAction(
    domainType,
    (doneMissions ?? []).filter((m: any) => m.domainType === domainType).map((m: any) => m.title),
    [
      ...(missions ?? []).filter((m: any) => m.domainType === domainType).map((m: any) => m.title),
      // A rung taken up as a rhythm never lands in missions, so without this
      // the ladder would offer it again every single time this screen opened.
      ...(allHabits ?? []).filter((h: any) => h.domainType === domainType).map((h: any) => h.title),
    ],
    { remoteChildren },
  ), [domainType, doneMissions, missions, allHabits, remoteChildren]);

  const domain = (dashboard?.domains ?? []).find((d: any) => d.domainType === domainType);
  const domainGoals = (goals ?? []).filter((g) => g.domainType === domainType && g.status !== 'done');
  const domainMissions = (missions ?? []).filter((m) => m.domainType === domainType);
  /* Active first, then retired — the ended ones stay visible so they can be
     picked back up, and so the ladder's silence about them makes sense. */
  const domainHabits = (allHabits ?? [])
    .filter((h: any) => h.domainType === domainType)
    .sort((a: any, b: any) => Number(b.isActive) - Number(a.isActive));
  const domainPeople = (relationships ?? []).filter((r) => relDomain[r.relationType] === domainType);
  const age = ageFromDob(me?.dob);
  const label = DOMAIN_LABELS[domainType] ?? domainType;

  /**
   * This person's own count for this domain, if they keep one — their words,
   * their pace, and the pace the archive proved wherever it can see it.
   * Null when they count nothing here, and then the card quotes nothing.
   */
  const ownCount = (() => {
    const probes = DOMAIN_COUNT_PROBES[domainType];
    if (!probes || age === null) return null;
    const saved: SavedCount[] = (answers ?? [])
      .filter((a: any) => a.section === 'counts' && a.value?.label)
      .map((a: any) => ({
        key: a.key as string,
        label: a.value.label as string,
        perYear: a.value.perYear as number,
      }));
    const names = saved.map((c: SavedCount) => ({ key: c.key, label: c.label }));
    /* First probe that lands wins, so the order above is the preference. */
    const hit = probes.reduce<ReturnType<typeof matchRitual>>(
      (found, p) => found ?? matchRitual(p, names), null,
    );
    const mine = hit ? saved.find((c: SavedCount) => c.key === hit.against.key) : undefined;
    if (!mine) return null;
    const lived = countsLived?.[mine.key];
    return countable({
      age,
      country: me?.country,
      label: mine.label,
      declaredPerYear: mine.perYear,
      observation: lived ? { count: lived.count, firstAt: lived.firstAt } : undefined,
    });
  })();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.textDim} />
          <Text style={type.dim}>Today</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <DomainDot domain={domainType} size={14} />
          <Text style={type.display}>{label}</Text>
        </View>

        {domain && (
          <Card style={{ gap: space(2), backgroundColor: `${c}${isLight ? '10' : '12'}` }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label>Say vs do</Label>
              {/* One verdict per domain, from `driftOf` — the same function the
                  constellation and the Today read-out use. This card judged on
                  `neglectRisk` alone and ignored the say/do gap beside it, so a
                  domain rated 63 and getting 0 wore a green "flat" here while
                  Today called it drifting: two screens, one domain, opposite
                  answers, and the green one directly above the evidence. */}
              {(() => {
                const chip = verdictFor(domain);
                return <Chip label={chip.label} color={chip.color} />;
              })()}
            </View>
            <GapBar importance={domain.importance} attention={domain.attention} color={c} />
          </Card>
        )}

        <SignatureFeature
          domainType={domainType}
          age={age}
          color={c}
          onAdd={(t, minutes, recurring) => addStarter.mutate({ title: t, minutes, recurring })}
          rung={rung}
          busy={addStarter.isPending}
          ownCount={ownCount}
          remoteChildren={remoteChildren}
        />

        {/* Cost of delay — this domain compounds; starting now beats starting later */}
        <Card style={{ gap: space(2), backgroundColor: colors.surfaceSunken }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="hourglass-outline" size={14} color={colors.textDim} />
            <Label>Why now beats later</Label>
          </View>
          <Text style={type.serif}>{costOfDelay(domainType, 10).framingText}</Text>
        </Card>

        {/* People — relationship domains */}
        {RELATIONSHIP_DOMAINS.includes(domainType) && (
          <View style={{ gap: space(2) }}>
            <Label>The people here</Label>
            {domainPeople.length === 0 ? (
              <Card><Text style={type.dim}>No one added to {label.toLowerCase()} yet. Add them on the People tab.</Text></Card>
            ) : domainPeople.map((r) => (
              /* A name that does nothing when you press it reads as broken.
                 This opens the person — their history, the moments kept with
                 them, and the place to correct or remove them. */
              <Pressable key={r.id} onPress={() => router.push(`/person/${r.id}`)}>
                {({ pressed }) => (
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${c}26`, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: c, fontWeight: '700' }}>{r.name[0]}</Text>
                    </View>
                    <Text style={[type.heading, { flex: 1 }]}>{r.name}</Text>
                    <Text style={[type.faint, { textTransform: 'capitalize' }]}>{r.relationType}</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                  </Card>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Goals */}
        <View style={{ gap: space(2) }}>
          <Label>Goals in this area</Label>
          {domainGoals.length === 0 ? (
            <Card><Text style={type.dim}>No goals here yet. The someday check in onboarding, or the Missions tab, is where these begin.</Text></Card>
          ) : domainGoals.map((g) => (
            <Card key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="flag-outline" size={16} color={c} />
              <Text style={[type.body, { flex: 1 }]}>{g.title}</Text>
              <Chip label={g.horizon === '5y' ? '5 yrs' : 'this year'} />
            </Card>
          ))}
        </View>

        {/* Standing rhythms here — the thing a ladder climbs toward, and
            until now the one kind of commitment this screen could create but
            never show. Without it, taking a recurring rung looked like
            nothing happened at all. */}
        {domainHabits.length > 0 && (
          <View style={{ gap: space(2) }}>
            <Label>Rhythms here</Label>
            {domainHabits.map((h: any) => (
              <Card key={h.id} style={{ gap: space(2) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons
                    name={h.isActive ? 'repeat' : 'remove-circle-outline'}
                    size={14}
                    color={h.isActive ? c : colors.textFaint}
                  />
                  <Text style={[type.body, { flex: 1 }, !h.isActive && { color: colors.textDim }]}>
                    {h.title}
                  </Text>
                  {h.isActive && typeof h.streakCurrent === 'number' && h.streakCurrent > 0 ? (
                    <Chip label={`${h.streakCurrent}w`} color={colors.green} />
                  ) : null}
                </View>
                <Text style={type.faint}>
                  {h.isActive
                    ? `${h.targetPerWeek} a week · ${h.perWeek ?? 0} a week over the last ${h.rateWindowDays ?? 28} days`
                    : 'Retired. The streak and everything logged stay yours.'}
                </Text>
                <Button
                  title={h.isActive ? 'Retire this rhythm' : 'Pick it back up'}
                  small
                  kind="ghost"
                  disabled={retire.isPending || restore.isPending}
                  onPress={() => (h.isActive ? retire : restore).mutate(h.id)}
                />
              </Card>
            ))}
          </View>
        )}

        {/* Open missions */}
        {domainMissions.length > 0 && (
          <View style={{ gap: space(2) }}>
            <Label>Open here</Label>
            {domainMissions.map((m) => (
              <Card key={m.id} style={{ gap: space(2) }}>
                <Text style={type.body}>{m.title}</Text>
                {/* Same verb as Today and Missions, and no bounty on it —
                    a mission is worth doing for the thing it does. */}
                <Button title="Done" small onPress={() => complete.mutate(m.id)} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

/**
 * The signature feature per domain — the blueprint's §5.3 headline tool,
 * finally with a home. Everything is estimate-framed and offers one
 * concrete action.
 */
function SignatureFeature({ domainType, age, color, onAdd, rung, busy, ownCount, remoteChildren }: {
  domainType: string; age: number | null; color: string;
  onAdd: (title: string, minutes: number, recurring?: { perWeek: number }) => void;
  rung: ReturnType<typeof nextDomainAction>;
  busy: boolean;
  /** Their own ritual for this domain, or null when they keep none. */
  ownCount: { label: string; remaining: number; detailText: string } | null;
  /** Every child on file lives away — the children prompt switches on it. */
  remoteChildren?: boolean;
}) {
  const [monthly, setMonthly] = React.useState('10000');
  const [minutes, setMinutes] = React.useState(30);

  /**
   * The next thing this domain is asking for.
   *
   * The literal starter titles that used to be hard-coded at each call site
   * are now the first rung of each ladder, so nothing changes for a new user —
   * but once they do it, the next tap offers the next thing instead of the
   * same thing. The argument is ignored; it survives only so the callers below
   * read the way they did.
   */
  const starter = (_label?: string, _title?: string) => {
    if (rung.finished) {
      return (
        <View style={{ gap: 4 }}>
          <Text style={[type.faint, { color: colors.green }]}>
            You have done everything this area knows to suggest — {rung.total} of {rung.total}.
          </Text>
          <Text style={type.faint}>
            What comes next here is yours to name, not ours. The Missions tab takes your own.
          </Text>
        </View>
      );
    }
    const recurring = rung.next!.recurring;
    return (
      <View style={{ gap: 6 }}>
        <Button
          title={busy ? 'Adding…' : rung.next!.label}
          small
          kind="ghost"
          disabled={busy}
          onPress={() => onAdd(rung.next!.title, rung.next!.minutes, recurring)}
        />
        {/* A standing rhythm and a one-off errand are not the same promise,
            and the button looked identical for both. This one does not get
            ticked off and disappear — it stays, every week. Say so first. */}
        {recurring ? (
          <Text style={[type.faint, { color: colors.amber }]}>
            This one becomes a rhythm, not a task — {recurring.perWeek}
            {recurring.perWeek === 1 ? ' time' : ' times'} a week, and it stays.
          </Text>
        ) : null}
        {rung.taken > 0 ? (
          <Text style={type.faint}>
            {rung.taken} of {rung.total} done here. This is the next one.
          </Text>
        ) : null}
      </View>
    );
  };

  if (domainType === 'health' && age !== null) {
    const windows = bodyWindows(age);
    return (
      <Card style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="fitness-outline" size={14} color={colors.textDim} />
          <Label>Windows open right now</Label>
        </View>
        {windows.map((w) => (
          <View key={w.key} style={s.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[type.heading, { flex: 1 }]}>{w.label}</Text>
              {/* Closed converts rather than vanishes — see the Time tab's
                  windows card for the story. Without the state check a
                  closed window's null yearsLeft read as "always open",
                  which is the one thing it is not. */}
              <Chip
                label={w.state === 'closed' ? 'has passed'
                  : w.yearsLeft === null ? 'always open' : `~${w.yearsLeft} yrs`}
                color={w.state === 'closed' ? colors.textDim
                  : w.yearsLeft === null ? colors.green : colors.amber}
              />
            </View>
            <Text style={type.faint}>{w.framingText}</Text>
          </View>
        ))}
        {starter('Book the annual checkup', 'Book the annual health checkup')}
      </Card>
    );
  }

  if (domainType === 'finance' && age !== null) {
    const money = estimateCostOfWaiting({ monthlyAmount: parseInt(monthly, 10) || 0, currentAge: age, targetAge: 60 });
    return (
      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="trending-up-outline" size={14} color={colors.textDim} />
          <Label>The freedom number</Label>
        </View>
        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
          {['5000', '10000', '25000', '50000'].map((v) => (
            <Pressable key={v} onPress={() => setMonthly(v)} style={[s.chip, monthly === v && s.chipOn]}>
              <Text style={[type.body, monthly === v && { color: colors.amber, fontWeight: '700' }]}>{Number(v).toLocaleString()}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={type.serif}>
          {Number(monthly).toLocaleString()} a month until 60 grows to ~{money.corpusStartingNow.toLocaleString()}.
        </Text>
        <Text style={[type.dim, { color: colors.green }]}>{money.framingText}</Text>
        <Text style={type.faint}>{money.assumptions[0]}.</Text>
        {starter('Start a monthly review habit', 'Weekly money review')}
      </Card>
    );
  }

  if (domainType === 'purpose' || domainType === 'growth') {
    const creative = estimateCreativeCompounding(minutes);
    return (
      <Card style={{ gap: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="color-palette-outline" size={14} color={colors.textDim} />
          <Label>The 30-minute calculator</Label>
        </View>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          {[15, 30, 60].map((m) => (
            <Pressable key={m} onPress={() => setMinutes(m)} style={[s.chip, minutes === m && s.chipOn]}>
              <Text style={[type.body, minutes === m && { color: colors.amber, fontWeight: '700' }]}>{m} min/day</Text>
            </Pressable>
          ))}
        </View>
        <Text style={type.serif}>{creative.framingText}</Text>
        {domainType === 'purpose'
          ? starter('Open the project today', 'Work on the project for 30 minutes')
          : starter('Start a learning habit', 'Learn for 30 minutes')}
      </Card>
    );
  }

  if (domainType === 'experiences' && age !== null) {
    return (
      <Card style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="airplane-outline" size={14} color={colors.textDim} />
          <Label>The experience window</Label>
        </View>
        {/* Their ritual or none. This line used to say "~130 more real trips
            at your pace" to everybody, from a hard-coded two a year, directly
            above an invitation to go and state a pace. */}
        {ownCount ? (
          <>
            <Text style={type.serif}>
              ~{ownCount.remaining} more {ownCount.label} — and the rough-travel window
              is shorter than the list.
            </Text>
            <Text style={type.faint}>{ownCount.detailText}</Text>
          </>
        ) : (
          <Text style={type.serif}>
            The rough-travel window is shorter than the list, and nobody can
            count it for you. Name what travel means to you on the Time tab —
            treks, ocean swims, festivals — and this becomes a number.
          </Text>
        )}
        <Text style={type.faint}>Counted moments tick down as you live them, on whatever pace you actually keep.</Text>
        {starter('Plan one local adventure', 'Plan one local adventure this month')}
      </Card>
    );
  }

  // reflection, impact, career, and relationship domains: a prompt + starter.
  const prompts: Record<string, { label: string; icon: any; text: string; starter: string }> = {
    reflection: { label: 'The big questions', icon: 'moon-outline', text: 'Inner life compounds quietly. A minute of honesty today is worth an hour of it in a crisis.', starter: 'Sit quietly for 5 minutes' },
    impact: { label: 'One person you could help', icon: 'earth-outline', text: 'Contribution is the domain that outlives you. Skills, time, or money — start with whichever is easiest this month.', starter: 'Mentor or help one person this month' },
    career: { label: 'Career, on your terms', icon: 'briefcase-outline', text: 'The goal is not more hours — it is that the hours point somewhere you chose.', starter: 'Block two hours of focused work' },
    family: { label: 'Show up', icon: 'heart-outline', text: 'The research is blunt: close relationships are the strongest predictor of a long, happy life.', starter: 'Call someone in your family today' },
    partner: { label: 'Presence over logistics', icon: 'heart-outline', text: 'Partnership erodes in the admin and rebuilds in the small, undivided moments.', starter: 'Plan a phone-free evening together' },
    children: remoteChildren
      /* Written for the parent whose children are grown or away — the
         co-located line names ordinary shared days this reader does not
         have, and reads as a page that never looked at the addresses. */
      ? { label: 'The distance years', icon: 'happy-outline', text: 'Distance sets the medium, not the closeness. The calls are where the ordinary days live now.', starter: 'A call where they pick the topic' }
      : { label: 'The concentrated years', icon: 'happy-outline', text: 'Ordinary days are where childhood actually happens.', starter: 'One undivided hour with them this week' },
    friends: { label: 'Against the drift', icon: 'people-outline', text: 'Friendships rarely end in a fight. They end in a slow quiet no one decided on.', starter: 'Message a friend you have been meaning to' },
  };
  const p = prompts[domainType] ?? prompts.reflection;
  return (
    <Card style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={p.icon} size={14} color={colors.textDim} />
        <Label>{p.label}</Label>
      </View>
      <Text style={type.serif}>{p.text}</Text>
      {starter(p.starter, p.starter)}
    </Card>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { gap: 4, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: space(2) },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
});
