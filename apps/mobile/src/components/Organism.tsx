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
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['life-organism', themeMode],
    queryFn: () => api<{ svg: string }>(`/life-os/organism?sky=${themeMode}`),
    // The render costs a few seconds of CPU and the shape of a life does not
    // move minute to minute; the server caches it too.
    staleTime: 10 * 60 * 1000,
  });

  if (isError) return null;

  return (
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
  );
}

const s = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  waiting: { alignItems: 'center' },
});
