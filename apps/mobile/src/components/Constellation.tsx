/**
 * The Living Constellation — the Today screen's hero.
 *
 * A life at the centre, and the parts of it going round. Four channels, all
 * real engine output, no decoration:
 *
 *   distance from centre  ← neglect (drift), with declared importance claiming
 *                           part of the span. Attention pulls a domain home.
 *   orbital period        ← how often that part of the life is actually
 *                           touched. Weekly domains take a week to come round.
 *   brightness            ← drift, inverted. Drifting domains dim.
 *   size                  ← declared importance. What you said matters most
 *                           burns biggest, whether or not you're feeding it.
 *
 * The orbit is a clock, not an animation. A domain's angle is its true
 * position in its own cycle, measured from a fixed epoch, so it is the same on
 * every device and survives the app being closed. At real speed nothing
 * appears to move — the sky is different when you come back, not while you
 * watch. Perpetual visible motion on a home screen is a slot machine, and this
 * is a record of someone's life.
 *
 * What moves at a speed you can see is the shimmer, and it carries no data.
 *
 * Two things this deliberately no longer does. It does not join the domains
 * with figure lines: a polygon between twelve bodies on twelve different
 * periods is a writhing mess, and the balance it used to show is legible
 * anyway in how far the domains are scattered between the rings. And it does
 * not draw where a domain used to sit in two dimensions — a ghost at an old
 * angle would show the clock ticking and pass it off as a life changing. The
 * ghost is radial only: same angle, old distance, which is the whole story.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import Svg, {
  Circle, Defs, G, Line, Path, RadialGradient, Stop, Text as SvgText,
} from 'react-native-svg';
import { obs, obsDomain, alpha } from '../observatory';

/**
 * The domain arithmetic moved to `src/domainScore.ts` so it could be tested —
 * this file needs a native runtime and the test config is limited to plain
 * modules, which is how a scoring bug survived in here unseen. Re-exported so
 * existing importers keep working.
 */
export {
  driftOf, mostAdrift, heldPercent, isPlanned, openingDomain, type DomainDatum,
} from '../domainScore';
import { driftOf, type DomainDatum } from '../domainScore';

/** What a domain holds, and how often it is touched. From `/life-os/rhythm`. */
export interface DomainRhythm {
  period: number | null;
  total: number;
  recent: number;
  lastAt: string | null;
  kinds: Array<{
    kind: 'mission' | 'contact' | 'memory' | 'habit' | 'reflection';
    count: number;
    items: Array<{ label: string; at: string }>;
  }>;
}

const DAY = 86_400_000;

/**
 * Starting angles: hand-placed, so the sky opens on an arrangement that reads
 * as a constellation rather than a dial, and drifts apart from there.
 */
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
 * What people typically mean by "I want this in my life this often" — used
 * only when an account is too young to have a measurable rhythm, never blended
 * with one. Intent and behaviour disagree exactly where someone is falling
 * short, and the sky must not flatter.
 */
const INTENT: Record<string, number> = {
  health: 1, partner: 1, children: 1, career: 2, family: 7, growth: 7,
  reflection: 7, friends: 14, finance: 30, experiences: 30, impact: 30, purpose: 90,
};

