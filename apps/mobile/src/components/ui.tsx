/**
 * Shared primitives, Observatory spec.
 *
 * Proportions come from the direction deck: 22px card radius, hairline
 * rules rather than filled borders, brass as the only accent, and every
 * uppercase label set as a letterspaced mono instrument tick.
 */
import React from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, type, space, domainColor, alpha, liningNums } from '../theme';

export function Card({ children, style, accent }: {
  children: React.ReactNode; style?: ViewStyle; accent?: string;
}) {
  return (
    <View style={[s.card, accent ? { borderColor: alpha(accent, 0.35) } : null, style]}>
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
      // On web a Pressable without a role renders as a bare <div> — a screen
      // reader walked whole screens of this app and found nothing pressable.
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        kind === 'ghost' && s.btnGhost,
        kind === 'danger' && s.btnDanger,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        // Dimming brass just makes mud. A disabled control drops the fill
        // entirely and reads as an outline waiting to be earned.
        disabled && s.btnDisabled,
      ]}
    >
      <Text style={[
        s.btnText,
        small && { fontSize: 13.5 },
        kind === 'ghost' && { color: colors.textDim },
        kind === 'danger' && { color: colors.rose },
        disabled && { color: colors.textFaint },
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
    <View style={[
      s.chip,
      { borderColor: active ? alpha(c, 0.5) : colors.lineSoft },
      active && { backgroundColor: alpha(c, 0.1) },
    ]}>
      <Text style={[type.label, { color: c, fontSize: 10 }]}>{label}</Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {inner}
    </Pressable>
  );
}

/** A domain's star, shrunk to a bullet — same colour language as the sky. */
/**
 * The dot carries the domain in colour alone, which is no information at all
 * for the roughly one in twelve men who cannot separate these hues. It cannot
 * carry a label visually without becoming a chip, so it carries one for screen
 * readers instead — and the name is almost always in the text beside it.
 */
export function DomainDot({ domain, size = 8 }: { domain: string; size?: number }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={domain}
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: domainColor(domain),
      }}
    />
  );
}

export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: alpha(color, 0.14), borderWidth: 1, borderColor: alpha(color, 0.34),
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color, fontWeight: '600', fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      {...props}
      style={[s.input, props.multiline && { minHeight: 76, textAlignVertical: 'top' }, props.style]}
    />
  );
}

/**
 * Overall life alignment (100 − weighted say/do gap) as a ring. One glance
 * answers "am I living what I say matters?" Set in the serif, because it is
 * a statement about a life rather than a metric.
 */
export function AlignmentRing({ score, size = 128 }: { score: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const ringColor = clamped >= 70 ? colors.green : clamped >= 45 ? colors.amber : colors.rose;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={ringColor} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={circ * (1 - clamped / 100)}
        />
      </Svg>
      <Text style={[type.stat, { fontSize: size * 0.28 }]}>{Math.round(clamped)}</Text>
      <Text style={[type.label, { marginTop: 2 }]}>aligned</Text>
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
  importance: number; attention: number | null; color?: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Row label="you say" value={importance} color={color ?? colors.blue} />
      <Row label="you do" value={attention} color={colors.green} />
    </View>
  );
}

/**
 * A null value is "we have not measured this yet", which is not the same
 * statement as zero. Rendering an unmeasured domain as an empty bar labelled 0
 * told people they were doing none of the thing they had just said mattered
 * most — a number the app invented, on the screen meant to earn their trust.
 */
function Row({ label, value, color }: { label: string; value: number | null; color: string }) {
  const measured = value != null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Text style={[type.label, { width: 52, fontSize: 9.5 }]}>{label}</Text>
      <View style={s.track}>
        {measured && (
          <View style={[s.fill, { width: `${Math.min(100, value)}%`, backgroundColor: color }]} />
        )}
      </View>
      {measured ? (
        <Text style={[type.label, { width: 26, textAlign: 'right', fontSize: 10, fontVariant: liningNums }]}>
          {Math.round(value)}
        </Text>
      ) : (
        <Text style={[type.label, { width: 26, textAlign: 'right', fontSize: 8.5, opacity: 0.6 }]}>
          —
        </Text>
      )}
    </View>
  );
}

/**
 * Something did not work, said out loud.
 *
 * The app is offline-first, so a failed write is normal and survivable — but
 * it has to be visible. Silently swallowing it is how a person taps Complete,
 * sees nothing change, and stops trusting the whole screen.
 */
export function ErrorNote({ error, onRetry, retrying }: {
  error: unknown; onRetry?: () => void; retrying?: boolean;
}) {
  if (!error) return null;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const status = (error as { status?: number })?.status;
  const message = offline
    ? "You're offline — this will need a connection."
    : status === 401
      ? 'Your session expired. Sign in again to save this.'
      : (error as { message?: string })?.message || "That didn't save.";
  return (
    <View style={s.errorNote}>
      <Text style={[type.faint, { color: colors.rose, flex: 1 }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          disabled={retrying}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={[type.label, { color: colors.rose }]}>
            {retrying ? 'Trying…' : 'Try again'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A destructive action that asks first, in the page.
 *
 * Not `Alert.alert` — that is a no-op on react-native-web, so on the web build
 * the confirmation step would vanish and the first tap would delete. Two taps
 * in the same place, always, on every platform.
 */
export function DangerConfirm({ label, confirmLabel = 'Really delete', onConfirm, pending }: {
  label: string; confirmLabel?: string; onConfirm: () => void; pending?: boolean;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return <Button title={label} kind="danger" small onPress={() => setArmed(true)} />;
  }
  return (
    <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
      <Button
        title={pending ? 'Deleting…' : confirmLabel}
        kind="danger"
        small
        disabled={pending}
        onPress={onConfirm}
      />
      <Button title="Keep it" kind="ghost" small onPress={() => setArmed(false)} />
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
      <Text style={[type.serif, { textAlign: 'center', fontSize: 19 }]}>{headline}</Text>
      {body ? <Text style={[type.dim, { textAlign: 'center' }]}>{body}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: 18,
    gap: space(2),
  },
  btn: {
    backgroundColor: colors.amber,
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 11 },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: alpha(colors.rose, 0.4),
  },
  btnDisabled: {
    // Dimming brass just makes mud, so a disabled control drops the fill and
    // reads as an outline waiting to be earned. The opacity is what separates
    // it from an enabled ghost button — without it a disabled primary and a
    // live secondary are the same shape in the same colours, and people tap
    // the dead one.
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineSoft,
    opacity: 0.65,
  },
  btnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2 },
  xpTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
    flex: 1,
  },
  xpFill: { height: 3, borderRadius: 2, backgroundColor: colors.amber },
  empty: {
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(10),
    paddingHorizontal: space(6),
  },
  errorNote: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: alpha(colors.rose, 0.08),
    borderWidth: 1, borderColor: alpha(colors.rose, 0.3),
    borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12,
  },
});
