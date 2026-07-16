import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bodyWindows,
  estimateCostOfWaiting,
  estimateCreativeCompounding,
  tripsRemaining,
  costOfDelay,
} from '@priority/scoring-engine';
import { api } from '@/services/api';
import { Button, Card, Chip, DomainDot, EmptyState, GapBar, Label } from '@/components/ui';
import { colors, type, space, domainColor, isLight } from '@/theme';

const DOMAIN_LABELS: Record<string, string> = {
  family: 'Family / Parents', partner: 'Partner', children: 'Children',
  health: 'Health', career: 'Career', finance: 'Financial freedom',
  growth: 'Personal growth', friends: 'Friends', experiences: 'Experiences',
  reflection: 'Inner life', purpose: 'Purpose / Creative work', impact: 'Giving back',
};

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

export default function DomainDetail() {
  const { type: domainType } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const c = domainColor(domainType);

  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('/me') });
  const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: () => api<any[]>('/goals') });
  const { data: missions } = useQuery({ queryKey: ['missions'], queryFn: () => api<any[]>('/missions?status=pending') });
  const { data: relationships } = useQuery({ queryKey: ['relationships'], queryFn: () => api<any[]>('/relationships') });

  const complete = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['missions-completed'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const addStarter = useMutation({
    mutationFn: (title: string) =>
      api('/missions', { method: 'POST', body: { title, domainType, estimatedMinutes: 15, xpReward: 30 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const domain = (dashboard?.domains ?? []).find((d: any) => d.domainType === domainType);
  const domainGoals = (goals ?? []).filter((g) => g.domainType === domainType && g.status !== 'done');
  const domainMissions = (missions ?? []).filter((m) => m.domainType === domainType);
  const domainPeople = (relationships ?? []).filter((r) => relDomain[r.relationType] === domainType);
  const age = ageFromDob(me?.dob);
  const label = DOMAIN_LABELS[domainType] ?? domainType;

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
              {domain.neglectRisk >= 50
                ? <Chip label="drifting" color={colors.rose} />
                : <Chip label={domain.trend === 'up' ? 'rising' : domain.trend} color={colors.green} />}
            </View>
            <GapBar importance={domain.importance} attention={domain.attention} color={c} />
          </Card>
        )}

        <SignatureFeature
          domainType={domainType}
          age={age}
          color={c}
          onAdd={(t) => addStarter.mutate(t)}
          pendingTitles={new Set((missions ?? []).map((m: any) => String(m.title).trim().toLowerCase()))}
          busy={addStarter.isPending}
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
              <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${c}26`, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c, fontWeight: '700' }}>{r.name[0]}</Text>
                </View>
                <Text style={[type.heading, { flex: 1 }]}>{r.name}</Text>
                <Text style={[type.faint, { textTransform: 'capitalize' }]}>{r.relationType}</Text>
              </Card>
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

        {/* Open missions */}
        {domainMissions.length > 0 && (
          <View style={{ gap: space(2) }}>
            <Label>Open here</Label>
            {domainMissions.map((m) => (
              <Card key={m.id} style={{ gap: space(2) }}>
                <Text style={type.body}>{m.title}</Text>
                <Button title={`Complete  +${m.xpReward} XP`} small onPress={() => complete.mutate(m.id)} />
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
function SignatureFeature({ domainType, age, color, onAdd, pendingTitles, busy }: {
  domainType: string; age: number | null; color: string; onAdd: (title: string) => void;
  pendingTitles: Set<string>; busy: boolean;
}) {
  const [monthly, setMonthly] = React.useState('10000');
  const [minutes, setMinutes] = React.useState(30);
  // One tap adds it, then the button says so — no silent duplicate stacking.
  const starter = (label: string, missionTitle: string) => {
    const added = pendingTitles.has(missionTitle.trim().toLowerCase());
    return (
      <Button
        title={added ? 'Added — in your list' : label}
        small
        kind="ghost"
        disabled={added || busy}
        onPress={() => onAdd(missionTitle)}
      />
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
              <Chip label={w.yearsLeft === null ? 'always open' : `~${w.yearsLeft} yrs`} color={w.yearsLeft === null ? colors.green : colors.amber} />
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
    const trips = tripsRemaining(age, 2);
    return (
      <Card style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="airplane-outline" size={14} color={colors.textDim} />
          <Label>The experience window</Label>
        </View>
        <Text style={type.serif}>{trips.framingText}</Text>
        <Text style={type.faint}>Name your rituals on the Time tab — ocean swims, treks, festivals — and watch them count down as you live them.</Text>
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
    children: { label: 'The concentrated years', icon: 'happy-outline', text: 'Ordinary days are where childhood actually happens.', starter: 'One undivided hour with them this week' },
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
