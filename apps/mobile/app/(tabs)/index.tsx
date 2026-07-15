import React from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tinyStep } from '@priority/scoring-engine';
import { useRouter } from 'expo-router';
import { useMemoryDraft } from '@/store/memoryDraft';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  Button, Card, Chip, DomainDot, EmptyState, GapBar, Label, AlignmentRing, XpBar,
} from '@/components/ui';
import { colors, type, space, domainColor, domainTint, greeting, levelProgress, skyGradient } from '@/theme';

/** Overall alignment: 100 minus the importance-weighted say/do gap. */
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
  const [justCompleted, setJustCompleted] = React.useState<any | null>(null);
  const router = useRouter();
  const setMemoryDraft = useMemoryDraft((st) => st.setDraft);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['missions'] });
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

      {/* Hero: the thesis in one glance */}
      <Card style={s.heroCard}>
        <AlignmentRing score={score} />
        <View style={{ flex: 1, gap: space(2) }}>
          <Label>Life alignment</Label>
          <Text style={type.body}>
            How closely this week's attention matches what you say matters.
          </Text>
          {domains[0] && Math.max(0, domains[0].importance - domains[0].attention) > 20 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <DomainDot domain={domains[0].domainType} />
              <Text style={[type.dim, { color: domainColor(domains[0].domainType) }]}>
                {domains[0].domainType} is the widest gap
              </Text>
            </View>
          )}
        </View>
      </Card>

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

      {/* THE one mission — anti-overload by design */}
      {m ? (
        <Card accent={colors.amber} style={{ gap: space(3) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color={colors.amber}>Today's one thing</Label>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {m.estimatedMinutes ? <Chip label={`${m.estimatedMinutes} min`} /> : null}
              <Chip label={`+${m.xpReward} XP`} color={colors.amber} />
            </View>
          </View>
          <Text style={[type.title, { fontSize: 21 }]}>{m.title}</Text>
          {data.whyToday && (
            <View style={s.whyBox}>
              <Ionicons name="sparkles-outline" size={14} color={colors.textDim} style={{ marginTop: 3 }} />
              <Text style={[type.dim, { flex: 1 }]}>{data.whyToday.whyToday}</Text>
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
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <View style={{ flex: 1 }}>
              <Button title="Done" onPress={() => complete.mutate(m)} />
            </View>
            <Button title="Tomorrow" kind="ghost" onPress={() => snooze.mutate(m.id)} />
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
      ) : (
        <Card accent={justCompleted ? colors.green : undefined}>
          <EmptyState
            icon={<Ionicons name={justCompleted ? 'checkmark-circle' : 'leaf-outline'} size={34} color={colors.green} />}
            headline={justCompleted ? `Done — +${justCompleted.xpReward} XP` : 'Nothing pending'}
            body={justCompleted
              ? "That was the one thing that mattered most today. The rest is a bonus."
              : 'Add a mission from the Missions tab, or enjoy the calm.'}
          />
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
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  whyBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: colors.surfaceSunken, borderRadius: 12, padding: space(3),
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
