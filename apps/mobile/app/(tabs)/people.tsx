import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Avatar, Card, Chip, EmptyState } from '@/components/ui';
import { colors, type, space, domainColor } from '@/theme';

const relationDomain: Record<string, string> = {
  mother: 'family', father: 'family', parent: 'family', sibling: 'family',
  spouse: 'partner', partner: 'partner',
  friend: 'friends', child: 'children', son: 'children', daughter: 'children', mentor: 'career',
};
const relationColor = (t: string) => domainColor(relationDomain[t] ?? 'career');

/** Days a desired call cadence represents — for honest overdue framing. */
const cadenceDays: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

export default function People() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['relationships'],
    queryFn: () => api<any[]>('/relationships'),
  });
  const [logged, setLogged] = React.useState<Record<string, string>>({});
  const logContact = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: string }) =>
      api(`/relationships/${id}/contact`, { method: 'POST', body: { kind } }),
    onSuccess: (_res, { id, kind }) => {
      setLogged((prev) => ({ ...prev, [id]: kind }));
      qc.invalidateQueries({ queryKey: ['relationships'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const daysSince = (iso: string | null) =>
    iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

  function overdueRatio(r: any): number {
    const d = daysSince(r.lastContactAt);
    const target = cadenceDays[r.desiredCallFrequency] ?? 30;
    if (d === null) return 2;
    return d / target;
  }

  const people = [...(data ?? [])].sort((a, b) => overdueRatio(b) - overdueRatio(a));

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={s.wrap}
      data={people}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View style={{ gap: 4, marginBottom: space(2) }}>
          <Text style={type.display}>People</Text>
          <Text style={type.dim}>One tap to log a call or visit — no forms, no friction.</Text>
        </View>
      }
      ListEmptyComponent={
        <Card>
          <EmptyState
            icon={<Ionicons name="people-outline" size={34} color={colors.textDim} />}
            headline="Add the people who matter"
            body="Priority watches the gap between how often you want to show up for them and how often you do."
          />
        </Card>
      }
      renderItem={({ item: r }) => {
        const d = daysSince(r.lastContactAt);
        const overdue = overdueRatio(r) >= 1.5;
        const color = relationColor(r.relationType);
        const just = logged[r.id];
        return (
          <Card accent={overdue ? colors.roseSoft : undefined} style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
              <Avatar name={r.name} color={color} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={type.title}>{r.name}</Text>
                  <Text style={[type.faint, { textTransform: 'capitalize' }]}>{r.relationType}</Text>
                </View>
                <Text style={[type.dim, overdue && { color: colors.rose }]}>
                  {d === null
                    ? 'No contact logged yet'
                    : d === 0
                      ? 'Talked today'
                      : `${d} day${d === 1 ? '' : 's'} since contact`}
                  {' · '}aiming {r.desiredCallFrequency}
                </Text>
              </View>
              {overdue && <Chip label="overdue" color={colors.rose} />}
            </View>
            {/* Something to reach out WITH — memory-grounded, not a guilt ping */}
            {overdueRatio(r) >= 1 && r.reachOutLine && !just && (
              <View style={s.reachOutRow}>
                <Ionicons name="gift-outline" size={14} color={colors.amber} style={{ marginTop: 2 }} />
                <Text style={[type.dim, { flex: 1 }]}>{r.reachOutLine}</Text>
              </View>
            )}
            {just ? (
              <View style={s.loggedRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                <Text style={[type.dim, { color: colors.green }]}>
                  {just === 'call' ? 'Call' : just === 'message' ? 'Message' : 'Visit'} logged — nice.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: space(2) }}>
                {([['call', 'call-outline'], ['message', 'chatbubble-outline'], ['visit', 'home-outline']] as const).map(
                  ([kind, iconName]) => (
                    <Pressable
                      key={kind}
                      onPress={() => logContact.mutate({ id: r.id, kind })}
                      style={({ pressed }) => [s.tapChip, pressed && { backgroundColor: colors.surfaceRaised, transform: [{ scale: 0.96 }] }]}
                    >
                      <Ionicons name={iconName} size={15} color={colors.amber} />
                      <Text style={{ color: colors.amber, fontWeight: '600', fontSize: 13 }}>{kind}</Text>
                    </Pressable>
                  ),
                )}
              </View>
            )}
          </Card>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  tapChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingVertical: 9,
  },
  loggedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  reachOutRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.amberFaint, borderRadius: 10, padding: 10,
  },
});
