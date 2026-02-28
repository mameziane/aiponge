/**
 * aiponge Typography Theme
 * Inter as the standard app-wide font for clean, modern UI
 * Playfair Display reserved for decorative headings
 */

export const fontFamilies = {
  // Inter - Primary UI font for all screens
  body: {
    light: 'Inter_300Light',
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  // Playfair Display - Decorative serif for special headings
  serif: {
    regular: 'PlayfairDisplay_400Regular',
    medium: 'PlayfairDisplay_500Medium',
    semibold: 'PlayfairDisplay_600SemiBold',
    bold: 'PlayfairDisplay_700Bold',
    black: 'PlayfairDisplay_900Black',
    italic: 'PlayfairDisplay_400Regular_Italic',
    boldItalic: 'PlayfairDisplay_700Bold_Italic',
  },
  // System fallback
  system: {
    regular: undefined,
    semibold: '600',
    bold: '700',
  },
  // Monospace for code/technical display
  // Note: 'monospace' works cross-platform in React Native (iOS maps to Courier, Android to monospace)
  mono: {
    ios: 'Courier',
    android: 'monospace',
    regular: 'monospace', // Cross-platform fallback
  },
} as const;

export const fontSizes = {
  hero: 44,
  display: 36,
  title1: 32,
  title2: 28,
  title3: 24,
  headline: 20,
  body: 17,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption1: 12,
  caption2: 11,
} as const;

export const lineHeights = {
  hero: 52,
  display: 44,
  title1: 40,
  title2: 36,
  title3: 32,
  headline: 28,
  body: 26,
  callout: 24,
  subhead: 22,
  footnote: 18,
  caption1: 16,
  caption2: 14,
} as const;

export const letterSpacing = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1,
} as const;

export const fontWeights = {
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};

export const onboardingTypography = {
  slideTitle: {
    fontFamily: fontFamilies.serif.bold,
    fontSize: fontSizes.display,
    lineHeight: lineHeights.display,
    letterSpacing: letterSpacing.tight,
  },
  slideDescription: {
    fontFamily: fontFamilies.body.regular,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body + 4,
  },
  sectionTitle: {
    fontFamily: fontFamilies.serif.semibold,
    fontSize: fontSizes.title3,
    lineHeight: lineHeights.title3,
    letterSpacing: letterSpacing.tight,
  },
  sectionDescription: {
    fontFamily: fontFamilies.body.regular,
    fontSize: fontSizes.callout,
    lineHeight: lineHeights.callout,
  },
  optionLabel: {
    fontFamily: fontFamilies.body.semibold,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
  },
  optionDescription: {
    fontFamily: fontFamilies.body.regular,
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
  },
  buttonText: {
    fontFamily: fontFamilies.body.bold,
    fontSize: fontSizes.headline,
    lineHeight: lineHeights.headline,
    letterSpacing: letterSpacing.wide,
  },
  successTitle: {
    fontFamily: fontFamilies.serif.bold,
    fontSize: fontSizes.hero,
    lineHeight: lineHeights.hero,
  },
  successMessage: {
    fontFamily: fontFamilies.body.regular,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body + 4,
  },
} as const;

export default {
  fontFamilies,
  fontSizes,
  lineHeights,
  letterSpacing,
  fontWeights,
  onboardingTypography,
};
