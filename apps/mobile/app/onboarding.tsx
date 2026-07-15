import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated, Platform, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { track } from '@/services/analytics';
import { Button, Card, DomainDot, GapBar, Input, Label } from '@/components/ui';
import { ShareRevealButton } from '@/components/ShareReveal';
import { colors, type, space, domainColor } from '@/theme';

const DOMAIN_LABELS: Record<string, string> = {
  family: 'Family / Parents',
  partner: 'Partner',
  children: 'Children',
  health: 'Health',
  career: 'Career',
  finance: 'Finance',
  growth: 'Personal growth',
  friends: 'Friends',
  experiences: 'Experiences',
  reflection: 'Inner life',
  purpose: 'Purpose / Creative work',
  impact: 'Giving back',
};
const DOMAINS = Object.keys(DOMAIN_LABELS);
const CADENCES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
const CADENCE_PER_YEAR: Record<string, number> = {
  daily: 365, weekly: 52, monthly: 12, quarterly: 4, yearly: 1,
};
const RELATIONS = ['mother', 'father', 'partner', 'sibling', 'friend', 'child'] as const;
const FEELINGS = ['closer to people', 'calmer', 'present', 'proud of myself', 'lighter', 'more alive'] as const;

const QUESTION_STEPS = 7; // life context, rank, reality, drift, postponing, person, feeling

/**
 * Lanes (activation research: first value in <3 min ≈ 2x retention).
 *  - fast:   rank → one person → the someday check → Reveal. ~90 seconds.
 *  - full:   the original seven questions, for people who want depth now.
 *  - deepen: entered from Today after a fast start — only the skipped
 *            depth questions, then a regenerated (richer) Life Reveal.
 */
const LANES: Record<'fast' | 'full' | 'deepen', number[]> = {
  fast: [2, 6, 5],
  full: [0.5, 1, 2, 3, 4, 5, 6, 7],
  deepen: [0.5, 1, 3, 4, 7],
};

const WORK_TYPES: Record<string, string> = {
  office_9_5: '9–5 office', remote: 'remote', shift: 'shift work',
  business: 'business owner', freelance: 'freelancer', student: 'student', homemaker: 'homemaker',
};
const WORK_HOURS: Record<string, string> = {
  '35': 'under 40 h', '45': '40–50 h', '55': '50–60 h', '65': '60+ h',
};
const MARITAL: Record<string, string> = {
  single: 'single', married: 'married', partnered: 'with a partner',
};

/**
 * Life Discovery (PRODUCT_PHILOSOPHY.md): values ranking, current-reality
 * scores, drift admission, relationship mapping, and a feeling intention —
 * then the Time Reality Reveal: one finite-window number, framed with
 * agency, ending in a first-priority selection.
 */
