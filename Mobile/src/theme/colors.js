/**
 * KinBech Design System
 * Brand: Sell Quick · Buy Local
 *
 * Dark + Light theme
 * Theme: Premium Slate Charcoal & Muted Forest Accent
 */

export const Theme = {
  // ============================================================
  // DARK THEME
  // ============================================================

  dark: {
    background: {
      // Main background (Deep Dark Charcoal)
      primary: '#0B0F17',

      // Secondary page background
      secondary: '#111827',

      // Profile Header & Main Cards (Dark Gray Tone)
      card: '#1F2937',

      // Elevated / Selected Surfaces
      elevated: '#374151',

      // Search bars and inputs
      input: '#1F2937',
    },

    text: {
      // Main headings, titles
      primary: '#F9FAFB',

      // Normal body text
      secondary: '#E5E7EB',

      // Secondary labels
      tertiary: '#9CA3AF',

      // Placeholder
      muted: '#6B7280',

      // Disabled text
      disabled: '#4B5563',
    },

    border: {
      // Subtle border
      default: '#374151',

      // Active border
      active: '#047857',
    },

    // Muted forest green — easy on the eyes
    primary: '#047857',

    // Slightly brighter for gradients / pressed states
    primaryBright: '#059669',

    // Semantic colors
    success: '#047857',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // Wishlist
    favorite: '#EC4899',

    // Subtle glow
    glow: 'rgba(4, 120, 87, 0.14)',
  },


  // ============================================================
  // LIGHT THEME
  // ============================================================

  light: {
    background: {
      primary: '#F9FAFB',
      secondary: '#F3F4F6',
      card: '#FFFFFF',
      elevated: '#E5E7EB',
      input: '#F3F4F6',
    },

    text: {
      primary: '#111827',
      secondary: '#374151',
      tertiary: '#4B5563',
      muted: '#6B7280',
      disabled: '#9CA3AF',
    },

    border: {
      default: '#E5E7EB',
      active: '#047857',
    },

    primary: '#047857',
    primaryBright: '#059669',

    success: '#047857',
    warning: '#D97706',
    error: '#DC2626',
    info: '#2563EB',

    favorite: '#EC4899',

    glow: 'rgba(4, 120, 87, 0.07)',
  },


  // ============================================================
  // GLOBAL BRAND COLORS
  // ============================================================

  brand: {
    purple: '#1F2937', // Main Surface Color
    violet: '#047857', // Accent
    lightViolet: '#6BAA94',
    green: '#047857',

    // Gradient for Buttons
    gradient: ['#065F46', '#047857'],
  },
};


// ============================================================
// UTILITY
// ============================================================

function tint(hex, alpha) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


// ============================================================
// BUILD COLORS
// ============================================================

