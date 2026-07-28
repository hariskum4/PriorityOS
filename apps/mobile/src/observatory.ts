/**
 * Observatory aliases.
 *
 * The direction now lives in `theme.ts` and drives the whole app, so this
 * file is a thin naming layer rather than a second palette — one source of
 * truth, no drift. Kept because the Today screen and Constellation read
 * more clearly in the direction's own vocabulary (`obs.brass` over
 * `colors.amber`, which no longer says what it is).
 */
import {
  colors, type as baseType, domainColor, alpha, skyGradient, greeting,
} from './theme';

export const obs = {
  ground: colors.bg,
  raised: colors.surface,
  sunken: colors.surfaceSunken,
  rule: colors.line,
  ruleSoft: colors.lineSoft,
  ink: colors.text,
  inkDim: colors.textDim,
  inkFaint: colors.textFaint,
  brass: colors.amber,
  brassBright: colors.amberBright,
  brassSoft: colors.amberSoft,
  brassFaint: colors.amberFaint,
  onBrass: colors.ink,
};

export const obsType = {
  display: baseType.display,
  said: {
    fontFamily: baseType.serif.fontFamily, fontSize: 22, lineHeight: 29,
    letterSpacing: -0.2, color: colors.text,
  },
  serif: baseType.serif,
  body: baseType.body,
  strong: { ...baseType.body, fontWeight: '600' as const },
  dim: baseType.dim,
  tick: baseType.label,
  stat: baseType.stat,
};

export const obsDomain = domainColor;
export const obsSky = skyGradient;
export const obsGreeting = greeting;
export { alpha };
