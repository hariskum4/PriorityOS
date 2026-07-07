import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Button, Card, Chip, DomainDot, EmptyState, Input, Label } from '@/components/ui';
import { colors, type, space, domainColor } from '@/theme';

/**
 * The Sunday Session — 6 steps, ~15 minutes, the retention backbone.
 * 1 last week · 2 domain pulse · 3 insight · 4 next week · 5 one thing · 6 intention
 */
const TOTAL_STEPS = 6;

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={type.stat}>{value}</Text>
      <Text style={[type.faint, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

export default function Review() {
  const qc = useQueryClient();
  const { data: review } = useQuery({
    queryKey: ['weekly-review'],
    queryFn: () => api<any>('/weekly-review/current'),
  });
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<any>('/dashboard'),
  });
  const { data: pendingMissions } = useQuery({
    queryKey: ['missions'],
    queryFn: () => api<any[]>('/missions?status=pending'),
  });

  const [inSession, setInSession] = useState(false);
  const [step, setStep] = useState(1);

  // Session state
  const [weekWord, setWeekWord] = useState('');
  const [pulse, setPulse] = useState<Record<string, number>>({});
  const [insightReady, setInsightReady] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [customs, setCustoms] = useState<string[]>([]);
  const [oneThing, setOneThing] = useState('');
  const [intention, setIntention] = useState('');
  const [done, setDone] = useState<any>(null);

  const generate = useMutation({
    mutationFn: () => api('/weekly-review/generate', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekly-review'] }),
  });
  const completeMission = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const submit = useMutation({
    mutationFn: () =>
      api<any>('/weekly-review/session', {
        method: 'POST',
        body: {
          weekWord,
          domainSelfScores: pulse,
          nextWeekPriorities: [...picked, ...customs].slice(0, 7).map((title) => ({
            title,
            domainType: guessDomain(title),
          })),
          oneThing,
          intentionWord: intention,
        },
      }),
    onSuccess: (res) => {
      setDone(res);
      qc.invalidateQueries({ queryKey: ['weekly-review'] });
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const domains = (dashboard?.domains ?? [])
    .filter((d: any) => d.importance > 0)
    .sort((a: any, b: any) => b.importance - a.importance);

  const guessDomain = (title: string): string => {
    const last = title.split(' ').pop()?.toLowerCase() ?? '';
    if (domains.some((d: any) => d.domainType === last)) return last;
    return domains[0]?.domainType ?? 'family';
  };

  // Step 3 gate: the insight cannot be skimmed past (min 3 seconds).
  useEffect(() => {
    if (step === 3) {
      setInsightReady(false);
      const t = setTimeout(() => setInsightReady(true), 3000);
      return () => clearTimeout(t);
    }
  }, [step]);

  const startSession = () => {
    if (!review) generate.mutate();
    setInSession(true);
    setStep(1);
    setDone(null);
  };

  const suggestions: string[] = review?.nextWeekFocus ?? [];
  const togglePick = (t: string) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t].slice(0, 7)));

  const sessionDone = review?.sessionCompletedAt || done;

  // ------------------------------------------------------------------ intro
  if (!inSession) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
        <View style={{ gap: 4 }}>
          <Text style={type.display}>The Sunday Session</Text>
          <Text style={type.dim}>Fifteen minutes to step back, look at your life, and choose what comes next.</Text>
        </View>

        {sessionDone ? (
          <>
            <Card accent={colors.greenSoft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                <Text style={[type.heading, { color: colors.green }]}>This week's session is done</Text>
              </View>
              {(review?.oneThing || done?.review?.oneThing) && (
                <View style={{ gap: 4, marginTop: space(2) }}>
                  <Label>The one thing this week</Label>
                  <Text style={type.serif}>{review?.oneThing ?? done?.review?.oneThing}</Text>
                </View>
              )}
              {(review?.intentionWord || done?.review?.intentionWord) && (
                <Text style={[type.dim, { marginTop: space(1) }]}>
                  Intention: <Text style={{ color: colors.amber, fontWeight: '700' }}>{review?.intentionWord ?? done?.review?.intentionWord}</Text>
                </Text>
              )}
            </Card>
            {review && (
              <View style={{ flexDirection: 'row', gap: space(2) }}>
                <Stat value={review.completedMissions ?? 0} label="missions" />
                <Stat value={review.completedHabits ?? 0} label="habit check-ins" />
                <Stat value={review.journalEntries ?? 0} label="journal entries" />
              </View>
            )}
            {review?.aiNarrative && (
              <Card style={{ backgroundColor: colors.surfaceSunken }}>
                <Text style={type.serif}>{review.aiNarrative}</Text>
              </Card>
            )}
          </>
        ) : (
          <Card style={{ gap: space(3) }}>
            <EmptyState
              icon={<Ionicons name="telescope-outline" size={34} color={colors.amber} />}
              headline="Sunday evening. A moment before the week begins again."
              body="Six short steps: last week honestly, how each part of life feels, one insight, next week's few priorities, the one thing, and an intention."
            />
            <Button title="Begin the session" onPress={startSession} />
            <Text style={[type.faint, { textAlign: 'center' }]}>+50 XP · your future self says thanks</Text>
          </Card>
        )}
      </ScrollView>
    );
  }

  // -------------------------------------------------------------- completed
  if (done) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
        <Card accent={colors.amberSoft} style={{ alignItems: 'center', gap: space(3), paddingVertical: space(8) }}>
          <Ionicons name="checkmark-circle" size={48} color={colors.green} />
          <Text style={[type.display, { fontSize: 26, textAlign: 'center' }]}>Week chosen.</Text>
          <Text style={[type.serif, { textAlign: 'center', color: colors.textDim }]}>
            {done.missionsCreated} priorit{done.missionsCreated === 1 ? 'y' : 'ies'} set.
            {intention ? `\nThis week: ${intention}.` : ''}
          </Text>
          <Chip label="+50 XP" color={colors.amber} />
          <Button title="Back to the week" onPress={() => setInSession(false)} />
        </Card>
      </ScrollView>
    );
  }

  // ------------------------------------------------------------------ steps
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={s.progressHeader}>
        <Pressable onPress={() => (step > 1 ? setStep(step - 1) : setInSession(false))} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textDim} />
        </Pressable>
        <View style={s.progressTrack}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[s.progressSeg, i < step && { backgroundColor: colors.amber }]} />
          ))}
        </View>
        <Text style={type.faint}>{step}/{TOTAL_STEPS}</Text>
      </View>

      {step === 1 && (
        <>
          <Text style={type.display}>Last week, honestly</Text>
          <Text style={type.dim}>No judgment. Just what happened.</Text>
          {review && (
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <Stat value={review.completedMissions ?? 0} label="missions done" />
              <Stat value={review.completedHabits ?? 0} label="habit check-ins" />
            </View>
          )}
          {pendingMissions && pendingMissions.length > 0 && (
            <Card>
              <Label>Still open — done in real life?</Label>
              <Text style={type.faint}>Tap anything you actually did but never marked.</Text>
              {pendingMissions.slice(0, 5).map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => completeMission.mutate(m.id)}
                  style={({ pressed }) => [s.missionRow, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="ellipse-outline" size={18} color={colors.textFaint} />
                  <Text style={[type.body, { flex: 1 }]}>{m.title}</Text>
                  <Text style={[type.faint, { color: colors.amber }]}>done it</Text>
                </Pressable>
              ))}
            </Card>
          )}
          <Card style={{ gap: space(2) }}>
            <Label>The week in one word</Label>
            <Input placeholder="full · heavy · warm · scattered…" value={weekWord} onChangeText={setWeekWord} />
          </Card>
          <Button title="Next" onPress={() => setStep(2)} disabled={!weekWord.trim()} />
        </>
      )}

      {step === 2 && (
        <>
          <Text style={type.display}>Domain pulse</Text>
          <Text style={type.dim}>How did each area of life feel this week? 1 is starved, 10 is thriving.</Text>
          <View style={{ gap: space(3) }}>
            {domains.map((d: any) => {
              const c = domainColor(d.domainType);
              const v = pulse[d.domainType] ?? 0;
              return (
                <Card key={d.domainType} style={{ gap: space(2) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <DomainDot domain={d.domainType} size={10} />
                    <Text style={[type.heading, { textTransform: 'capitalize', flex: 1 }]}>{d.domainType}</Text>
                    {v > 0 && <Text style={[type.dim, { color: c, fontWeight: '700' }]}>{v}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Pressable
                        key={i}
                        onPress={() => setPulse({ ...pulse, [d.domainType]: i + 1 })}
                        style={[s.pulseSeg, i < v && { backgroundColor: c, borderColor: c }]}
                      />
                    ))}
                  </View>
                </Card>
              );
            })}
          </View>
          <Button
            title="Next"
            onPress={() => setStep(3)}
            disabled={domains.some((d: any) => !pulse[d.domainType])}
          />
        </>
      )}

      {step === 3 && (
        <>
          <Text style={type.display}>One honest insight</Text>
          <Card style={{ backgroundColor: colors.surfaceSunken, gap: space(3) }}>
            <Text style={type.serif}>
              {review?.aiNarrative ?? 'Generating your week’s reading…'}
            </Text>
            {review?.regretRiskFocus && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.rose} style={{ marginTop: 3 }} />
                <Text style={[type.dim, { flex: 1 }]}>{review.regretRiskFocus}</Text>
              </View>
            )}
          </Card>
          <Button title={insightReady ? 'Next' : 'Sit with it a moment…'} onPress={() => setStep(4)} disabled={!insightReady} />
        </>
      )}

      {step === 4 && (
        <>
          <Text style={type.display}>Next week's few</Text>
          <Text style={type.dim}>Pick up to 7. Fewer is stronger — these become real missions.</Text>
          <Card style={{ gap: space(2) }}>
            <Label>Suggested from your week</Label>
            {suggestions.map((f: string) => {
              const on = picked.includes(f);
              return (
                <Pressable key={f} onPress={() => togglePick(f)} style={({ pressed }) => [s.missionRow, on && { backgroundColor: colors.amberFaint, borderRadius: 10 }, pressed && { opacity: 0.7 }]}>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? colors.amber : colors.textFaint} />
                  <Text style={[type.body, { flex: 1 }]}>{f}</Text>
                </Pressable>
              );
            })}
          </Card>
          <Card style={{ gap: space(2) }}>
            <Label>Your own</Label>
            {customs.map((cItem) => (
              <View key={cItem} style={s.missionRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.amber} />
                <Text style={[type.body, { flex: 1 }]}>{cItem}</Text>
                <Pressable onPress={() => setCustoms(customs.filter((x) => x !== cItem))}>
                  <Ionicons name="close" size={16} color={colors.textFaint} />
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <View style={{ flex: 1 }}>
                <Input placeholder="Call Amma about the trip…" value={custom} onChangeText={setCustom} />
              </View>
              <Button
                title="Add"
                small
                kind="ghost"
                onPress={() => {
                  if (custom.trim()) {
                    setCustoms([...customs, custom.trim()].slice(0, 7));
                    setCustom('');
                  }
                }}
              />
            </View>
          </Card>
          <Button title="Next" onPress={() => setStep(5)} disabled={picked.length + customs.length === 0} />
        </>
      )}

      {step === 5 && (
        <>
          <Text style={type.display}>The one thing</Text>
          <Text style={type.dim}>If only one thing happens next week, what should it be? It pins to the top of Today all week.</Text>
          <Input
            multiline
            placeholder="One sentence. Make it yours."
            value={oneThing}
            onChangeText={setOneThing}
          />
          <Button title="Next" onPress={() => setStep(6)} disabled={!oneThing.trim()} />
        </>
      )}

      {step === 6 && (
        <>
          <Text style={type.display}>Close with intention</Text>
          <Text style={type.dim}>One word for the week ahead. You'll see it each morning.</Text>
          <View style={s.chips}>
            {['present', 'steady', 'brave', 'gentle', 'focused', 'open'].map((w) => (
              <Pressable key={w} onPress={() => setIntention(w)} style={[s.chip, intention === w && s.chipOn]}>
                <Text style={[type.body, intention === w && { color: colors.amber, fontWeight: '700' }]}>{w}</Text>
              </Pressable>
            ))}
          </View>
          <Input placeholder="…or your own word" value={intention} onChangeText={setIntention} />
          <Button
            title={submit.isPending ? 'Sealing the week…' : 'Complete the session  +50 XP'}
            onPress={() => submit.mutate()}
            disabled={!intention.trim() || submit.isPending}
          />
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  stat: {
    flex: 1, alignItems: 'center', gap: 2,
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.lineSoft, paddingVertical: space(4),
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  progressTrack: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  pulseSeg: {
    flex: 1, height: 26, borderRadius: 6,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSunken,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
});
