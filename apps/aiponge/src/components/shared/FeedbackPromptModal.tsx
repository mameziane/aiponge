/**
 * FeedbackPromptModal - Modal dialog for track feedback after playback
 *
 * @description Full-screen modal for collecting feedback when a user finishes
 * listening to a generated track. Shows track title and larger interaction targets.
 *
 * @see FeedbackPrompt - Inline version for feedback during creation
 * @see useFeedbackPrompt - Hook that manages modal visibility and timing
 *
 * @example
 * <FeedbackPromptModal
 *   visible={showFeedback}
 *   onClose={() => setShowFeedback(false)}
 *   trackId={currentTrack.id}
 *   trackTitle={currentTrack.title}
 *   onFeedbackSubmitted={(trackId) => markFeedbackGiven(trackId)}
 * />
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BaseModal } from './BaseModal';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { useTrackFeedback } from '../../hooks/music/useTrackFeedback';
import { useAuthStore, selectUser } from '../../auth/store';

interface FeedbackPromptModalProps {
  visible: boolean;
  onClose: () => void;
  trackId: string;
  trackTitle?: string | null;
  onFeedbackSubmitted?: (trackId: string) => void;
}

export function FeedbackPromptModal({
  visible,
  onClose,
  trackId,
  trackTitle,
  onFeedbackSubmitted,
}: FeedbackPromptModalProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const user = useAuthStore(selectUser);
  const { submitFeedback, isSubmitting } = useTrackFeedback(trackId, user?.id);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleFeedback = async (wasHelpful: boolean) => {
    await submitFeedback(wasHelpful);
    onFeedbackSubmitted?.(trackId);
    onClose();
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={t('feedback.title') || 'How was this track?'}
      subtitle={trackTitle || undefined}
      headerIcon="musical-notes"
      testID="modal-feedback-prompt"
      scrollable={false}
      maxHeight="40%"
    >
      <View style={styles.container}>
        <Text style={styles.description}>
          {t('feedback.description') || 'Your feedback helps us create better music for you.'}
        </Text>

        {isSubmitting ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
            <Text style={styles.loadingText}>{t('feedback.submitting') || 'Submitting...'}</Text>
          </View>
        ) : (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.feedbackButton, styles.positiveButton]}
              onPress={() => handleFeedback(true)}
              testID="button-feedback-helpful"
              activeOpacity={0.8}
            >
              <Ionicons name="thumbs-up" size={32} color={colors.status.good} />
              <Text style={styles.buttonLabel}>{t('feedback.helpful') || 'Helpful'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.feedbackButton, styles.negativeButton]}
              onPress={() => handleFeedback(false)}
              testID="button-feedback-not-helpful"
              activeOpacity={0.8}
            >
              <Ionicons name="thumbs-down" size={32} color={colors.text.muted} />
              <Text style={styles.buttonLabel}>{t('feedback.notHelpful') || 'Not helpful'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.skipButton} onPress={onClose} testID="button-feedback-skip">
          <Text style={styles.skipText}>{t('feedback.skip') || 'Skip for now'}</Text>
        </TouchableOpacity>
      </View>
    </BaseModal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    description: {
      fontSize: 15,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 22,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.secondary,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 24,
      marginBottom: 16,
    },
    feedbackButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 100,
      height: 100,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 2,
    },
    positiveButton: {
      borderColor: colors.status.good,
      backgroundColor: `${colors.status.good}15`,
    },
    negativeButton: {
      borderColor: colors.border.primary,
      backgroundColor: colors.background.secondary,
    },
    buttonLabel: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    skipButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    skipText: {
      fontSize: 14,
      color: colors.text.muted,
      textDecorationLine: 'underline',
    },
  });
