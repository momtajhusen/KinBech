import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

// Mirrors Website/src/admin/admin-clay.css so the app admin and the web admin look the same.
export const ADMIN_FONT = 'Nunito';

const PALETTES = {
  light: {
    background: '#e7ecf4',
    backgroundSecondary: '#e1e7f0',
    card: '#f2f5fa',
    border: 'rgba(140,155,180,0.24)',
    text: '#1e2533',
    textSecondary: '#3b4558',
    textTertiary: '#556073',
    textMuted: '#6a7488',
    primary: '#047857',
    primaryBright: '#059669',
    success: '#047857',
    warning: '#d97706',
    error: '#dc2626',
    info: '#2563eb',
    clayDark: 'rgba(143,158,186,0.5)',
    clayLight: 'rgba(255,255,255,0.95)',
    clayHi: 'rgba(255,255,255,0.9)',
    clayLo: 'rgba(143,158,186,0.3)',
    greenShadow: '8px 10px 20px rgba(4,120,87,0.3), -4px -4px 12px rgba(255,255,255,0.95), inset 3px 3px 6px rgba(255,255,255,0.22), inset -4px -4px 8px rgba(2,44,34,0.4)',
    tintShadow: '4px 4px 10px rgba(143,158,186,0.5), -4px -4px 10px rgba(255,255,255,0.95), inset 2px 2px 3px rgba(255,255,255,0.55), inset -2px -2px 4px rgba(0,0,0,0.06)',
    badgeShadow: 'inset 1px 1px 2px rgba(255,255,255,0.55), inset -1px -2px 3px rgba(0,0,0,0.07)',
    canvas:
      'radial-gradient(circle at 0% 0%, rgba(4,120,87,0.14) 0%, rgba(4,120,87,0) 45%), ' +
      'radial-gradient(circle at 100% 0%, rgba(196,181,253,0.38) 0%, rgba(196,181,253,0) 50%), ' +
      'radial-gradient(circle at 100% 100%, rgba(253,186,116,0.24) 0%, rgba(253,186,116,0) 50%)',
    backdrop: 'rgba(30,37,51,0.35)',
  },
  dark: {
    background: '#1a1e29',
    backgroundSecondary: '#171a24',
    card: '#232837',
    border: 'rgba(255,255,255,0.07)',
    text: '#f3f5fa',
    textSecondary: '#b7bfcf',
    textTertiary: '#9aa3b6',
    textMuted: '#8691a6',
    primary: '#059669',
    primaryBright: '#10b981',
    success: '#059669',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    clayDark: 'rgba(0,0,0,0.55)',
    clayLight: 'rgba(255,255,255,0.035)',
    clayHi: 'rgba(255,255,255,0.07)',
    clayLo: 'rgba(0,0,0,0.38)',
    greenShadow: '8px 10px 22px rgba(0,0,0,0.5), -3px -3px 10px rgba(255,255,255,0.035), inset 3px 3px 6px rgba(255,255,255,0.28), inset -4px -4px 8px rgba(2,44,33,0.5)',
    tintShadow: '4px 4px 10px rgba(0,0,0,0.55), -3px -3px 8px rgba(255,255,255,0.035), inset 1px 1px 2px rgba(255,255,255,0.08), inset -2px -2px 4px rgba(0,0,0,0.25)',
    badgeShadow: 'inset 1px 1px 2px rgba(255,255,255,0.08), inset -1px -2px 3px rgba(0,0,0,0.3)',
    canvas:
      'radial-gradient(circle at 0% 0%, rgba(4,120,87,0.12) 0%, rgba(4,120,87,0) 45%), ' +
      'radial-gradient(circle at 100% 0%, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0) 50%), ' +
      'radial-gradient(circle at 100% 100%, rgba(249,115,22,0.07) 0%, rgba(249,115,22,0) 50%)',
    backdrop: 'rgba(0,0,0,0.55)',
  },
};

function hexRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** CSS `color-mix(in srgb, tone pct%, base)`. */
function mix(tone, base, pct) {
  const a = hexRgb(tone);
  const b = hexRgb(base);
  const out = a.map((channel, i) => Math.round(channel * pct + b[i] * (1 - pct)));
  return `#${out.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function buildAdminColors(colors, isDark) {
  const p = PALETTES[isDark ? 'dark' : 'light'];
  const clay = `12px 12px 28px ${p.clayDark}, -10px -10px 24px ${p.clayLight}, inset 3px 3px 6px ${p.clayHi}, inset -4px -4px 10px ${p.clayLo}`;
  return {
    ...colors,
    background: p.background,
    backgroundSecondary: p.backgroundSecondary,
    surface: p.card,
    card: p.card,
    surfaceMuted: p.backgroundSecondary,
    inputBackground: p.backgroundSecondary,
    border: p.border,
    text: p.text,
    textSecondary: p.textSecondary,
    textTertiary: p.textTertiary,
    textMuted: p.textMuted,
    accentText: p.primary,
    primary: p.primary,
    primaryBright: p.primaryBright,
    success: p.success,
    warning: p.warning,
    error: p.error,
    info: p.info,
    pastelGreen: mix(p.success, p.card, 0.16),
    pastelRed: mix(p.error, p.card, 0.14),
    pastelOrange: mix(p.warning, p.card, 0.16),
    pastelBlue: mix(p.info, p.card, 0.16),
    backdrop: p.backdrop,
    canvas: p.canvas,
    greenGradient: 'linear-gradient(145deg, #0b8a62 0%, #047857 48%, #065f46 100%)',
    clay,
    clayHover: `16px 18px 36px ${p.clayDark}, -12px -12px 28px ${p.clayLight}, inset 3px 3px 6px ${p.clayHi}, inset -4px -4px 10px ${p.clayLo}`,
    claySoft: `6px 6px 14px ${p.clayDark}, -6px -6px 14px ${p.clayLight}, inset 2px 2px 4px ${p.clayHi}, inset -3px -3px 6px ${p.clayLo}`,
    clayPressed: `inset 4px 4px 10px ${p.clayLo}, inset -4px -4px 10px ${p.clayHi}`,
    clayGreenShadow: p.greenShadow,
    clayTint: p.tintShadow,
    clayBadge: p.badgeShadow,
  };
}

/** Raised green surface (`--clay-green` + its shadow): active tabs, primary buttons, hub icon. */
export function clayGreen(colors) {
  return {
    backgroundColor: colors.primary,
    experimental_backgroundImage: colors.greenGradient,
    boxShadow: colors.clayGreenShadow,
  };
}

/** Pressed-in track: inputs, segmented tracks, inner info boxes. */
export function clayPressed(colors) {
  return { backgroundColor: colors.backgroundSecondary, boxShadow: colors.clayPressed };
}

export function useAdminTheme() {
  const theme = useTheme();
  const colors = useMemo(() => buildAdminColors(theme.colors, theme.isDark), [theme.colors, theme.isDark]);
  return { ...theme, colors };
}

/** Every text style gets Nunito; the Android font family maps fontWeight 400–900 to the right file. */
function withAdminFont(styles) {
  const out = {};
  Object.entries(styles).forEach(([key, style]) => {
    out[key] =
      style && typeof style === 'object' && (style.fontSize != null || style.fontWeight != null) && !style.fontFamily
        ? { ...style, fontFamily: ADMIN_FONT }
        : style;
  });
  return out;
}

export function useAdminStyles(factory) {
  const { colors } = useAdminTheme();
  return useMemo(() => StyleSheet.create(withAdminFont(factory(colors) || {})), [colors, factory]);
}
