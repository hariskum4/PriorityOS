/**
 * Priority visual system — "The Observatory".
 *
 * Celestial cartography: brass on midnight, ink on parchment. Hairline
 * instrument rules, an engraved serif for anything true, a letterspaced
 * mono for anything measured, and a plain sans for anything you act on.
 *
 * Dark: "the sky at 4am" — indigo-shifted near-black, one brass accent.
 * Light: "an old star atlas" — warm paper, deep ink, oxidised-brass accent.
 *
 * The export surface is deliberately unchanged from the previous amber
 * system: every screen already consumes `colors`, `type`, `space`,
 * `domainColor` and friends, so the whole app retunes from this one file.
 *
 * Mode is resolved synchronously at module load (system scheme, with a
 * stored override on web) so every StyleSheet evaluates against the right
 * sky; switching themes reloads the JS world.
 */
import { Appearance, Platform } from 'react-native';
import type { TextStyle } from 'react-native';

export type ThemeMode = 'dark' | 'light';

function resolveMode(): ThemeMode {
  if (Platform.OS === 'web') {
    try {
      const stored = window.localStorage.getItem('themeMode');
      if (stored === 'dark' || stored === 'light') return stored;
    } catch { /* SSR / privacy mode */ }
  }
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export const themeMode: ThemeMode = resolveMode();
export const isLight = themeMode === 'light';

/** Persist + apply a theme choice. Web applies instantly (reload);
 *  native re-resolves on next launch / system change. */
export function setThemeMode(next: ThemeMode | 'system') {
  if (Platform.OS === 'web') {
    try {
      if (next === 'system') window.localStorage.removeItem('themeMode');
      else window.localStorage.setItem('themeMode', next);
      window.location.reload();
    } catch { /* ignore */ }
  } else if (next !== 'system') {
    Appearance.setColorScheme?.(next);
  } else {
    Appearance.setColorScheme?.(null as any);
  }
}

/* ── ground & ink ─────────────────────────────────────────────────
 * Key names are inherited from the amber system so nothing downstream has
 * to change; the values are entirely new. `amber*` now carries brass, and
 * green/rose/blue are kept strictly as semantics (good / tender / cool),
 * never as decoration.
 */
const darkColors = {
  bg: '#090D18',
  surface: '#101626',
  surfaceRaised: '#182034',
  surfaceSunken: '#0D121F',
  line: '#1E2739',
  lineSoft: '#161D2C',
  text: '#F2EEE6',
  textDim: '#98A0B8',
  textFaint: '#5A6178',
  amber: '#E0AE54',        // brass — the only accent
  amberBright: '#F0C87E',
  amberSoft: '#3A2C17',    // brass border tint
  amberFaint: '#1A1610',   // brass ground tint
  green: '#34C79A',
  greenSoft: '#102B24',
  rose: '#F0637E',
  roseSoft: '#2D1620',
  blue: '#5B9BE8',
  ink: '#12161F',          // text sitting on a brass fill
};

const lightColors: typeof darkColors = {
  // Cards are white paper laid on a parchment ground — on light, "sunken"
  // reads as *cleaner*, not darker, or the whole page turns to mush.
  bg: '#F4EFE4',
  surface: '#FFFFFF',
  surfaceRaised: '#EDE6D8',
  surfaceSunken: '#FFFFFF',
  line: '#D9CFBD',
  lineSoft: '#E6DDCC',
  text: '#161A26',
  textDim: '#565D72',
  textFaint: '#8C92A6',
  amber: '#A9761C',
  amberBright: '#8A5D0F',
  amberSoft: '#E8D6B4',
  amberFaint: '#F6EEDF',
  green: '#0E8C68',
  greenSoft: '#DFF0E8',
  rose: '#D93A5C',
  roseSoft: '#F9E2E6',
  blue: '#2F72C4',
  ink: '#FFFFFF',
};

export const colors = isLight ? lightColors : darkColors;

/**
 * Alpha suffix for hex colors. RN accepts 8-digit hex, so this is the
 * cheapest way to tint without pulling in a color library.
 */
export const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;

/* ── domain hues ──────────────────────────────────────────────────
 * Twelve domains, each keeping the emotion its counterpart carried in the
 * direction deck. Colour here is strictly information — it never brands
 * and never decorates. Tuned twice so both skies stay legible.
 */
const darkDomains: Record<string, string> = {
  family: '#F0798A',
  partner: '#F0637E',
  children: '#F5A05C',
  friends: '#C79BF0',
  health: '#34C79A',
  career: '#5B9BE8',
  finance: '#E4B33E',
  growth: '#A78BFA',
  experiences: '#6FC3F0',
  reflection: '#8E96E8',
  purpose: '#3FBFB4',
  impact: '#63C98F',
};
const lightDomains: Record<string, string> = {
  family: '#C43F55',
  partner: '#B8304A',
  children: '#B26A18',
  friends: '#7B4FA8',
  health: '#0E8C68',
  career: '#2F6BB8',
  finance: '#9A7212',
  growth: '#6D46C4',
  experiences: '#1F6E9E',
  reflection: '#4A52B8',
  purpose: '#14827D',
  impact: '#2C8355',
};
export const domainColors = isLight ? lightDomains : darkDomains;
export const domainColor = (d: string) => domainColors[d] ?? colors.blue;

/** Subtle emotional tint for a domain card background. */
export const domainTint = (d: string) => alpha(domainColor(d), isLight ? 0.07 : 0.09);

/* ── type ─────────────────────────────────────────────────────────
 * Three voices, three jobs:
 *   serif — anything true about a life ("Fourteen summers")
 *   sans  — anything you act on ("Done · Not today")
 *   mono  — anything measured ("2.4H THIS WEEK · TARGET 10H")
 *
 * Hoefler Text ships with iOS and macOS, which covers this app's two real
 * surfaces. Android has no old-style serif worth naming, so it falls back
 * to the platform serif rather than shipping a font binary.
 */
export const serifFamily = Platform.select({
  ios: 'Hoefler Text',
  web: "'Hoefler Text', 'Iowan Old Style', Palatino, Georgia, serif",
  default: 'serif',
}) as string;

export const monoFamily = Platform.select({
  ios: 'Menlo',
  web: "ui-monospace, 'SF Mono', Menlo, monospace",
  default: 'monospace',
}) as string;

/**
 * Hoefler defaults to old-style figures — lovely mid-sentence, unreadable
 * as standalone data ("0" reads as a letter O, "1" as a Roman numeral).
 * Measured numbers force lining, tabular figures; prose keeps the default.
 */
export const liningNums = ['lining-nums', 'tabular-nums'] as TextStyle['fontVariant'];

/**
 * Let an unbroken run of characters break rather than leave the screen.
 *
 * Prose wraps at spaces, so this never fires for ordinary writing — but a
 * pasted URL or a run-on with no whitespace has no break opportunity, and a
 * journal entry containing one rendered as a single line clipped at the
 * viewport edge, carrying the card's layout out with it. Web-only: native
 * `Text` already breaks inside a word rather than overflowing its parent.
 */
export const breakLongWords = (Platform.OS === 'web'
  ? { wordBreak: 'break-word', overflowWrap: 'anywhere' }
  : {}) as TextStyle;

export const type = {
  display: {
    fontFamily: serifFamily, fontSize: 30, lineHeight: 36,
    letterSpacing: -0.3, color: colors.text,
  },
  title: {
    fontSize: 19, fontWeight: '600' as const,
    letterSpacing: -0.3, color: colors.text,
  },
  heading: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  serif: {
    fontFamily: serifFamily, fontSize: 17, lineHeight: 26, color: colors.text,
  },
  dim: { fontSize: 13.5, color: colors.textDim, lineHeight: 20 },
  faint: { fontSize: 12.5, color: colors.textFaint, lineHeight: 18 },
  /** The instrument tick — every uppercase label in the app runs through this. */
  label: {
    fontFamily: monoFamily, fontSize: 10.5, letterSpacing: 1.6,
    textTransform: 'uppercase' as const, color: colors.textFaint,
  },
  stat: {
    fontFamily: serifFamily, fontSize: 26, letterSpacing: -0.2,
    color: colors.text, fontVariant: liningNums,
  },
};

export const space = (n: number) => n * 4;

/** Level curve mirror of @priority/scoring-engine (100 * (n-1)^1.5). */
export const xpForLevel = (level: number) => Math.round(100 * Math.pow(level - 1, 1.5));
export function levelProgress(totalXp: number) {
  let level = 1;
  while (totalXp >= xpForLevel(level + 1)) level += 1;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, intoLevel: totalXp - base, neededForNext: next - base };
}

