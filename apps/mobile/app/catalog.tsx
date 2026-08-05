/**
 * The catalog, walkable.
 *
 * Every rhythm the app can offer, laid out by domain — the screen that did
 * not exist. Rhythms were only ever met one at a time: the next available
 * one for a domain, dealt onto a card. Good for deciding *now*; useless for
 * the day-one question, which is "what could a well-tended week even look
 * like across my whole life?" A person cannot want what they have never
 * seen.
 *
 * This is a pull surface, and that is what squares it with the one-thing
 * rule. The dashboard decides for you because you asked it to; this screen
 * is where you go on purpose, and a library you walked into is not choice
 * overload — it is a library.
 *
 * Everything here reads from the same catalog the rest of the app resolves
 * against, held state included, via the same `rhythmForHabit` keys. One
 * source, so this screen cannot drift from what the day card believes —
 * which is the failure mode this codebase keeps paying for and does not
 * need a new copy of.
 *
 * A library you can see the shelves of.
 *
 * Twelve domains laid out at once, three rhythms each, every one carrying a
 * title, a cadence, a reason and a button, came to about four thousand
 * pixels — and the shape of the thing, the twelve parts of a life, was the
 * one piece a reader could never see. Scrolling past two domains to reach
 * the third is not browsing. So the domains collapse: closed, the whole
 * catalog is a page of twelve names, which is exactly the "what could a
 * well-tended week look like across my whole life" question this screen was
 * built to answer. Open one and it is the card it always was.
 *
 * Closed is the default for all twelve, including the ones already being
 * kept, because a header that says "1 in your week" answers the question
 * without costing three hundred pixels. Several may be open at once; a
 * reader comparing partner against children should not have one shut in
 * their face for opening the other.
 */

import React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Animated, Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  rhythmDomains,
  rhythmsFor,
  rhythmForHabit,
  isPlaceable,
  isBoundary,
  type Rhythm,
} from '@priority/scoring-engine';
import { api } from '@/services/api';
import { Card, Chip, DomainDot, Label } from '@/components/ui';
import { colors, type, space, domainColor, alpha } from '@/theme';

const DOMAIN_LABELS: Record<string, string> = {
  family: 'Family / Parents', partner: 'Partner', children: 'Children',
  health: 'Health', career: 'Career', finance: 'Financial freedom',
  growth: 'Personal growth', friends: 'Friends', experiences: 'Experiences',
  reflection: 'Inner life', purpose: 'Purpose / Creative work', impact: 'Giving back',
};

/**
 * What a rhythm costs, said the way a person would say it.
 * "3× · 40m" reads as arithmetic; "three times a week, 40 minutes" reads
 * as a commitment, and a commitment is what the tap agrees to.
 */
function cadence(r: Rhythm): string {
  const times = r.perWeek === 7 ? 'daily' : r.perWeek === 1 ? 'weekly' : `${r.perWeek}× a week`;
  return `${times} · ${r.minutes < 60 ? `${r.minutes}m` : `${r.minutes / 60}h`}`;
}

/** Where in the day it lives, only when that says something a reader can use. */
function whenLabel(r: Rhythm): string | null {
  if (isBoundary(r.when)) return 'at the day’s edge';
  if (r.when === 'allday') return 'kept all day';
  if (r.when === 'work') return 'inside the working day';
  if (!isPlaceable(r.when)) return null;
  if (r.when === 'morning') return 'wants a morning';
  if (r.when === 'midday') return 'wants a midday';
  if (r.when === 'evening') return 'wants an evening';
  return null;
}

/**
 * A domain's rhythms, arriving rather than appearing.
 *
 * Only the opening is animated — the body unmounts on close, so there is
 * nothing left to fade out, and a list that snapped open under a finger read
 * as a layout bug rather than as a drawer. Short and small on purpose: this
 * is a disclosure, not an entrance.
 */
