import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import { useMemoryDraft } from '@/store/memoryDraft';
import { writeMemoryToCalendar, addMomentToCalendar, canWriteToDeviceCalendar } from '@/services/calendarWrite';
import {
  Button, Card, Chip, DangerConfirm, DomainDot, EmptyState, ErrorNote, Input, Label,
} from '@/components/ui';
import { supportLines, insightPrompt } from '@priority/scoring-engine';
import { colors, type, space, alpha, breakLongWords } from '@/theme';

/**
 * The way into the weekly review, from the daily one.
 *
 * States what it costs and what it is worth before asking for fifteen minutes,
 * and says plainly when it is already done — an entry point that cannot tell
 * you whether you have done the thing is an invitation to do it twice.
 */
function SundaySessionEntry() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['weekly-review'],
    queryFn: () => api<any>('/weekly-review/current'),
  });
  const done = !!data?.completedAt;

  return (
    <Pressable
      onPress={() => router.push('/review')}
      accessibilityRole="button"
      accessibilityLabel={done ? 'Sunday Session, already done this week' : 'Start the Sunday Session'}
      style={({ pressed }) => [s.sundayCard, pressed && { opacity: 0.75 }]}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : 'telescope-outline'}
        size={20}
        color={done ? colors.green : colors.amber}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[type.body, { fontWeight: '600' }]}>
          {done ? 'Sunday Session — done this week' : 'The Sunday Session'}
        </Text>
        <Text style={type.faint}>
          {done
            ? 'Reopen it to change what you set.'
            : 'Fifteen minutes, once a week — the step back that makes the daily notes add up.'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const MEMORY_TYPES: Record<string, string> = {
  relationship: 'together', experience: 'experience', achievement: 'achievement',
  reflection: 'realization', gratitude: 'gratitude',
};

const DOMAINS = [
  'family', 'partner', 'children', 'health', 'career', 'finance',
  'growth', 'friends', 'experiences', 'reflection', 'purpose', 'impact',
];

/** How the day felt, 1–5. Stored as `mood`, which nothing has ever written. */
const MOODS: Array<[number, string, string]> = [
  [1, 'sad-outline', 'hard'],
  [2, 'rainy-outline', 'heavy'],
  [3, 'remove-circle-outline', 'flat'],
  [4, 'partly-sunny-outline', 'good'],
  [5, 'sunny-outline', 'bright'],
];

export default function Journal() {
  const [segment, setSegment] = useState<'reflect' | 'memories'>('reflect');
  const { draft, pendingEntry } = useMemoryDraft();

  // A pending mission draft jumps straight to the memory form.
  useEffect(() => {
    if (draft) setSegment('memories');
  }, [draft]);

  /* And back again once the moment is kept, because a drafted first line is
     no use on the half of the tab that cannot write one. */
  useEffect(() => {
    if (pendingEntry) setSegment('reflect');
  }, [pendingEntry]);

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

      {/* The Sunday Session's home.
          Reflecting daily and reflecting weekly are the same activity on two
          clocks, and they were two separate tabs — which is part of why the
          bar carried eight. The weekly one now lives where the daily one is,
          and it is the only route out of this screen, so it has to be
          unmissable rather than a link. */}
      <SundaySessionEntry />
    </ScrollView>
  );
}

