import React from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import { tinyStep } from '@priority/scoring-engine';
import {
  Button, Card, Chip, DangerConfirm, DomainDot, EmptyState, ErrorNote, Input, Label,
} from '@/components/ui';
import { colors, type, space, domainColor, alpha } from '@/theme';

const DOMAINS = [
  'family', 'partner', 'children', 'health', 'career', 'finance',
  'growth', 'friends', 'experiences', 'reflection', 'purpose', 'impact',
];

function completedRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/**
 * The goal editor.
 *
 * Onboarding files a goal under whichever domain the answer hinted at, and it
 * guesses wrong often — "open a hotel" landed under *children*, which then
 * chose its colour, its suggested first step ("sit down where they are
 * playing"), and which engine reads it. A misfiled goal quietly corrupts the
 * model of the person, so correcting one has to be possible from inside the
 * app rather than only at the moment of creation.
 */
/**
 * By when, in the words people use for it.
 *
 * `Goal.targetDate` has been on the model since the beginning and nothing
 * outside the test fixtures has ever written one — while the engine flags
 * every goal with "No date, so nothing ever makes it urgent" and this very
 * form's placeholder reads "Run a 10K by December". A whole risk rule and a
 * whole column, with no way in.
 *
 * Offsets rather than a calendar. Somebody who has been putting off a doctor's
 * appointment for a year is not choosing the 14th of March, they are deciding
 * between soon and not yet — and a date picker asks a question this app does
 * not need the answer to. "No date" stays first and stays legitimate; a
 * deadline invented to satisfy a form is worse than none.
 */