function Reveal({ children }: { children: React.ReactNode }) {
  const v = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(v, {
      toValue: 1, duration: 170, useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [v]);
  return (
    <Animated.View
      style={{
        gap: space(3),
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function Catalog() {
  const router = useRouter();
  const qc = useQueryClient();
  /* "Family / Parents" is already two words wide in the letterspaced label,
     and "3 in your week" beside it pushed both onto second lines on a small
     phone — a header that is taller than the row it summarises. Below 360 the
     count keeps the tick and drops the sentence; the screen reader gets the
     sentence either way from the header's own label. */
  const { width: screenWidth } = useWindowDimensions();
  const tightHead = screenWidth < 360;

  const { data: habits } = useQuery({
    queryKey: ['habits'],
    queryFn: () => api<any[]>('/habits'),
  });

  /* Held by substance, not title — the same resolution every other surface
     uses, so a strength habit begun from the healthspan card marks the
     catalog's strength rhythm as held here too. */
  const heldKeys = new Set(
    (habits ?? [])
      .filter((h: any) => h.isActive !== false)
      .map((h: any) => rhythmForHabit(h.title)?.key)
      .filter(Boolean),
  );

  const [begun, setBegun] = React.useState<string[]>([]);
  const begin = useMutation({
    mutationFn: (r: { key: string; title: string; perWeek: number; domain: string }) =>
      api('/habits', {
        method: 'POST',
        body: {
          title: r.title,
          domainType: r.domain,
          targetPerWeek: r.perWeek,
          sourceType: 'system',
        },
      }),
    onMutate: (r) => setBegun((p) => (p.includes(r.key) ? p : [...p, r.key])),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (_e, r) => setBegun((p) => p.filter((k) => k !== r.key)),
  });

  const domains = rhythmDomains();

  /**
   * Which domains are open. Closed is not a lack of an answer here — it is
   * the answer for all twelve until somebody asks, which is why this starts
   * empty rather than holding the first domain or the ones being kept.
   */
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const toggle = (d: string) => setOpen((p) => ({ ...p, [d]: !p[d] }));

  const isHeld = (key: string) => heldKeys.has(key) || begun.includes(key);
  const heldIn = (d: string) => rhythmsFor(d).filter((r) => isHeld(r.key)).length;

  /* Said once, at the top, so "why only three?" has an answer before it is
     asked — and so the twelve closed rows below read as a whole catalog
     rather than as a screen that failed to load. */
  const total = domains.reduce((n, d) => n + rhythmsFor(d).length, 0);
  const heldTotal = domains.reduce((n, d) => n + heldIn(d), 0);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.textDim} />
          <Text style={type.dim}>Back</Text>
        </Pressable>

        <Text style={type.display}>The catalog</Text>
        {/* Not "three to a part of a life" any more — health holds nine.
            The count below says the true number without the copy having to
            be edited again the next time the catalog grows. */}
        <Text style={type.dim}>
          Every standing rhythm this app knows how to hold, by part of a life.
          Nothing here is assigned — a rhythm starts when you start it, and
          three a week is plenty to begin with.
        </Text>
        <Text style={type.faint}>
          {total} rhythms across {domains.length} parts of a life
          {heldTotal ? ` · ${heldTotal} already in your week` : ''}
        </Text>

        {domains.map((d) => {
          const list = rhythmsFor(d);
          if (!list.length) return null;
          const c = domainColor(d);
          const shown = open[d];
          const kept = heldIn(d);
          const name = DOMAIN_LABELS[d] ?? d;
          return (
            <Card key={d} style={{ gap: space(3), paddingVertical: 14 }}>
              {/* The whole row is the target, not the chevron. A twelve-row
                  index gets tapped at speed, and a 16px glyph at the far
                  edge is the wrong thing to ask a thumb to find. */}
              <Pressable
                onPress={() => toggle(d)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !!shown }}
                accessibilityLabel={
                  shown
                    ? `${name} — close`
                    : `${name}, ${list.length} rhythms${kept ? `, ${kept} in your week` : ''} — open`
                }
                style={({ pressed }) => [s.head, pressed && { opacity: 0.6 }]}
              >
                <DomainDot domain={d} size={10} />
                <Label>{name}</Label>
                <View style={{ flex: 1 }} />
                {/* Only when there is something to say. Twelve rows each
                    reading "3 rhythms" is noise repeated twelve times; a
                    green count is the one fact worth carrying while shut. */}
                {kept ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {tightHead ? (
                      <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                    ) : null}
                    <Text style={[type.faint, { color: colors.green }]} numberOfLines={1}>
                      {tightHead ? kept : `${kept} in your week`}
                    </Text>
                  </View>
                ) : null}
                <Ionicons
                  name={shown ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textDim}
                />
              </Pressable>
              {shown ? (
              <Reveal>
              {list.map((r) => {
                const held = isHeld(r.key);
                const hint = whenLabel(r);
                return (
                  <View key={r.key} style={s.row}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[type.body, { flex: 1, fontWeight: '600' }]}>{r.title}</Text>
                      <Chip label={cadence(r)} color={held ? colors.green : c} />
                    </View>
                    <Text style={type.faint}>{r.because}</Text>
                    {held ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                        <Text style={[type.faint, { color: colors.green }]}>In your week</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => begin.mutate({
                          key: r.key, title: r.title, perWeek: r.perWeek, domain: d,
                        })}
                        disabled={begin.isPending}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Begin: ${r.title}`}
                        style={({ pressed }) => [
                          s.beginChip,
                          begin.isPending && { opacity: 0.45 },
                          pressed && { backgroundColor: alpha(colors.amber, 0.12), transform: [{ scale: 0.97 }] },
                        ]}
                      >
                        <Ionicons name="add" size={13} color={colors.amber} />
                        <Text style={{ color: colors.amber, fontWeight: '600', fontSize: 12 }}>
                          Begin it{hint ? ` — ${hint}` : ''}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              </Reveal>
              ) : null}
            </Card>
          );
        })}

        <Text style={[type.faint, { textAlign: 'center', paddingHorizontal: space(4) }]}>
          Held ones are matched by what they are, not what they are called —
          a strength habit begun anywhere marks the strength rhythm here.
        </Text>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  wrap: {
    padding: space(5), paddingTop: space(14), gap: space(3),
    paddingBottom: space(10), maxWidth: 560, width: '100%', alignSelf: 'center',
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6 },
  /* Padded back out to the card's own inset and up to a thumb's worth of
     height, so the row a reader taps is the row they can see. */
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 24, marginVertical: -4, paddingVertical: 4,
    marginHorizontal: -18, paddingHorizontal: 18,
  },
  row: {
    gap: 6, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line, paddingTop: space(3),
  },
  beginChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: alpha(colors.amber, 0.5), borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
  },
});
