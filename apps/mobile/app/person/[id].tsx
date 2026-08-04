/**
 * One person, opened.
 *
 * Everything on this screen was already in the database and had nowhere to be
 * seen: how close you said you are, how often you meant to be in touch, every
 * contact you logged, and the moments you kept with them in them. Without it
 * the People tab is a list of names and a number of days — a relationship the
 * product cannot open is a row in a table.
 *
 * It is also the only place a person can be corrected or removed. Onboarding
 * captures a name in a hurry and gets relations wrong; a life that cannot be
 * edited is a form, not a record.
 */
import React from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import {
  Avatar, Button, Card, Chip, DangerConfirm, ErrorNote, Input, Label,
} from '@/components/ui';
import { colors, type, space, domainColor, alpha } from '@/theme';

const relationDomain: Record<string, string> = {
  mother: 'family', father: 'family', parent: 'family', sibling: 'family',
  spouse: 'partner', partner: 'partner',
  friend: 'friends', child: 'children', son: 'children', daughter: 'children', mentor: 'career',
};
const CADENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
const RELATION_TYPES = [
  'mother', 'father', 'sibling', 'spouse', 'partner',
  'child', 'friend', 'mentor', 'colleague',
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export default function PersonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);

  const { data: person, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['person', id],
    queryFn: () => api<any>(`/relationships/${id}`),
    enabled: !!id,
    retry: 1,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['person', id] });
    qc.invalidateQueries({ queryKey: ['relationships'] });
    invalidateLifeRecord(qc);
  };

  const logContact = useMutation({
    // Keyed for offline resume — and the id rides in the variables, because a
    // replay after relaunch has no route params to close over.
    mutationKey: ['contact', 'log'],
    mutationFn: ({ id: relId, kind }: { id: string; kind: string }) =>
      api(`/relationships/${relId}/contact`, { method: 'POST', body: { kind } }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => api(`/relationships/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['memories'] });
      router.back();
    },
  });

  if (isLoading) {
    return (
      <View style={s.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={type.dim}>Opening…</Text>
      </View>
    );
  }

  if (isError || !person) {
    return (
      <View style={s.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={type.body}>This person would not load.</Text>
        <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(3) }}>
          <Button title="Try again" small kind="ghost" onPress={() => refetch()} />
          <Button title="Back" small kind="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const color = domainColor(relationDomain[person.relationType] ?? 'career');
  const days = person.lastContactAt
    ? Math.floor((Date.now() - new Date(person.lastContactAt).getTime()) / 86_400_000)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={s.wrap}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.amber} />
        }
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.textDim} />
          <Text style={type.dim}>People</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
          <Avatar name={person.name} color={color} size={62} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.display} numberOfLines={2}>{person.name}</Text>
            <Text style={[type.dim, { textTransform: 'capitalize' }]}>
              {person.relationType}
              {person.age ? ` · ${person.age}` : ''}
              {person.city ? ` · ${person.city}` : ''}
            </Text>
          </View>
        </View>

        <Card style={{ gap: space(3) }}>
          <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
            <Chip
              label={days === null ? 'never logged' : days === 0 ? 'talked today' : `${days}d since`}
              color={days !== null && days > 30 ? colors.rose : colors.textDim}
            />
            <Chip label={`wants ${person.desiredCallFrequency ?? 'weekly'}`} color={colors.amber} />
            {person.closenessScore != null ? <Chip label={`closeness ${person.closenessScore}/10`} /> : null}
            {person.healthStatus ? <Chip label={person.healthStatus} color={colors.rose} /> : null}
          </View>
          <ErrorNote error={logContact.error} onRetry={() => logContact.reset()} />
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            {(['call', 'message', 'visit'] as const).map((kind) => (
              <Pressable
                key={kind}
                disabled={logContact.isPending}
                onPress={() => logContact.mutate({ id: String(id), kind })}
                style={({ pressed }) => [
                  s.tapChip,
                  logContact.isPending && { opacity: 0.5 },
                  pressed && { backgroundColor: colors.surfaceRaised },
                ]}
              >
                <Text style={{ color: colors.amber, fontWeight: '600', fontSize: 13 }}>{kind}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {person.notes ? (
          <Card style={{ gap: space(1) }}>
            <Label>What you wrote about them</Label>
            <Text style={type.serif}>{person.notes}</Text>
          </Card>
        ) : null}

        {editing ? (
          <EditPerson person={person} onClose={() => setEditing(false)} onSaved={invalidate} />
        ) : (
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <Button title="Edit details" kind="ghost" small onPress={() => setEditing(true)} />
          </View>
        )}

        <Card style={{ gap: space(3) }}>
          <Label>Moments kept with them</Label>
          {(person.memories ?? []).length === 0 ? (
            <Text style={type.faint}>
              Nothing yet. A memory saved with {person.name.split(' ')[0]} is what the reach-out lines
              are built from — it is the difference between a reminder and something to say.
            </Text>
          ) : (
            (person.memories ?? []).map((m: any) => (
              <View key={m.id} style={s.row}>
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={2}>{m.title}</Text>
                <Text style={type.faint}>{fmt(m.occurredAt)}</Text>
              </View>
            ))
          )}
        </Card>

        <Card style={{ gap: space(3) }}>
          <Label>Every time you showed up</Label>
          {(person.contacts ?? []).length === 0 ? (
            <Text style={type.faint}>No contact logged yet.</Text>
          ) : (
            (person.contacts ?? []).map((c: any) => (
              <View key={c.id} style={s.row}>
                <Text style={[type.dim, { flex: 1, textTransform: 'capitalize' }]} numberOfLines={2}>
                  {c.kind}{c.note ? ` — ${c.note}` : ''}
                </Text>
                <Text style={type.faint}>{fmt(c.occurredAt)}</Text>
              </View>
            ))
          )}
        </Card>

        <View style={{ gap: space(2), marginTop: space(4) }}>
          <Text style={type.faint}>
            Removing {person.name.split(' ')[0]} keeps every moment you saved with them — the memories
            hold onto the name, so nothing you wrote down disappears with the row.
          </Text>
          <ErrorNote error={remove.error} onRetry={() => remove.mutate()} retrying={remove.isPending} />
          <DangerConfirm
            label={`Remove ${person.name.split(' ')[0]}`}
            confirmLabel="Yes, remove them"
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/** The details onboarding got wrong, corrected. */
function EditPerson({ person, onClose, onSaved }: {
  person: any; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = React.useState(person.name ?? '');
  const [relationType, setRelationType] = React.useState(person.relationType ?? 'friend');
  const [desired, setDesired] = React.useState(person.desiredCallFrequency ?? 'weekly');
  const [city, setCity] = React.useState(person.city ?? '');
  const [notes, setNotes] = React.useState(person.notes ?? '');
  const [closeness, setCloseness] = React.useState<number>(person.closenessScore ?? 5);

  const save = useMutation({
    mutationFn: () =>
      api(`/relationships/${person.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          relationType,
          desiredCallFrequency: desired,
          city: city.trim() || null,
          notes: notes.trim() || null,
          closenessScore: closeness,
        },
      }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <Card style={{ gap: space(3) }}>
      <Label>Their details</Label>
      <Input placeholder="Name" value={name} onChangeText={setName} />
      <Text style={type.faint}>They are your…</Text>
      <View style={s.chipWrap}>
        {RELATION_TYPES.map((t) => (
          <Pressable key={t} onPress={() => setRelationType(t)} style={[s.chip, relationType === t && s.chipOn]}>
            <Text style={[type.faint, relationType === t && { color: colors.amber, fontWeight: '700' }]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.faint}>You want to be in touch…</Text>
      <View style={s.chipWrap}>
        {CADENCES.map((c) => (
          <Pressable key={c} onPress={() => setDesired(c)} style={[s.chip, desired === c && s.chipOn]}>
            <Text style={[type.faint, desired === c && { color: colors.amber, fontWeight: '700' }]}>{c}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.faint}>How close are you, honestly? ({closeness}/10)</Text>
      <View style={s.chipWrap}>
        {[1, 3, 5, 7, 9, 10].map((n) => (
          <Pressable key={n} onPress={() => setCloseness(n)} style={[s.chip, closeness === n && s.chipOn]}>
            <Text style={[type.faint, closeness === n && { color: colors.amber, fontWeight: '700' }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Input placeholder="Where they live" value={city} onChangeText={setCity} />
      <Input
        multiline
        placeholder="Anything worth remembering about them…"
        value={notes}
        onChangeText={setNotes}
      />
      <ErrorNote error={save.error} onRetry={() => save.mutate()} retrying={save.isPending} />
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <View style={{ flex: 1 }}>
          <Button
            title={save.isPending ? 'Saving…' : 'Save'}
            onPress={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
          />
        </View>
        <Button title="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  wrap: {
    padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10),
    maxWidth: 560, width: '100%', alignSelf: 'center',
  },
  center: {
    flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
    padding: space(6),
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: space(2) },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space(3),
    borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: space(2),
  },
  tapChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingVertical: 9,
  },
  chipWrap: { flexDirection: 'row', gap: space(2), flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
});