/** Days until a target, or null when there is no date to count to. */
function daysUntil(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;
  const t = new Date(targetDate).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

function overdue(targetDate: string | null | undefined): boolean {
  const d = daysUntil(targetDate);
  return d != null && d < 0;
}

/**
 * A deadline said the way somebody would say it.
 *
 * "14 Mar" is a fact to decode; "3 weeks" is a fact you already feel. Past
 * dates say how long it has been rather than a negative number, because the
 * point of showing it is the weight, not the arithmetic.
 */
function dueLabel(targetDate: string | null | undefined): string | null {
  const d = daysUntil(targetDate);
  if (d == null) return null;
  if (d < 0) {
    const over = Math.abs(d);
    if (over < 14) return `${over}d over`;
    if (over < 60) return `${Math.round(over / 7)}w over`;
    return `${Math.round(over / 30)}mo over`;
  }
  if (d === 0) return 'today';
  if (d < 14) return `${d}d left`;
  if (d < 60) return `${Math.round(d / 7)}w left`;
  return `${Math.round(d / 30)}mo left`;
}

const BY_WHEN: Array<{ label: string; days: number | null }> = [
  { label: 'no date yet', days: null },
  { label: 'this month', days: 30 },
  { label: 'three months', days: 90 },
  { label: 'six months', days: 182 },
  { label: 'this year', days: 365 },
];

function GoalForm({ goal, onClose }: { goal?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState(goal?.title ?? '');
  const [domainType, setDomainType] = React.useState(goal?.domainType ?? 'health');
  const [horizon, setHorizon] = React.useState(goal?.horizon ?? '1y');
  /* An existing date maps back to the offset closest to it, so reopening the
     form shows what was chosen rather than resetting to "no date yet" and
     quietly clearing a deadline on save. */
  const [whenDays, setWhenDays] = React.useState<number | null>(() => {
    if (!goal?.targetDate) return null;
    const days = Math.round(
      (new Date(goal.targetDate).getTime() - Date.now()) / 86_400_000,
    );
    return BY_WHEN.reduce<number | null>((best, o) => {
      if (o.days == null) return best;
      if (best == null) return o.days;
      return Math.abs(o.days - days) < Math.abs(best - days) ? o.days : best;
    }, null);
  });

  const done = () => {
    qc.invalidateQueries({ queryKey: ['goals'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        domainType,
        horizon,
        targetDate: whenDays == null
          ? null
          : new Date(Date.now() + whenDays * 86_400_000).toISOString(),
      };
      return goal
        ? api(`/goals/${goal.id}`, { method: 'PATCH', body })
        : api('/goals', { method: 'POST', body });
    },
    onSuccess: done,
  });

  return (
    <Card style={{ gap: space(3) }}>
      <Label>{goal ? 'Fix this goal' : 'What are you aiming at?'}</Label>
      <Input
        placeholder="Run a 10K by December"
        value={title}
        onChangeText={setTitle}
        autoFocus={!goal}
      />
      <Text style={type.faint}>Which part of your life is this?</Text>
      <View style={s.chipWrap}>
        {DOMAINS.map((d) => (
          <Pressable key={d} onPress={() => setDomainType(d)} style={[s.chip, domainType === d && s.chipOn]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <DomainDot domain={d} size={7} />
              <Text style={[type.faint, domainType === d && { color: colors.amber, fontWeight: '700' }]}>{d}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={type.faint}>
        This is what decides the colour, the first step it suggests, and which part of your life gets
        the credit when you move on it.
      </Text>
      <View style={s.chipWrap}>
        {(['1y', '5y'] as const).map((h) => (
          <Pressable key={h} onPress={() => setHorizon(h)} style={[s.chip, horizon === h && s.chipOn]}>
            <Text style={[type.faint, horizon === h && { color: colors.amber, fontWeight: '700' }]}>
              {h === '1y' ? 'this year' : 'five years'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.faint}>By when?</Text>
      <View style={s.chipWrap}>
        {BY_WHEN.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => setWhenDays(o.days)}
            accessibilityRole="button"
            accessibilityState={{ selected: whenDays === o.days }}
            style={[s.chip, whenDays === o.days && s.chipOn]}
          >
            <Text style={[type.faint, whenDays === o.days && { color: colors.amber, fontWeight: '700' }]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.faint}>
        {whenDays == null
          ? 'Without one, nothing here ever becomes urgent — which is how a year goes by.'
          : 'A date you can move. It is what lets this start asking.'}
      </Text>
      <ErrorNote error={save.error} onRetry={() => save.mutate()} retrying={save.isPending} />
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <View style={{ flex: 1 }}>
          <Button
            title={save.isPending ? 'Saving…' : goal ? 'Save' : 'Add this goal'}
            onPress={() => save.mutate()}
            disabled={!title.trim() || save.isPending}
          />
        </View>
        <Button title="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

function GoalRow({ goal, hasStep }: { goal: any; hasStep: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [step, setStep] = React.useState('');
  const suggestion = tinyStep({ title: goal.title, domainType: goal.domainType });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['missions'] });
    qc.invalidateQueries({ queryKey: ['goals'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const planStep = useMutation({
    // The suggestion is the default, not decoration. It used to sit in the
    // placeholder beside a button disabled until you typed — so the one
    // obvious action on the screen looked available and did nothing.
    mutationFn: () =>
      api('/missions', {
        method: 'POST',
        body: {
          title: step.trim() || suggestion,
          domainType: goal.domainType,
          goalId: goal.id,
          estimatedMinutes: 15,
          xpReward: 40,
        },
      }),
    onSuccess: () => { setStep(''); invalidate(); },
  });

  const achieve = useMutation({
    mutationFn: () => api(`/goals/${goal.id}`, { method: 'PATCH', body: { status: 'achieved' } }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => api(`/goals/${goal.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  if (editing) return <GoalForm goal={goal} onClose={() => setEditing(false)} />;

  return (
    <View style={{ gap: space(2), borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
        <View style={{ paddingTop: 6 }}><DomainDot domain={goal.domainType} /></View>
        {/* A goal title is an identifier, not an essay. Some are stored as
            whole paragraphs, so clamp rather than let one goal push the rest
            of the card off-screen. */}
        <Text style={[type.heading, { flex: 1, minWidth: 0 }]} numberOfLines={2}>
          {goal.title}
        </Text>
        <View style={{ flexShrink: 0 }}>
          {/* The date when there is one, the horizon when there is not. Two
              chips saying "this year" and "three months" beside each other
              is one fact too many for a row this narrow. */}
          <Chip
            label={dueLabel(goal.targetDate) ?? (goal.horizon === '5y' ? '5 years' : 'this year')}
            color={overdue(goal.targetDate) ? colors.rose : undefined}
          />
        </View>
        <Pressable
          onPress={() => setEditing(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit goal: ${goal.title}`}
        >
          <Ionicons name="create-outline" size={16} color={colors.textFaint} />
        </Pressable>
      </View>

      {/* The engine has always flagged this — "No date, so nothing ever makes
          it urgent" — and the reader was never shown it or given a way to
          answer. A year of putting off a doctor's appointment is exactly the
          shape of goal that never had a date. */}
      {!goal.targetDate ? (
        <Pressable
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel={`Set a date for: ${goal.title}`}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 5 }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="calendar-outline" size={13} color={colors.textDim} />
          <Text style={type.faint}>No date — nothing makes this urgent. </Text>
          <Text style={[type.faint, { color: colors.amber }]}>Set one</Text>
        </Pressable>
      ) : null}

      {hasStep ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={15} color={colors.green} />
          <Text style={[type.faint, { color: colors.green }]}>This week's step is in your missions.</Text>
        </View>
      ) : (
        <View style={{ gap: space(2) }}>
          <Input placeholder={suggestion} value={step} onChangeText={setStep} />
          <ErrorNote error={planStep.error} onRetry={() => planStep.mutate()} retrying={planStep.isPending} />
          <Button
            title={planStep.isPending ? 'Adding…' : step.trim() ? "Make it this week's mission" : 'Use this step'}
            small
            kind="ghost"
            onPress={() => planStep.mutate()}
            disabled={planStep.isPending}
          />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
        <Button
          title={achieve.isPending ? 'Marking…' : 'Achieved'}
          small
          kind="ghost"
          onPress={() => achieve.mutate()}
          disabled={achieve.isPending}
        />
        <DangerConfirm
          label="Remove"
          confirmLabel="Yes, remove"
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      </View>
      <ErrorNote error={achieve.error ?? remove.error} />
    </View>
  );
}

export default function Missions() {
  const qc = useQueryClient();
  const [goalsOpen, setGoalsOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  const { data, isError, refetch, isRefetching } = useQuery({
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
    invalidateLifeRecord(qc);
  };
  const complete = useMutation({
    mutationFn: (id: string) => api(`/missions/${id}/complete`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  /**
   * Snooze moves the due date a day but leaves the card exactly where it was,
   * so a successful "Later" was indistinguishable from a dead button. This is
   * the receipt.
   */
  const [snoozedTitle, setSnoozedTitle] = React.useState<string | null>(null);
  const snooze = useMutation({
    mutationFn: (m: any) => api(`/missions/${m.id}/snooze`, { method: 'POST' }),
    onSuccess: (_res, m) => {
      setSnoozedTitle(m.title ?? 'That mission');
      invalidate();
    },
  });
  React.useEffect(() => {
    if (!snoozedTitle) return;
    // Long enough to read a mission title and believe it. Four seconds was
    // gone before a slow reader reached the end of their own words.
    const t = setTimeout(() => setSnoozedTitle(null), 7000);
    return () => clearTimeout(t);
  }, [snoozedTitle]);
  /** Which row is mid-flight, so only that card's buttons go quiet. */
  const busyId = complete.isPending ? complete.variables : snooze.isPending ? snooze.variables?.id : null;

  const openGoals = (goals ?? []).filter((g) => g.status !== 'achieved' && g.status !== 'done');
  const stepped = openGoals.filter((g) => (data ?? []).some((m) => m.goalId === g.id)).length;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={s.wrap}
      data={data ?? []}
      keyExtractor={(m) => m.id}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.amber} />
      }
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
          {isError ? (
            <ErrorNote error={new Error('Could not load your missions.')} onRetry={() => refetch()} />
          ) : null}
          {(complete.isError || snooze.isError) ? (
            <ErrorNote
              error={complete.error ?? snooze.error}
              onRetry={() => { complete.reset(); snooze.reset(); }}
            />
          ) : null}
          {snoozedTitle ? (
            <View style={s.snoozeNote}>
              <Ionicons name="time-outline" size={15} color={colors.textDim} />
              <Text style={[type.faint, { flex: 1 }]}>
                Moved to tomorrow: {snoozedTitle}
              </Text>
            </View>
          ) : null}

          {/* Goals fold. Seven of them, each with a title, an input and a
              button, buried the one pending mission a thousand pixels down —
              the tab was mostly a form for things that are not today. */}
          <View style={{ gap: goalsOpen ? space(3) : 0 }}>
            <Pressable
              onPress={() => setGoalsOpen((v) => !v)}
              // Without a role this renders as a bare div on web, so the one
              // control that opens the goals was invisible to a screen reader
              // and to anything else walking the page.
              accessibilityRole="button"
              accessibilityState={{ expanded: goalsOpen }}
              accessibilityLabel={
                goalsOpen
                  ? 'Your goals — close'
                  : `Your goals, ${openGoals.length} open — open`
              }
              style={({ pressed }) => [s.sectionHead, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="flag-outline" size={14} color={goalsOpen ? colors.amber : colors.textDim} />
              <Label color={goalsOpen ? colors.amber : undefined}>Your goals</Label>
              <View style={{ flex: 1 }} />
              {!goalsOpen ? (
                /* "4 open · 0 with a step" advertised an unused feature as a
                   deficiency, in a collapsed header, to somebody who has not
                   been told what a step is. The count of goals is the fact
                   worth carrying; the second half joins in only when it has
                   a number that means something. */
                <Text style={type.faint}>
                  {openGoals.length} open
                  {stepped > 0 ? ` · ${stepped} with a step` : ''}
                </Text>
              ) : null}
              <Ionicons name={goalsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
            </Pressable>

            {goalsOpen ? (
              <Card style={{ gap: space(3) }}>
                {openGoals.map((g) => (
                  <GoalRow
                    key={g.id}
                    goal={g}
                    hasStep={(data ?? []).some((m) => m.goalId === g.id)}
                  />
                ))}
                {adding ? (
                  <GoalForm onClose={() => setAdding(false)} />
                ) : (
                  <Pressable onPress={() => setAdding(true)} style={({ pressed }) => [s.addRow, pressed && { opacity: 0.6 }]}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.amber} />
                    <Text style={[type.label, { color: colors.amber }]}>Add a goal</Text>
                  </Pressable>
                )}
                <Text style={type.faint}>
                  A goal without a scheduled step is a wish. One small step a week compounds.
                </Text>
              </Card>
            ) : null}
          </View>
        </View>
      }
      renderItem={({ item: m }) => {
        const busy = busyId === m.id;
        return (
          <Card style={{ gap: space(3) }}>
            {/* This row used to be two unshrinkable halves, so a longish name
                pushed it 89px past the viewport: the list scrolled sideways,
                the XP chip left the screen entirely, and the buttons below
                drifted out from under the reader's thumb. The breadcrumb now
                yields space and the chips hold theirs. */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                <DomainDot domain={m.domainType} />
                <Text
                  numberOfLines={1}
                  style={[type.faint, { color: domainColor(m.domainType), fontWeight: '600', flexShrink: 1 }]}
                >
                  {/* `capitalize` belongs to the domain word alone. Applied to
                      the whole string it rewrote people's names — "de Souza"
                      became "De Souza". */}
                  <Text style={{ textTransform: 'capitalize' }}>{m.domainType}</Text>
                  {m.relationship ? ` · ${m.relationship.name}` : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
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
                {/* Guarded, because two taps used to mean two completions and
                    double XP — and on a slow connection nothing moved to say
                    the first tap had landed. */}
                <Button
                  title={busy ? 'Saving…' : 'Complete'}
                  small
                  onPress={() => complete.mutate(m.id)}
                  disabled={busy}
                />
              </View>
              <Button title="Later" kind="ghost" small onPress={() => snooze.mutate(m)} disabled={busy} />
            </View>
          </Card>
        );
      }}
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
  snoozeNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceSunken, borderRadius: 10, padding: 10,
  },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: space(3), paddingHorizontal: space(2),
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
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