/**
 * Time-of-day greeting in the Observatory's register — calm, never chirpy.
 *
 * Takes the moment rather than reading the clock, so a caller that keeps time
 * (`useNow`) gets a greeting that turns with the hour, and one that does not
 * is at least visibly choosing when it was written.
 */
export function greeting(at: Date = new Date()): string {
  const h = at.getHours();
  if (h < 5) return 'Still awake';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Winding down';
}

/**
 * The sky changes with the hour and so does the app: dawn ember, midday
 * brass, dusk rose, night indigo. Kept very low-contrast — this is
 * atmosphere, not a gradient hero.
 */
export const emotion = isLight
  ? {
      ember: '#B85A32',
      emberSoft: '#F3DACB',
      dawnGlow: '#F6E6D2',
      duskGlow: '#F2E2E4',
      nightGlow: '#E7E4EF',
      middayGlow: '#F4EEDF',
    }
  : {
      ember: '#D97A54',
      emberSoft: '#2A1A12',
      dawnGlow: '#1D1A22',
      duskGlow: '#1E1723',
      nightGlow: '#12142A',
      middayGlow: '#141A26',
    };

/** [top, bottom] gradient for the current hour — the sky inside the app. */
export function skyGradient(): [string, string] {
  const h = new Date().getHours();
  if (h < 5) return [emotion.nightGlow, colors.bg];
  if (h < 12) return [emotion.dawnGlow, colors.bg];
  if (h < 17) return [emotion.middayGlow, colors.bg];
  if (h < 21) return [emotion.duskGlow, colors.bg];
  return [emotion.nightGlow, colors.bg];
}
