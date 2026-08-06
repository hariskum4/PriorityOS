import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { invalidateLifeRecord } from '@/services/invalidate';
import { useRefresh } from '@/hooks/useRefresh';
import { useAuth } from '@/store/auth';
import { Button, Card, Chip, ErrorNote, Input, Label, XpBar } from '@/components/ui';
import { CountryField } from '@/components/CountryField';
import { CityField } from '@/components/CityField';
import { RegionField } from '@/components/RegionField';
import { HobbyPicker } from '@/components/HobbyPicker';
import {
  calendarWriteSupported, canWriteToDeviceCalendar, calendarWriteEnabled,
  setCalendarWriteEnabled, prepareCalendarWrite,
} from '@/services/calendarWrite';
import { canonicalTimezone, regionOfCity } from '@priority/scoring-engine';
import {
  colors, type, space, levelProgress, themeMode, setThemeMode, isLight,
} from '@/theme';

const BADGE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  first_step: 'footsteps-outline',
  shows_up: 'ribbon-outline',
  consistent: 'flame-outline',
  dedicated: 'bonfire-outline',
  storyteller: 'book-outline',
  wide_heart: 'heart-outline',
  sunday_ritualist: 'telescope-outline',
  getting_clear: 'sunny-outline',
};

const LEVEL_TITLES: Array<[number, string]> = [
  [1, 'Waking up'], [11, 'Getting clear'], [26, 'Building'],
  [51, 'Living well'], [76, 'Mastery'], [91, 'Fully alive'],
];
const levelTitle = (lvl: number) =>
  [...LEVEL_TITLES].reverse().find(([min]) => lvl >= min)?.[1] ?? 'Waking up';

