import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { LiquidGlassView } from '../ui';
import { LoadingState } from '../shared';
import { fontFamilies, fontSizes, lineHeights } from '../../theme/typography';
import { setOnboardingCompleted } from '../../utils/onboarding';
import { useAuthStore, selectUser } from '../../auth/store';
import { logger } from '../../lib/logger';
import { queryKeys } from '../../lib/queryKeys';

interface OnboardingProfileCompletionProps {
  onComplete: () => void;
}

export function OnboardingProfileCompletion({ onComplete }: OnboardingProfileCompletionProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!user?.id) {
      setError(t('onboardingProfile.errors.mustBeLoggedIn'));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      queryClient.invalidateQueries({ queryKey: [...queryKeys.library.all, 'chapters'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.allChapters() });
      queryClient.removeQueries({ queryKey: queryKeys.chapters.all });
      queryClient.removeQueries({ queryKey: queryKeys.entries.list(user.id) });
      queryClient.removeQueries({ queryKey: queryKeys.profile.all });

      await setOnboardingCompleted(user.id);

      onComplete();
    } catch (err) {
      logger.error('OnboardingProfileCompletion error', err);
      setError(t('onboardingProfile.errors.setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleContinue();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.gradients.onboarding.slide1}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.fullScreenGradient}
      >
        <View style={styles.centerContent}>
          {loading && (
            <>
              <LoadingState fullScreen={false} message={t('onboardingProfile.settingUp')} />
              <Text style={styles.loadingSubtext}>{t('onboardingProfile.settingUpDescription')}</Text>
            </>
          )}

          {error && (
            <View style={styles.errorContent}>
              <Ionicons name="alert-circle" size={48} color={colors.semantic.errorDark} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleContinue} testID="retry-onboarding">
                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    fullScreenGradient: {
      flex: 1,
    },
    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    loadingSubtext: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.subhead,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 12,
      lineHeight: lineHeights.subhead + 2,
    },
    errorContent: {
      alignItems: 'center',
      gap: 16,
    },
    errorText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.body,
      color: colors.semantic.errorDark,
      textAlign: 'center',
      lineHeight: lineHeights.body,
    },
    retryButton: {
      backgroundColor: colors.brand.primary,
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: BORDER_RADIUS.md,
      marginTop: 8,
    },
    retryButtonText: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.body,
      color: colors.absolute.white,
    },
  });