// ---------------------------------------------------------------- reflect
function Reflect() {
  const qc = useQueryClient();
  const [whatMattered, setWhatMattered] = useState('');
  /**
   * A first line offered after a moment was kept.
   *
   * Taken once — `takeEntry` clears it as it hands it over — so a re-render
   * cannot refill a field somebody has just emptied on purpose. It lands as
   * ordinary editable text with no ceremony: accept it, rewrite it, or select
   * all and delete. The app drafted a sentence; it did not write the journal.
   */
  const takeEntry = useMemoryDraft((st) => st.takeEntry);
  const offered = useMemoryDraft((st) => st.pendingEntry);
  const offeredPrompt = useMemoryDraft((st) => st.pendingPrompt);
  const [wasDrafted, setWasDrafted] = useState(false);
  const [askedPrompt, setAskedPrompt] = useState<string | null>(null);
  useEffect(() => {
    if (!offered && !offeredPrompt) return;
    const taken = takeEntry();
    if (!taken) return;
    if (taken.line) setWhatMattered((current) => (current.trim() ? current : taken.line));
    setAskedPrompt(taken.prompt);
    setWasDrafted(!!taken.line);
  }, [offered, offeredPrompt]);
  const [whatIAvoided, setWhatIAvoided] = useState('');
  const [gratitude, setGratitude] = useState('');
  const [gladNotPostponed, setGladNotPostponed] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  /** How far back we have asked for. Bumped by "Show older". */
  const [pages, setPages] = useState<string[]>([]);

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['journal'],
    queryFn: () => api<any[]>('/journal?take=30'),
  });
  /* Only so the support card can offer lines somebody can actually reach.
     Cached and shared with every other screen that asks for it. */
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('/me'),
    staleTime: 10 * 60_000,
  });
  const { data: older } = useQuery({
    queryKey: ['journal-older', pages],
    queryFn: async () => {
      const out: any[] = [];
      for (const before of pages) {
        out.push(...await api<any[]>(`/journal?take=30&before=${encodeURIComponent(before)}`));
      }
      return out;
    },
    enabled: pages.length > 0,
  });

  const loaded = [...(data ?? []), ...(older ?? [])];
  /**
   * Search, over what has been loaded.
   *
   * Deliberately not a server query: these columns are encrypted at rest, so
   * the database cannot match on them without giving up the encryption — which
   * is a far worse trade than searching the entries you have pulled down. Load
   * older entries and they join the search.
   */
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const entries = needle
    ? loaded.filter((e) =>
        [e.whatMattered, e.whatIAvoided, e.gratitude, e.gladNotPostponed]
          .filter(Boolean)
          .some((v: string) => v.toLowerCase().includes(needle)))
    : loaded;

  // The body travels as mutation VARIABLES, not closed-over state: paused
  // offline, this write is snapshotted to disk as key + variables and finished
  // on the next launch by the default registered in mutationDefaults.ts —
  // which cannot see this component.
  const entryBody = () => ({
    whatMattered: whatMattered || null,
    whatIAvoided: whatIAvoided || null,
    gratitude: gratitude || null,
    gladNotPostponed: gladNotPostponed || null,
    mood,
    // The schema calls this the field that feeds attention scoring, and
    // nothing had ever set it — so writing in your journal counted for
    // nothing in the model of where your attention actually goes.
    domainTags: tags,
  });
  const save = useMutation({
    mutationKey: ['journal', 'create'],
    mutationFn: (body: ReturnType<typeof entryBody>) =>
      api<any>('/journal', { method: 'POST', body }),
    onSuccess: (res) => {
      setWhatMattered(''); setWhatIAvoided(''); setGratitude('');
      setGladNotPostponed(''); setMood(null); setTags([]); setMore(false);
      if (res?.supportSuggested) {
        setShowSupport(true);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
      qc.invalidateQueries({ queryKey: ['journal'] });
      invalidateLifeRecord(qc);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/journal/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal'] });
      qc.invalidateQueries({ queryKey: ['journal-older'] });
    },
  });

  const empty = !whatMattered && !whatIAvoided && !gratitude && !gladNotPostponed && mood === null;

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
          {/* The lines for where this reader actually is, from the country
              already on their profile. It used to be three fixed Indian
              numbers with the international directory underneath — the right
              default for this product, and the wrong thing to hand somebody
              in Manchester at two in the morning, who would then have to read
              past two numbers that cannot help them to reach the one that
              can. Nobody in that state should be doing routing work for the
              app. */}
          <View style={{ gap: space(1) }}>
            {supportLines(me?.country).map((line) => (
              <Text key={line.contact} style={type.dim}>
                {line.name}{line.note ? ` (${line.note})` : ''}:{' '}
                <Text style={{ color: colors.blue, fontWeight: '700' }}>{line.contact}</Text>
              </Text>
            ))}
          </View>
          <Text style={type.faint}>
            Priority is a planning tool, not a substitute for support from people who are trained for it.
          </Text>
          <Button title="Okay" kind="ghost" onPress={() => setShowSupport(false)} />
        </Card>
      )}

      <Card style={{ gap: space(3) }}>
        <View style={{ gap: space(2) }}>
          <Label>How was today?</Label>
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            {MOODS.map(([value, icon, word]) => (
              <Pressable
                key={value}
                onPress={() => setMood(mood === value ? null : value)}
                accessibilityRole="button"
                accessibilityLabel={`Today was ${word}`}
                aria-selected={mood === value}
                style={[s.mood, mood === value && s.moodOn]}
              >
                <Ionicons
                  name={icon as never}
                  size={19}
                  color={mood === value ? colors.amber : colors.textFaint}
                />
                <Text style={[type.faint, { fontSize: 10 }, mood === value && { color: colors.amber }]}>
                  {word}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: space(2) }}>
          <Label>What mattered today?</Label>
          <Input multiline value={whatMattered} onChangeText={setWhatMattered} placeholder="A moment, a person, a choice…" />
          {/* Said out loud, because a sentence that appears in a text box
              without explanation reads as something the app decided about
              your evening rather than a first line you are free to delete. */}
          {wasDrafted && whatMattered.trim() ? (
            <Text style={type.faint}>
              A first line from what you just kept — change it, or clear it.
            </Text>
          ) : null}
          {/**
           * The question, which is the half that actually earns its place.
           * The expressive-writing gain tracked causal and insight words
           * rather than emotional ones, so what helps is not more sentence
           * from the app — it is the question that pulls for the sentence
           * only the person can write.
           */}
          {askedPrompt ? (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Ionicons name="help-circle-outline" size={14} color={colors.amber} style={{ marginTop: 2 }} />
              <Text style={[type.dim, { flex: 1, color: colors.amber }]}>{askedPrompt}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ gap: space(2) }}>
          <Label>What did I avoid?</Label>
          <Input multiline value={whatIAvoided} onChangeText={setWhatIAvoided} placeholder="The call you didn't make, the thing you didn't say…" />
        </View>

        {/* The rest of the entry, folded. Four questions on an empty screen is
            an interrogation; two is a journal. The other fields have always
            existed in the database and simply had nowhere to be written. */}
        {more ? (
          <>
            <View style={{ gap: space(2) }}>
              <Label>What are you grateful for?</Label>
              <Input multiline value={gratitude} onChangeText={setGratitude} placeholder="Small counts. Small is usually the point." />
            </View>
            <View style={{ gap: space(2) }}>
              <Label>What are you glad you didn't put off?</Label>
              <Input multiline value={gladNotPostponed} onChangeText={setGladNotPostponed} placeholder="The thing you almost moved to tomorrow…" />
            </View>
            <View style={{ gap: space(2) }}>
              <Label>Which parts of life was today about?</Label>
              <View style={s.chipWrap}>
                {DOMAINS.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setTags((t) => t.includes(d) ? t.filter((x) => x !== d) : [...t, d])}
                    style={[s.chip, tags.includes(d) && s.chipOn]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <DomainDot domain={d} size={7} />
                      <Text style={[type.faint, tags.includes(d) && { color: colors.amber, fontWeight: '700' }]}>{d}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              <Text style={type.faint}>
                This is the one part of the entry the rest of the app reads — tagging a day is how
                writing about your family shows up as attention paid to them.
              </Text>
            </View>
          </>
        ) : (
          <Pressable
            onPress={() => setMore(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add gratitude, what you didn't postpone, or tags"
          >
            {/* Seven words can't be an instrument tick — as letterspaced mono
                caps this wrapped onto two lines and read as shouting. */}
            <Text style={[type.faint, { color: colors.amber }]}>
              + gratitude, what you didn't postpone, tags
            </Text>
          </Pressable>
        )}

        <ErrorNote error={save.error} onRetry={() => save.mutate(entryBody())} retrying={save.isPending} />
        {saved ? (
          <View style={s.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            {/* Not "+10 XP" — a journal entry is the least arcade moment in
                the app. The ledger on the You tab still banks it. */}
            <Text style={[type.dim, { color: colors.green }]}>Saved — it counts toward today.</Text>
          </View>
        ) : (
          <Button
            title={save.isPending ? 'Saving…' : 'Save entry'}
            onPress={() => save.mutate(entryBody())}
            disabled={empty || save.isPending}
          />
        )}
      </Card>

      <ErrorNote error={remove.error} onRetry={() => remove.reset()} />
      {loaded.length > 3 ? (
        <View style={{ gap: space(1) }}>
          <Input
            placeholder="Search what you've written…"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {needle ? (
            <Text style={type.faint}>
              {entries.length} of {loaded.length} loaded {loaded.length === 1 ? 'entry' : 'entries'}
              {' '}— load older ones below to search further back.
            </Text>
          ) : null}
        </View>
      ) : null}
      {entries.length > 0 && <Label>{needle ? 'Found' : 'Earlier'}</Label>}
      {entries.map((e) => (
        <Card key={e.id} style={{ backgroundColor: colors.surfaceSunken, gap: space(2) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[type.faint, { flex: 1 }]}>{fmtDate(e.createdAt)}</Text>
            {/* The word as well as the glyph.
                Saying how a day felt is the one thing this screen asks for
                before anything else, and reading it back gave a grey icon in
                the same faint colour whether the answer was "hard" or
                "bright" — unnamed to a screen reader, and to anyone who has
                not memorised five weather symbols. The composer above shows
                both; so does the record. */}
            {e.mood ? (() => {
              const mood = MOODS.find(([v]) => v === e.mood);
              return (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  accessibilityLabel={mood ? `Today was ${mood[2]}` : undefined}
                >
                  <Ionicons
                    name={(mood?.[1] ?? 'ellipse-outline') as never}
                    size={15}
                    color={colors.textFaint}
                  />
                  {mood ? <Text style={type.faint}>{mood[2]}</Text> : null}
                </View>
              );
            })() : null}
            {(e.domainTags ?? []).slice(0, 4).map((d: string) => <DomainDot key={d} domain={d} size={7} />)}
          </View>
          {e.whatMattered ? <Text style={[type.serif, breakLongWords]}>{e.whatMattered}</Text> : null}
          {e.whatIAvoided ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="eye-off-outline" size={14} color={colors.textFaint} style={{ marginTop: 3 }} />
              <Text style={[type.dim, { flex: 1, minWidth: 0 }, breakLongWords]}>{e.whatIAvoided}</Text>
            </View>
          ) : null}
          {e.gratitude ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="leaf-outline" size={14} color={colors.green} style={{ marginTop: 3 }} />
              <Text style={[type.dim, { flex: 1, minWidth: 0 }, breakLongWords]}>{e.gratitude}</Text>
            </View>
          ) : null}
          {e.gladNotPostponed ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="checkmark-done-outline" size={14} color={colors.amber} style={{ marginTop: 3 }} />
              <Text style={[type.dim, { flex: 1, minWidth: 0 }, breakLongWords]}>{e.gladNotPostponed}</Text>
            </View>
          ) : null}
          {/* A private journal you cannot take something back out of is not
              private in the way people mean the word. */}
          <View style={{ alignSelf: 'flex-start' }}>
            <DangerConfirm
              label="Delete"
              confirmLabel="Delete this entry"
              pending={remove.isPending && remove.variables === e.id}
              onConfirm={() => remove.mutate(e.id)}
            />
          </View>
        </Card>
      ))}
      {loaded.length >= 30 && (
        <Button
          title="Show older entries"
          kind="ghost"
          onPress={() => setPages((p) => [...p, loaded[loaded.length - 1].createdAt])}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------- memories
function Memories() {
  const qc = useQueryClient();
  const { draft, clear, markKept, offerEntry } = useMemoryDraft();

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
  /**
   * People are held by id, not by name.
   *
   * `peoplePresent` is a list of names and `relationshipId` is the actual
   * link — and this form only ever set the names, so a memory about Amma
   * written here was not attached to Amma. It never reached her page, and the
   * reach-out line that is supposed to be built from your last moment
   * together could not see it.
   */
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [countKey, setCountKey] = useState<string>('');
  const [reflection, setReflection] = useState('');
  /**
   * The two beats that turn a row into something worth going back to.
   *
   * A memory had one prose box, so the archive read as a list of titles with
   * dates — a thing that counts rather than a thing anybody re-reads. What
   * people return to a diary for is the substance: what was actually said,
   * and the part that stayed with them.
   *
   * Behind a disclosure, and staying there. Three questions where there was
   * one is how a journal empties — the same restraint the hobby picker
   * needed, for the same reason.
   */
  const [conversation, setConversation] = useState('');
  const [keepsake, setKeepsake] = useState('');
  const [moreBeats, setMoreBeats] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * When it happened, not when it was typed.
   *
   * A life did not begin when the app was installed. Backdating is what lets the
   * years grid on the Time tab light up 2009 for a graduation — the timeline
   * reads `occurredAt`, so without a way to set it every memory collapses onto
   * today and the whole archive looks a few weeks old.
   */
  const [occurredOn, setOccurredOn] = useState('');   // YYYY-MM-DD, blank = today
  const dateValid = occurredOn === '' || /^\d{4}-\d{2}-\d{2}$/.test(occurredOn);

  useEffect(() => {
    if (draft) {
      setTitle(draft.title);
      if (draft.relationshipId) setPersonIds([draft.relationshipId]);
      /**
       * A new moment gets a form, not the last one's receipt.
       *
       * "Kept. This is what the numbers were for." is a confirmation with a
       * two-and-a-half second life, and it lives on a screen the tabs keep
       * mounted. Finish one mission, keep its moment, finish another and tap
       * "Save it" inside that window, and the second moment was greeted by
       * the first one's thank-you — the app appearing to have already saved
       * something the reader had not written yet.
       */
      setJustSaved(false);
    }
  }, [draft]);

  const people = relationships ?? [];
  const nameOf = (id: string) => people.find((p: any) => p.id === id)?.name ?? '';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['memories'] });
    invalidateLifeRecord(qc);
  };

  // Variables, not closure: this is the "memory on a plane" write, and it can
  // only survive a force-quit if everything it needs rides in the snapshot.
  const momentBody = () => ({
    title: title.trim(),
    memoryType,
    peoplePresent: personIds.map(nameOf).filter(Boolean),
    // One person named is an unambiguous link; several is a gathering,
    // and the row can only point at one.
    relationshipId: personIds.length === 1 ? personIds[0] : draft?.relationshipId,
    countKey: countKey || undefined,
    reflection: reflection.trim() || undefined,
    conversation: conversation.trim() || undefined,
    keepsake: keepsake.trim() || undefined,
    missionId: draft?.missionId,
    domainType: draft?.domainType,
    // Noon UTC, so a date never lands on the previous day in a western
    // timezone once it comes back as a timestamp.
    occurredAt: occurredOn ? `${occurredOn}T12:00:00.000Z` : undefined,
  });
  const save = useMutation({
    mutationKey: ['memory', 'create'],
    mutationFn: (body: ReturnType<typeof momentBody>) =>
      api<any>('/memories', { method: 'POST', body }),
    onSuccess: (saved: any) => {
      /* Remembered before the draft is cleared, so the banner that sent us
         here stops offering to save a moment that is already kept. */
      if (draft?.missionId) markKept(draft.missionId);
      /**
       * And onto the phone's calendar, if the reader asked for that.
       *
       * Fire and forget, and silent about failing. The moment is already in
       * the archive by the time this runs — a refused permission or a phone
       * with no calendar app is not a reason to tell somebody their evening
       * did not save. `writeMemoryToCalendar` checks the preference itself,
       * so the default path here is a no-op that costs nothing.
       */
      void writeMemoryToCalendar({
        title: saved?.title ?? title.trim(),
        occurredAt: saved?.occurredAt ?? new Date(),
        /* The server decides this, never the client — a timed entry means the
           app watched the clock, and only the server knows whether it did. */
        timeKnown: saved?.timeKnown,
      });
      /**
       * And the other half of the tab, which until now never heard about any
       * of this. The archive got a row and the written journal stayed empty,
       * so the app could know somebody called their mother and hold not one
       * word about it.
       *
       * Fire and forget on purpose: this is an offer, not a step. If the
       * draft never arrives the composer is simply blank, which is exactly
       * what it was before.
       */
      const kept = title.trim() || draft?.title;
      if (kept) {
        api<{ whatMattered?: string }>('/journal/draft', {
          method: 'POST',
          body: {
            title: kept,
            personName: draft?.personName,
            domainType: draft?.domainType,
          },
        })
          .then((d) => { if (d) offerEntry(d.whatMattered ?? '', (d as any).prompt ?? null); })
          .catch(() => {});
      }
      setTitle(''); setReflection(''); setConversation(''); setKeepsake(''); setMoreBeats(false);
      setPersonIds([]); setCountKey(''); setOccurredOn('');
      clear();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/memories/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  /* Explicit, per moment. The background write governed by the You tab
     toggle is a different thing and only exists on a device. */
  const toCalendar = useMutation({
    mutationFn: (m: any) => addMomentToCalendar({
      title: m.title, occurredAt: m.occurredAt, timeKnown: m.timeKnown,
    }),
  });


  const togglePerson = (id: string) =>
    setPersonIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  /**
   * The date, and the hour only where there is one.
   *
   * Every moment shows a date. A moment kept from a finished mission also
   * shows a time, because that one was dated from the completion rather than
   * from whenever the phone was picked up again — the app watched that clock.
   * Everything else has a day and nothing more, and printing "12:00" on a
   * trip somebody dated by hand would be inventing an afternoon.
   *
   * Which is the whole point of the distinction being carried this far: the
   * two look different on the screen, so a time on the page always means
   * something.
   */
  const fmtWhen = (m: { occurredAt: string; timeKnown?: boolean }) => (
    m.timeKnown
      ? `${fmtDate(m.occurredAt)} · ${new Date(m.occurredAt).toLocaleTimeString(undefined, {
        hour: 'numeric', minute: '2-digit',
      })}`
      : fmtDate(m.occurredAt)
  );

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
              <Text style={type.faint}>{fmtWhen(m)}</Text>
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

        {/* When it happened. Blank means today; a past date lights up that year
            on the Time tab, which is how a life older than the app gets in. */}
        <View style={{ gap: space(1) }}>
          <Text style={type.faint}>When did it happen?</Text>
          <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
            <Input
              placeholder="today"
              value={occurredOn}
              onChangeText={(v) => setOccurredOn(v.replace(/[^0-9-]/g, '').slice(0, 10))}
              autoCapitalize="none"
              style={{ maxWidth: 150 }}
            />
            <Text style={[type.faint, !dateValid && { color: colors.rose }]}>
              {occurredOn === ''
                ? 'YYYY-MM-DD for something older'
                : dateValid
                  ? 'Will land on that year'
                  : 'Needs to look like 2009-06-14'}
            </Text>
          </View>
        </View>
        {people.length > 0 && (
          <View style={{ gap: space(1) }}>
            <Text style={type.faint}>Who was there?</Text>
            <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
              {people.map((r: any) => (
                <Pressable key={r.id} onPress={() => togglePerson(r.id)} style={[s.chip, personIds.includes(r.id) && s.chipOn]}>
                  <Text style={[type.faint, personIds.includes(r.id) && { color: colors.amber, fontWeight: '700' }]}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
            {personIds.length === 1 ? (
              <Text style={type.faint}>This will be kept on {nameOf(personIds[0])}'s page too.</Text>
            ) : null}
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
          /* Not "What happened?" — the title field one row up already asks
             that, and two identical prompts on one form is how somebody
             types their account into the one-line name. I did exactly that
             while testing it. */
          placeholder="The longer version — how it actually went"
          accessibilityLabel="The longer version — how it actually went"
          value={reflection}
          onChangeText={setReflection}
        />
        {moreBeats ? (
          <>
            <Input
              multiline
              placeholder="What did you talk about?"
              accessibilityLabel="What did you talk about?"
              value={conversation}
              onChangeText={setConversation}
            />
            <Input
              multiline
              placeholder="What do you want to remember about it?"
              accessibilityLabel="What do you want to remember about it?"
              value={keepsake}
              onChangeText={setKeepsake}
            />
          </>
        ) : (
          <Pressable
            onPress={() => setMoreBeats(true)}
            accessibilityRole="button"
            accessibilityLabel="Add what you talked about and what you want to remember"
            hitSlop={8}
          >
            <Text style={[type.faint, { color: colors.amber }]}>
              + what you talked about, what you want to remember
            </Text>
          </Pressable>
        )}
        <ErrorNote error={save.error} onRetry={() => save.mutate(momentBody())} retrying={save.isPending} />
        {justSaved ? (
          <View style={s.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            <Text style={[type.dim, { color: colors.green }]}>Kept. This is what the numbers were for.</Text>
          </View>
        ) : (
          <Button
            title={save.isPending ? 'Keeping…' : 'Keep this moment'}
            onPress={() => save.mutate(momentBody())}
            disabled={!title.trim() || !dateValid || save.isPending}
          />
        )}
      </Card>

      <ErrorNote error={remove.error} onRetry={() => remove.reset()} />
      {memories && memories.length > 0 && <Label>The archive</Label>}
      {memories?.map((m) => (
        editing === m.id ? (
          <EditMemory key={m.id} memory={m} onClose={() => setEditing(null)} onSaved={invalidate} />
        ) : (
          <Card key={m.id} style={{ backgroundColor: colors.surfaceSunken, gap: space(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {m.domainType ? <DomainDot domain={m.domainType} /> : null}
              <Text style={[type.heading, { flex: 1 }]}>{m.title}</Text>
              <Text style={type.faint}>{fmtWhen(m)}</Text>
              <Pressable onPress={() => setEditing(m.id)} hitSlop={8}>
                <Ionicons name="create-outline" size={15} color={colors.textFaint} />
              </Pressable>
            </View>
            {(m.peoplePresent ?? []).length > 0 && (
              <Text style={type.faint}>With {(m.peoplePresent as string[]).join(', ')}</Text>
            )}
            {/**
             * Read as an entry, not as a row.
             *
             * The account first and plainest, then what was said, then the
             * part that stayed — which is the order somebody re-reading it
             * wants them in, and the reason the archive is worth opening at
             * all. Each is absent when it is absent; a moment with only a
             * title still renders as a moment.
             */}
            {m.reflection ? <Text style={type.serif}>{m.reflection}</Text> : null}
            {m.conversation ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: space(1) }}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textFaint} style={{ marginTop: 3 }} />
                <Text style={[type.dim, { flex: 1, minWidth: 0 }, breakLongWords]}>{m.conversation}</Text>
              </View>
            ) : null}
            {m.keepsake ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: space(1) }}>
                <Ionicons name="bookmark-outline" size={14} color={colors.amber} style={{ marginTop: 3 }} />
                <Text style={[type.dim, { flex: 1, minWidth: 0 }, breakLongWords]}>{m.keepsake}</Text>
              </View>
            ) : null}
            {/**
             * The way out of the archive and into the written half.
             *
             * A kept moment is a fact with a date on it; an entry is what it
             * came to mean, and the second usually arrives later than the
             * first. Without this the archive was a dead end — somewhere
             * moments went to be counted and never thought about again.
             */}
            {/**
             * Opens the moment itself, not today's page.
             *
             * This used to hand a drafted line to the Today composer, which
             * is right for something kept an hour ago and wrong for anything
             * older: a memory from three weeks back would have been written
             * about inside today's daily entry, under today's date. A moment
             * belongs to the day it happened on, and expanding it is editing
             * it — not writing a new thing somewhere else.
             */}
            <View style={{ flexDirection: 'row', gap: space(3), flexWrap: 'wrap' }}>
              <Pressable
                onPress={() => setEditing(m.id)}
                accessibilityRole="button"
                accessibilityLabel={`Write more about ${m.title}`}
                style={({ pressed }) => [s.writeAbout, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="create-outline" size={14} color={colors.amber} />
                <Text style={[type.faint, { color: colors.amber }]}>Write more about this</Text>
              </Pressable>
              {/**
               * One moment onto a calendar, asked for rather than assumed.
               *
               * On a phone this writes into the app's own calendar; in a
               * browser it hands over the file every calendar imports. The
               * destination is the same and the route is whatever the
               * platform actually has — which is why the action is here on
               * both rather than hidden on one.
               */}
              <Pressable
                onPress={() => toCalendar.mutate(m)}
                disabled={toCalendar.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Add ${m.title} to your calendar`}
                style={({ pressed }) => [s.writeAbout, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="calendar-outline" size={14} color={colors.textFaint} />
                <Text style={type.faint}>
                  {canWriteToDeviceCalendar ? 'Add to calendar' : 'Download for calendar'}
                </Text>
              </Pressable>
            </View>
            <View style={{ alignSelf: 'flex-start', marginTop: space(1) }}>
              <DangerConfirm
                label="Delete"
                confirmLabel="Delete this moment"
                pending={remove.isPending && remove.variables === m.id}
                onConfirm={() => remove.mutate(m.id)}
              />
            </View>
          </Card>
        )
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

/** Mostly this exists to fix a date — the thing that puts a moment on the wrong year. */
function EditMemory({ memory, onClose, onSaved }: {
  memory: any; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(memory.title ?? '');
  const [reflection, setReflection] = useState(memory.reflection ?? '');
  /* The beats are why somebody reopens a moment, so the edit form has to
     hold them — otherwise coming back can only correct a title. */
  const [conversation, setConversation] = useState(memory.conversation ?? '');
  const [keepsake, setKeepsake] = useState(memory.keepsake ?? '');
  const [occurredOn, setOccurredOn] = useState(
    memory.occurredAt ? new Date(memory.occurredAt).toISOString().slice(0, 10) : '',
  );
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(occurredOn);

  const save = useMutation({
    mutationFn: () =>
      api(`/memories/${memory.id}`, {
        method: 'PATCH',
        body: {
          title: title.trim(),
          reflection: reflection.trim() || null,
          conversation: conversation.trim() || null,
          keepsake: keepsake.trim() || null,
          occurredAt: `${occurredOn}T12:00:00.000Z`,
        },
      }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <Card style={{ gap: space(3) }}>
      {/**
       * "Fix this moment" was error-correction language on the one screen
       * that should invite return. Nobody comes back to an evening because
       * it was wrong — they come back because they have thought about it
       * since, and that is the whole value of the screen: the feeling about
       * a call is often not available until the next morning, which is
       * exactly the window the expressive-writing work is about.
       */}
      <Label>Back to this moment</Label>
      {/**
       * The question, asked where the moment is rather than on today's page.
       *
       * Somebody reopening an evening from three weeks ago is not short of a
       * text box — they are short of a reason to start. This is the same
       * deterministic question the composer uses, put next to the thing it is
       * about, which is the only place it makes sense to answer it.
       */}
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
        <Ionicons name="help-circle-outline" size={14} color={colors.amber} style={{ marginTop: 2 }} />
        <Text style={[type.dim, { flex: 1, color: colors.amber }]}>
          {insightPrompt({
            title: memory.title,
            personName: (memory.peoplePresent ?? [])[0] ?? memory.personName ?? null,
          })}
        </Text>
      </View>
      <Input value={title} onChangeText={setTitle} placeholder="What happened? One line is enough." />
      <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
        <Input
          value={occurredOn}
          onChangeText={(v) => setOccurredOn(v.replace(/[^0-9-]/g, '').slice(0, 10))}
          autoCapitalize="none"
          style={{ maxWidth: 150 }}
        />
        <Text style={[type.faint, !dateValid && { color: colors.rose }]}>
          {dateValid ? 'Lands on that year' : 'Needs to look like 2009-06-14'}
        </Text>
      </View>
      <Input multiline value={reflection} onChangeText={setReflection} placeholder="The longer version — how it actually went" accessibilityLabel="The longer version — how it actually went" />
      <Input multiline value={conversation} onChangeText={setConversation} placeholder="What did you talk about?" accessibilityLabel="What did you talk about?" />
      <Input multiline value={keepsake} onChangeText={setKeepsake} placeholder="What do you want to remember about it?" accessibilityLabel="What do you want to remember about it?" />
      <ErrorNote error={save.error} onRetry={() => save.mutate()} retrying={save.isPending} />
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <View style={{ flex: 1 }}>
          <Button
            title={save.isPending ? 'Saving…' : 'Save'}
            onPress={() => save.mutate()}
            disabled={!title.trim() || !dateValid || save.isPending}
          />
        </View>
        <Button title="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  segmentRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  writeAbout: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: space(1) },
  segment: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  segmentOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  sundayCard: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    marginTop: space(4),
    borderWidth: 1, borderColor: colors.line, borderRadius: 14,
    backgroundColor: colors.surface, padding: space(3),
  },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  chipWrap: { flexDirection: 'row', gap: space(2), flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  mood: {
    flex: 1, alignItems: 'center', gap: 3, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    backgroundColor: colors.surface,
  },
  moodOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
});
