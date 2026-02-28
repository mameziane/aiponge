/**
 * aiponge Theme Colors
 * Purple-based dark theme matching aiponge design system
 * ALL colors should be referenced from here - no hardcoded values in components
 */

export interface ColorScheme {
  brand: {
    primary: string;
    primaryHover: string;
    secondary: string;
    accent: string;
    pink: string;
    cyan: string;
    purple: Record<number, string>;
  };
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    subtle: string;
    surface: string;
    surfaceLight: string;
    dark: string;
    darkElevated: string;
    darkCard: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    dark: string;
    muted: string;
    gray: Record<number, string>;
  };
  interactive: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
  };
  semantic: {
    success: string;
    successLight: string;
    successDark: string;
    warning: string;
    warningLight: string;
    warningDark: string;
    error: string;
    errorLight: string;
    errorDark: string;
    info: string;
    infoLight: string;
    crisis: string;
    crisisDark: string;
    high: string;
    highDark: string;
    medium: string;
    mediumDark: string;
    mediumFg: string;
    mediumBg: string;
    low: string;
    lowDark: string;
  };
  border: {
    primary: string;
    muted: string;
    light: string;
    subtle: string;
    dark: string;
  };
  state: {
    hover: string;
    active: string;
    disabled: string;
    focus: string;
  };
  overlay: {
    dark: string;
    medium: string;
    light: string;
    ultraLight: string;
    white: Record<number, string>;
    black: Record<number, string>;
    purple: Record<number, string>;
    brand: Record<number, string>;
  };
  absolute: {
    white: string;
    black: string;
    transparent: string;
  };
  gradients: {
    onboarding: {
      lastSlide: readonly [string, string, ...string[]];
      slide1: readonly [string, string, ...string[]];
      slideA: readonly [string, string, ...string[]];
      slideB: readonly [string, string, ...string[]];
    };
    orb: {
      topRight: string;
      bottomLeft: string;
      center: string;
    };
    primary: readonly [string, string, ...string[]];
    primaryReverse: readonly [string, string, ...string[]];
    premium: readonly [string, string, ...string[]];
    premiumDark: readonly [string, string, ...string[]];
    hero: readonly [string, string, ...string[]];
    card: readonly [string, string, ...string[]];
    subtle: readonly [string, string, ...string[]];
  };
  social: {
    like: string;
    favorite: string;
    gold: string;
  };
  activity: {
    created: string;
    listened: string;
    scheduled: string;
    alarm: string;
  };
  reminder: {
    reading: string;
    listening: string;
    meditation: string;
  };
  status: {
    good: string;
    moderate: string;
    needsAttention: string;
  };
  category: Record<string, string>;
  iconReveal: readonly string[];
  purpleTransparent: readonly string[];
  genre: Record<string, string>;
}

