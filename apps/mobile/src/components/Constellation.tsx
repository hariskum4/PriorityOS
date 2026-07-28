/**
 * The Living Constellation — the Today screen's hero.
 *
 * Every domain of a life is a star. Three channels, all real engine output,
 * no decoration:
 *
 *   distance from centre  ← neglect (drift). Attention pulls a star home;
 *                           neglect lets it wander to the outer dark.
 *   brightness            ← the same, inverted. Drifting domains dim.
 *   size                  ← declared importance. What you said matters most
 *                           burns biggest, whether or not you're feeding it.
 *
 * The faint polygon threading the stars is the shape of the week: round means
 * balanced, lopsided means something is being starved. It reads as an
 * asterism and doubles as an honest chart.
 *
 * Angles come from a fixed table rather than even spacing — twelve evenly
 * spaced points read as a clock face, and a life is not a clock.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import Svg, {
  Circle, Defs, G, Line, RadialGradient, Stop,
} from 'react-native-svg';
import { obs, obsDomain, alpha } from '../observatory';

export interface DomainDatum {
  domainType: string;
  importance: number;   // 0-100, declared
  attention: number;    // 0-100, observed
  neglectRisk?: number; // 0-100, engine-computed
}

/** Hand-placed so the field reads as a constellation, not a dial. */
const ANGLE: Record<string, number> = {
  partner: 84,
  family: 108,
  children: 133,
  friends: 159,
  finance: 182,
  career: 206,
  impact: 233,
  reflection: 258,
  purpose: 286,
  health: 318,
  experiences: 38,
  growth: 62,
};

/**
 * The asterism. Hand-drawn like a real star chart's figure lines: a wandering
 * path with two branches, never a closed ring — a closed ring reads as a radar
 * chart, and this is a sky. Pairs are chosen so neighbours in life sit next to
 * each other (partner→children, career→finance), which makes the shape mean
 * something when one limb stretches far out.
 */
const LINKS: [string, string][] = [
  ['family', 'partner'],
  ['partner', 'children'],
  ['family', 'friends'],
  ['friends', 'growth'],
  ['growth', 'experiences'],
  ['experiences', 'health'],
  ['health', 'career'],
  ['career', 'finance'],
  ['career', 'impact'],
  ['impact', 'purpose'],
  ['purpose', 'reflection'],
  ['reflection', 'family'],
];

