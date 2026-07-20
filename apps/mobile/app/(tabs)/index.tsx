import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { tinyStep } from '@priority/scoring-engine';
import { useRouter } from 'expo-router';
import { useMemoryDraft } from '@/store/memoryDraft';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Button, Card, Chip, DomainDot, GapBar, Label, XpBar,
} from '@/components/ui';
import { colors, type, space, domainColor, domainTint, greeting, levelProgress, skyGradient } from '@/theme';

/** Overall alignment: 100 minus the importance-weighted say/do gap. */
function relativeDays(iso: string | Date): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

function alignmentScore(domains: any[]): number {
  const active = domains.filter((d) => d.importance > 0);
  if (!active.length) return 0;
  const totalWeight = active.reduce((sum, d) => sum + d.importance, 0);
  const weightedGap = active.reduce(
    (sum, d) => sum + Math.max(0, d.importance - d.attention) * d.importance,
    0,
  );
  return 100 - (weightedGap / totalWeight);
}

/** Days each desired cadence represents — for the "people waiting" glance. */
const CADENCE_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

/**
 * The Life Home focus dial: today's one thing held inside a slow-breathing
 * ring in its domain's color. Motion explains, it doesn't decorate — the
 * breath says "alive, unhurried", nothing more.
 */
function FocusDial({ color, breathe, children }: {
  color: string; breathe: boolean; children: React.ReactNode;
}) {
  const size = 250;
  const r = (size - 18) / 2;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!breathe) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.015, duration: 2600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(scale, { toValue: 1, duration: 2600, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, scale]);
  return (
    <Animated.View
      style={{
        width: size, height: size, alignSelf: 'center',
        alignItems: 'center', justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} stroke={`${color}26`} strokeWidth={1.5} fill={`${color}0D`} />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={2.5} fill="none" opacity={0.85} />
      </Svg>
      <View style={{ maxWidth: size - 60, alignItems: 'center', gap: 7 }}>{children}</View>
    </Animated.View>
  );
}

