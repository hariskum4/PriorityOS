import React from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, type, space, domainColor } from '../theme';

export function Card({ children, style, accent }: {
  children: React.ReactNode; style?: ViewStyle; accent?: string;
}) {
  return (
    <View style={[s.card, accent ? { borderColor: accent } : null, style]}>
      {children}
    </View>
  );
}

export function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[type.label, color ? { color } : null]}>{children}</Text>;
}

export function Button({
  title, onPress, kind = 'primary', disabled, small,
}: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        kind === 'ghost' && s.btnGhost,
        kind === 'danger' && s.btnDanger,
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[
        s.btnText,
        small && { fontSize: 13 },
        kind === 'ghost' && { color: colors.textDim },
        kind === 'danger' && { color: colors.rose },
      ]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, color, onPress, active }: {
  label: string; color?: string; onPress?: () => void; active?: boolean;
}) {
  const c = color ?? colors.textDim;
  const inner = (
    <View style={[s.chip, { borderColor: active ? c : colors.line }, active && { backgroundColor: colors.surfaceRaised }]}>
      <Text style={{ color: c, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {inner}
    </Pressable>
  );
}

export function DomainDot({ domain, size = 8 }: { domain: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: domainColor(domain),
    }} />
  );
}

export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `${color}26`, borderWidth: 1, borderColor: `${color}59`,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color, fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      {...props}
      style={[s.input, props.multiline && { minHeight: 72, textAlignVertical: 'top' }, props.style]}
    />
  );
}

/**
 * The hero metric: overall life alignment (100 - weighted say/do gap)
 * as a ring. One glance answers "am I living what I say matters?"
 */
export function AlignmentRing({ score, size = 128 }: { score: number; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const ringColor = clamped >= 70 ? colors.green : clamped >= 45 ? colors.amber : colors.rose;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceRaised} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={ringColor} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={circ * (1 - clamped / 100)}
        />
      </Svg>
      <Text style={[type.stat, { fontSize: size * 0.26 }]}>{Math.round(clamped)}</Text>
      <Text style={[type.faint, { marginTop: -2 }]}>aligned</Text>
    </View>
  );
}

/** Thin XP progress bar toward the next level. */
export function XpBar({ into, needed }: { into: number; needed: number }) {
  const pct = needed > 0 ? Math.min(100, (into / needed) * 100) : 0;
  return (
    <View style={s.xpTrack}>
      <View style={[s.xpFill, { width: `${pct}%` }]} />
    </View>
  );
}

/**
 * The signature element: importance ("you say") vs attention ("you do")
 * as paired bars. The visible gap IS the product.
 */
export function GapBar({ importance, attention, color }: {
  importance: number; attention: number; color?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Row label="you say" value={importance} color={color ?? colors.blue} />
      <Row label="you do" value={attention} color={colors.green} />
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={[type.faint, { width: 50, fontSize: 11 }]}>{label}</Text>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.min(100, value)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[type.faint, { width: 28, textAlign: 'right', fontSize: 11 }]}>
        {Math.round(value)}
      </Text>
    </View>
  );
}

/** Friendly empty state — an invitation, never an apology. */
export function EmptyState({ icon, headline, body }: {
  icon?: React.ReactNode; headline: string; body?: string;
}) {
  return (
    <View style={s.empty}>
      {icon}
      <Text style={[type.heading, { textAlign: 'center' }]}>{headline}</Text>
      {body ? <Text style={[type.dim, { textAlign: 'center' }]}>{body}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: space(4),
    gap: space(2),
  },
  btn: {
    backgroundColor: colors.amber,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10 },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.roseSoft,
  },
  btnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
  xpTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    flex: 1,
  },
  xpFill: { height: 4, borderRadius: 2, backgroundColor: colors.amber },
  empty: {
    alignItems: 'center',
    gap: space(2),
    paddingVertical: space(8),
    paddingHorizontal: space(6),
  },
});