/** Stable fallback angle for any domain not in the table. */
function fallbackAngle(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

/** Days per revolution. Observed rhythm, or intent while there isn't one. */
export function periodOf(key: string, rhythm?: DomainRhythm | null): number {
  return rhythm?.period ?? INTENT[key] ?? 30;
}

/**
 * A domain's true angle now: how far through its own cycle it is, measured
 * from the Unix epoch so every device and every launch agrees.
 */
export function angleAt(key: string, period: number, at: number): number {
  const base = ANGLE[key] ?? fallbackAngle(key);
  return (base + (360 * (at / DAY)) / period) % 360;
}

/**
 * Shimmer bands. Twelve independently breathing layers is eleven more than the
 * effect is worth; three, keyed to how fast the domain actually moves, is
 * enough that the field is never in lockstep — which is what makes it read as
 * twelve things rather than one.
 */
const BANDS = [
  { max: 3, duration: 2600 },
  { max: 14, duration: 3600 },
  { max: Infinity, duration: 5200 },
];
const bandOf = (period: number) => BANDS.findIndex((b) => period < b.max);

const KIND_ORDER = ['memory', 'contact', 'reflection', 'habit', 'mission'] as const;
const TIP_R: Record<string, number> = {
  memory: 2.6, contact: 2.2, reflection: 2.0, habit: 1.7, mission: 1.6,
};

/**
 * Animated SVG nodes, minus the prop that breaks them on web.
 *
 * `Animated.createAnimatedComponent` passes `collapsable={false}` to whatever
 * it wraps — meaningful to the native view flattener, meaningless to an SVG
 * element, and react-native-web dutifully writes it onto the DOM node and
 * warns about it on every render. Dropping it here keeps the growth animation
 * and keeps the console honest, so a real warning is still worth reading.
 */
const svgSafe = <P extends object>(C: React.ComponentType<P>) => {
  const Safe = React.forwardRef<unknown, P & { collapsable?: boolean }>(
    ({ collapsable, ...rest }, ref) => <C ref={ref as never} {...(rest as P)} />,
  );
  Safe.displayName = `SvgSafe(${(C as { displayName?: string }).displayName ?? 'Node'})`;
  return Safe;
};

const AnimatedPath = Animated.createAnimatedComponent(svgSafe(Path));
const AnimatedCircle = Animated.createAnimatedComponent(svgSafe(Circle));

const rad = (deg: number) => (deg * Math.PI) / 180;

export function Constellation({
  domains, past, rhythm, selected, opened, onSelect, size = 300,
}: {
  domains: DomainDatum[];
  /** The same domains as they stood some weeks ago — drawn as a radial ghost. */
  past?: DomainDatum[];
  /** Cadence and contents per domain. Without it the sky falls back to intent. */
  rhythm?: Record<string, DomainRhythm>;
  /** Which domain the read-out is describing. Highlighted, not opened. */
  selected?: string;
  /** Which domain was actually tapped open. Only this one grows branches. */
  opened?: string | null;
  onSelect?: (domainType: string) => void;
  size?: number;
}) {
  const c = size / 2;
  const rInner = size * 0.115;
  const rOuter = size * 0.35;

  /**
   * The clock. Half a minute is far finer than anything visible — the fastest
   * a domain can honestly orbit is once a day, which is a quarter of a degree
   * per minute — and it costs one state update. It exists so the sky is
   * current when someone opens the app, not so they can watch it turn.
   */
  const [at, setAt] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAt(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const place = React.useCallback((d: DomainDatum, when: number) => {
    const drift = driftOf(d);
    const dormant = d.importance <= 0;
    const period = periodOf(d.domainType, rhythm?.[d.domainType]);
    const angle = angleAt(d.domainType, period, when);
    /**
     * Drift alone collapses the sky. On an account being kept up with, every
     * domain scores near zero and all twelve land on one circle — which is
     * precisely the clock face the hand-placed angles were invented to avoid,
     * and the orbit makes it worse by setting that clock ticking. Declared
     * importance claims a quarter of the span, so ties break on a second real
     * fact: what you said matters most sits nearest you when you're keeping up.
     */
    const span = rOuter - rInner;
    const r = dormant
      ? rOuter
      : rInner + (1 - d.importance / 100) * 0.26 * span + drift * 0.74 * span;
    return {
      key: d.domainType,
      color: obsDomain(d.domainType),
      x: c + r * Math.cos(rad(angle)),
      y: c - r * Math.sin(rad(angle)),
      r,
      angle,
      period,
      radius: dormant ? 1.6 : 2.2 + (d.importance / 100) * 3.2,
      glow: dormant ? 0.12 : 0.28 + (1 - drift) * 0.5,
      core: dormant ? 0.22 : 0.42 + (1 - drift) * 0.58,
      drift,
      dormant,
    };
  }, [c, rInner, rOuter, rhythm]);

  /**
   * Twelve bodies on twelve different periods will sometimes line up, and two
   * domains landing on the same pixel is not a rare edge case — it is a
   * conjunction, and it happens constantly. Left alone it costs more than
   * looks: overlapping stars mean overlapping touch targets, and whichever
   * was drawn last silently swallows presses meant for its neighbour. Pressing
   * health would open purpose.
   *
   * So they push each other apart, and only ever sideways. Radius is where
   * every meaning lives — drift, importance, whether a domain is being fed —
   * and it is never touched. Angle gives up a degree or two, and angle was
   * never carrying anything but the clock.
   */
  const stars = useMemo(() => {
    const placed = domains.map((d) => place(d, at));
    const MIN = size * 0.065;
    for (let pass = 0; pass < 6; pass++) {
      let settled = true;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]; const b = placed[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d >= MIN) continue;
          settled = false;
          // Which way round is "apart" — normalised, because 359° and 1° are
          // two degrees from each other, not three hundred and fifty-eight.
          const turn = ((a.angle - b.angle + 540) % 360) - 180;
          const dir = turn > 0 || (turn === 0 && i < j) ? 1 : -1;
          // Half the shortfall each, as a turn at their own radius.
          const push = ((MIN - d) / 2) * (180 / Math.PI);
          a.angle += (dir * push) / Math.max(a.r, 1);
          b.angle -= (dir * push) / Math.max(b.r, 1);
          for (const s of [a, b]) {
            s.x = c + s.r * Math.cos(rad(s.angle));
            s.y = c - s.r * Math.sin(rad(s.angle));
          }
        }
      }
      if (settled) break;
    }
    return placed;
  }, [domains, place, at, size, c]);

  /**
   * Ghosts, radial only. Anything under ~2% of the field is treated as
   * standing still — a trail one pixel long is noise pretending to be
   * information.
   */
  const ghosts = useMemo(() => {
    if (!past?.length) return [];
    const then = new Map(past.map((d) => [d.domainType, d]));
    return stars.flatMap((s) => {
      const was = then.get(s.key);
      if (!was || s.dormant) return [];
      const old = place(was, at);
      if (Math.abs(old.r - s.r) < size * 0.02) return [];
      return [{
        key: s.key,
        color: s.color,
        radius: old.radius,
        x: c + old.r * Math.cos(rad(s.angle)),
        y: c - old.r * Math.sin(rad(s.angle)),
        now: s,
      }];
    });
  }, [past, stars, place, size, c, at]);

  const bands = useMemo(
    () => BANDS.map((_, i) => stars.filter((s) => bandOf(s.period) === i)),
    [stars],
  );

  /* Three slow breaths, out of phase because their periods differ. Native
     driver everywhere it's available; opacity is the one property that
     animates reliably on both react-native-svg and web. */
  const breaths = useRef(BANDS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = breaths.map((v, i) => Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1, duration: BANDS[i].duration, easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(v, {
          toValue: 0, duration: BANDS[i].duration, easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    ));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [breaths]);

  /* ── the opened domain ──────────────────────────────────────────
   * Branches exist only while a domain is open, and they grow rather than
   * appear. One value drives the whole thing; every limb and tip reads it
   * through its own slice of the range, so the growth runs outward from the
   * trunk instead of the whole figure fading up at once.
   */
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    grow.setValue(0);
    if (!opened) return;
    const a = Animated.timing(grow, {
      toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic),
      useNativeDriver: false,   // stroke geometry cannot go over the native driver
    });
    a.start();
    return () => a.stop();
  }, [opened, grow]);

  const openStar = opened ? stars.find((s) => s.key === opened) : null;

  const branch = useMemo(() => {
    if (!openStar) return null;
    const kinds = (rhythm?.[openStar.key]?.kinds ?? [])
      .filter((k) => k.items.length)
      .slice()
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    if (!kinds.length) return null;

    /**
     * A domain out at the rim has less room before the edge than one near the
     * centre, so the figure is scaled to whatever space it actually has rather
     * than being drawn off the canvas. Neglected domains hold less anyway.
     */
    const room = Math.max(30, c - openStar.r - 10);
    const spread = Math.min(150, 46 + kinds.length * 20);
    const limbs = kinds.map((k, i) => {
      const off = kinds.length === 1 ? 0 : -spread / 2 + (spread / (kinds.length - 1)) * i;
      const a = openStar.angle + off;
      const L1 = room * 0.44;
      const twigSpread = Math.min(30, 9 + k.items.length * 3.4);
      return {
        kind: k.kind,
        a,
        L1,
        stagger: 0.02 + i * 0.05,
        twigs: k.items.map((it, j) => {
          const n = k.items.length;
          const tOff = n === 1 ? 0 : -twigSpread / 2 + (twigSpread / (n - 1)) * j;
          return {
            label: it.label,
            a2: a + tOff,
            L2: L1 + room * 0.28 + (j % 3) * (room * 0.09),
            stagger: 0.3 + j * 0.045,
            tipStagger: 0.42 + j * 0.045,
          };
        }),
      };
    });
    return { limbs, room };
  }, [openStar, rhythm, c]);

  /** Draw from `t` of the way through the run to the end, clamped. */
  const from = (t: number) => ({
    inputRange: [t, Math.min(1, t + 0.45)],
    outputRange: [1, 0],
    extrapolate: 'clamp' as const,
  });

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      {/* Glow, one layer per shimmer band, each on its own plain view.
          Animating an SVG node directly makes react-native-web leak
          `collapsable` onto <circle>. */}
      {bands.map((band, i) => (
        <Animated.View
          key={`band-${i}`}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            opacity: breaths[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
          }}
          pointerEvents="none"
        >
          <Svg width={size} height={size}>
            <Defs>
              {band.map((s) => (
                <RadialGradient key={s.key} id={`halo-${s.key}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={s.color} stopOpacity={s.glow * 0.55} />
                  <Stop offset="55%" stopColor={s.color} stopOpacity={s.glow * 0.16} />
                  <Stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </RadialGradient>
              ))}
            </Defs>
            {band.map((s) => (
              <Circle
                key={s.key}
                cx={s.x} cy={s.y} r={s.radius * 6}
                fill={`url(#halo-${s.key})`}
                opacity={opened && opened !== s.key ? 0.22 : 1}
              />
            ))}
          </Svg>
        </Animated.View>
      ))}

      <Svg width={size} height={size}>
        {/* instrument rings */}
        {[0.155, 0.25, 0.35].map((f, i) => (
          <Circle
            key={f}
            cx={c} cy={c} r={size * f}
            stroke={obs.rule} strokeWidth={0.7} fill="none"
            strokeDasharray={i === 1 ? '1.5 6' : undefined}
          />
        ))}

        {/* Where each domain sat, and how far it has come. Under the live
            stars on purpose — the past should never be the brighter. */}
        {ghosts.map((g) => (
          <G key={`ghost-${g.key}`}>
            <Line
              x1={g.x} y1={g.y} x2={g.now.x} y2={g.now.y}
              stroke={g.color} strokeWidth={0.8}
              strokeDasharray="2 3"
              opacity={opened && opened !== g.key ? 0.08 : 0.34}
            />
            <Circle cx={g.x} cy={g.y} r={g.radius * 0.75} fill="none"
              stroke={g.color} strokeWidth={0.7}
              opacity={opened && opened !== g.key ? 0.08 : 0.32} />
          </G>
        ))}

        {/* centre — the self. Never orbits, never dims. */}
        <Circle cx={c} cy={c} r={4} stroke={obs.brass} strokeWidth={0.8} fill="none" opacity={0.55} />
        <Circle cx={c} cy={c} r={1.3} fill={obs.brass} />
        <Line x1={c} y1={c - 11} x2={c} y2={c + 11} stroke={obs.brass} strokeWidth={0.5} opacity={0.3} />
        <Line x1={c - 11} y1={c} x2={c + 11} y2={c} stroke={obs.brass} strokeWidth={0.5} opacity={0.3} />

        {/* What the open domain holds. The shape only — every tip is named in
            the list underneath, because there is no hover on a phone and a fan
            of unlabelled dots is a picture of nothing. */}
        {openStar && branch ? (
          <G>
            {branch.limbs.map((limb) => {
              const x1 = openStar.x + limb.L1 * Math.cos(rad(limb.a));
              const y1 = openStar.y - limb.L1 * Math.sin(rad(limb.a));
              return (
                <G key={limb.kind}>
                  <AnimatedPath
                    d={`M${openStar.x} ${openStar.y}L${x1} ${y1}`}
                    stroke={openStar.color} strokeWidth={1.5} strokeLinecap="round"
                    fill="none" opacity={0.55}
                    strokeDasharray={`${limb.L1} ${limb.L1}`}
                    strokeDashoffset={grow.interpolate({
                      ...from(limb.stagger),
                      outputRange: [limb.L1, 0],
                    })}
                  />
                  {limb.twigs.map((t, j) => {
                    const x2 = openStar.x + t.L2 * Math.cos(rad(t.a2));
                    const y2 = openStar.y - t.L2 * Math.sin(rad(t.a2));
                    const mid = (limb.L1 + t.L2) / 2;
                    const ma = (limb.a + t.a2) / 2;
                    const mx = openStar.x + mid * Math.cos(rad(ma));
                    const my = openStar.y - mid * Math.sin(rad(ma));
                    const len = Math.hypot(x2 - x1, y2 - y1) + 6;
                    return (
                      <G key={`${limb.kind}-${j}`}>
                        <AnimatedPath
                          d={`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`}
                          stroke={openStar.color} strokeWidth={0.9} fill="none" opacity={0.34}
                          strokeDasharray={`${len} ${len}`}
                          strokeDashoffset={grow.interpolate({
                            ...from(t.stagger),
                            outputRange: [len, 0],
                          })}
                        />
                        <AnimatedCircle
                          cx={x2} cy={y2} r={TIP_R[limb.kind] ?? 1.6}
                          fill={openStar.color}
                          opacity={grow.interpolate({
                            inputRange: [t.tipStagger, Math.min(1, t.tipStagger + 0.3)],
                            outputRange: [0, 0.85],
                            extrapolate: 'clamp',
                          })}
                        />
                      </G>
                    );
                  })}
                </G>
              );
            })}
            {/* The name, on the inward side where no limb grows. Without it the
                whole expansion is an anonymous fan of dots. */}
            <SvgText
              x={openStar.x + 22 * Math.cos(rad(openStar.angle + 180))}
              y={openStar.y - 22 * Math.sin(rad(openStar.angle + 180)) + 4}
              fill={openStar.color}
              fontSize={12}
              fontWeight="600"
              textAnchor={
                Math.cos(rad(openStar.angle + 180)) < -0.3 ? 'end'
                  : Math.cos(rad(openStar.angle + 180)) > 0.3 ? 'start' : 'middle'
              }
            >
              {openStar.key}
            </SvgText>
          </G>
        ) : null}

        {stars.map((s) => {
          /* An open domain takes the field: the rest recedes rather than
             disappearing, so nothing is ever lost — it is only further away. */
          const recede = opened && opened !== s.key ? 0.22 : 1;
          return (
            <G key={s.key}>
              <Circle
                cx={s.x} cy={s.y}
                r={s.radius * (opened === s.key ? 1.22 : 1)}
                fill={s.color} opacity={s.core * recede}
              />
              {selected === s.key && !opened ? (
                <Circle
                  cx={s.x} cy={s.y} r={s.radius * 2.9}
                  stroke={s.color} strokeWidth={0.8}
                  strokeDasharray="1.5 2.5" fill="none" opacity={0.9}
                />
              ) : null}
              {opened === s.key ? (
                <Circle
                  cx={s.x} cy={s.y} r={s.radius * 2.4}
                  stroke={s.color} strokeWidth={0.8}
                  strokeDasharray="1.5 2.5" fill="none" opacity={0.9}
                />
              ) : null}
            </G>
          );
        })}
      </Svg>

      {/* Touch targets live above the SVG, each as large as it can be without
          reaching its nearest neighbour — so a 3px star is a comfortable tap,
          and no domain can ever swallow a press meant for the one beside it.
          A domain turns at most a quarter of a degree a minute, so this is
          never a moving target in the hand. */}
      {onSelect && stars.map((s) => {
        const gap = stars.reduce((m, o) =>
          o.key === s.key ? m : Math.min(m, Math.hypot(o.x - s.x, o.y - s.y)), Infinity);
        const hit = Math.max(16, Math.min(44, gap * 0.92));
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
