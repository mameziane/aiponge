/**
 * Reflect Screen Styles
 * Comprehensive StyleSheet for React Native reflection and writing screen
 */

import { StyleSheet } from 'react-native';
import type { ColorScheme } from '../theme';
import { BORDER_RADIUS } from '../theme/constants';

export const createProfileEditorStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    // Layout styles
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    contentContainer: {
      flexGrow: 1,
      paddingHorizontal: 8,
      paddingVertical: 16,
      maxWidth: 768,
      alignSelf: 'center',
      width: '100%',
    },
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

    // Tab styles (inline styles removed - using shared TabBar component)
    tabContainer: {
      width: '100%',
    },
    tabContent: {
      flex: 1,
    },

    // Card styles
    card: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.primary,
      marginBottom: 24,
      padding: 0,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      paddingBottom: 8,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    cardContent: {
      padding: 16,
      paddingTop: 0,
    },

    // Form styles
    formField: {
      marginBottom: 16,
    },
    label: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
      marginBottom: 4,
    },
    input: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border.primary,
      minHeight: 48,
      color: colors.text.primary,
    },
    textarea: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border.primary,
      color: colors.text.primary,
      minHeight: 88,
      textAlignVertical: 'top',
    },
    readOnlyText: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },

    // Button styles
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
      minHeight: 36,
    },
    buttonPrimary: {
      backgroundColor: colors.brand.primary,
    },
    buttonSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    buttonText: {
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 4,
    },
    buttonTextPrimary: {
      color: colors.text.primary,
    },
    buttonTextSecondary: {
      color: colors.text.primary,
    },
    fullWidthButton: {
      width: '100%',
      justifyContent: 'center',
    },

    // Badge styles
    badgesContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    badge: {
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    badgeSecondary: {
      backgroundColor: colors.background.subtle,
    },
    badgeOutline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    badgeText: {
      fontSize: 12,
      color: colors.text.primary,
      fontWeight: '500',
    },

    // Stats styles
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      gap: 24,
    },
    statItem: {
      alignItems: 'center',
      flex: 1,
      minWidth: '45%',
      paddingVertical: 8,
    },
    statValue: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.brand.primary,
    },
    statLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },

    // Entry/Insight card styles
    entryCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.primary,
      marginBottom: 8,
      padding: 6,
    },
    entryContent: {
      fontSize: 14,
      color: colors.text.primary,
      marginBottom: 6,
      lineHeight: 20,
    },
    entryMeta: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 8,
    },
    aiAnalysis: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      marginTop: 12,
    },
    aiAnalysisTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.brand.primary,
      marginBottom: 4,
    },
    aiAnalysisText: {
      fontSize: 12,
      color: colors.text.secondary,
    },

    // Settings styles
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    settingRowLast: {
      borderBottomWidth: 0,
    },
    settingInfo: {
      flex: 1,
      marginRight: 16,
    },
    settingTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
    },
    settingDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 2,
    },
    radioGroup: {
      marginTop: 8,
    },
    radioOption: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    radioButton: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border.primary,
      marginRight: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    radioButtonActive: {
      borderColor: colors.brand.primary,
    },
    radioButtonInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.brand.primary,
    },
    radioLabel: {
      fontSize: 14,
      color: colors.text.primary,
      flex: 1,
    },

    // List styles
    listContainer: {
      gap: 16,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },

    // Spacing utilities
    spacingSmall: {
      gap: 8,
    },
    spacingMedium: {
      gap: 16,
    },
    spacingLarge: {
      gap: 24,
    },

    // Dropdown button styles
    dropdownButton: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.primary,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 48,
    },
    dropdownButtonText: {
      fontSize: 16,
      color: colors.text.primary,
      flex: 1,
    },

    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.secondary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '80%',
      paddingBottom: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalScroll: {
      flex: 1,
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    modalOptionSelected: {
      backgroundColor: colors.background.primary,
    },
    modalOptionContent: {
      flex: 1,
      marginRight: 12,
    },
    modalOptionLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
      marginBottom: 4,
    },
    modalOptionDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 18,
    },

    // Table of Contents (TOC) styles - Book-like chapter list
    tocContainer: {
      backgroundColor: 'rgba(20, 20, 25, 0.6)',
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    tocChapter: {
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    },
    tocChapterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    tocChapterLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    tocChapterNumber: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.brand.primary,
      minWidth: 24,
      textAlign: 'center',
    },
    tocChapterTitleContainer: {
      flex: 1,
      gap: 2,
    },
    tocChapterTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      lineHeight: 22,
    },
    tocEntryCount: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontWeight: '400',
    },
    tocChapterActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    tocEntriesList: {
      paddingLeft: 36,
      paddingRight: 16,
      paddingBottom: 12,
      gap: 8,
    },
    newEntryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderStyle: 'dashed',
    },
    newEntryButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.brand.primary,
    },
    newEntryInputContainer: {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.brand.primary,
      padding: 12,
      gap: 12,
    },
    newEntryInput: {
      fontSize: 14,
      color: colors.text.primary,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    newEntryActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    newEntryCancelButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    newEntryCancelText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    newEntrySaveButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary,
    },
    newEntrySaveText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.background.primary,
    },
  });
