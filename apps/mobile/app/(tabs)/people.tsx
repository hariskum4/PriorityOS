import React from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import { Avatar, Button, Card, Chip, EmptyState, ErrorNote, Input, Label } from '@/components/ui';
import { colors, type, space, domainColor, alpha } from '@/theme';

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

const RELATION_TYPES = [
  'mother', 'father', 'sibling', 'spouse', 'partner',
  'child', 'friend', 'mentor', 'colleague',
];
const CADENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

/**
 * Adding someone, after onboarding.
 *
 * This was the app's largest hole: the API has had create, update and delete
 * from the start, and the only screen that ever called create was onboarding,
 * once, for one person. So a life could be described but never grow — no new
 * friend, no colleague, no child born next year. The empty state said "Add the
 * people who matter" beside nothing to tap.
 */
function AddPerson({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [relationType, setRelationType] = React.useState('friend');
  const [desired, setDesired] = React.useState('monthly');

  const create = useMutation({
    mutationFn: () =>
      api('/relationships', {
        method: 'POST',
        body: {
          name: name.trim(),
          relationType,
          desiredCallFrequency: desired,
          closenessScore: 7,
          wantsMoreTime: true,
        },
      }),
    onSuccess: () => {
      setName(''); setRelationType('friend'); setDesired('monthly'); setOpen(false);
      qc.invalidateQueries({ queryKey: ['relationships'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone();
    },
  });

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [s.addRow, pressed && { opacity: 0.6 }]}>
        <Ionicons name="add-circle-outline" size={18} color={colors.amber} />
        <Text style={[type.label, { color: colors.amber }]}>Add someone</Text>
      </Pressable>
    );
  }

  return (
    <Card style={{ gap: space(3) }}>
      <Label>Who?</Label>
      <Input placeholder="Their name" value={name} onChangeText={setName} autoFocus />
      <Text style={type.faint}>They are your…</Text>
      <View style={s.chipWrap}>
        {RELATION_TYPES.map((t) => (
          <Pressable key={t} onPress={() => setRelationType(t)} style={[s.chip, relationType === t && s.chipOn]}>
            <Text style={[type.faint, relationType === t && { color: colors.amber, fontWeight: '700' }]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.faint}>How often do you want to be in touch?</Text>
      <View style={s.chipWrap}>
        {CADENCES.map((c) => (
          <Pressable key={c} onPress={() => setDesired(c)} style={[s.chip, desired === c && s.chipOn]}>
            <Text style={[type.faint, desired === c && { color: colors.amber, fontWeight: '700' }]}>{c}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.faint}>
        That last answer is the one the app measures against — not a target, just what you said you wanted.
      </Text>
      <ErrorNote error={create.error} onRetry={() => create.mutate()} retrying={create.isPending} />
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <View style={{ flex: 1 }}>
          <Button
            title={create.isPending ? 'Adding…' : 'Add them'}
            onPress={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          />
        </View>
        <Button title="Cancel" kind="ghost" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}

export default function People() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isError, refetch, isRefetching } = useQuery({
    queryKey: ['relationships'],
    queryFn: () => api<any[]>('/relationships'),
  });
  /**
   * The last thing logged, per person — a receipt, not a lock.
   *
   * This used to replace the three buttons permanently: log a call and there
   * was no way to log a second one, and no way to correct a mis-tapped
   * "message". The confirmation now fades and the buttons come back, because
   * talking to your mother twice in one day is the behaviour this app exists
   * to encourage.
   */
  const [logged, setLogged] = React.useState<Record<string, string>>({});
  const logContact = useMutation({
    // Keyed so a tap made offline survives a force-quit: the default under
    // this key (mutationDefaults.ts) replays it from the disk snapshot.
    mutationKey: ['contact', 'log'],
    mutationFn: ({ id, kind }: { id: string; kind: string }) =>
      api(`/relationships/${id}/contact`, { method: 'POST', body: { kind } }),
    onSuccess: (_res, { id, kind }) => {
      setLogged((prev) => ({ ...prev, [id]: kind }));
      setTimeout(() => setLogged((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      }), 2600);
      qc.invalidateQueries({ queryKey: ['relationships'] });
      invalidateLifeRecord(qc);
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
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.amber} />
      }
      ListHeaderComponent={
        <View style={{ gap: space(3), marginBottom: space(2) }}>
          <View style={{ gap: 4 }}>
            <Text style={type.display}>People</Text>
            <Text style={type.dim}>One tap to log a call or visit — no forms, no friction.</Text>
          </View>
          {isError ? <ErrorNote error={new Error('Could not load your people.')} onRetry={() => refetch()} /> : null}
          <AddPerson onDone={() => {}} />
          {logContact.isError ? (
            <ErrorNote error={logContact.error} onRetry={() => logContact.reset()} />
          ) : null}
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
            {/* The whole header opens the person — their history, the moments
                kept with them, and the only place to correct or remove them. */}
            <Pressable
              onPress={() => router.push(`/person/${r.id}`)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: space(3) },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Avatar name={r.name} color={color} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={type.title} numberOfLines={1}>{r.name}</Text>
                  <Text style={[type.faint, { textTransform: 'capitalize' }]}>{r.relationType}</Text>
                </View>
                {/* Elapsed time is measured, so it's set as an instrument tick —
                    which also keeps it on one line beside the overdue chip. */}
                <Text
                  style={[type.label, { letterSpacing: 1 }, overdue && { color: colors.rose }]}
                  numberOfLines={1}
                >
                  {d === null
                    ? 'never logged'
                    : d === 0
                      ? 'talked today'
                      : `${d}d ago`}
                  {' · '}{r.desiredCallFrequency}
                </Text>
              </View>
              {overdue && <View style={{ flexShrink: 0 }}><Chip label="overdue" color={colors.rose} /></View>}
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
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
                      disabled={logContact.isPending}
                      onPress={() => logContact.mutate({ id: r.id, kind })}
                      style={({ pressed }) => [
                        s.tapChip,
                        logContact.isPending && { opacity: 0.5 },
                        pressed && { backgroundColor: colors.surfaceRaised, transform: [{ scale: 0.96 }] },
                      ]}
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
  addRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.amber, 0.4),
    borderRadius: 13, paddingVertical: 12,
  },
  chipWrap: { flexDirection: 'row', gap: space(2), flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
});
