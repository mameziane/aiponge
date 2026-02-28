import { colors as darkColors, type ColorScheme } from './colors';

export const lightColors: ColorScheme = {
  brand: { ...darkColors.brand },

  background: {
    primary: '#F5F0F8',
    secondary: '#EDE5F3',
    tertiary: '#E0D4EA',
    subtle: '#D6C8E0',
    surface: '#FFFFFF',
    surfaceLight: '#F8F9FA',
    dark: '#FFFFFF',
    darkElevated: '#F5F5F5',
    darkCard: '#F0E8F5',
  },

  text: {
    primary: '#1a1a1a',
    secondary: '#4a4a4a',
    tertiary: '#6b6b6b',
    dark: '#212529',
    muted: '#6C757D',
    gray: {
      50: '#171717',
      100: '#262626',
      200: '#404040',
      300: '#525252',
      400: '#737373',
      500: '#a3a3a3',
      600: '#d4d4d4',
      700: '#e5e5e5',
      800: '#f5f5f5',
      900: '#fafafa',
    },
  },

  interactive: {
    primary: '#7c3aed',
    primaryForeground: '#FFFFFF',
    secondary: '#EDE5F3',
    secondaryForeground: '#440972',
  },

  semantic: { ...darkColors.semantic },

  border: {
    primary: '#E0D4EA',
    muted: '#D6C8E0',
    light: '#E5E7EB',
    subtle: '#DEE2E6',
    dark: '#C8BDD2',
  },

  state: {
    hover: 'rgba(124, 58, 237, 0.08)',
    active: '#E0D4EA',
    disabled: 'rgba(107, 114, 128, 0.3)',
    focus: '#7c3aed',
  },

  overlay: {
    dark: 'rgba(0, 0, 0, 0.5)',
    medium: 'rgba(0, 0, 0, 0.3)',
    light: 'rgba(0, 0, 0, 0.15)',
    ultraLight: 'rgba(0, 0, 0, 0.05)',
    white: darkColors.overlay.white,
    black: darkColors.overlay.black,
    purple: {
      8: 'rgba(124, 58, 237, 0.06)',
      15: 'rgba(124, 58, 237, 0.1)',
      20: 'rgba(124, 58, 237, 0.15)',
      30: 'rgba(124, 58, 237, 0.2)',
      40: 'rgba(124, 58, 237, 0.3)',
    },
    brand: darkColors.overlay.brand,
  },

  absolute: { ...darkColors.absolute },

  gradients: {
    onboarding: {
      lastSlide: ['#F5F0F8', '#EDE5F3', '#E0D4EA', '#D6C8E0'] as const,
      slide1: ['#F5F0F8', '#EDE5F3', '#E0D4EA'] as const,
      slideA: ['#F5F0F8', '#EDE5F3', '#E0D4EA'] as const,
      slideB: ['#EDE5F3', '#E0D4EA', '#D6C8E0'] as const,
    },
    orb: {
      topRight: '#c084fc',
      bottomLeft: '#a78bfa',
      center: '#d8b4fe',
    },
    primary: ['#7c3aed', '#6d28d9'] as const,
    primaryReverse: ['#6d28d9', '#7c3aed'] as const,
    premium: ['#7c3aed', '#8b5cf6', '#a78bfa'] as const,
    premiumDark: ['#6d28d9', '#5b21b6'] as const,
    hero: ['#F5F0F8', '#EDE5F3'] as const,
    card: ['#FFFFFF', '#F5F0F8'] as const,
    subtle: ['rgba(124, 58, 237, 0.08)', 'transparent'] as const,
  },

  social: { ...darkColors.social },

  activity: { ...darkColors.activity },

  reminder: { ...darkColors.reminder },

  status: { ...darkColors.status },

  category: { ...darkColors.category },

  iconReveal: darkColors.iconReveal,

  purpleTransparent: darkColors.purpleTransparent,

  genre: { ...darkColors.genre },
};
