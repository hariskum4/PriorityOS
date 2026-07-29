/**
 * Record — everything PriorityOS knows about you, readable.
 *
 * Deliberately the least interactive screen in the app. It has no cards to
 * dismiss, no scores to improve, nothing to tap for XP. It exists so a person
 * can read what the system believes about their life and disagree with it, which
 * is the only honest form of "explain your recommendations".
 *
 * The content is generated server-side from Postgres on every open, never
 * stored — so it cannot fall out of step with the data it describes. That is
 * also why there is a visible "generated just now" line: the freshness is the
 * feature.
 *
 * Rendered with a small purpose-built markdown reader rather than a dependency:
 * the document's vocabulary is fixed (headings, bold, quotes, lists, one table),
 * and a 60-line renderer we control beats a library that fights the type system.
 */
import React from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, Share, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Organism } from '@/components/Organism';
import { colors, type, space, alpha, serifFamily, monoFamily, skyGradient } from '@/theme';

/* ── markdown → the Observatory's three voices ───────────────────────── */

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'em'; text: string }        // _italic paragraph_ — the asides
  | { kind: 'quote'; text: string }     // > their own words
  | { kind: 'li'; text: string }
  | { kind: 'rule' }
  | { kind: 'row'; cells: string[]; header?: boolean };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^\|\s*[-:| ]+\|$/.test(line)) continue;              // table divider
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      blocks.push({ kind: 'row', cells, header: /you say/i.test(line) });
      continue;
    }
    if (line.startsWith('### ')) { blocks.push({ kind: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## ')) { blocks.push({ kind: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# ')) { blocks.push({ kind: 'h1', text: line.slice(2) }); continue; }
    if (line === '---') { blocks.push({ kind: 'rule' }); continue; }
    if (line.startsWith('> ')) { blocks.push({ kind: 'quote', text: line.slice(2) }); continue; }
    if (/^\s*-\s+/.test(line)) { blocks.push({ kind: 'li', text: line.replace(/^\s*-\s+/, '') }); continue; }
    if (/^[*_].+[*_]$/.test(line)) {
      blocks.push({ kind: 'em', text: line.replace(/^[*_]+|[*_]+$/g, '') });
      continue;
    }
    blocks.push({ kind: 'p', text: line });
  }
  return blocks;
}

/**
 * Inline emphasis. Bold is matched before single-asterisk italic so `**x**`
 * cannot be mistaken for two italics, and `*emphasis*` renders rather than
 * leaking its markers into the prose.
 */
function Inline({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_]+_)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
          return <Text key={i} style={{ fontWeight: '700', color: colors.text }}>{p.slice(2, -2)}</Text>;
        }
        if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) {
          return <Text key={i} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</Text>;
        }
        if (p.length > 2 && p.startsWith('_') && p.endsWith('_')) {
          return <Text key={i} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</Text>;
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

function Rendered({ blocks }: { blocks: Block[] }) {
  return (
    <View style={{ gap: 2 }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h1':
            return <Text key={i} style={s.h1}>{b.text}</Text>;
          case 'h2':
            return (
              <View key={i} style={s.h2Wrap}>
                <Text style={s.h2}>{b.text}</Text>
              </View>
            );
          case 'h3':
            return <Text key={i} style={s.h3}>{b.text}</Text>;
          case 'p':
            return <Inline key={i} text={b.text} style={s.p} />;
          case 'em':
            // The asides — where the document explains itself.
            return <Inline key={i} text={b.text} style={s.aside} />;
          case 'quote':
            return (
              <View key={i} style={s.quote}>
                <Inline text={b.text} style={s.quoteText} />
              </View>
            );
          case 'li':
            return (
              <View key={i} style={s.liRow}>
                <View style={s.bullet} />
                <Inline text={b.text} style={s.li} />
              </View>
            );
          case 'rule':
            return <View key={i} style={s.rule} />;
          case 'row':
            return (
              <View key={i} style={[s.tRow, b.header && s.tHeader]}>
                {b.cells.map((c, j) => (
                  <Inline
                    key={j}
                    text={c}
                    style={[
                      j === 0 ? s.tCellFirst : s.tCell,
                      b.header && s.tHeaderCell,
                    ]}
                  />
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </View>
  );
}

/* ── screen ──────────────────────────────────────────────────────────── */

export default function Record() {
  const {
    data, refetch, isRefetching, isLoading, isError, isPaused, dataUpdatedAt,
  } = useQuery({
    queryKey: ['life-document'],
    queryFn: () => api<any>('/life-os/document'),
    // Always current: this document's whole promise is that it reflects now.
    staleTime: 0,
    retry: 1,
  });

  /**
   * When what you are reading was actually read.
   *
   * The document says of itself that it "cannot drift out of date" — and then
   * the offline cache hands you yesterday's copy, under that sentence, with
   * nothing to say so. Either the claim is true or it is labelled. An hour is
   * the threshold: inside it the wording is honest enough; past it the page
   * has to admit what it is showing.
   */
  const ageMs = dataUpdatedAt ? Date.now() - dataUpdatedAt : 0;
  const stale = !!data && ageMs > 60 * 60 * 1000;
  const asOf = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;

  const blocks = React.useMemo(() => parse(data?.markdown ?? ''), [data?.markdown]);
  const sum = data?.summary;

  const exportDoc = async () => {
    if (!data?.markdown) return;
    try {
      if (Platform.OS === 'web') {
        // Your data, in a format nothing can lock you out of.
        const blob = new Blob([data.markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `priority-record-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: data.markdown });
      }
    } catch { /* the user cancelled the share sheet */ }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={skyGradient()} style={s.skyWash} pointerEvents="none" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.wrap}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.amber} />
        }
      >
        <View style={{ gap: 6 }}>
          <Text style={type.label}>Your record</Text>
          {sum ? (
            <Text style={type.faint}>
              {sum.people} people · {sum.goals} goals · {sum.decisions} decisions
              {' · '}{sum.knowledge} things read · {sum.memories} moments · {sum.weeks} weeks of history
            </Text>
          ) : null}
        </View>

        <Organism size={320} />
        <Text style={[type.faint, { textAlign: 'center', marginTop: -8 }]}>
          Every limb is a domain, every tip an act. Thickness is what it holds up.
        </Text>

        <Pressable
          onPress={exportDoc}
          style={({ pressed }) => [s.export, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="download-outline" size={15} color={colors.amber} />
          <Text style={[type.label, { color: colors.amber }]}>Export as markdown</Text>
        </Pressable>

        {stale || isPaused ? (
          <View style={s.staleNote}>
            <Ionicons name="cloud-offline-outline" size={15} color={colors.textDim} />
            <Text style={[type.faint, { flex: 1 }]}>
              Showing the copy stored on this device{asOf ? `, read ${asOf}` : ''}. Anything you have
              changed since is not in it yet.
            </Text>
            <Pressable onPress={() => refetch()} hitSlop={8}>
              <Text style={[type.label, { color: colors.amber }]}>
                {isRefetching ? 'Reading…' : 'Refresh'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <Text style={[type.dim, { marginTop: space(6) }]}>Reading your data…</Text>
        ) : isError && !data ? (
          <View style={{ marginTop: space(6), gap: space(3), alignItems: 'flex-start' }}>
            <Text style={type.body}>
              Your record could not be read just now. Nothing is lost — this page is generated from
              your data every time it opens, so it will be here when the connection is.
            </Text>
            <Pressable onPress={() => refetch()} style={({ pressed }) => [s.export, pressed && { opacity: 0.7 }]}>
              <Ionicons name="refresh-outline" size={15} color={colors.amber} />
              <Text style={[type.label, { color: colors.amber }]}>
                {isRefetching ? 'Trying…' : 'Try again'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Rendered blocks={blocks} />
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    padding: 22, paddingTop: 64, paddingBottom: 64, gap: 16,
    maxWidth: 620, width: '100%', alignSelf: 'center',
  },
  skyWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },

  export: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: alpha(colors.amber, 0.35), borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 13,
  },
  staleNote: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 13,
    paddingVertical: 10, paddingHorizontal: 13,
    backgroundColor: colors.surfaceSunken,
  },

  h1: {
    fontFamily: serifFamily, fontSize: 32, lineHeight: 38, color: colors.text,
    letterSpacing: -0.4, marginTop: 14,
  },
  h2Wrap: {
    marginTop: 26, marginBottom: 4,
    borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 18,
  },
  h2: { fontFamily: serifFamily, fontSize: 24, lineHeight: 30, color: colors.text, letterSpacing: -0.3 },
  h3: {
    fontSize: 16, fontWeight: '600', color: colors.text,
    letterSpacing: -0.1, marginTop: 18,
  },
  p: { fontSize: 14.5, lineHeight: 22, color: colors.textDim, marginTop: 5 },
  aside: {
    fontFamily: serifFamily, fontSize: 14.5, lineHeight: 23,
    color: colors.textFaint, marginTop: 8,
  },
  quote: {
    borderLeftWidth: 2, borderLeftColor: alpha(colors.amber, 0.5),
    paddingLeft: 13, marginTop: 10, marginBottom: 4,
  },
  quoteText: { fontFamily: serifFamily, fontSize: 15.5, lineHeight: 25, color: colors.text },

  liRow: { flexDirection: 'row', gap: 10, marginTop: 7, alignItems: 'flex-start' },
  bullet: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 9,
  },
  li: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.textDim },

  rule: { height: 1, backgroundColor: 'transparent', marginTop: 6 },

  tRow: {
    flexDirection: 'row', gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.lineSoft,
  },
  tHeader: { borderBottomColor: colors.line },
  tHeaderCell: {
    fontFamily: monoFamily, fontSize: 10, letterSpacing: 1.2,
    textTransform: 'uppercase', color: colors.textFaint,
  },
  tCellFirst: { flex: 2, fontSize: 14, color: colors.text, textTransform: 'capitalize' },
  tCell: { flex: 1, fontSize: 14, color: colors.textDim, textAlign: 'right' },
});
