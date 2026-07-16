import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { tinyStep } from '@priority/scoring-engine';
import { Button, Card, Chip, DomainDot, EmptyState, Input, Label } from '@/components/ui';
import { colors, type, space, domainColor } from '@/theme';

function completedRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

export default function Missions() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['missions'],
    queryFn: () => api<any[]>('/missions?status=pending'),
  });
  const { data: goals } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api<any[]>('/goals'),
  });
  // "When I completed a mission it isn't shown anywhere" — this closes that
  // gap: a visible momentum trail, not a void the second you tap Complete.
  const { data: done } = useQuery({
    queryKey: ['missions-completed'],
    queryFn: () => api<any[]>('/missions?status=completed'),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['missions'] });
    qc.invalidateQueries({ queryKey: ['missions-completed'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  // IKEA effect: a step the user names themselves is one they value —
  // and complete. The app suggests; the user builds.
  const [stepDrafts, setStepDrafts] = React.useState<Record<string, string>>({});
  const planStep = useMutation({
    mutationFn: (g: any) =>
      api('/missions', {
        method: 'POST',
        body: {
          title: stepDrafts[g.id]?.trim() || `First step: ${g.title}`,
          domainType: g.domainType,
          goalId: g.id,
          estimatedMinutes: 15,
          xpReward: 40,
        },
      }),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/complete`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const snooze = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/snooze`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={s.wrap}
      data={data ?? []}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={
        <View style={{ gap: space(3), marginBottom: space(2) }}>
          <View style={{ gap: 4 }}>
            <Text style={type.display}>Missions</Text>
            {data && data.length > 0 && (
              <Text style={type.dim}>
                {data.length} pending — ranked by what closes your biggest gap.
              </Text>
            )}
          </View>
          {goals && goals.filter((g) => g.status !== 'done').length > 0 && (
            <Card style={{ gap: space(3) }}>
              <Label>Your goals</Label>
              {goals.filter((g) => g.status !== 'done').map((g) => {
                const stepPlanned = (data ?? []).some((m) => m.goalId === g.id);
                return (
                  <View key={g.id} style={{ gap: space(2) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <DomainDot domain={g.domainType} />
                      <Text style={[type.heading, { flex: 1 }]}>{g.title}</Text>
                      <Chip label={g.horizon === '5y' ? '5 years' : 'this year'} />
                    </View>
                    {stepPlanned ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={15} color={colors.green} />
                        <Text style={[type.faint, { color: colors.green }]}>This week's step is in your missions.</Text>
                      </View>
                    ) : (
                      <View style={{ gap: space(2) }}>
                        <Input
                          placeholder={tinyStep({ title: g.title, domainType: g.domainType })}
                          value={stepDrafts[g.id] ?? ''}
                          onChangeText={(v) => setStepDrafts({ ...stepDrafts, [g.id]: v })}
                        />
                        <Button
                          title="Make it this week's mission"
                          small
                          kind="ghost"
                          onPress={() => planStep.mutate(g)}
                          disabled={!(stepDrafts[g.id] ?? '').trim()}
                        />
                        <Text style={type.faint}>Name the tiniest step yourself — steps you write are steps you take.</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              <Text style={type.faint}>A goal without a scheduled step is a wish. One small step a week compounds.</Text>
            </Card>
          )}
        </View>
      }
      renderItem={({ item: m }) => (
        <Card style={{ gap: space(3) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <DomainDot domain={m.domainType} />
              <Text style={[type.faint, { color: domainColor(m.domainType), fontWeight: '600', textTransform: 'capitalize' }]}>
                {m.domainType}{m.relationship ? ` · ${m.relationship.name}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {m.estimatedMinutes ? <Chip label={`${m.estimatedMinutes} min`} /> : null}
              <Chip label={`+${m.xpReward} XP`} color={colors.amber} />
            </View>
          </View>
          <Text style={type.title}>{m.title}</Text>
          {m.aiRationale && <Text style={type.dim}>{m.aiRationale}</Text>}
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <Ionicons name="footsteps-outline" size={13} color={colors.green} style={{ marginTop: 2 }} />
            <Text style={[type.faint, { flex: 1 }]}>
              {tinyStep({ title: m.title, domainType: m.domainType, missionType: m.missionType, personName: m.relationship?.name })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <View style={{ flex: 1 }}>
              <Button title="Complete" small onPress={() => complete.mutate(m.id)} />
            </View>
            <Button title="Later" kind="ghost" small onPress={() => snooze.mutate(m.id)} />
          </View>
        </Card>
      )}
      ListEmptyComponent={
        <Card>
          <EmptyState
            icon={<Ionicons name="checkmark-done-circle-outline" size={34} color={colors.green} />}
            headline="No pending missions"
            body="That's alignment. New missions appear when a gap opens between what you say matters and where your attention goes."
          />
        </Card>
      }
      ListFooterComponent={
        done && done.length > 0 ? (
          <View style={{ gap: space(2), marginTop: space(4) }}>
            <Label>Recently completed</Label>
            {done.slice(0, 8).map((m) => (
              <View key={m.id} style={s.doneRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <DomainDot domain={m.domainType} />
                <Text style={[type.dim, { flex: 1 }]} numberOfLines={1}>
                  {m.title}{m.relationship ? ` · ${m.relationship.name}` : ''}
                </Text>
                <Text style={type.faint}>{completedRelative(m.completedAt)}</Text>
              </View>
            ))}
          </View>
        ) : null
      }
    />
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  doneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceSunken, borderRadius: 10, padding: 10,
  },
});
