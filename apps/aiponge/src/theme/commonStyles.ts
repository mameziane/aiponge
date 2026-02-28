/**
 * Common Styles - Reusable style patterns for layout consistency
 * Import these to reduce boilerplate and ensure design system compliance
 */

import { StyleSheet, ViewStyle } from 'react-native';
import { colors } from './colors';
import { spacing } from './spacing';

/**
 * Shadow presets - Use instead of repeating shadow properties
 */
export const shadows = {
  none: {
    shadowColor: colors.absolute.black,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ViewStyle,
  sm: {
    shadowColor: colors.absolute.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  } as ViewStyle,
  md: {
    shadowColor: colors.absolute.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  } as ViewStyle,
  lg: {
    shadowColor: colors.absolute.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  } as ViewStyle,
  xl: {
    shadowColor: colors.absolute.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  } as ViewStyle,
};

/**
 * Border radius presets
 */
export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

/**
 * Common layout styles
 */
export const commonStyles = StyleSheet.create({
  // Screen containers
  screenContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  screenContainerDark: {
    flex: 1,
    backgroundColor: colors.background.dark,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.screenVertical,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Cards
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.elementPadding,
  },
  cardElevated: {
    backgroundColor: colors.background.secondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.elementPadding,
    ...shadows.md,
  },
  cardDark: {
    backgroundColor: colors.background.darkCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.elementPadding,
  },

  // Modal overlays
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.black[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayDark: {
    flex: 1,
    backgroundColor: colors.overlay.black[70],
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background.secondary,
    borderRadius: radii.xl,
    padding: spacing.elementPadding,
    maxWidth: '90%',
    width: '100%',
  },

  // Buttons
  buttonPrimary: {
    backgroundColor: colors.brand.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: colors.background.subtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.state.disabled,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Text styles
  textPrimary: {
    color: colors.text.primary,
    fontSize: 16,
  },
  textSecondary: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  textMuted: {
    color: colors.text.muted,
    fontSize: 12,
  },
  textWhite: {
    color: colors.absolute.white,
  },
  textHeading: {
    color: colors.text.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  textSubheading: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '600',
  },
  textLabel: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '500',
  },

  // Inputs
  input: {
    backgroundColor: colors.background.primary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 12,
    fontSize: 16,
    color: colors.text.primary,
    minHeight: 48,
  },
  textarea: {
    backgroundColor: colors.background.primary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: 12,
    fontSize: 16,
    color: colors.text.primary,
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Flexbox helpers
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    flexDirection: 'column',
  },
  columnCenter: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexOne: {
    flex: 1,
  },

  // Spacing helpers
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap24: { gap: 24 },

  // Dividers
  divider: {
    height: 1,
    backgroundColor: colors.border.primary,
    marginVertical: spacing.componentGap,
  },
  // Loading states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: 14,
    marginTop: 12,
  },

  // Empty states
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },

  // Status badges
  badgeSuccess: {
    backgroundColor: colors.semantic.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  badgeWarning: {
    backgroundColor: colors.semantic.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  badgeError: {
    backgroundColor: colors.semantic.errorLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  badgeInfo: {
    backgroundColor: colors.semantic.infoLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
});

export default commonStyles;