export function buildColors(modeKey = 'dark') {
  const m = Theme[modeKey] || Theme.dark;
  const brand = Theme.brand;
  const isDark = modeKey === 'dark';

  return {

    theme: m,
    brand,

    background: m.background.primary,
    paper: m.background.card,
    surface: m.background.card,
    surfaceElevated: m.background.elevated,
    surfaceMuted: m.background.secondary,
    surfaceMutedBorder: m.border.default,
    surfaceSelected: m.background.elevated,
    inputBackground: m.background.input,

    text: m.text.primary,
    textSecondary: m.text.secondary,
    textMuted: m.text.muted,
    textTertiary: m.text.tertiary,
    textDisabled: m.text.disabled,

    border: m.border.default,
    borderLight: m.border.default,
    borderActive: m.border.active,

    primary: m.primary,
    primaryBright: m.primaryBright,

    accentText: isDark ? '#8FBAA8' : '#047857',
    price: isDark ? '#8FBAA8' : '#047857',
    link: isDark ? '#8FBAA8' : '#047857',

    accent: m.primary,
    secondary: m.primary,

    success: m.success,
    warning: m.warning,
    error: m.error,
    info: m.info,
    favorite: m.favorite,

    glow: m.glow,
    gradient: brand.gradient,
    gradientStart: brand.gradient[0],
    gradientEnd: brand.gradient[1],

    gradientSplash: isDark
      ? [m.background.primary, '#1F2937', m.primary]
      : ['#065F46', m.primary],

    onPrimary: '#FFFFFF',
    onGradient: '#FFFFFF',
    white: '#FFFFFF',

    tabBarBackground: m.background.card,
    tabBarBorder: m.border.default,
    tabBarInactive: m.text.tertiary,

    iconBackground: m.background.elevated,
    categoryIconBg: m.background.elevated,

    photoFrame: m.background.secondary,
    photoLine: m.border.default,
    photoBorder: m.primary,
    photoPlusBackground: m.background.elevated,

    chatMine: m.primary,
    chatTheirs: m.background.elevated,
    chatOnline: m.success,
    chatRead: m.info,

    statusActive: m.success,
    statusPending: m.warning,
    statusSold: m.text.muted,
    statusSuccess: m.success,

    statusSuccessBg: tint(m.success, isDark ? 0.18 : 0.12),

    danger: m.error,
    dangerBackground: tint(m.error, isDark ? 0.18 : 0.10),
    deleteRed: m.error,
    deleteBg: tint(m.error, isDark ? 0.18 : 0.10),

    badge: m.favorite,
    rating: m.warning,

    shadow: isDark ? '#000000' : '#111827',
    overlay: isDark ? 'rgba(11, 15, 23, 0.75)' : 'rgba(17, 24, 39, 0.45)',

    accentPink: m.favorite,
    conditionColor: m.success,
    warningYellow: m.warning,
    progressBlue: m.info,

    category: {
      mobiles: '#047857',
      laptops: '#3B82F6',
      electronics: '#8B5CF6',
      furniture: '#F59E0B',
      vehicles: '#06B6D4',
      more: '#EC4899',
    },

    categoryFurniture: '#F59E0B',

    menuPurple: m.primary,
    menuOrange: m.warning,
    menuCyan: m.info,
    menuBlue: m.info,

    pastelOrange: tint(m.warning, isDark ? 0.20 : 0.12),
    pastelPink: tint(m.favorite, isDark ? 0.20 : 0.12),
    pastelGreen: tint(m.success, isDark ? 0.20 : 0.12),
    pastelBlue: tint(m.info, isDark ? 0.20 : 0.12),
    pastelPurple: tint(m.primary, isDark ? 0.20 : 0.12),
    pastelCyan: tint(m.info, isDark ? 0.18 : 0.10),
    pastelLime: tint(m.success, isDark ? 0.18 : 0.10),
    pastelRed: tint(m.error, isDark ? 0.20 : 0.10),
    pastelIndigo: tint(m.primary, isDark ? 0.20 : 0.14),
    pastelBrown: m.background.elevated,

    notificationMessage: m.primary,
    notificationPrice: m.favorite,
    notificationSaved: m.primary,
    notificationVerified: m.success,
    notificationOffer: m.info,
    notificationReview: m.warning,
    notificationSold: m.error,

    supportSafetyBg: tint(m.success, isDark ? 0.20 : 0.12),
    supportSafetyIcon: m.success,
    supportReportBg: tint(m.error, isDark ? 0.20 : 0.10),
    supportReportIcon: m.error,
    supportPaymentsBg: tint(m.warning, isDark ? 0.20 : 0.12),
    supportPaymentsIcon: m.warning,

    socialGoogle: '#EA4335',
    socialApple: isDark ? '#F9FAFB' : '#111111',
    socialFacebook: '#1877F2',

    reportGradient: [m.error, m.warning],

    statusBarStyle: isDark ? 'light' : 'dark',
    headerStatusBarStyle: 'light',
  };
}

export const colors = buildColors('light');
export default colors;