export default function Today() {
  const qc = useQueryClient();
  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<any>('/dashboard'),
  });
  const { data: review } = useQuery({
    queryKey: ['weekly-review'],
    queryFn: () => api<any>('/weekly-review/current'),
  });
  // Shared with the People tab (same cache key) — feeds the glance row.
  const { data: relationships } = useQuery({
    queryKey: ['relationships'],
    queryFn: () => api<any[]>('/relationships'),
  });
  // Fast-lane starters skipped the depth questions — invite them back once
  // they're in. Deeper answers = a sharper reveal + better personalization.
  const { data: obAnswers } = useQuery({
    queryKey: ['onboarding-answers'],
    queryFn: () => api<any[]>('/onboarding/answers'),
    staleTime: 5 * 60_000,
  });
  const hasAnswer = (key: string) =>
    (obAnswers ?? []).some((a) => {
      if (a.key !== key) return false;
      const v = a.value;
      return typeof v === 'string'
        ? v.trim().length > 0
        : v && typeof v === 'object' && Object.keys(v).length > 0;
    });
  // A deepen pass forces reality scores; futureSelf can be deliberately
  // skipped — either one counts as "they went deeper", and the card rests.
  const needsDepth =
    Array.isArray(obAnswers) &&
    obAnswers.length > 0 && // onboarded at all
    !hasAnswer('futureSelf') &&
    !hasAnswer('currentReality');
  const [justCompleted, setJustCompleted] = React.useState<any | null>(null);
  const router = useRouter();
  const setMemoryDraft = useMemoryDraft((st) => st.setDraft);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['missions'] });
    qc.invalidateQueries({ queryKey: ['missions-completed'] });
  };
  const complete = useMutation({
    mutationFn: (m: any) => api<any>(`/missions/${m.id}/complete`, { method: 'POST' }),
    onSuccess: (res, m) => {
      // The adaptive loop's client half: the server may have already lined
      // up the next-best action — show it in the celebration.
      setJustCompleted({ ...m, next: res?.next ?? null });
      invalidate();
    },
  });
  const snooze = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/snooze`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  // Honest recalibration: stated priorities are sometimes false fronts.
  // Letting go without judgment beats churning from guilt.
  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}`, { method: 'PATCH', body: { status: 'dismissed' } }),
    onSuccess: invalidate,
  });
  const tickHabit = useMutation({
    mutationFn: (id: string) => api(`/habits/${id}/complete`, { method: 'POST', body: {} }),
    onSuccess: invalidate,
  });

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const m = data.todayMission;
  const allDomains = (data.domains ?? []).slice()
    .sort((a: any, b: any) => b.importance - a.importance);
  const domains = allDomains.filter((d: any) => d.importance > 0);
  const score = alignmentScore(domains);
  const gam = data.gamification;
  const lvl = gam ? levelProgress(gam.totalXp ?? 0) : null;
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Glance row — real numbers only, no mocked "Energy 72%".
  const peopleWaiting = (relationships ?? []).filter((r: any) => {
    if (!r.wantsMoreTime) return false;
    const target = CADENCE_DAYS[r.desiredCallFrequency] ?? 30;
    const d = r.lastContactAt
      ? (Date.now() - new Date(r.lastContactAt).getTime()) / 86_400_000
      : Infinity;
    return d / target >= 1.5;
  }).length;
  const habitsTotal = (data.todayHabits ?? []).length;
  const habitsDone = (data.todayHabits ?? []).filter((h: any) => h.doneToday).length;
  const dialColor = m ? domainColor(m.domainType) : colors.green;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={skyGradient()} style={s.skyWash} pointerEvents="none" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.wrap}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.amber} />}
      >
      <View style={s.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.faint}>{dateLine}</Text>
          <Text style={type.display}>{greeting()}</Text>
        </View>
        {gam && (
          <View style={s.streakBadge}>
            <Ionicons name="flame" size={15} color={colors.amber} />
            <Text style={{ color: colors.amber, fontWeight: '700', fontSize: 14 }}>{gam.dailyStreak}</Text>
          </View>
        )}
      </View>

      {gam && lvl && (
        <View style={s.levelRow}>
          <Text style={[type.faint, { width: 38 }]}>Lv {lvl.level}</Text>
          <XpBar into={lvl.intoLevel} needed={lvl.neededForNext} />
          <Text style={type.faint}>{lvl.intoLevel}/{lvl.neededForNext} XP</Text>
        </View>
      )}

      {/* This week's One Thing + intention, set in the Sunday Session */}
      {review?.oneThing && (
        <View style={s.oneThingRow}>
          <Ionicons name="pin" size={13} color={colors.amber} />
          <Text style={[type.dim, { flex: 1 }]}>
            <Text style={{ color: colors.amber, fontWeight: '700' }}>This week: </Text>
            {review.oneThing}
            {review.intentionWord ? `  ·  ${review.intentionWord}` : ''}
          </Text>
        </View>
      )}

      {/* Completion banner — the loop made the next mission appear below;
          this keeps the win (and the memory hand-off) visible. */}
      {justCompleted && m && (
        <View style={s.doneBanner}>
          <Ionicons name="checkmark-circle" size={18} color={colors.green} />
          <Text style={[type.dim, { flex: 1 }]}>
            <Text style={{ color: colors.green, fontWeight: '700' }}>Done, +{justCompleted.xpReward} XP. </Text>
            {justCompleted.next
              ? 'The engine picked your next one below.'
              : 'Your plate already has what matters — nothing new needed.'}
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
            <Text style={[type.dim, { color: colors.amber, fontWeight: '700' }]}>Save the moment</Text>
          </Pressable>
          <Pressable onPress={() => setJustCompleted(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      )}

      {/* THE LIFE HOME — one mission, held in a breathing ring. Anti-overload
          stays the law: the dial holds one thing; everything else waits. */}
      {m ? (
        <View style={{ gap: space(4), marginTop: space(2) }}>
          <FocusDial color={dialColor} breathe>
            <Label color={dialColor}>Today's one thing</Label>
            <Text style={[type.title, { fontSize: 19, textAlign: 'center' }]} numberOfLines={4}>
              {m.title}
            </Text>
            <Text style={[type.faint, { textAlign: 'center' }]}>
              {m.relationship?.name ? `with ${m.relationship.name} · ` : ''}
              {m.estimatedMinutes ? `${m.estimatedMinutes} min · ` : ''}+{m.xpReward} XP
            </Text>
          </FocusDial>
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <View style={{ flex: 1 }}>
              <Button title="Done" onPress={() => complete.mutate(m)} />
            </View>
            <Button title="Tomorrow" kind="ghost" onPress={() => snooze.mutate(m.id)} />
          </View>
        </View>
      ) : (
        <View style={{ gap: space(4), marginTop: space(2) }}>
          <FocusDial color={colors.green} breathe={false}>
            <Ionicons
              name={justCompleted ? 'checkmark-circle' : 'leaf-outline'}
              size={30}
              color={colors.green}
            />
            <Text style={[type.title, { fontSize: 19, textAlign: 'center' }]}>
              {justCompleted ? `Done — +${justCompleted.xpReward} XP` : 'Nothing pending'}
            </Text>
            <Text style={[type.faint, { textAlign: 'center' }]}>
              {justCompleted
                ? 'That was the one thing that mattered most today.'
                : 'That is alignment. Enjoy the calm.'}
            </Text>
          </FocusDial>
          {justCompleted && (
            <Button
              title="Save the moment"
              kind="ghost"
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
            />
          )}
        </View>
      )}

      {/* The glance row — real numbers only, each one an existing engine
          output. No mocked Energy/Focus/Mood. */}
      <View style={s.glanceRow}>
        <View style={s.glanceTile}>
          <Text style={[type.stat, { fontSize: 22, color: score >= 70 ? colors.green : score >= 45 ? colors.amber : colors.rose }]}>
            {Math.round(score)}
          </Text>
          <Text style={type.faint}>life alignment</Text>
        </View>
        <Pressable style={s.glanceTile} onPress={() => router.push('/(tabs)/people')}>
          {peopleWaiting > 0 ? (
            <Text style={[type.stat, { fontSize: 22, color: colors.rose }]}>{peopleWaiting}</Text>
          ) : (
            <Ionicons name="heart" size={22} color={colors.green} style={{ marginVertical: 3 }} />
          )}
          <Text style={type.faint}>
            {peopleWaiting === 1 ? 'person waiting' : peopleWaiting > 1 ? 'people waiting' : 'people, close'}
          </Text>
        </Pressable>
        <View style={s.glanceTile}>
          {habitsTotal > 0 ? (
            <>
              <Text style={[type.stat, { fontSize: 22, color: habitsDone === habitsTotal ? colors.green : colors.amber }]}>
                {habitsDone}/{habitsTotal}
              </Text>
              <Text style={type.faint}>habits today</Text>
            </>
          ) : (
            <>
              <Text style={[type.stat, { fontSize: 22, color: colors.amber }]}>{gam?.dailyStreak ?? 0}</Text>
              <Text style={type.faint}>day streak</Text>
            </>
          )}
        </View>
      </View>

      {/* The mission's supporting context — why, the memory, the tiny step */}
      {m && (
        <Card style={{ gap: space(3) }}>
          {data.whyToday && (
            <View style={s.whyBox}>
              <Ionicons name="sparkles-outline" size={14} color={colors.textDim} style={{ marginTop: 3 }} />
              <Text style={[type.dim, { flex: 1 }]}>{data.whyToday.whyToday}</Text>
            </View>
          )}
          {/* Resurfaced memory — the last saved moment with this person */}
          {data.resurfacedMemory && (
            <View style={s.memoryBox}>
              <Ionicons name="images-outline" size={14} color={colors.amber} style={{ marginTop: 3 }} />
              <Text style={[type.dim, { flex: 1 }]}>
                <Text style={{ color: colors.amber, fontWeight: '700' }}>
                  Last time with {data.resurfacedMemory.personName}:{' '}
                </Text>
                “{data.resurfacedMemory.title}” — {relativeDays(data.resurfacedMemory.occurredAt)}.
                {data.resurfacedMemory.reflection ? ` Worth bringing up.` : ''}
              </Text>
            </View>
          )}
          <View style={s.tinyRow}>
            <Ionicons name="footsteps-outline" size={14} color={colors.green} style={{ marginTop: 2 }} />
            <Text style={[type.dim, { flex: 1 }]}>
              <Text style={{ color: colors.green, fontWeight: '700' }}>Too big right now? </Text>
              {m.description ||
                tinyStep({
                  title: m.title,
                  domainType: m.domainType,
                  missionType: m.missionType,
                  personName: m.relationship?.name,
                })}
            </Text>
          </View>
          {data.whyToday?.encouragement && (
            <Text style={[type.faint, { textAlign: 'center' }]}>{data.whyToday.encouragement}</Text>
          )}
          {m.snoozeCount >= 2 && (
            <View style={s.recalRow}>
              <Text style={[type.faint, { flex: 1 }]}>
                You've moved this {m.snoozeCount} times. Priorities are allowed to change.
              </Text>
              <Pressable onPress={() => dismiss.mutate(m.id)} hitSlop={8}>
                <Text style={[type.faint, { color: colors.rose, fontWeight: '600' }]}>Not a priority now</Text>
              </Pressable>
            </View>
          )}
        </Card>
      )}

      {/* Supporting missions — max two, quiet */}
      {data.supportingMissions?.length > 0 && (
        <Card>
          <Label>If you have more in you</Label>
          {data.supportingMissions.map((sm: any) => (
            <View key={sm.id} style={s.supportRow}>
              <DomainDot domain={sm.domainType} />
              <Text style={[type.body, { flex: 1 }]}>{sm.title}</Text>
              <Text style={type.faint}>+{sm.xpReward}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* One insight, framed as an estimate */}
      {data.insight && (
        <Card style={{ backgroundColor: colors.surfaceSunken }}>
          <Label>Worth knowing</Label>
          <Text style={type.serif}>{data.insight.headline}</Text>
          <Text style={type.faint}>{data.insight.detail}</Text>
        </Card>
      )}

      {/* Habits for today */}
      {data.todayHabits?.length > 0 && (
        <Card>
          <Label>Habits</Label>
          {data.todayHabits.map((h: any) => (
            <Pressable
              key={h.id}
              disabled={h.doneToday}
              onPress={() => tickHabit.mutate(h.id)}
              style={({ pressed }) => [s.habitRow, pressed && { opacity: 0.7 }]}
            >
              <Ionicons
                name={h.doneToday ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={h.doneToday ? colors.green : colors.textFaint}
              />
              <Text style={[type.body, { flex: 1 }, h.doneToday && { color: colors.textDim, textDecorationLine: 'line-through' }]}>
                {h.title}
              </Text>
              {typeof h.currentStreak === 'number' && h.currentStreak > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="flame-outline" size={13} color={colors.textDim} />
                  <Text style={type.faint}>{h.currentStreak}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </Card>
      )}

      {/* The invitation back into depth — only for fast-lane starters */}
      {needsDepth && !justCompleted && (
        <Pressable onPress={() => router.push('/onboarding?mode=deepen')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.surfaceSunken }}>
            <Ionicons name="telescope-outline" size={18} color={colors.amber} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.heading}>Deepen your reveal</Text>
              <Text style={type.faint}>
                Five quiet questions about who you're becoming. Your plan gets sharper.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Card>
        </Pressable>
      )}

      {/* Domain pulse — every part of life, one glance, all tappable */}
      <View style={{ gap: space(2), marginTop: space(2) }}>
        <Label>Every part of life</Label>
        <View style={s.pulseRow}>
          {allDomains.map((d: any) => {
            const c = domainColor(d.domainType);
            const status =
              d.importance <= 0
                ? { border: colors.line, text: colors.textFaint }
                : d.neglectRisk >= 50
                  ? { border: colors.rose, text: colors.rose }
                  : d.importance - d.attention > 25
                    ? { border: colors.amberSoft, text: colors.amber }
                    : { border: colors.greenSoft, text: colors.green };
            return (
              <Pressable
                key={d.domainType}
                onPress={() => router.push(`/domain/${d.domainType}`)}
                style={({ pressed }) => [
                  s.pulseChip,
                  { borderColor: status.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <DomainDot domain={d.domainType} size={8} />
                <Text style={{ color: c, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>
                  {d.domainType}
                </Text>
                <Ionicons
                  name={
                    d.importance <= 0
                      ? 'ellipse-outline'
                      : d.neglectRisk >= 50
                        ? 'trending-down'
                        : d.importance - d.attention > 25
                          ? 'remove'
                          : 'trending-up'
                  }
                  size={11}
                  color={status.text}
                />
              </Pressable>
            );
          })}
        </View>
        <Text style={type.faint}>
          Green is thriving, amber has a gap, rose is drifting. Grey ones aren't in your plan yet — tap any to open it.
        </Text>
      </View>

      {/* Domain gap bars — the thesis, visible */}
      <View style={{ gap: space(1), marginTop: space(2) }}>
        <Label>Say vs do</Label>
        <Text style={type.faint}>Importance you declared vs attention your behavior shows.</Text>
      </View>
      {domains.map((d: any) => {
        const gap = Math.max(0, d.importance - d.attention);
        return (
          <Pressable
            key={d.domainType}
            onPress={() => router.push(`/domain/${d.domainType}`)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Card style={{ gap: space(2), backgroundColor: domainTint(d.domainType) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <DomainDot domain={d.domainType} size={10} />
                  <Text style={type.heading}>{d.domainType}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {d.neglectRisk >= 50 ? (
                    <Chip label="drifting" color={colors.rose} />
                  ) : gap > 25 ? (
                    <Chip label={`gap ${Math.round(gap)}`} color={colors.amber} />
                  ) : (
                    <Chip label={d.trend === 'up' ? 'rising' : d.trend} color={colors.green} />
                  )}
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </View>
              </View>
              <GapBar importance={d.importance} attention={d.attention} color={domainColor(d.domainType)} />
            </Card>
          </Pressable>
        );
      })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  skyWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.amberFaint, borderWidth: 1, borderColor: colors.amberSoft,
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
  },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  oneThingRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.amberFaint, borderWidth: 1, borderColor: colors.amberSoft,
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
  },
  glanceRow: { flexDirection: 'row', gap: space(2) },
  glanceTile: {
    flex: 1, alignItems: 'center', gap: 2,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft,
    borderRadius: 14, paddingVertical: space(3),
  },
  whyBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: colors.surfaceSunken, borderRadius: 12, padding: space(3),
  },
  memoryBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: colors.amberFaint, borderRadius: 12, padding: space(3),
  },
  tinyRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: colors.greenSoft, borderRadius: 12, padding: space(3),
  },
  recalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: space(2),
  },
  doneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.greenSoft, borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  pulseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pulseChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
});
