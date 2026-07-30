/**
 * The Organism — this life as one grown thing, at the head of the Record.
 *
 * The whole image is generated server-side (space colonization for the limbs,
 * Murray's law for their thickness, a Gray-Scott field for the medium they
 * grow through) and arrives as SVG markup. The client draws one picture rather
 * than assembling four hundred nodes, which is the only way this is affordable
 * on a phone.
 *
 * Deliberately unlabelled and untappable. It is the Record's frontispiece, not
 * a chart: the reading is "this is the shape of it", and anything precise the
 * person wants is in the words directly below.
 */
import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Svg from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { colors, type, space, themeMode } from '@/theme';

/**
 * One picture, two renderers.
 *
 * react-native-svg's web build has no `SvgXml` — the parser only ships in the
 * native entry — so on web the markup goes straight into the DOM, which is
 * both simpler and faster there. Either way the server's viewBox does the
 * scaling, so the fixed pixel size in the markup is stripped first.
 */
function Drawn({ xml, size }: { xml: string; size: number }) {
  const fluid = xml.replace(/\swidth="\d+"\sheight="\d+"/, ' width="100%" height="100%"');

  if (Platform.OS === 'web') {
    return React.createElement('div', {
      style: { width: size, height: size, lineHeight: 0 },
      dangerouslySetInnerHTML: { __html: fluid },
    });
  }

  const SvgXml = (Svg as any).SvgXml;
  if (!SvgXml) return null;
  return <SvgXml xml={fluid} width={size} height={size} />;
}

export function Organism({ size = 300 }: { size?: number }) {
  /**
   * The years this life can be drawn at.
   *
   * The drawing was a portrait: true, and mute about having been earned. Given
   * the frames, it becomes a sequence — and the reading changes from "this is
   * the shape of it" to "this is what you have built". A thin early year is
   * not a worse drawing, it is a younger one, and that is the whole point.
   */
  const { data: yearsData } = useQuery({
    queryKey: ['life-organism-years'],
    queryFn: () => api<{ years: number[] }>('/life-os/organism/years'),
    staleTime: 60 * 60 * 1000,
  });
  const years: number[] = yearsData?.years ?? [];
  /** null means now — the live drawing, which is where it opens. */
  const [asOf, setAsOf] = useState<number | null>(null);

  const { data, isLoading, isError, isPaused, refetch, isFetching } = useQuery({
    queryKey: ['life-organism', themeMode, asOf],
    queryFn: () => api<{ svg: string }>(
      `/life-os/organism?sky=${themeMode}${asOf ? `&year=${asOf}` : ''}`),
    // The render costs a few seconds of CPU and the shape of a life does not
    // move minute to minute; the server caches it too.
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  /**
   * A failure that says so.
   *
   * This used to `return null`, so when the drawing could not be fetched it
   * simply was not there — and the caption underneath it on the Record ("every
   * limb is a domain, every tip an act") was left describing an empty gap. An
   * image that vanishes silently is worse than one that admits it is missing.
   */
  if (isError || isPaused) {
    return (
      <View style={[s.frame, { height: size }]}>
        <View style={s.waiting}>
          <Ionicons name="leaf-outline" size={26} color={colors.textFaint} />
          <Text style={[type.faint, { marginTop: space(2), textAlign: 'center' }]}>
            {isPaused
              ? 'The drawing needs a connection — it will grow back when you have one.'
              : 'The drawing could not be grown just now.'}
          </Text>
          <Pressable onPress={() => refetch()} hitSlop={10} style={{ marginTop: space(2) }}>
            <Text style={[type.label, { color: colors.amber }]}>
              {isFetching ? 'Growing…' : 'Try again'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* Only worth offering once there is more than one year to compare. */
  const canScrub = years.length > 1;

  return (
    <View>
      <View style={[s.frame, { height: size }]}>
        {isLoading || !data?.svg ? (
          <View style={s.waiting}>
            <ActivityIndicator color={colors.amber} />
            <Text style={[type.faint, { marginTop: space(2) }]}>Growing your record…</Text>
          </View>
        ) : (
          <Drawn xml={data.svg} size={size} />
        )}
      </View>

      {canScrub ? (
        <View style={s.years}>
          {years.map((y) => {
            const on = asOf === y;
            return (
              <Pressable
                key={y}
                onPress={() => setAsOf(on ? null : y)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Draw this life as it stood at the end of ${y}`}
                style={({ pressed }) => [s.year, on && s.yearOn, pressed && { opacity: 0.6 }]}
              >
                <Text style={[type.faint, on && { color: colors.amber, fontWeight: '700' }]}>
                  {String(y).slice(2)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setAsOf(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Draw this life as it stands now"
            style={({ pressed }) => [s.year, !asOf && s.yearOn, pressed && { opacity: 0.6 }]}
          >
            <Text style={[type.faint, !asOf && { color: colors.amber, fontWeight: '700' }]}>now</Text>
          </Pressable>
        </View>
      ) : null}

      {asOf ? (
        <Text style={[type.faint, { textAlign: 'center', marginTop: space(2) }]}>
          As it stood at the end of {asOf}. Nothing here was lost — this is only
          how far it had grown by then.
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  waiting: { alignItems: 'center' },
  /* Years read as a strip of frames, not as a chart axis. */
  years: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 4, marginTop: space(3),
  },
  year: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  yearOn: { backgroundColor: colors.amberFaint },
});