/** Stable fallback angle for any domain not in the table. */
function fallbackAngle(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

/**
 * How far a domain has drifted, 0 (fed) → 1 (starved). Prefers the engine's
 * own neglect score and falls back to the raw say/do gap when it's absent.
 */
export function driftOf(d: DomainDatum): number {
  const gap = Math.max(0, d.importance - d.attention) / 60;
  const risk = (d.neglectRisk ?? 0) / 100;
  return Math.max(0, Math.min(1, Math.max(gap, risk)));
}

/** The star that most deserves the opening glance. */
export function mostAdrift(domains: DomainDatum[]): DomainDatum | null {
  const live = domains.filter((d) => d.importance > 0);
  if (!live.length) return null;
  return live.reduce((worst, d) =>
    driftOf(d) * d.importance > driftOf(worst) * worst.importance ? d : worst);
}

export function Constellation({
  domains, selected, onSelect, size = 300,
}: {
  domains: DomainDatum[];
  selected?: string;
  onSelect?: (domainType: string) => void;
  size?: number;
}) {
  const c = size / 2;
  const rInner = size * 0.115;
  const rOuter = size * 0.435;

  const stars = useMemo(() => domains.map((d) => {
    const drift = driftOf(d);
    const dormant = d.importance <= 0;
    const theta = ((ANGLE[d.domainType] ?? fallbackAngle(d.domainType)) * Math.PI) / 180;
    // Dormant domains sit at the rim: present in the sky, not yet lit.
    const r = dormant ? rOuter : rInner + drift * (rOuter - rInner);
    return {
      key: d.domainType,
      color: obsDomain(d.domainType),
      x: c + r * Math.cos(theta),
      y: c - r * Math.sin(theta),
      radius: dormant ? 1.6 : 2.2 + (d.importance / 100) * 3.2,
      glow: dormant ? 0.12 : 0.28 + (1 - drift) * 0.5,
      core: dormant ? 0.22 : 0.42 + (1 - drift) * 0.58,
      angle: ANGLE[d.domainType] ?? fallbackAngle(d.domainType),
      dormant,
    };
  }), [domains, c, rInner, rOuter]);

  /** Figure lines, drawn only where both ends are lit. */
  const byKey = useMemo(() => {
    const m: Record<string, typeof stars[number]> = {};
    stars.forEach((s) => { m[s.key] = s; });
    return m;
  }, [stars]);

  const links = useMemo(() => LINKS
    .map(([a, b]) => [byKey[a], byKey[b]] as const)
    .filter(([a, b]) => a && b && !a.dormant && !b.dormant), [byKey]);

  /* One slow breath across the whole field — "alive, unhurried", nothing
     more. Native driver everywhere it's available. */
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1, duration: 3400, easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(breath, {
          toValue: 0, duration: 3400, easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  /* Opacity rather than scale: it's the one property the native driver
     animates reliably on both react-native-svg and web. */
  const haloOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      {/* The glow layer breathes on its own plain view. Animating an SVG node
          directly makes react-native-web leak `collapsable` onto <circle>. */}
      <Animated.View
        style={{ position: 'absolute', width: size, height: size, opacity: haloOpacity }}
        pointerEvents="none"
      >
        <Svg width={size} height={size}>
          <Defs>
            {stars.map((s) => (
              <RadialGradient key={s.key} id={`halo-${s.key}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={s.color} stopOpacity={s.glow * 0.55} />
                <Stop offset="55%" stopColor={s.color} stopOpacity={s.glow * 0.16} />
                <Stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {stars.map((s) => (
            <Circle
              key={s.key}
              cx={s.x} cy={s.y} r={s.radius * 6}
              fill={`url(#halo-${s.key})`}
            />
          ))}
        </Svg>
      </Animated.View>

      <Svg width={size} height={size}>
        {/* instrument rings */}
        {[0.175, 0.29, 0.4].map((f, i) => (
          <Circle
            key={f}
            cx={c} cy={c} r={size * f}
            stroke={obs.rule} strokeWidth={0.7} fill="none"
            strokeDasharray={i === 1 ? '1.5 6' : undefined}
          />
        ))}

        {/* figure lines */}
        {links.map(([a, b]) => (
          <Line
            key={`${a.key}-${b.key}`}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={alpha(obs.ink, 0.18)} strokeWidth={0.6}
          />
        ))}

        {/* centre — the self */}
        <Circle cx={c} cy={c} r={4} stroke={obs.brass} strokeWidth={0.8} fill="none" opacity={0.55} />
        <Circle cx={c} cy={c} r={1.3} fill={obs.brass} />
        <Line x1={c} y1={c - 11} x2={c} y2={c + 11} stroke={obs.brass} strokeWidth={0.5} opacity={0.3} />
        <Line x1={c - 11} y1={c} x2={c + 11} y2={c} stroke={obs.brass} strokeWidth={0.5} opacity={0.3} />

        {stars.map((s) => (
          <G key={s.key}>
            <Circle cx={s.x} cy={s.y} r={s.radius} fill={s.color} opacity={s.core} />
            {selected === s.key && (
              <Circle
                cx={s.x} cy={s.y} r={s.radius * 2.9}
                stroke={s.color} strokeWidth={0.8}
                strokeDasharray="1.5 2.5" fill="none" opacity={0.9}
              />
            )}
          </G>
        ))}
      </Svg>

      {/* Touch targets live above the SVG: comfortably larger than the stars
          they select, so a 3px star is still a 44px tap. */}
      {onSelect && stars.map((s) => {
        const hit = 44;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityLabel={`${s.key}${s.dormant ? ', not in your plan yet' : ''}`}
            onPress={() => onSelect(s.key)}
            style={{
              position: 'absolute',
              left: s.x - hit / 2,
              top: s.y - hit / 2,
              width: hit,
              height: hit,
              borderRadius: hit / 2,
            }}
          />
        );
      })}
    </View>
  );
}
