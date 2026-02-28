import { StyleSheet, Dimensions } from 'react-native';
import type { ColorScheme } from '@/theme';
import { spacing } from '@/theme/spacing';
import { BORDER_RADIUS } from '@/theme/constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_ENTRY_INPUT_HEIGHT = Math.round(SCREEN_HEIGHT * 0.22); // ~22% of screen height

export const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    scrollContainer: {
      flex: 1,
    },
    container: {
      backgroundColor: 'transparent',
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: spacing.edgeInset,
      paddingVertical: spacing.componentGap,
      gap: spacing.componentGap,
    },
    navigationBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    navButtonsLeft: {
      flexDirection: 'row',
      gap: spacing.componentGap,
    },
    navButtonsRight: {
      flexDirection: 'row',
      gap: spacing.componentGap,
    },
    navButton: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    navButtonDisabled: {
      opacity: 0.4,
    },
    counter: {
      paddingHorizontal: spacing.elementPadding,
      paddingVertical: spacing.componentGap,
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    counterText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    contentContainer: {
      minHeight: 150,
    },
    contentContainerSelected: {
      borderWidth: 2,
      borderColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
    },
    loadingText: {
      color: colors.text.secondary,
      fontSize: 14,
      marginTop: 12,
    },
    entryInput: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: spacing.componentGap,
      paddingVertical: spacing.componentGap,
      color: colors.text.primary,
      fontSize: 15,
      lineHeight: 22,
      minHeight: 150,
      maxHeight: MAX_ENTRY_INPUT_HEIGHT,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    entryInputSelected: {
      borderColor: colors.brand.primary,
      borderWidth: 2,
    },
    dateChapterRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.componentGap,
    },
    datePickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      gap: 6,
    },
    dateText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '500',
    },
    datePickerContainer: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 4,
      marginBottom: 4,
      padding: spacing.componentGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    datePickerDoneButton: {
      alignSelf: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginTop: 8,
    },
    datePickerDoneText: {
      color: colors.brand.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    chapterPickerWrapper: {
      flex: 1,
      flexDirection: 'column',
    },
    chapterPickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    chapterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      gap: 6,
      flex: 1,
    },
    chapterText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '500',
      flex: 1,
    },
    chapterPickerContainer: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 4,
      marginBottom: 4,
      padding: spacing.componentGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    chapterOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 6,
      gap: 10,
    },
    chapterOptionSelected: {
      backgroundColor: colors.background.primary,
    },
    chapterOptionText: {
      color: colors.text.secondary,
      fontSize: 14,
      flex: 1,
    },
    chapterOptionTextSelected: {
      color: colors.text.primary,
      fontWeight: '500',
    },
    newChapterSection: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    newChapterInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    newChapterInput: {
      flex: 1,
      backgroundColor: colors.background.primary,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: colors.text.primary,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    newChapterButton: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    newChapterButtonDisabled: {
      opacity: 0.4,
    },
    emotionSliderContainer: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 4,
    },
    savingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
    },
    savingText: {
      fontSize: 12,
      color: colors.brand.primary,
      fontStyle: 'italic',
    },
    actionsBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    actionsLeft: {
      flexDirection: 'row',
      gap: spacing.sectionGap,
    },
    actionsCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionsRight: {
      flexDirection: 'row',
      gap: spacing.sectionGap,
    },
    doneButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary,
    },
    doneButtonText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    actionButton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.sm,
      width: 36,
      height: 36,
    },
    actionButtonPrimary: {
      backgroundColor: colors.brand.primary,
    },
    actionButtonSecondary: {
      backgroundColor: colors.brand.primary,
    },
    actionButtonDanger: {
      backgroundColor: colors.brand.purple[700],
    },
    actionButtonSuccess: {
      backgroundColor: colors.brand.primary,
    },
    actionButtonDisabled: {
      opacity: 0.4,
    },
    actionButtonLabel: {
      color: colors.text.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    actionButtonLabelSecondary: {
      color: colors.text.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    actionButtonLabelDanger: {
      color: colors.text.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    inputWrapper: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    entryInputWithMic: {
      flex: 1,
      paddingRight: 48,
    },
    entryInputListening: {
      borderColor: colors.brand.primary,
      borderWidth: 2,
    },
    micButton: {
      position: 'absolute',
      right: 8,
      top: 8,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    micButtonActive: {
      backgroundColor: colors.background.secondary,
      borderColor: colors.brand.primary,
      borderWidth: 2,
    },
    micButtonDisabled: {
      opacity: 0.5,
    },
    listeningIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      gap: 8,
    },
    listeningDot: {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.xs,
      backgroundColor: colors.brand.primary,
    },
    listeningText: {
      fontSize: 13,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    charCount: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      fontSize: 11,
      color: colors.text.tertiary,
      backgroundColor: colors.background.primary,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    charCountWarning: {
      color: colors.semantic.warning,
    },
    charCountLimit: {
      color: colors.semantic.error,
    },
    floatingDismissButton: {
      position: 'absolute',
      right: 16,
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
  });

export const createCompactPickerStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    buttonsRow: {
      flexDirection: 'row',
      gap: spacing.sectionGap,
    },
    pickerButton: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
  });
