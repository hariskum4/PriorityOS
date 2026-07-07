import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useMemoryDraft } from '@/store/memoryDraft';
import { Button, Card, Chip, DomainDot, EmptyState, Input, Label } from '@/components/ui';
import { colors, type, space } from '@/theme';

const MEMORY_TYPES: Record<string, string> = {
  relationship: 'together', experience: 'experience', achievement: 'achievement',
  reflection: 'realization', gratitude: 'gratitude',
};

export default function Journal() {
  const [segment, setSegment] = useState<'reflect' | 'memories'>('reflect');
  const { draft } = useMemoryDraft();

  // A pending mission draft jumps straight to the memory form.
  useEffect(() => {
    if (draft) setSegment('memories');
  }, [draft]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={{ gap: 4 }}>
        <Text style={type.display}>Journal</Text>
        <View style={s.segmentRow}>
          {(['reflect', 'memories'] as const).map((seg) => (
            <Pressable
              key={seg}
              onPress={() => setSegment(seg)}
              style={[s.segment, segment === seg && s.segmentOn]}
            >
              <Text style={[type.body, segment === seg && { color: colors.amber, fontWeight: '700' }]}>
                {seg === 'reflect' ? 'Today' : 'Memories'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {segment === 'reflect' ? <Reflect /> : <Memories />}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- reflect
function Reflect() {
  const qc = useQueryClient();
  const [whatMattered, setWhatMattered] = useState('');
  const [whatIAvoided, setWhatIAvoided] = useState('');
  const [saved, setSaved] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const { data } = useQuery({ queryKey: ['journal'], queryFn: () => api<any[]>('/journal') });

  const save = useMutation({
    mutationFn: () =>
      api<any>('/journal', { method: 'POST', body: { whatMattered, whatIAvoided } }),
    onSuccess: (res) => {
      setWhatMattered('');
      setWhatIAvoided('');
      if (res?.supportSuggested) {
        setShowSupport(true);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
      qc.invalidateQueries({ queryKey: ['journal'] });
    },
  });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <>
      {showSupport && (
        <Card style={{ gap: space(3), borderColor: colors.blue }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="heart" size={18} color={colors.blue} />
            <Text style={type.heading}>That sounds heavy. Thank you for writing it down.</Text>
          </View>
          <Text style={type.body}>
            Your entry is saved and private. And if things feel like too much right now,
            talking to a real person helps more than any app can.
          </Text>
          <View style={{ gap: space(1) }}>
            <Text style={type.dim}>iCall (India): <Text style={{ color: colors.blue, fontWeight: '700' }}>+91 91529 87821</Text></Text>
            <Text style={type.dim}>AASRA (India, 24×7): <Text style={{ color: colors.blue, fontWeight: '700' }}>+91 98204 66726</Text></Text>
            <Text style={type.dim}>Elsewhere: <Text style={{ color: colors.blue, fontWeight: '700' }}>findahelpline.com</Text></Text>
          </View>
          <Text style={type.faint}>
            Priority is a planning tool, not a substitute for support from people who are trained for it.
          </Text>
          <Button title="Okay" kind="ghost" onPress={() => setShowSupport(false)} />
        </Card>
      )}

      <Card style={{ gap: space(3) }}>
        <View style={{ gap: space(2) }}>
          <Label>What mattered today?</Label>
          <Input multiline value={whatMattered} onChangeText={setWhatMattered} placeholder="A moment, a person, a choice…" />
        </View>
        <View style={{ gap: space(2) }}>
          <Label>What did I avoid?</Label>
          <Input multiline value={whatIAvoided} onChangeText={setWhatIAvoided} placeholder="The call you didn't make, the thing you didn't say…" />
        </View>
        {saved ? (
          <View style={s.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            <Text style={[type.dim, { color: colors.green }]}>Saved — +10 XP</Text>
          </View>
        ) : (
          <Button title="Save entry" onPress={() => save.mutate()} disabled={!whatMattered && !whatIAvoided} />
        )}
      </Card>

      {data && data.length > 0 && <Label>Earlier</Label>}
      {data?.map((e) => (
        <Card key={e.id} style={{ backgroundColor: colors.surfaceSunken, gap: space(2) }}>
          <Text style={type.faint}>{fmtDate(e.createdAt)}</Text>
          {e.whatMattered ? <Text style={type.serif}>{e.whatMattered}</Text> : null}
          {e.whatIAvoided ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="eye-off-outline" size={14} color={colors.textFaint} style={{ marginTop: 3 }} />
              <Text style={[type.dim, { flex: 1 }]}>{e.whatIAvoided}</Text>
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}

// --------------------------------------------------------------- memories
function Memories() {
  const qc = useQueryClient();
  const { draft, clear } = useMemoryDraft();

  const { data: memories } = useQuery({
    queryKey: ['memories'],
    queryFn: () => api<any[]>('/memories'),
  });
  const { data: onThisDay } = useQuery({
    queryKey: ['memories-otd'],
    queryFn: () => api<any[]>('/memories/on-this-day'),
  });
  const { data: relationships } = useQuery({
    queryKey: ['relationships'],
    queryFn: () => api<any[]>('/relationships'),
  });
  const { data: answers } = useQuery({
    queryKey: ['onboarding-answers'],
    queryFn: () => api<any[]>('/onboarding/answers'),
  });
  const counts = (answers ?? [])
    .filter((a) => a.section === 'counts' && a.value?.label)
    .map((a) => ({ key: a.key, label: a.value.label }));

  const [title, setTitle] = useState(draft?.title ?? '');
  const [memoryType, setMemoryType] = useState('relationship');
  const [people, setPeople] = useState<string[]>(draft?.personName ? [draft.personName] : []);
  const [countKey, setCountKey] = useState<string>('');
  const [reflection, setReflection] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (draft) {
      setTitle(draft.title);
      if (draft.personName) setPeople([draft.personName]);
    }
  }, [draft]);

  const save = useMutation({
    mutationFn: () =>
      api<any>('/memories', {
        method: 'POST',
        body: {
          title: title.trim(),
          memoryType,
          peoplePresent: people,
          countKey: countKey || undefined,
          reflection: reflection.trim() || undefined,
          missionId: draft?.missionId,
          relationshipId: draft?.relationshipId,
          domainType: draft?.domainType,
        },
      }),
    onSuccess: () => {
      setTitle(''); setReflection(''); setPeople([]); setCountKey('');
      clear();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ['memories'] });
      qc.invalidateQueries({ queryKey: ['memories-otd'] });
    },
  });

  const togglePerson = (name: string) =>
    setPeople((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <>
      {onThisDay && onThisDay.length > 0 && (
        <Card accent={colors.amberSoft} style={{ gap: space(2) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar-outline" size={14} color={colors.amber} />
            <Label color={colors.amber}>On this day</Label>
          </View>
          {onThisDay.slice(0, 2).map((m) => (
            <View key={m.id}>
              <Text style={type.serif}>{m.title}</Text>
              <Text style={type.faint}>{fmtDate(m.occurredAt)}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card style={{ gap: space(3) }}>
        <Label>{draft ? 'Save the moment' : 'Log a memory'}</Label>
        <Input
          placeholder="What happened? One line is enough."
          value={title}
          onChangeText={setTitle}
        />
        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
          {Object.entries(MEMORY_TYPES).map(([k, label]) => (
            <Pressable key={k} onPress={() => setMemoryType(k)} style={[s.chip, memoryType === k && s.chipOn]}>
              <Text style={[type.faint, memoryType === k && { color: colors.amber, fontWeight: '700' }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {relationships && relationships.length > 0 && (
          <View style={{ gap: space(1) }}>
            <Text style={type.faint}>Who was there?</Text>
            <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
              {relationships.map((r) => (
                <Pressable key={r.id} onPress={() => togglePerson(r.name)} style={[s.chip, people.includes(r.name) && s.chipOn]}>
                  <Text style={[type.faint, people.includes(r.name) && { color: colors.amber, fontWeight: '700' }]}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {counts.length > 0 && (
          <View style={{ gap: space(1) }}>
            <Text style={type.faint}>Counts toward:</Text>
            <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
              {counts.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setCountKey(countKey === c.key ? '' : c.key)}
                  style={[s.chip, countKey === c.key && s.chipOn]}
                >
                  <Text style={[type.faint, countKey === c.key && { color: colors.amber, fontWeight: '700' }]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <Input
          multiline
          placeholder="What will you remember about this?"
          value={reflection}
          onChangeText={setReflection}
        />
        {justSaved ? (
          <View style={s.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            <Text style={[type.dim, { color: colors.green }]}>Kept — +30 XP. This is what the numbers were for.</Text>
          </View>
        ) : (
          <Button title="Keep this moment" onPress={() => save.mutate()} disabled={!title.trim() || save.isPending} />
        )}
      </Card>

      {memories && memories.length > 0 && <Label>The archive</Label>}
      {memories?.map((m) => (
        <Card key={m.id} style={{ backgroundColor: colors.surfaceSunken, gap: space(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {m.domainType ? <DomainDot domain={m.domainType} /> : null}
            <Text style={[type.heading, { flex: 1 }]}>{m.title}</Text>
            <Text style={type.faint}>{fmtDate(m.occurredAt)}</Text>
          </View>
          {(m.peoplePresent ?? []).length > 0 && (
            <Text style={type.faint}>With {(m.peoplePresent as string[]).join(', ')}</Text>
          )}
          {m.reflection ? <Text style={type.serif}>{m.reflection}</Text> : null}
        </Card>
      ))}
      {memories && memories.length === 0 && (
        <EmptyState
          icon={<Ionicons name="images-outline" size={34} color={colors.textDim} />}
          headline="The archive starts with one moment"
          body="Every count on the Time tab is waiting to become a memory here. That's the whole point of the numbers."
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  segmentRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  segment: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  segmentOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
});