export default function You() {
  const qc = useQueryClient();
  /* Device-local, so it is read straight from the device rather than through
     a query — there is no server copy of this and there should not be. */
  const [calWrite, setCalWrite] = React.useState(false);
  const [calDenied, setCalDenied] = React.useState(false);
  React.useEffect(() => { calendarWriteEnabled().then(setCalWrite); }, []);
  const toggleCalendarWrite = useMutation({
    mutationFn: async (on: boolean) => {
      /* Ask before promising. A switch that flips on and silently writes
         nothing for a week is worse than one that says no now. */
      if (on) {
        const state = await prepareCalendarWrite();
        if (state.status !== 'ready') { setCalDenied(true); return false; }
      }
      setCalDenied(false);
      await setCalendarWriteEnabled(on);
      return on;
    },
    onSuccess: (on) => setCalWrite(on),
  });
  const logout = useAuth((s) => s.logout);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('/me') });
  const { data: profile } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => api<any>('/gamification/profile'),
  });
  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api<any>('/me/preferences'),
  });
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<any[]>('/notifications'),
  });

  const setIntensity = useMutation({
    mutationFn: (insightIntensity: string) =>
      api('/me/preferences', { method: 'PATCH', body: { insightIntensity } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferences'] }),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  /**
   * The zone a life is measured in.
   *
   * Signup records the device's zone and nothing has ever changed it since, so
   * someone who moves country keeps filing days and weeks against a zone they
   * no longer live in — permanently, in a record meant to outlast the move.
   *
   * It asks rather than following the device on its own. Bucketing happens at
   * read time from the raw timestamp, so changing this re-reads the whole past
   * record through the new zone: a fortnight in Tokyo would silently shift days
   * near midnight and shift them back on the way home. A move is worth one tap;
   * a holiday should not rewrite a history.
   */
  const deviceZone = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return null;
    }
  }, []);
  const [zoneDismissed, setZoneDismissed] = useState(false);
  const setZone = useMutation({
    mutationFn: (timezone: string) => api('/me', { method: 'PATCH', body: { timezone } }),
    onSuccess: () => {
      // Everything dated is read through this, so the whole record is stale.
      qc.invalidateQueries({ queryKey: ['me'] });
      invalidateLifeRecord(qc);
    },
  });
  /**
   * `Asia/Calcutta` and `Asia/Kolkata` are the same place — one is the
   * deprecated alias, and both are already in this database from real signups.
   * Comparing the strings would offer to "move" someone who has not moved.
   */
  const sameZone = (a?: string | null, b?: string | null) => {
    if (!a || !b) return true;
    if (a === b) return true;
    try {
      const at = new Date();
      const fmt = (z: string) =>
        new Intl.DateTimeFormat('en-CA', {
          timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(at);
      return fmt(a) === fmt(b);
    } catch {
      // An unrecognised zone is not evidence of a move.
      return true;
    }
  };
  const zoneMoved = !!me?.timezone && !!deviceZone
    && !sameZone(me.timezone, deviceZone) && !zoneDismissed;

  const { data: partners } = useQuery({ queryKey: ['partners'], queryFn: () => api<any>('/partners') });
  /* Only for the hobby suggestions: four options drawn from what they
     ranked beats the first four of an alphabetical shelf. */
  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const [inviteEmail, setInviteEmail] = useState('');
  const invite = useMutation({
    mutationFn: () => api('/partners/invite', { method: 'POST', body: { email: inviteEmail } }),
    onSuccess: () => { setInviteEmail(''); qc.invalidateQueries({ queryKey: ['partners'] }); },
  });
  const accept = useMutation({
    mutationFn: (id: string) => api(`/partners/${id}/accept`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners'] }),
  });

  const lvl = profile ? levelProgress(profile.totalXp ?? 0) : null;
  const badges: any[] = profile?.badges ?? [];
  const unread = (notifications ?? []).filter((n) => !n.readAt);
  const { refreshing, onRefresh } = useRefresh();

  /**
   * The three facts the engines read that until now nothing let anyone
   * correct: profession and city feed every generated suggestion's
   * vocabulary, and country picks the life-expectancy table under the
   * Time tab's numbers. Country especially needs a door — it is derived
   * from the device timezone at signup, and a derivation someone cannot
   * fix is a guess wearing a fact's clothes.
   *
   * The door used to be nine chips wide, which is a door for the people the
   * guess was already right about. `CountryField` keeps the nine and puts
   * every country behind them.
   */
  /**
   * The city being edited, or null when nothing is in flight. Held rather
   * than committed on every keystroke: the suggestions update as you type,
   * and a PATCH per character would be a write for every one of them.
   */
  const [cityDraft, setCityDraft] = useState<string | null>(null);
  /**
   * The two hobby lists, read from the onboarding answers that hold them.
   *
   * Kept as local state seeded from the server so a tap redraws immediately
   * — an upsert round trip is the wrong amount of latency for toggling a
   * chip.
   */
  const { data: answers } = useQuery({
    queryKey: ['onboarding-answers'],
    queryFn: () => api<any[]>('/onboarding/answers'),
  });
  const savedHobbies = (answers ?? []).find((a: any) => a.key === 'hobbies')?.value;
  const savedLapsed = (answers ?? []).find((a: any) => a.key === 'lapsedHobbies')?.value;
  const [hobbyDraft, setHobbies] = useState<string[] | null>(null);
  const [lapsedDraft, setLapsedHobbies] = useState<string[] | null>(null);
  const hobbies = hobbyDraft ?? (Array.isArray(savedHobbies) ? savedHobbies : []);
  const lapsedHobbies = lapsedDraft ?? (Array.isArray(savedLapsed) ? savedLapsed : []);
  const saveHobbies = useMutation({
    mutationFn: (patch: { hobbies?: string[]; lapsedHobbies?: string[] }) =>
      api('/onboarding/answers', {
        method: 'POST',
        body: {
          answers: Object.entries(patch).map(([key, value]) => ({
            section: 'life', key, value,
          })),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-answers'] }),
  });
  /** The state, only while this screen is open — see `RegionField`. */
  const [region, setRegion] = useState('');

  const saveProfile = useMutation({
    mutationFn: (patch: Record<string, string | null>) =>
      api('/me', { method: 'PATCH', body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      // Country moves the expectancy table; every time number is stale.
      invalidateLifeRecord(qc);
    },
  });

  return (
    <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={s.wrap}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />
        }
      >
      <View style={{ gap: 4 }}>
        <Text style={type.display}>{me?.fullName ?? 'You'}</Text>
        {lvl && (
          <Text style={type.dim}>
            Level {lvl.level} · {levelTitle(lvl.level)}
          </Text>
        )}
      </View>

      {profile && lvl && (
        <Card style={{ gap: space(3) }}>
          {/* Zeros greeted every new account — a report card of failure for
              somebody who hadn't been given a chance to do anything yet.
              Same rule as the GapBar: an absence is a dash, not a zero. */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={type.stat}>{profile.totalXp || '—'}</Text>
              <Text style={type.faint}>life XP</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={type.stat}>{profile.dailyStreak || '—'}</Text>
              <Text style={type.faint}>day streak</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={type.stat}>{profile.graceRemaining}</Text>
              <Text style={type.faint}>{profile.graceRemaining === 1 ? 'grace day' : 'grace days'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[type.faint, { width: 38 }]}>Lv {lvl.level}</Text>
            <XpBar into={lvl.intoLevel} needed={lvl.neededForNext} />
            <Text style={type.faint}>{lvl.intoLevel}/{lvl.neededForNext}</Text>
          </View>
          {/* "Grace left" was the one number on this card wearing jargon —
              a term the app never explains anywhere. One line pays for it. */}
          <Text style={type.faint}>
            A grace day is a missed day your streak survives.
          </Text>
        </Card>
      )}

      <Card>
        <Label>Achievements</Label>
        {badges.length === 0 ? (
          <Text style={type.dim}>None yet — they arrive as you show up, not as you tap.</Text>
        ) : (
          <View style={s.badgeGrid}>
            {badges.map((b) => (
              <View key={b.key} style={s.badge}>
                <View style={s.badgeIcon}>
                  <Ionicons name={BADGE_ICONS[b.key] ?? 'star-outline'} size={20} color={colors.amber} />
                </View>
                <Text style={[type.faint, { textAlign: 'center', fontWeight: '600', color: colors.text }]}>{b.name}</Text>
                <Text style={[type.faint, { textAlign: 'center', fontSize: 10 }]}>{b.description}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Label>Notifications</Label>
          {unread.length > 0 && <Chip label={`${unread.length} new`} color={colors.amber} />}
        </View>
        {(notifications ?? []).length === 0 ? (
          <Text style={type.dim}>Nothing yet. Priority only speaks when it has something worth saying.</Text>
        ) : (
          (notifications ?? []).slice(0, 6).map((n) => (
            <Pressable
              key={n.id}
              onPress={() => !n.readAt && markRead.mutate(n.id)}
              style={({ pressed }) => [s.notifRow, pressed && { opacity: 0.7 }]}
            >
              <View style={[s.notifDot, { backgroundColor: n.readAt ? colors.line : colors.amber }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.body, !n.readAt && { fontWeight: '700' }]}>{n.title}</Text>
                <Text style={type.faint}>{n.body}</Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>

      <Card style={{ gap: space(3) }}>
        <Label>Who you are</Label>
        <Text style={type.faint}>
          Suggestions borrow your words — what you do shapes what a realistic
          week looks like, and country tunes the arithmetic under Time.
        </Text>
        <ProfileField
          label="What you do"
          placeholder="e.g. ICU nurse, teacher"
          value={me?.profession}
          disabled={saveProfile.isPending}
          onCommit={(v) => saveProfile.mutate({ profession: v })}
        />
        {/* Country, then state, then city — the same order as onboarding and
            the same order an address is written in. Each answer shortens the
            list under it, which is the only thing that makes a list better
            than a text box. */}
        <CountryField
          value={me?.country}
          disabled={saveProfile.isPending}
          onPick={(code) => { saveProfile.mutate({ country: code }); setRegion(''); }}
        />
        {/* Re-derived from the saved city rather than stored, so a return
            visit lands on the right state without a column existing to
            remember a narrowing step. Unknown city, no state — and the city
            box below still takes anything typed into it. */}
        <RegionField
          value={region || (regionOfCity(me?.country, me?.city) ?? '')}
          onChange={setRegion}
          country={me?.country}
          disabled={saveProfile.isPending}
        />
        <View style={{ gap: space(2) }}>
          <Text style={type.dim}>City</Text>
          <CityField
            value={cityDraft ?? me?.city ?? ''}
            onChange={setCityDraft}
            country={me?.country}
            region={region || regionOfCity(me?.country, me?.city)}
            disabled={saveProfile.isPending}
          />
          {cityDraft != null && cityDraft.trim() !== (me?.city ?? '') && (
            <Button
              small
              title={saveProfile.isPending ? 'Saving…' : 'Save city'}
              onPress={() => {
                saveProfile.mutate({ city: cityDraft.trim() || null });
                setCityDraft(null);
              }}
            />
          )}
        </View>
        {/**
          * What they do for themselves, correctable.
          *
          * Hobbies rot faster than anything else the profile holds — somebody
          * says "guitar" in March and stops in April — and this app has a bad
          * record with facts captured once and believed forever: the clock
          * read at render, the country taken from a timezone and never asked
          * about again. A fact that cannot be corrected becomes a lie on a
          * schedule, so this is here from the start rather than after the
          * first person is nagged about a guitar they sold.
          */}
        <View style={{ gap: space(2) }}>
          <Text style={type.dim}>What you do for yourself</Text>
          <HobbyPicker
            value={hobbies}
            onChange={(next) => { setHobbies(next); saveHobbies.mutate({ hobbies: next }); }}
            placeholder="Search, or type your own"
            disabled={saveHobbies.isPending}
            domains={dashboard?.domains}
            movementLimits={me?.movementLimits}
            exclude={lapsedHobbies}
          />
        </View>
        <View style={{ gap: space(2) }}>
          <Text style={type.dim}>Anything you used to do and miss</Text>
          <HobbyPicker
            value={lapsedHobbies}
            onChange={(next) => { setLapsedHobbies(next); saveHobbies.mutate({ lapsedHobbies: next }); }}
            placeholder="Search, or type your own"
            max={4}
            disabled={saveHobbies.isPending}
            domains={dashboard?.domains}
            movementLimits={me?.movementLimits}
            exclude={hobbies}
          />
        </View>
        <ErrorNote error={saveProfile.error} onRetry={() => saveProfile.reset()} />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Label>Appearance</Label>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          {(['light', 'dark'] as const).map((m) => {
            const on = themeMode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setThemeMode(m)}
                style={[s.modeChip, on && { borderColor: colors.amber, backgroundColor: colors.amberFaint }]}
              >
                <Ionicons name={m === 'light' ? 'sunny-outline' : 'moon-outline'} size={16} color={on ? colors.amber : colors.textDim} />
                <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>{m}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setThemeMode('system')} style={s.modeChip}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.textDim} />
            <Text style={type.body}>system</Text>
          </Pressable>
        </View>
        <Text style={type.faint}>
          {isLight ? 'Morning paper.' : 'A quiet room at night.'} On phones, "system" follows your device.
        </Text>
      </Card>

      <Card style={{ gap: space(3) }}>
        <Label>Time reality insights</Label>
        <Text style={type.faint}>How directly should Priority talk about finite time?</Text>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          {(['off', 'gentle', 'direct'] as const).map((v) => {
            const on = (prefs?.insightIntensity ?? 'gentle') === v;
            return (
              <Pressable
                key={v}
                onPress={() => setIntensity.mutate(v)}
                style={[s.modeChip, on && { borderColor: colors.amber, backgroundColor: colors.amberFaint }]}
              >
                <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>{v}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Which calendar this life is filed against. Quiet unless it disagrees
          with the device, because for almost everyone it never will. */}
      <Card style={{ gap: space(3) }}>
        <Label>Your days</Label>
        <Text style={type.body}>
          {/* The current name, not the one the tz database keeps for
              compatibility — onboarding already offers "Kolkata" as a city
              chip, and printing "Asia/Calcutta" here had the app disagreeing
              with itself about where somebody lives. */}
          Measured in <Text style={{ color: colors.amber }}>{canonicalTimezone(me?.timezone) ?? 'UTC'}</Text>
        </Text>
        {zoneMoved ? (
          <>
            <Text style={type.faint}>
              This device says {canonicalTimezone(deviceZone)}. If you have moved, updating this files your days
              and weeks against where you actually live. Your past record is re-read through
              the new zone, so a day logged near midnight can shift by one.
            </Text>
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={setZone.isPending ? 'Updating…' : `Use ${canonicalTimezone(deviceZone)}`}
                  small
                  onPress={() => setZone.mutate(deviceZone!)}
                  disabled={setZone.isPending}
                />
              </View>
              <Button title="Keep it" small kind="ghost" onPress={() => setZoneDismissed(true)} />
            </View>
          </>
        ) : (
          <Text style={type.faint}>
            A day starts at midnight where you are, not where the server is. Priority asks
            before changing this — travelling is not moving.
          </Text>
        )}
      </Card>

      {/**
       * Moments on the phone's own calendar.
       *
       * The one place this app writes to the device, and off until asked.
       * Hidden entirely on web, where there is no device calendar to write
       * to — a switch that cannot do anything is worse than no switch.
       */}
      {calendarWriteSupported && (
        <Card style={{ gap: space(3) }}>
          <Label>Moments on your calendar</Label>
          <Text style={type.faint}>
            {canWriteToDeviceCalendar
              ? 'Kept moments appear on a calendar of their own, on the day they happened. '
                + 'The title only — never what you wrote about it. Delete the calendar any '
                + 'time and nothing here changes.'
              : 'In a browser there is no calendar to write to, so each moment can be '
                + 'downloaded from the archive and opened in whichever calendar you use. '
                + 'The title only — never what you wrote about it.'}
          </Text>
          {canWriteToDeviceCalendar && (
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            {([true, false] as const).map((on) => (
              <Pressable
                key={String(on)}
                onPress={() => toggleCalendarWrite.mutate(on)}
                disabled={toggleCalendarWrite.isPending}
                accessibilityRole="button"
                accessibilityLabel={on ? 'Save moments to my calendar' : 'Do not save moments to my calendar'}
                aria-selected={calWrite === on}
                style={[s.modeChip, calWrite === on && s.modeChipOn]}
              >
                <Text style={[type.body, calWrite === on && { color: colors.amber, fontWeight: '700' }]}>
                  {on ? 'on' : 'off'}
                </Text>
              </Pressable>
            ))}
          </View>
          )}
          {calDenied ? (
            <Text style={[type.faint, { color: colors.rose }]}>
              Your phone declined calendar access, so nothing can be written. It is
              in Settings if you change your mind.
            </Text>
          ) : null}
        </Card>
      )}

      {/* Accountability partner — the shared-life moat */}
      <Card style={{ gap: space(3) }}>
        <Label>Accountability partner</Label>
        {/**
         * This sentence used to read "One person who sees your momentum" and
         * sat above both halves of the card, which made it wrong twice.
         *
         * It described the opposite of what the code does. Inviting somebody
         * does not give them sight of you — it gives you sight of them:
         * `list()` returns the links you own with the stats of the person you
         * invited. Tested by giving the invitee a completed mission and a
         * streak and the inviter neither, then reading the inviter's screen.
         *
         * And because it sat above the incoming invite too, the one person it
         * most needed to inform was the one it misled. Somebody tapping
         * Accept was reading "one person who sees your momentum" and getting
         * the reverse: their own completion rate leaving for somebody else,
         * with nothing on the row saying so.
         *
         * What is shared has always been narrow and stays narrow. What was
         * missing was an honest account of which way it travels, said on the
         * screen of the person whose numbers move.
         */}
        <Text style={type.faint}>
          Momentum only — completion rate, streak, whether life is in balance.
          Never your priorities, people, journal, or memories. Ever.
        </Text>

        {(partners?.incoming ?? []).map((inv: any) => (
          <View key={inv.id} style={[s.partnerRow, { alignItems: 'flex-start' }]}>
            <Ionicons name="mail-unread-outline" size={18} color={colors.amber} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.body}>{inv.owner?.fullName ?? 'Someone'} invited you</Text>
              {/* The consent, at the moment of consenting, in the direction it
                  actually goes. */}
              <Text style={type.faint}>
                Accepting lets {inv.owner?.fullName ?? 'them'} see your momentum — nothing else,
                and you can be removed at any time.
              </Text>
            </View>
            <Button
              title={accept.isPending ? 'Accepting…' : 'Accept'}
              small
              onPress={() => accept.mutate(inv.id)}
              disabled={accept.isPending}
            />
          </View>
        ))}

        {(partners?.owned ?? []).map((l: any) => (
          <View key={l.id} style={s.partnerRow}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.amberFaint, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people-outline" size={16} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{l.inviteEmail}</Text>
              {l.status === 'active' && l.stats ? (
                <Text style={type.faint}>
                  {l.stats.missionsThisWeek} this week · {l.stats.dailyStreak}-day streak · {l.stats.domainsActive}/{l.stats.domainsTotal} areas active
                </Text>
              ) : (
                <Text style={type.faint}>Invite sent — waiting for them to join</Text>
              )}
            </View>
            {l.status === 'active' && <Chip label="linked" color={colors.green} />}
          </View>
        ))}

        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <View style={{ flex: 1 }}>
            <Input placeholder="Their email" autoCapitalize="none" value={inviteEmail} onChangeText={setInviteEmail} />
          </View>
          <Button title="Invite" small kind="ghost" onPress={() => invite.mutate()} disabled={!inviteEmail.trim() || invite.isPending} />
        </View>
      </Card>

      <Button title="Log out" kind="ghost" onPress={() => logout()} />
      <Text style={[type.faint, { textAlign: 'center' }]}>
        Priority learns from behavior, not data entry. Your data stays yours.
      </Text>
    </ScrollView>
  );
}

/**
 * One profile fact, editable in place.
 *
 * Commits on blur, only when the value actually changed, and an emptied
 * field commits null rather than an empty string — the AI reads these
 * columns as "their words", and "" is not a word anyone said. The draft
 * belongs to the field while focused so a background refetch cannot
 * overwrite mid-typing.
 */
function ProfileField({ label, placeholder, value, onCommit, disabled }: {
  label: string;
  placeholder: string;
  value?: string | null;
  onCommit: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value ?? '';
  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    setDraft(null);
    if (trimmed !== shown) onCommit(trimmed || null);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
      <Text style={[type.dim, { width: 92 }]}>{label}</Text>
      <Input
        value={draft ?? shown}
        onChangeText={setDraft}
        onFocus={() => setDraft(shown)}
        onBlur={commit}
        onSubmitEditing={commit}
        editable={!disabled}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        style={{ flex: 1, paddingVertical: 9 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), paddingTop: space(14), gap: space(3), paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center' },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), marginTop: space(1) },
  badge: { width: 96, alignItems: 'center', gap: 4 },
  badgeIcon: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.amberFaint, borderWidth: 1, borderColor: colors.amberSoft,
  },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  notifDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  modeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  modeChipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