export default function Onboarding() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [step, setStep] = useState<number>(0);
  const [lane, setLane] = useState<'fast' | 'full' | 'deepen'>('full');

  const [futureSelf, setFutureSelf] = useState('');
  const [eulogy, setEulogy] = useState('');
  const [userAge, setUserAge] = useState('');
  const [workType, setWorkType] = useState('');
  const [workHours, setWorkHours] = useState('');
  const [marital, setMarital] = useState('');
  const [children, setChildren] = useState<string>('0');
  const [awayFromParents, setAwayFromParents] = useState<string>('');
  const [ranking, setRanking] = useState<string[]>([]);
  const [reality, setReality] = useState<Record<string, number>>({}); // 1..5
  const [neglected, setNeglected] = useState<string[]>([]);
  const [person, setPerson] = useState({ name: '', relationType: 'mother' as string });
  const [personAge, setPersonAge] = useState<string>('');
  const [locationType, setLocationType] = useState<string>('different_city');
  const [healthStatus, setHealthStatus] = useState<string>('');
  const [callFrequency, setCallFrequency] = useState<string>('monthly');
  const [desired, setDesired] = useState<string>('weekly');
  const [visitFrequency, setVisitFrequency] = useState<string>('quarterly');
  const [postponing, setPostponing] = useState('');
  const [postponingDomain, setPostponingDomain] = useState('');
  const [feeling, setFeeling] = useState<string>('');
  const [style, setStyle] = useState<string>('balanced');

  const [reveal, setReveal] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, item: string, max = 10) => {
    if (list.includes(item)) set(list.filter((d) => d !== item));
    else if (list.length < max) set([...list, item]);
  };

  // Deepen mode: skip the intro, load what they already told us (the reality
  // step scores the domains they ranked during the fast start).
  useEffect(() => {
    if (mode !== 'deepen') return;
    setLane('deepen');
    api<any[]>('/onboarding/answers')
      .then((answers) => {
        const get = (key: string) => answers?.find((a) => a.key === key)?.value;
        const ranked = get('priorityRanking');
        if (Array.isArray(ranked) && ranked.length) setRanking(ranked);
        if (typeof get('futureSelf') === 'string') setFutureSelf(get('futureSelf'));
        if (typeof get('eulogy') === 'string') setEulogy(get('eulogy'));
        if (typeof get('firstWeekFeeling') === 'string') setFeeling(get('firstWeekFeeling'));
      })
      .catch(() => {})
      .finally(() => setStep(LANES.deepen[0]));
  }, [mode]);

  // Sequence-driven navigation: each lane walks its own list of steps.
  const seq = LANES[lane];
  const pos = seq.indexOf(step);
  const isLastStep = pos === seq.length - 1;
  const next = () => (isLastStep ? finish() : setStep(seq[pos + 1]));
  const back = () => {
    if (pos > 0) setStep(seq[pos - 1]);
    else if (lane === 'deepen') router.back();
    else setStep(0);
  };
  // Terminal steps build the reveal; mid-lane steps just advance.
  const nextTitle = isLastStep ? (busy ? 'Building your Life Reveal…' : 'See my Life Reveal') : 'Next';

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      // Life context → profile; work hours feed the Time Reality engine's
      // realistic visit-capacity math.
      await api('/me', {
        method: 'PATCH',
        body: {
          // Age anchors every life-window calculation on the Time tab.
          dob: userAge
            ? new Date(new Date().getFullYear() - parseInt(userAge, 10), 6, 1).toISOString()
            : undefined,
          workType: workType || undefined,
          workHoursPerWeek: workHours ? parseInt(workHours, 10) : undefined,
          maritalStatus: marital || undefined,
          childrenCount: parseInt(children, 10) || 0,
          livesAwayFromParents: awayFromParents === 'yes',
          motivationStyle: style,
        },
      });
      // The postponed thing becomes the user's first real goal — the Goals
      // table is what the engine's importance scoring reads from.
      if (postponing.trim()) {
        await api('/goals', {
          method: 'POST',
          body: {
            title: postponing.trim(),
            domainType: postponingDomain || ranking[0] || 'growth',
            horizon: '1y',
          },
        });
      }
      // Only send answers that carry a value — a deepen pass must never
      // blank out what the fast lane already saved (upsert semantics).
      const hasValue = (v: unknown) =>
        Array.isArray(v) ? v.length > 0
        : typeof v === 'string' ? v.trim().length > 0
        : v && typeof v === 'object' ? Object.keys(v).length > 0
        : v != null;
      await api('/onboarding/answers', {
        method: 'POST',
        body: {
          answers: [
            { section: 'values', key: 'priorityRanking', value: ranking },
            { section: 'values', key: 'currentReality', value: reality },
            { section: 'values', key: 'neglectedDomains', value: neglected },
            { section: 'values', key: 'regretRisks', value: neglected.slice(0, 3) },
            { section: 'values', key: 'firstWeekFeeling', value: feeling },
            { section: 'reflection', key: 'postponing', value: postponing },
            { section: 'reflection', key: 'futureSelf', value: futureSelf },
            { section: 'reflection', key: 'eulogy', value: eulogy },
          ].filter((a) => hasValue(a.value)),
        },
      });
      if (person.name) {
        await api('/relationships', {
          method: 'POST',
          body: {
            ...person,
            age: personAge ? parseInt(personAge, 10) : undefined,
            locationType,
            healthStatus: healthStatus || undefined,
            callFrequency,
            desiredCallFrequency: desired,
            inPersonFrequency: visitFrequency,
            closenessScore: 9,
            wantsMoreTime: true,
          },
        });
      }
      const res = await api<{ reveal: any }>('/onboarding/complete', { method: 'POST' });
      setReveal(res.reveal);
      api<any[]>('/insights/opportunities')
        .then((list) => setInsights(list ?? []))
        .catch(() => {});
      setStep(QUESTION_STEPS + 1);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      {pos >= 0 && step !== 0 && step !== QUESTION_STEPS + 1 && (
        <View style={s.progressHeader}>
          <Pressable onPress={back} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Ionicons name="chevron-back" size={22} color={colors.textDim} />
          </Pressable>
          <View style={s.progressTrack}>
            {seq.map((_, i) => (
              <View key={i} style={[s.progressSeg, i <= pos && { backgroundColor: colors.amber }]} />
            ))}
          </View>
          <Text style={type.faint}>{pos + 1}/{seq.length}</Text>
        </View>
      )}

      {step === 0 && (
        <View style={{ gap: space(4), paddingTop: space(10) }}>
          <View style={s.mark}>
            <View style={s.markRing} />
            <View style={s.markDot} />
          </View>
          <Text style={[type.display, { textAlign: 'center' }]}>First, the honest part</Text>
          <Text style={[type.serif, { textAlign: 'center', color: colors.textDim }]}>
            Three questions if you're in a hurry. Seven if you're not.{'\n'}
            Either way, we show you the gap between the life you describe and the life your time describes.
          </Text>
          <View style={{ gap: space(3), marginTop: space(4) }}>
            {[
              ['briefcase-outline', 'Tell us how your weeks actually work'],
              ['podium-outline', 'Rank what actually matters to you'],
              ['speedometer-outline', 'Score how you are living it today'],
              ['trending-down-outline', 'Admit what has been drifting'],
              ['hourglass-outline', 'Name the thing you keep postponing'],
              ['heart-outline', 'Name one person you want to show up for'],
              ['sunny-outline', 'Choose how you want to feel in a week'],
            ].map(([icon, text]) => (
              <View key={text} style={s.promiseRow}>
                <Ionicons name={icon as any} size={18} color={colors.amber} />
                <Text style={[type.body, { flex: 1 }]}>{text}</Text>
              </View>
            ))}
          </View>
          <Button
            title="Quick start — 90 seconds"
            onPress={() => { track('onboarding_started', { lane: 'fast' }); setLane('fast'); setStep(LANES.fast[0]); }}
          />
          <Pressable onPress={() => { track('onboarding_started', { lane: 'full' }); setLane('full'); setStep(LANES.full[0]); }}>
            <Text style={[type.dim, { textAlign: 'center', padding: 6, color: colors.amber }]}>
              I have four minutes — ask me everything
            </Text>
          </Pressable>
          <Text style={[type.faint, { textAlign: 'center' }]}>
            Either way: no forms after this. Priority learns from behavior, not data entry.
          </Text>
        </View>
      )}

      {step === 0.5 && (
        <View style={{ gap: space(4), paddingTop: space(6) }}>
          <Text style={type.display}>Start at the end</Text>
          <Text style={[type.serif, { color: colors.textDim }]}>
            Picture yourself at 80, looking back on a life that went well. This is the compass for everything else — but it's optional. Skip if you'd rather just begin.
          </Text>
          <View style={{ gap: space(2) }}>
            <Label>Who is around you, and what did you build?</Label>
            <Input multiline value={futureSelf} onChangeText={setFutureSelf} placeholder="The people, the feeling, the kind of person you became…" />
          </View>
          <View style={{ gap: space(2) }}>
            <Label>At your funeral, what do they say about the person — not the achievements?</Label>
            <Input multiline value={eulogy} onChangeText={setEulogy} placeholder="They were someone who always…" />
          </View>
          <Button title="Continue" onPress={next} />
          <Pressable onPress={next}>
            <Text style={[type.faint, { textAlign: 'center', padding: 6 }]}>Skip — I'll just begin</Text>
          </Pressable>
        </View>
      )}

      {step === 1 && (
        <>
          <Text style={type.display}>First, your life as it is</Text>
          <Text style={type.dim}>Your work pattern shapes what's realistic — Priority plans around your life, not an imaginary one.</Text>
          <View style={{ gap: space(4), marginTop: space(2) }}>
            <View style={{ gap: space(2) }}>
              <Label>Your age</Label>
              <Input
                placeholder="e.g. 32"
                keyboardType="number-pad"
                value={userAge}
                onChangeText={(v) => setUserAge(v.replace(/[^0-9]/g, ''))}
                style={{ maxWidth: 120 }}
              />
            </View>
            <PickRow
              label="Your work looks like"
              options={Object.keys(WORK_TYPES)}
              display={WORK_TYPES}
              value={workType}
              onPick={setWorkType}
            />
            <PickRow
              label="Hours in a typical week"
              options={Object.keys(WORK_HOURS)}
              display={WORK_HOURS}
              value={workHours}
              onPick={setWorkHours}
            />
            <PickRow
              label="At home you are"
              options={Object.keys(MARITAL)}
              display={MARITAL}
              value={marital}
              onPick={setMarital}
            />
            <PickRow
              label="Children"
              options={['0', '1', '2', '3']}
              display={{ '0': 'none', '3': '3+' }}
              value={children}
              onPick={setChildren}
            />
            <PickRow
              label="Do you live away from your parents?"
              options={['yes', 'no']}
              value={awayFromParents}
              onPick={setAwayFromParents}
            />
            <Button
              title={nextTitle}
              onPress={next}
              disabled={busy || !userAge || !workType || !workHours || !awayFromParents}
            />
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <Text style={type.display}>What matters most?</Text>
          <Text style={type.dim}>Tap in order of importance. Your first tap is your #1. Pick at least three.</Text>
          <View style={s.chips}>
            {DOMAINS.map((d) => {
              const idx = ranking.indexOf(d);
              const on = idx >= 0;
              const c = domainColor(d);
              return (
                <Pressable
                  key={d}
                  onPress={() => toggle(ranking, setRanking, d)}
                  style={({ pressed }) => [
                    s.chip,
                    on && { borderColor: c, backgroundColor: `${c}1F` },
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                >
                  {on && (
                    <View style={[s.rankBadge, { backgroundColor: c }]}>
                      <Text style={{ color: colors.bg, fontSize: 11, fontWeight: '800' }}>{idx + 1}</Text>
                    </View>
                  )}
                  <Text style={[type.body, on && { color: c, fontWeight: '700' }]}>
                    {DOMAIN_LABELS[d]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button title={nextTitle} onPress={next} disabled={busy || ranking.length < 3} />
        </>
      )}

      {step === 3 && (
        <>
          <Text style={type.display}>And honestly — how are you living them?</Text>
          <Text style={type.dim}>For each area you ranked: 1 means barely present in your weeks, 5 means fully lived.</Text>
          <View style={{ gap: space(4), marginVertical: space(3) }}>
            {ranking.map((d) => {
              const c = domainColor(d);
              const score = reality[d] ?? 0;
              return (
                <View key={d} style={{ gap: space(2) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <DomainDot domain={d} size={10} />
                    <Text style={type.heading}>{DOMAIN_LABELS[d]}</Text>
                    {score > 0 && <Text style={[type.faint, { color: c }]}>{score}/5</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', gap: space(2) }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => setReality({ ...reality, [d]: n })}
                        style={({ pressed }) => [
                          s.scoreDot,
                          n <= score && { backgroundColor: c, borderColor: c },
                          pressed && { transform: [{ scale: 0.9 }] },
                        ]}
                      >
                        <Text style={{
                          color: n <= score ? colors.bg : colors.textFaint,
                          fontWeight: '700', fontSize: 13,
                        }}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          <Button
            title={nextTitle}
            onPress={next}
            disabled={busy || ranking.some((d) => !reality[d])}
          />
        </>
      )}

      {step === 4 && (
        <>
          <Text style={type.display}>What's drifting?</Text>
          <Text style={type.dim}>The areas you keep saying "next month" about. This stays between us.</Text>
          <View style={s.chips}>
            {DOMAINS.map((d) => {
              const on = neglected.includes(d);
              return (
                <Pressable
                  key={d}
                  onPress={() => toggle(neglected, setNeglected, d, 4)}
                  style={({ pressed }) => [
                    s.chip,
                    on && s.chipRisk,
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                >
                  {on && <Ionicons name="trending-down" size={13} color={colors.rose} />}
                  <Text style={[type.body, on && { color: colors.rose, fontWeight: '700' }]}>
                    {DOMAIN_LABELS[d]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button title={neglected.length ? nextTitle : 'Nothing is drifting'} onPress={next} disabled={busy} />
        </>
      )}

      {step === 5 && (
        <>
          <Text style={type.display}>The someday check</Text>
          <Text style={type.dim}>What do you keep postponing? The thing you keep saying "someday" about. It becomes your first real goal — not a wish.</Text>
          <View style={{ gap: space(4), marginTop: space(2) }}>
            <Input
              multiline
              placeholder="Visit Amma for a full week · start the book · get the health checkup…"
              value={postponing}
              onChangeText={setPostponing}
            />
            <PickRow
              label="Which part of life is it?"
              options={ranking.length ? ranking.slice(0, 6) : DOMAINS.slice(0, 6)}
              display={DOMAIN_LABELS}
              value={postponingDomain}
              onPick={setPostponingDomain}
            />
            {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
            <Button title={nextTitle} onPress={next} disabled={busy || !postponing.trim()} />
            <Pressable onPress={() => { if (!busy) next(); }}>
              <Text style={[type.faint, { textAlign: 'center', padding: 6 }]}>Nothing comes to mind — skip</Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 6 && (
        <>
          <Text style={type.display}>One person who matters</Text>
          <Text style={type.dim}>We start with one relationship. You can add more later — or never; one is enough.</Text>
          <View style={{ gap: space(4), marginTop: space(2) }}>
            <View style={{ flexDirection: 'row', gap: space(3) }}>
              <View style={{ flex: 2 }}>
                <Input
                  placeholder="Their name (e.g. Amma)"
                  value={person.name}
                  onChangeText={(name) => setPerson({ ...person, name })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="Age"
                  keyboardType="number-pad"
                  value={personAge}
                  onChangeText={(v) => setPersonAge(v.replace(/[^0-9]/g, ''))}
                />
              </View>
            </View>
            <PickRow label="They are your" options={RELATIONS} value={person.relationType} onPick={(rel) => setPerson({ ...person, relationType: rel })} />
            <PickRow label="How often do you wish you talked?" options={CADENCES} value={desired} onPick={setDesired} />
            {lane !== 'fast' && (
              <>
                <PickRow
                  label="Where do they live?"
                  options={['same_city', 'different_city', 'abroad'] as const}
                  display={{ same_city: 'same city', different_city: 'another city', abroad: 'abroad' }}
                  value={locationType}
                  onPick={setLocationType}
                />
                <PickRow label="How often do you talk?" options={CADENCES} value={callFrequency} onPick={setCallFrequency} />
                <PickRow label="How often do you see them in person?" options={CADENCES} value={visitFrequency} onPick={setVisitFrequency} />
                <View style={{ gap: space(2) }}>
                  <Label>How is their health these days? (optional)</Label>
                  <Text style={type.faint}>This only tunes the arithmetic. It never changes how Priority speaks to you.</Text>
                  <PickRow
                    label=""
                    options={['good', 'declining', 'serious'] as const}
                    display={{ good: 'doing well', declining: 'some concerns', serious: 'serious' }}
                    value={healthStatus}
                    onPick={(v) => setHealthStatus(healthStatus === v ? '' : v)}
                  />
                </View>
              </>
            )}
            {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
            <Button title={nextTitle} onPress={next} disabled={busy || !person.name} />
          </View>
        </>
      )}

      {step === 7 && (
        <>
          <Text style={type.display}>One week from now…</Text>
          <Text style={type.dim}>If Priority works, how do you want to feel next {new Date(Date.now() + 7 * 86_400_000).toLocaleDateString(undefined, { weekday: 'long' })} evening?</Text>
          <View style={s.chips}>
            {FEELINGS.map((f) => {
              const on = feeling === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFeeling(f)}
                  style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { transform: [{ scale: 0.96 }] }]}
                >
                  <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>{f}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ gap: space(2), marginTop: space(2) }}>
            <Label>And how should Priority speak to you?</Label>
            <PickRow
              label=""
              options={['gentle', 'balanced', 'direct'] as const}
              display={{ gentle: 'gently', balanced: 'balanced', direct: 'direct — hold me to it' }}
              value={style}
              onPick={setStyle}
            />
          </View>
          {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
          <Button
            title={busy ? 'Building your Life Reveal…' : 'See my Life Reveal'}
            onPress={finish}
            disabled={busy || !feeling}
          />
        </>
      )}

      {step === QUESTION_STEPS + 1 && reveal && (
        <Reveal
          reveal={reveal}
          insights={insights}
          ranking={ranking}
          reality={reality}
          feeling={feeling}
          person={person.name ? { ...person, callFrequency, desired, visitFrequency } : null}
          onDone={() => router.replace('/(tabs)')}
        />
      )}
    </ScrollView>
  );
}

function PickRow({ label, options, value, onPick, display }: {
  label: string; options: readonly string[]; value: string; onPick: (v: string) => void;
  display?: Record<string, string>;
}) {
  return (
    <View style={{ gap: space(2) }}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const on = value === o;
          return (
            <Pressable key={o} onPress={() => onPick(o)} style={[s.chip, on && s.chipOn]}>
              <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>{display?.[o] ?? o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Fades a block in with a slight rise, after `delay` ms. */
function Stage({ delay, children }: { delay: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 700, delay, useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      gap: space(3),
    }}>
      {children}
    </Animated.View>
  );
}

/** Counts a number up from 0 — the finite window landing softly. */
function CountUp({ value, color, delay }: { value: number; color: string; delay: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = Date.now() + delay;
    const timer = setInterval(() => {
      const t = (Date.now() - start) / 1400;
      if (t < 0) return;
      if (t >= 1) { setN(value); clearInterval(timer); return; }
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
    }, 40);
    return () => clearInterval(timer);
  }, [value]);
  return (
    <Text style={{ fontSize: 84, fontWeight: '800', letterSpacing: -3, color, lineHeight: 92 }}>
      {n}
    </Text>
  );
}

function Reveal({ reveal, insights, ranking, reality, feeling, person, onDone }: {
  reveal: any;
  insights: any[];
  ranking: string[];
  reality: Record<string, number>;
  feeling: string;
  person: { name: string; relationType: string; callFrequency: string; desired: string; visitFrequency: string } | null;
  onDone: () => void;
}) {
  const top3 = (reveal.topPriorities ?? ranking).slice(0, 3);
  const visits = insights.find((i) => i.kind === 'visits_remaining');
  const callDelta = insights.find((i) => i.kind === 'calls_per_year');

  // Fallback + uplift math mirror the scoring engine (visitsPerYear + 2 over
  // 10y), including its scarcity gate: no finite-window framing for people
  // the user already sees more than monthly.
  const perYear = person ? CADENCE_PER_YEAR[person.visitFrequency] ?? 4 : 4;
  const bigNumber = visits?.estimate ?? (person && perYear <= 12 ? perYear * 10 : null);
  const uplift = (perYear + 2) * 10;

  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const pickPriority = async (title: string) => {
    if (chosen || adding) return;
    setAdding(true);
    try {
      const domain = title.split(' ').pop() ?? 'family';
      await api('/missions', {
        method: 'POST',
        body: { title, domainType: domain, estimatedMinutes: 15, xpReward: 30 },
      });
      setChosen(title);
    } catch {
      // leave selectable on failure
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={{ gap: space(4), paddingTop: space(4) }}>
      <Stage delay={300}>
        <Label>Your life reveal</Label>
        <Text style={[type.display, { color: colors.amber, fontSize: 32 }]}>{reveal.headline}</Text>
      </Stage>

      {reveal.extractedValues && (
        <Stage delay={800}>
          <Card style={{ backgroundColor: colors.surfaceSunken, gap: space(2) }}>
            <Label>What we heard you say matters</Label>
            <Text style={type.serif}>{reveal.extractedValues.reflection}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) }}>
              {reveal.extractedValues.values.map((v: string) => (
                <View key={v} style={{ borderWidth: 1, borderColor: colors.amberSoft, backgroundColor: colors.amberFaint, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Text style={{ color: colors.amber, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{v}</Text>
                </View>
              ))}
            </View>
          </Card>
        </Stage>
      )}

      <Stage delay={1200}>
        <Card style={{ gap: space(3) }}>
          <Label>What you said · how you're living it</Label>
          {top3.map((d: string, i: number) => (
            <View key={d} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[type.stat, { fontSize: 18, color: domainColor(d), width: 20 }]}>{i + 1}</Text>
                <Text style={[type.heading, { textTransform: 'capitalize', flex: 1 }]}>{d}</Text>
                {reality[d] && <Text style={type.faint}>living it {reality[d]}/5</Text>}
              </View>
              <GapBar
                importance={90 - i * 15}
                attention={(reality[d] ?? 0) * 20}
                color={domainColor(d)}
              />
            </View>
          ))}
          <Text style={type.faint}>The gap between those bars is what Priority works on.</Text>
        </Card>
      </Stage>

      <Stage delay={2400}>
        <Card style={{ backgroundColor: colors.surfaceSunken }}>
          <Text style={type.serif}>{reveal.narrative}</Text>
        </Card>
      </Stage>

      {bigNumber !== null && person && (
        <Stage delay={3400}>
          <Card accent={colors.amberSoft} style={{ alignItems: 'center', gap: space(2), paddingVertical: space(6) }}>
            <Label color={colors.amber}>Your time reality</Label>
            <CountUp value={bigNumber} color={colors.amber} delay={3600} />
            <Text style={[type.body, { textAlign: 'center' }]}>
              more visits with {person.name} in the next 10 years,{'\n'}at your current pace.
            </Text>
            <Text style={[type.faint, { textAlign: 'center' }]}>
              {visits?.detail ?? 'Simple arithmetic on the visit pace you told us — a planning lens, not a prediction.'}
            </Text>
            <View style={s.upliftRow}>
              <Ionicons name="trending-up" size={15} color={colors.green} />
              <Text style={[type.dim, { color: colors.green, flex: 1 }]}>
                Add just 2 visits a year and it becomes {uplift}.
              </Text>
            </View>
            <Text style={[type.serif, { textAlign: 'center', color: colors.textDim, marginTop: space(2) }]}>
              That is not unlimited.{'\n'}But it is enough to make each one count.
            </Text>
          </Card>
        </Stage>
      )}

      {callDelta && (
        <Stage delay={4600}>
          <Card style={{ backgroundColor: colors.surfaceSunken }}>
            <Label>Worth knowing</Label>
            <Text style={type.serif}>{callDelta.headline}</Text>
          </Card>
        </Stage>
      )}

      {reveal.driftWarning && (
        <Stage delay={5200}>
          <Card accent={colors.roseSoft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.rose} />
              <Label color={colors.rose}>Drift warning</Label>
            </View>
            <Text style={type.body}>{reveal.driftWarning}</Text>
          </Card>
        </Stage>
      )}

      <Stage delay={5800}>
        <Card accent={colors.amberSoft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="compass-outline" size={14} color={colors.amber} />
            <Label color={colors.amber}>Choose your first priority</Label>
          </View>
          <Text style={type.dim}>Pick one. It becomes your first mission — small, this week, yours.</Text>
          {reveal.firstWeekFocus?.map((f: string) => {
            const isChosen = chosen === f;
            const dimmed = !!chosen && !isChosen;
            return (
              <Pressable
                key={f}
                onPress={() => pickPriority(f)}
                disabled={!!chosen || adding}
                style={({ pressed }) => [
                  s.priorityRow,
                  isChosen && { borderColor: colors.green, backgroundColor: colors.greenSoft },
                  dimmed && { opacity: 0.4 },
                  pressed && !chosen && { backgroundColor: colors.surfaceRaised },
                ]}
              >
                <Ionicons
                  name={isChosen ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={isChosen ? colors.green : colors.textFaint}
                />
                <Text style={[type.body, { flex: 1 }]}>{f}</Text>
              </Pressable>
            );
          })}
          {chosen && (
            <Text style={[type.dim, { color: colors.green, textAlign: 'center' }]}>
              {feeling
                ? `Added to Today. That's where next week's "${feeling}" starts.`
                : 'Added to Today. That is where it starts.'}
            </Text>
          )}
        </Card>
        <Button title="Start living it" onPress={onDone} />
        <ShareRevealButton
          data={{
            headline: reveal.headline,
            topDomains: top3,
            personLine: person && bigNumber !== null
              ? `~${bigNumber} more visits with ${person.name} in the next 10 years — at my current pace.`
              : null,
            insightLine: 'That is not unlimited. But it is enough to make each one count.',
          }}
        />
      </Stage>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    padding: space(6), paddingTop: space(12), gap: space(4), paddingBottom: space(12),
    maxWidth: 560, width: '100%', alignSelf: 'center',
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  progressTrack: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  mark: {
    width: 52, height: 52, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
  },
  markRing: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    borderWidth: 3, borderColor: colors.amberSoft,
  },
  markDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.amber },
  promiseRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft,
    borderRadius: 14, padding: space(4),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginVertical: space(3) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  chipRisk: { borderColor: colors.rose, backgroundColor: colors.roseSoft },
  rankBadge: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreDot: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  upliftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.greenSoft, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12, marginTop: space(2),
  },
  priorityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    padding: space(3),
  },
});
