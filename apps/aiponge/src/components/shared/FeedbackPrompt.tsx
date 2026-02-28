/**
 * FeedbackPrompt - Thumbs up/down feedback component for generated music
 * Captures user feedback on whether the generated content was helpful
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useThemeColors, spacing, type ColorScheme } from '../../theme';
import { LiquidGlassCard } from '../ui';
import { apiRequest } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';

interface FeedbackPromptProps {
  trackId: string;
  userTrackId?: string;
  generationRequestId?: string;
  onFeedbackSubmitted?: (wasHelpful: boolean) => void;
  onDismiss?: () => void;
  visible?: boolean;
}

export function FeedbackPrompt({
  trackId,
  userTrackId,
  generationRequestId,
  onFeedbackSubmitted,
  onDismiss,
  visible = true,
}: FeedbackPromptProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<boolean | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleFeedback = useCallback(
    async (wasHelpful: boolean) => {
      if (isSubmitting || submitted) return;

      setIsSubmitting(true);
      setSelectedFeedback(wasHelpful);

      try {
        await apiRequest('/api/v1/app/music/feedback', {
          method: 'POST',
          data: {
            trackId,
            userTrackId,
            generationRequestId,
            wasHelpful,
          },
        });

        setSubmitted(true);
        onFeedbackSubmitted?.(wasHelpful);
      } catch (error) {
        logger.error('[FeedbackPrompt] Error submitting feedback:', error instanceof Error ? error : undefined, {
          error,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [trackId, userTrackId, generationRequestId, isSubmitting, submitted, onFeedbackSubmitted]
  );

  if (!visible) return null;

  return (
    <LiquidGlassCard intensity="medium" padding={12} style={styles.container}>
      <Text style={styles.promptText}>{submitted ? t('feedback.thankYou') : t('feedback.wasHelpful')}</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.feedbackButton, styles.thumbsUpButton, selectedFeedback === true && styles.selectedButton]}
          onPress={() => handleFeedback(true)}
          disabled={isSubmitting || submitted}
          testID="button-feedback-up"
        >
          {isSubmitting && selectedFeedback === true ? (
            <ActivityIndicator size="small" color={colors.semantic.success} />
          ) : (
            <Ionicons
              name="thumbs-up"
              size={24}
              color={selectedFeedback === true ? colors.semantic.success : colors.text.secondary}
            />
          )}
          <Text style={[styles.buttonText, selectedFeedback === true && styles.selectedButtonText]}>
            {t('feedback.yes')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.feedbackButton, styles.thumbsDownButton, selectedFeedback === false && styles.selectedButton]}
          onPress={() => handleFeedback(false)}
          disabled={isSubmitting || submitted}
          testID="button-feedback-down"
        >
          {isSubmitting && selectedFeedback === false ? (
            <ActivityIndicator size="small" color={colors.semantic.error} />
          ) : (
            <Ionicons
              name="thumbs-down"
              size={24}
              color={selectedFeedback === false ? colors.semantic.error : colors.text.secondary}
            />
          )}
          <Text style={[styles.buttonText, selectedFeedback === false && styles.selectedButtonTextNegative]}>
            {t('feedback.no')}
          </Text>
        </TouchableOpacity>

        {onDismiss && !submitted && (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={onDismiss}
            disabled={isSubmitting}
            testID="button-feedback-dismiss"
          >
            <Text style={styles.dismissText}>{t('feedback.notNow')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </LiquidGlassCard>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginHorizontal: spacing.screenHorizontal,
      marginVertical: spacing.sectionGap,
    },
    promptText: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: spacing.componentGap,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.componentGap,
    },
    feedbackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.primary,
      backgroundColor: colors.background.secondary,
      gap: 8,
    },
    thumbsUpButton: {},
    thumbsDownButton: {},
    selectedButton: {
      backgroundColor: colors.state.hover,
    },
    buttonText: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    selectedButtonText: {
      color: colors.semantic.success,
    },
    selectedButtonTextNegative: {
      color: colors.semantic.error,
    },
    dismissButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    dismissText: {
      fontSize: 14,
      color: colors.text.muted,
    },
  });

export default FeedbackPrompt;
