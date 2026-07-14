/**
 * Priority visual system — two skies, one soul.
 *
 * Dark: "a quiet room at night" — warm near-black ink, one amber accent.
 * Light: "morning paper" — warm parchment, earth-deep text, ochre accent
 * (blueprint §7.1's Dawn/Earth palette). Both keep the signature GAP BAR
 * and the per-domain identity colors, re-tuned per mode for contrast.
 *
 * Mode is resolved synchronously at module load (system scheme, with a
 * stored override on web) so every StyleSheet in the app evaluates against
 * the right palette; switching themes reloads the JS world.
 */
import { Appearance, Platform } from 'react-native';

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

const darkColors = {
  bg: '#12100E',
  surface: '#1C1917',
  surfaceRaised: '#26211D',
  surfaceSunken: '#171412',
  line: '#332C26',
  lineSoft: '#292420',
  text: '#F5EFE6',
  textDim: '#A69B8C',
  textFaint: '#6E6558',
  amber: '#E8A33D',
  amberBright: '#F5B95C',
  amberSoft: '#4A3618',
  amberFaint: '#2E2415',
  green: '#7FB069',
  greenSoft: '#22301E',
  rose: '#D4737E',
  roseSoft: '#3A2226',
  blue: '#7A9CC6',
  ink: '#2A1D06',        // text on amber buttons
};

const lightColors: typeof darkColors = {
  bg: '#FAF6F0',
  surface: '#FFFFFF',
  surfaceRaised: '#F1E9DE',
  surfaceSunken: '#F4EEE5',
  line: '#E3D8C9',
  lineSoft: '#ECE4D7',
  text: '#2C2420',
  textDim: '#6B5F52',
  textFaint: '#9C8F7F',
  amber: '#C77E22',
  amberBright: '#A96812',
  amberSoft: '#EFD9B4',
  amberFaint: '#F7EDDA',
  green: '#4E8A3C',
  greenSoft: '#E3EFDA',
  rose: '#C25562',
  roseSoft: '#F6E1E3',
  blue: '#4A6FA5',
  ink: '#FFFFFF',
};

export const colors = isLight ? lightColors : darkColors;

/** Domain identity colors — dark mode gets luminous tints, light mode
 * gets earthier, higher-contrast versions of the same hues. */
const darkDomains: Record<string, string> = {
  family: '#E8846B',
  partner: '#D4737E',
  children: '#E89B4B',  // marigold — warm, joyful
  friends: '#B08BC9',
  health: '#7FB069',
  career: '#7A9CC6',
  finance: '#5FB0A5',
  growth: '#C9A227',
  experiences: '#6FB8E8', // adventure sky
  reflection: '#A9A2D8',  // moonstone — inner life
  purpose: '#9F86E0',   // Creative & Purpose — the blueprint's creative violet
  impact: '#63B58F',    // Contribution & Impact — earth green
};
const lightDomains: Record<string, string> = {
  family: '#C05138',
  partner: '#B23A4D',
  children: '#A8661A',
  friends: '#7E56A0',
  health: '#4E8A3C',
  career: '#3E6390',
  finance: '#2E7D71',
  growth: '#96760F',
  experiences: '#2D6FA8',
  reflection: '#5C549E',
  purpose: '#6647B8',
  impact: '#2F7D4F',
};
export const domainColors = isLight ? lightDomains : darkDomains;
export const domainColor = (d: string) => domainColors[d] ?? colors.blue;

export const type = {
  display: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8, color: colors.text },
  title: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.text },
  heading: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  serif: {
    fontSize: 16, color: colors.text, lineHeight: 26,
    fontFamily: 'Georgia' as any,
  },
  dim: { fontSize: 13, color: colors.textDim, lineHeight: 19 },
  faint: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const, color: colors.textDim },
  stat: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.5, color: colors.text },
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

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Emotional layer — color psychology research for wellness apps:
 * warm terracotta/peach reads as human warmth and change; earthy tones
 * ground; soft gradients build trust. The sky changes with the day and
 * so does the app: dawn ember, midday amber, dusk rose, night violet.
 */
export const emotion = isLight
  ? {
      ember: '#B85A32',
      emberSoft: '#F3DACB',
      dawnGlow: '#F7E3CE',
      duskGlow: '#F2DFE4',
      nightGlow: '#E8E3F0',
      middayGlow: '#F6ECD6',
    }
  : {
      ember: '#D97A54',
      emberSoft: '#3D2418',
      dawnGlow: '#3A2517',
      duskGlow: '#33202B',
      nightGlow: '#241E2E',
      middayGlow: '#332815',
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

/** Subtle emotional tint for a domain card background. */
export const domainTint = (d: string) => `${domainColor(d)}${isLight ? '12' : '14'}`;
