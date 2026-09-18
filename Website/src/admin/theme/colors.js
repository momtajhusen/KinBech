// KinBech Admin Panel Theme Colors
// Based on Mobile App Theme

export const lightColors = {
  // Primary Colors (Muted Forest Green)
  primary: '#047857',
  primaryBright: '#059669',
  primaryDark: '#065F46',

  // Background Colors
  background: '#F9FAFB',
  backgroundSecondary: '#F3F4F6',
  card: '#FFFFFF',
  cardHover: '#F9FAFB',

  // Text Colors
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',

  // Border Colors
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderActive: '#047857',

  // Semantic Colors
  success: '#047857',
  successBg: 'rgba(4, 120, 87, 0.1)',
  warning: '#D97706',
  warningBg: 'rgba(217, 119, 6, 0.1)',
  error: '#DC2626',
  errorBg: 'rgba(220, 38, 38, 0.1)',
  info: '#2563EB',
  infoBg: 'rgba(37, 99, 235, 0.1)',

  // Category Colors
  category: {
    mobiles: '#047857',
    laptops: '#3B82F6',
    electronics: '#8B5CF6',
    furniture: '#F59E0B',
    vehicles: '#06B6D4',
    fashion: '#EC4899',
  },

  // Status Colors
  status: {
    active: '#047857',
    pending: '#D97706',
    suspended: '#DC2626',
    verified: '#047857',
    rejected: '#DC2626',
    reported: '#F59E0B',
  },

  // Gradient
  gradient: 'linear-gradient(135deg, #065F46 0%, #047857 100%)',

  // Shadow
  shadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
  shadowLg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
};

export const darkColors = {
  // Primary Colors (Muted forest — readable on dark surfaces)
  primary: '#059669',
  primaryBright: '#6BAA94',
  primaryDark: '#047857',

  // Background Colors
  background: '#111827',
  backgroundSecondary: '#1F2937',
  card: '#1F2937',
  cardHover: '#374151',

  // Text Colors
  text: '#F9FAFB',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',
  textLight: '#6B7280',

  // Border Colors
  border: '#374151',
  borderLight: '#4B5563',
  borderActive: '#059669',

  // Semantic Colors
  success: '#059669',
  successBg: 'rgba(4, 120, 87, 0.14)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.15)',
  error: '#EF4444',
  errorBg: 'rgba(239, 68, 68, 0.15)',
  info: '#3B82F6',
  infoBg: 'rgba(59, 130, 246, 0.15)',

  // Category Colors (same but with better contrast)
  category: {
    mobiles: '#047857',
    laptops: '#3B82F6',
    electronics: '#8B5CF6',
    furniture: '#F59E0B',
    vehicles: '#06B6D4',
    fashion: '#EC4899',
  },

  // Status Colors
  status: {
    active: '#059669',
    pending: '#F59E0B',
    suspended: '#EF4444',
    verified: '#059669',
    rejected: '#EF4444',
    reported: '#F59E0B',
  },

  // Gradient
  gradient: 'linear-gradient(135deg, #047857 0%, #059669 100%)',

  // Shadow (more visible in dark mode)
  shadow: '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
  shadowLg: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
};

// Export both theme objects
export const colors = lightColors; // Default to light for backward compatibility
export default colors;