export const colors: ColorScheme = {
  // Brand - Purple theme (primary palette)
  brand: {
    primary: '#a280bc',
    primaryHover: '#b794c9',
    secondary: '#dcc8eb',
    accent: '#8b5a9c',
    // Accent colors for gradients and highlights
    pink: '#FF6B9D',
    cyan: '#6BDBFF',
    // Purple spectrum for gradients
    purple: {
      900: '#440972', // Darkest
      800: '#5b21b6',
      700: '#652d90',
      600: '#7c3aed',
      500: '#8b5a9c',
      400: '#9333ea',
      300: '#a280bc',
      200: '#a855f7',
      100: '#dcc8eb', // Lightest
    },
  },

  // Backgrounds
  background: {
    primary: '#440972',
    secondary: '#652d90',
    tertiary: '#7c4d8e',
    subtle: '#8b5a9c',
    surface: '#FFFFFF',
    surfaceLight: '#F8F9FA',
    // Dark mode surfaces
    dark: '#000000',
    darkElevated: '#1a1a1a',
    darkCard: '#2d1b4e',
  },

  // Text
  text: {
    primary: '#fafafa',
    secondary: '#cccccc',
    tertiary: '#999999',
    dark: '#212529',
    muted: '#6C757D',
    // Specific grays
    gray: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#e5e5e5',
      300: '#d4d4d4',
      400: '#a3a3a3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
    },
  },

  // Interactive elements
  interactive: {
    primary: '#a280bc',
    primaryForeground: '#fafafa',
    secondary: '#dcc8eb',
    secondaryForeground: '#440972',
  },

  // Semantic colors
  semantic: {
    success: '#22c55e',
    successLight: '#dcfce7',
    successDark: '#15803d',
    warning: '#f59e0b',
    warningLight: '#fef3c7',
    warningDark: '#b45309',
    error: '#ef4444',
    errorLight: '#fee2e2',
    errorDark: '#b91c1c',
    info: '#3b82f6',
    infoLight: '#dbeafe',
    // Risk severity levels
    crisis: '#fca5a5',
    crisisDark: '#b91c1c',
    high: '#fcd34d',
    highDark: '#b45309',
    medium: '#fdba74',
    mediumDark: '#c2410c',
    mediumFg: '#FFA500',
    mediumBg: '#FFF3E0',
    low: '#86efac',
    lowDark: '#15803d',
  },

  // Borders
  border: {
    primary: '#4a2d5c',
    muted: '#5c3d6e',
    light: '#E5E7EB',
    subtle: '#DEE2E6',
    dark: '#333333',
  },

  // States
  state: {
    hover: 'rgba(139, 92, 156, 0.1)',
    active: '#7c4d8e',
    disabled: 'rgba(107, 114, 128, 0.5)',
    focus: '#b794c9',
  },

  // Overlays (for modals, sheets, etc.)
  overlay: {
    dark: 'rgba(0, 0, 0, 0.75)',
    medium: 'rgba(0, 0, 0, 0.5)',
    light: 'rgba(0, 0, 0, 0.25)',
    ultraLight: 'rgba(0, 0, 0, 0.1)',
    white: {
      5: 'rgba(255, 255, 255, 0.05)',
      8: 'rgba(255, 255, 255, 0.08)',
      10: 'rgba(255, 255, 255, 0.1)',
      15: 'rgba(255, 255, 255, 0.15)',
      20: 'rgba(255, 255, 255, 0.2)',
      30: 'rgba(255, 255, 255, 0.3)',
      40: 'rgba(255, 255, 255, 0.4)',
      50: 'rgba(255, 255, 255, 0.5)',
      60: 'rgba(255, 255, 255, 0.6)',
      70: 'rgba(255, 255, 255, 0.7)',
      75: 'rgba(255, 255, 255, 0.75)',
      80: 'rgba(255, 255, 255, 0.8)',
      85: 'rgba(255, 255, 255, 0.85)',
      90: 'rgba(255, 255, 255, 0.9)',
      95: 'rgba(255, 255, 255, 0.95)',
    },
    black: {
      5: 'rgba(0, 0, 0, 0.05)',
      10: 'rgba(0, 0, 0, 0.1)',
      20: 'rgba(0, 0, 0, 0.2)',
      25: 'rgba(0, 0, 0, 0.25)',
      30: 'rgba(0, 0, 0, 0.3)',
      40: 'rgba(0, 0, 0, 0.4)',
      50: 'rgba(0, 0, 0, 0.5)',
      60: 'rgba(0, 0, 0, 0.6)',
      70: 'rgba(0, 0, 0, 0.7)',
      75: 'rgba(0, 0, 0, 0.75)',
      80: 'rgba(0, 0, 0, 0.8)',
      85: 'rgba(0, 0, 0, 0.85)',
      90: 'rgba(0, 0, 0, 0.9)',
      95: 'rgba(0, 0, 0, 0.95)',
    },
    purple: {
      8: 'rgba(162, 128, 188, 0.08)',
      15: 'rgba(162, 128, 188, 0.15)',
      20: 'rgba(162, 128, 188, 0.2)',
      30: 'rgba(162, 128, 188, 0.3)',
      40: 'rgba(162, 128, 188, 0.4)',
    },
    brand: {
      8: 'rgba(147, 51, 234, 0.08)',
      10: 'rgba(147, 51, 234, 0.1)',
      15: 'rgba(147, 51, 234, 0.15)',
      20: 'rgba(147, 51, 234, 0.2)',
    },
  },

  // Absolute colors (use sparingly)
  absolute: {
    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',
  },

  // Gradient presets (for LinearGradient colors prop)
  // Typed as tuples to satisfy LinearGradient requirements
  gradients: {
    // Onboarding gradients
    onboarding: {
      lastSlide: ['#1a0a2e', '#2d1b4e', '#4a2c7a', '#3d1f5c'] as const,
      slide1: ['#1a0a2e', '#3d1f5c', '#5a3d7a'] as const,
      slideA: ['#1a0a2e', '#3d1f5c', '#5a3d7a'] as const,
      slideB: ['#2d1b4e', '#4a2c7a', '#6b4d8e'] as const,
    },
    // Orb/decorative element colors
    orb: {
      topRight: '#a855f7',
      bottomLeft: '#7c3aed',
      center: '#c084fc',
    },
    // Button/CTA gradients
    primary: ['#9333ea', '#7c3aed'] as const,
    primaryReverse: ['#7c3aed', '#9333ea'] as const,
    premium: ['#7c3aed', '#9333ea', '#a855f7'] as const,
    premiumDark: ['#7c3aed', '#5b21b6'] as const,
    // Background gradients
    hero: ['#440972', '#652d90'] as const,
    card: ['#652d90', '#8b5a9c'] as const,
    subtle: ['rgba(162, 128, 188, 0.3)', 'transparent'] as const,
  },

  // Social/Special colors
  social: {
    like: '#ef4444',
    favorite: '#ef4444',
    gold: '#fbbf24',
  },

  // Activity calendar colors
  activity: {
    created: '#22c55e', // Green - tracks created
    listened: '#60a5fa', // Blue - tracks listened
    scheduled: '#fbbf24', // Yellow - scheduled items
    alarm: '#fb923c', // Orange - alarm notifications
  },

  // Reminder type colors
  reminder: {
    reading: '#4ECDC4', // Teal - reading reminders
    listening: '#A855F7', // Purple - listening reminders
    meditation: '#10B981', // Green - meditation reminders
  },

  // Additional semantic colors for UI elements
  status: {
    good: '#4ade80',
    moderate: '#fbbf24',
    needsAttention: '#f97316',
  },

  // Book category colors
  category: {
    anxiety: '#6BDBFF',
    growth: '#4ade80',
    purpose: '#a280bc',
    love: '#FF6B9D',
    grief: '#6b7280',
    gratitude: '#fbbf24',
    mindfulness: '#a78bfa',
    resilience: '#f97316',
  },

  // Icon reveal colors for DraftTrackCard pixel animation
  iconReveal: [
    '#581C87', // purple-900
    '#6B21A8', // purple-800
    '#7E22CE', // purple-700
    '#9333EA', // purple-600
    '#A855F7', // purple-500
    '#C084FC', // purple-400
    '#D8B4FE', // purple-300
    '#E9D5FF', // purple-200
    '#8B5CF6', // violet-500
    '#7C3AED', // violet-600
    '#A280BC', // brand purple
    '#1A1A2E', // dark background
  ] as const,

  // Purple transparent variants for pixel animations (DraftTrackCard)
  purpleTransparent: [
    'rgba(88, 28, 135, 0.9)', // purple-900
    'rgba(107, 33, 168, 0.85)', // purple-800
    'rgba(126, 34, 206, 0.8)', // purple-700
    'rgba(147, 51, 234, 0.75)', // purple-600
    'rgba(168, 85, 247, 0.7)', // purple-500
    'rgba(192, 132, 252, 0.65)', // purple-400
    'rgba(216, 180, 254, 0.6)', // purple-300
    'rgba(233, 213, 255, 0.55)', // purple-200
    'rgba(139, 92, 246, 0.7)', // violet-500
    'rgba(124, 58, 237, 0.75)', // violet-600
    'rgba(109, 40, 217, 0.8)', // violet-700
    'rgba(162, 128, 188, 0.7)', // brand purple
  ] as const,

  // Genre colors for music onboarding
  genre: {
    pop: '#FF6B9D',
    rock: '#E53935',
    jazz: '#9C27B0',
    classical: '#673AB7',
    electronic: '#00BCD4',
    hiphop: '#FF9800',
    rap: '#FFA726',
    rnb: '#E91E63',
    country: '#8D6E63',
    folk: '#4CAF50',
    blues: '#2196F3',
    soul: '#FF5722',
    gospel: '#FFC107',
    reggae: '#00C853',
    latin: '#FF4081',
    flamenco: '#D32F2F',
    salsa: '#F44336',
    bossanova: '#26A69A',
    tango: '#C2185B',
    afrobeat: '#FF6F00',
    highlife: '#FFD600',
    kpop: '#EA80FC',
    jpop: '#F48FB1',
    bollywood: '#FF7043',
    arabic: '#26C6DA',
    turkish: '#5C6BC0',
    celtic: '#66BB6A',
    indie: '#78909C',
    alternative: '#607D8B',
    metal: '#37474F',
    punk: '#D81B60',
    funk: '#AB47BC',
    disco: '#E040FB',
    house: '#00E5FF',
    techno: '#1DE9B6',
    trance: '#00B8D4',
    dubstep: '#651FFF',
    ambient: '#80DEEA',
    lofi: '#A1887F',
    chillout: '#81D4FA',
    newage: '#B39DDB',
    world: '#4DB6AC',
    acoustic: '#AED581',
    orchestral: '#9575CD',
    cinematic: '#7986CB',
    worship: '#FFD54F',
    spiritual: '#CE93D8',
    meditation: '#80CBC4',
    ska: '#7CB342',
  },
};

export default colors;
