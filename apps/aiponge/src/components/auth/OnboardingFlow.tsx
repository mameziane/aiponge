import { useState, useCallback, useMemo, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';

// Reanimated 4.1.x entering/exiting worklets crash on iPhone OS 26 (same UIKit internals
// as the RNTP RunLoop bug). Disable them entirely on iOS 26 — plain mounts/unmounts only.
const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_PADDING = 48;

const WELLNESS_GAP = 8;
const WELLNESS_COLS = 2;
const WELLNESS_CHIP_WIDTH = Math.floor(
  (SCREEN_WIDTH - CONTAINER_PADDING - WELLNESS_GAP * (WELLNESS_COLS - 1)) / WELLNESS_COLS
);

const GENRE_GAP = 8;
const GENRES_PER_ROW = 4;
const GENRE_CHIP_WIDTH = Math.floor(
  (SCREEN_WIDTH - CONTAINER_PADDING - GENRE_GAP * (GENRES_PER_ROW - 1)) / GENRES_PER_ROW
);

const OTHER_GENRE_GAP = 6;
const OTHER_GENRES_PER_ROW = 4;
const OTHER_GENRE_CHIP_WIDTH = Math.floor(
  (SCREEN_WIDTH - CONTAINER_PADDING - OTHER_GENRE_GAP * (OTHER_GENRES_PER_ROW - 1)) / OTHER_GENRES_PER_ROW
);

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { fontFamilies, fontSizes, lineHeights } from '../../theme/typography';
import { setOnboardingCompleted } from '../../utils/onboarding';
import { useAuthStore, selectUser } from '../../auth/store';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { prefetchBooks } from '../../hooks/book/useUnifiedLibrary';
import {
  VOCAL_GENDER_KEYS,
  LANGUAGE_KEYS,
  GENRE_KEYS,
  ONBOARDING_GENRES,
  DEFAULT_GENRE,
  WELLNESS_INTENTION_KEYS,
  WELLNESS_INTENTION_ICONS,
  type GenreKey,
  type WellnessIntentionKey,
} from '../../constants/musicPreferences';
import { useConfigurableOptions } from '../../hooks/admin/useConfigurableOptions';

import { PROFILE_QUERY_KEY } from '../../hooks/profile/useProfile';
import { APP_INIT_QUERY_KEY } from '../../hooks/system/useAppInit';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type OnboardingStep = 'welcome' | 'preferences';

interface UserPreferences {
  vocalGender: 'f' | 'm' | null;
  languagePreference: string;
  genre: GenreKey | '';
  wellnessIntention: WellnessIntentionKey | null;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const GENRE_COLORS: Record<string, string> = colors.genre;
  const { t, i18n } = useTranslation();
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();
  const { languages: configurableLanguages } = useConfigurableOptions();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moreGenresExpanded, setMoreGenresExpanded] = useState(false);
  const [languageSectionExpanded, setLanguageSectionExpanded] = useState(false);

  const getDefaultLanguage = useCallback(() => {
    const appLang = i18n.language?.split('-')[0] || 'en';
    return LANGUAGE_KEYS.includes(appLang as (typeof LANGUAGE_KEYS)[number]) ? appLang : 'en';
  }, [i18n.language]);

  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    vocalGender: 'f',
    languagePreference: getDefaultLanguage(),
    genre: DEFAULT_GENRE,
    wellnessIntention: null,
  }));

  const genreOptions = useMemo(
    () =>
      ONBOARDING_GENRES.map((genre: GenreKey) => ({
        value: genre,
        label: t(`create.genres.${genre}`, { defaultValue: genre }),
      })),
    [t]
  );

  const otherGenreOptions = useMemo(
    () =>
      GENRE_KEYS.filter(genre => !ONBOARDING_GENRES.includes(genre))
        .map((genre: GenreKey) => ({
          value: genre,
          label: t(`create.genres.${genre}`, { defaultValue: genre }),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [t]
  );

  const languageOptions = useMemo(() => {
    const languageMap = new Map(configurableLanguages.map(l => [l.code, l]));
    return LANGUAGE_KEYS.map(lang => {
      const langConfig = languageMap.get(lang);
      return {
        value: lang,
        label:
          langConfig?.nativeLabel ||
          langConfig?.label ||
          t(`create.languages.${lang}`, { defaultValue: lang === 'auto' ? 'Auto-detect' : lang.toUpperCase() }),
      };
    });
  }, [t, configurableLanguages]);

  const handleContinueToPreferences = useCallback(() => {
    setStep('preferences');
  }, []);

  const handleCompleteOnboarding = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await apiClient.post(
        '/api/v1/app/onboarding/complete',
        {
          wellnessGoals: [],
          preferences: {
            favoriteStyles: ['ambient', 'acoustic'],
            preferredDuration: 600,
            vocalGender: preferences.vocalGender,
            languagePreference: preferences.languagePreference,
            genre: preferences.genre,
            wellnessIntention: preferences.wellnessIntention,
          },
          journal: {
            title: t('welcomeJourney.journalTitle', { defaultValue: 'My Story' }),
            description: t('welcomeJourney.journalDescription', {
              defaultValue: 'Your personal space for reflection and growth',
            }),
          },
          locale: i18n.language || 'en-US',
        },
        { timeout: 45000 }
      );

      // Invalidate profile cache so newly saved preferences are loaded for song generation
      invalidateOnEvent(queryClient, { type: 'ONBOARDING_COMPLETED', userId: user?.id });

      await Promise.all([
        prefetchBooks(queryClient),
        queryClient.prefetchQuery({
          queryKey: queryKeys.tracks.explore(),
          queryFn: () => apiClient.get('/api/v1/app/library/explore'),
        }),
        queryClient.prefetchQuery({
          queryKey: queryKeys.tracks.private(),
          queryFn: () => apiClient.get('/api/v1/app/library/private'),
        }),
        queryClient.prefetchQuery({
          queryKey: [PROFILE_QUERY_KEY, user?.id],
          queryFn: () => apiClient.get(PROFILE_QUERY_KEY),
        }),
      ]);

      if (user?.id) {
        await setOnboardingCompleted(user.id);
      }

      onComplete();
    } catch (error) {
      logger.error('Failed to complete onboarding', error);
      if (user?.id) {
        await setOnboardingCompleted(user.id);
      }
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  }, [user?.id, onComplete, isSubmitting, i18n.language, t, preferences, queryClient]);

  const renderWelcomeStep = () => (
    <Animated.View
      entering={isIOS26OrLater ? undefined : FadeIn.duration(500)}
      exiting={isIOS26OrLater ? undefined : FadeOut.duration(300)}
      style={styles.stepContainer}
    >
      <View style={styles.content}>
        <View style={styles.centerContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="musical-notes" size={56} color={colors.text.primary} />
          </View>

          <Text style={styles.title}>
            {t('onboardingFlow.welcomeTitle', { defaultValue: 'Your musical journey begins' })}
          </Text>
          <Text style={styles.subtitle}>
            {t('onboardingFlow.welcomeSubtitle', {
              defaultValue: 'Create your first personalized song and discover how your entries become music',
            })}
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color={colors.brand.primary} />
              <Text style={styles.featureText}>
                {t('onboardingFlow.feature1', { defaultValue: "Write what's on your mind" })}
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color={colors.brand.primary} />
              <Text style={styles.featureText}>
                {t('onboardingFlow.feature2', { defaultValue: 'Get a personalized song' })}
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color={colors.brand.primary} />
              <Text style={styles.featureText}>
                {t('onboardingFlow.feature3', { defaultValue: 'Unlock your music library' })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleContinueToPreferences}>
          <LinearGradient
            colors={[colors.brand.primary, colors.brand.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            <Text style={styles.buttonText}>{t('onboardingFlow.continue', { defaultValue: 'Continue' })}</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.absolute.white} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderPreferencesStep = () => (
    <Animated.View entering={isIOS26OrLater ? undefined : FadeIn.duration(500)} style={styles.stepContainer}>
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
        <View style={styles.preferencesHeader}>
          <Ionicons name="settings-outline" size={40} color={colors.text.primary} />
          <Text style={styles.preferencesTitle}>
            {t('onboardingFlow.preferencesTitle', { defaultValue: 'Quick Setup' })}
          </Text>
          <Text style={styles.preferencesSubtitle}>
            {t('onboardingFlow.preferencesSubtitle', { defaultValue: 'Help us personalize your music' })}
          </Text>
        </View>

        <View style={styles.preferenceSection}>
          <Text style={styles.sectionLabel}>
            {t('onboardingFlow.wellnessLabel', { defaultValue: 'What brings you here?' })}
          </Text>
          <View style={styles.wellnessGrid}>
            {WELLNESS_INTENTION_KEYS.map(key => {
              const isSelected = preferences.wellnessIntention === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.wellnessChip, isSelected && styles.wellnessChipSelected]}
                  onPress={() =>
                    setPreferences(prev => ({
                      ...prev,
                      wellnessIntention: prev.wellnessIntention === key ? null : key,
                    }))
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Ionicons
                    name={WELLNESS_INTENTION_ICONS[key] as ComponentProps<typeof Ionicons>['name']}
                    size={18}
                    color={isSelected ? colors.absolute.white : colors.text.secondary}
                  />
                  <Text style={[styles.wellnessChipText, isSelected && styles.wellnessChipTextSelected]}>
                    {t(`onboardingFlow.wellnessIntentions.${key}`, { defaultValue: key })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.preferenceSection}>
          <Text style={styles.sectionLabel}>{t('onboardingFlow.vocalLabel', { defaultValue: 'Preferred Voice' })}</Text>
          <View style={styles.optionRow}>
            {VOCAL_GENDER_KEYS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.optionButton, preferences.vocalGender === option.value && styles.optionButtonSelected]}
                onPress={() => setPreferences(prev => ({ ...prev, vocalGender: option.value }))}
              >
                <Ionicons
                  name={option.icon}
                  size={24}
                  color={preferences.vocalGender === option.value ? colors.absolute.white : colors.text.secondary}
                />
                <Text
                  style={[styles.optionText, preferences.vocalGender === option.value && styles.optionTextSelected]}
                >
                  {t(`createScreen.vocalGenders.${option.labelKey}`, { defaultValue: option.labelKey })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.preferenceSection}>
          <Text style={styles.sectionLabel}>{t('create.genre', { defaultValue: 'Genre' })}</Text>
          <View style={styles.genreGridContainer}>
            {genreOptions.map(option => {
              const isSelected = preferences.genre === option.value;
              const genreColor = GENRE_COLORS[option.value] || colors.brand.primary;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.genreChip,
                    { backgroundColor: colors.background.subtle, borderColor: colors.border.primary },
                    isSelected && { backgroundColor: genreColor, borderColor: genreColor },
                  ]}
                  onPress={() =>
                    setPreferences(prev => ({
                      ...prev,
                      genre: prev.genre === option.value ? '' : (option.value as GenreKey),
                    }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.genreChipText,
                      { color: isSelected ? colors.absolute.white : colors.text.secondary },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.moreGenresToggle}
            onPress={() => setMoreGenresExpanded(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={t('onboardingFlow.moreGenres', { defaultValue: 'More Genres' })}
          >
            <Text style={styles.otherGenresLabel}>
              {t('onboardingFlow.moreGenres', { defaultValue: 'More Genres' })}
            </Text>
            <Ionicons
              name={moreGenresExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.text.tertiary}
            />
          </TouchableOpacity>
          {moreGenresExpanded && (
            <View style={styles.otherGenreGridContainer}>
              {otherGenreOptions.map(option => {
                const isSelected = preferences.genre === option.value;
                const genreColor = GENRE_COLORS[option.value] || colors.brand.primary;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.otherGenreChip,
                      { backgroundColor: colors.background.subtle, borderColor: colors.border.primary },
                      isSelected && { backgroundColor: genreColor, borderColor: genreColor },
                    ]}
                    onPress={() =>
                      setPreferences(prev => ({
                        ...prev,
                        genre: prev.genre === option.value ? '' : (option.value as GenreKey),
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.otherGenreChipText,
                        { color: isSelected ? colors.absolute.white : colors.text.secondary },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.preferenceSection}>
          <TouchableOpacity
            style={styles.moreGenresToggle}
            onPress={() => setLanguageSectionExpanded(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={t('onboardingFlow.languageLabel', { defaultValue: 'Lyrics Language' })}
          >
            <Ionicons name="language-outline" size={18} color={colors.text.secondary} />
            <Text style={styles.sectionLabel}>
              {t('onboardingFlow.languageLabel', { defaultValue: 'Lyrics Language' })}
            </Text>
            <Text style={styles.languageCurrentValue}>
              {languageOptions.find(opt => opt.value === preferences.languagePreference)?.label || 'EN'}
            </Text>
            <Ionicons
              name={languageSectionExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.text.tertiary}
            />
          </TouchableOpacity>
          {languageSectionExpanded && (
            <View style={styles.languageListContainer}>
              {languageOptions.map(item => (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.languageItem,
                    preferences.languagePreference === item.value && styles.languageItemSelected,
                  ]}
                  onPress={() => setPreferences(prev => ({ ...prev, languagePreference: item.value }))}
                >
                  <Text
                    style={[
                      styles.languageItemText,
                      preferences.languagePreference === item.value && styles.languageItemTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {preferences.languagePreference === item.value && (
                    <Ionicons name="checkmark" size={18} color={colors.absolute.white} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleCompleteOnboarding} disabled={isSubmitting}>
          <LinearGradient
            colors={[colors.brand.primary, colors.brand.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.absolute.white} />
            ) : (
              <>
                <Text style={styles.buttonText}>{t('onboardingFlow.getStarted', { defaultValue: 'Get Started' })}</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.absolute.white} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={handleCompleteOnboarding} disabled={isSubmitting}>
          <Text style={styles.skipText}>{t('onboardingFlow.skipForNow', { defaultValue: 'Skip for now' })}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        // as unknown: theme gradient arrays are string[] but LinearGradient requires readonly tuple type
        colors={colors.gradients.onboarding.slideA as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {step === 'welcome' && renderWelcomeStep()}
        {step === 'preferences' && renderPreferencesStep()}
      </LinearGradient>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    gradient: {
      flex: 1,
    },
    stepContainer: {
      flex: 1,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    scrollContent: {
      flex: 1,
    },
    scrollContentContainer: {
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    centerContent: {
      alignItems: 'center',
    },
    iconContainer: {
      marginBottom: 32,
      padding: 24,
      borderRadius: 100,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    title: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.title1,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: lineHeights.title1,
    },
    subtitle: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.body,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 40,
      lineHeight: lineHeights.body,
      paddingHorizontal: 16,
    },
    featureList: {
      gap: 16,
      width: '100%',
      paddingHorizontal: 24,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.body,
      color: colors.text.primary,
      flex: 1,
    },
    footer: {
      paddingHorizontal: 24,
      paddingBottom: 50,
      paddingTop: 20,
    },
    primaryButton: {
      borderRadius: 14,
      overflow: 'hidden',
    },
    languageCurrentValue: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.footnote,
      color: colors.brand.primary,
      marginLeft: 'auto',
      marginRight: 4,
    },
    languageListContainer: {
      gap: 2,
    },
    languageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.md,
    },
    languageItemSelected: {
      backgroundColor: colors.brand.primary,
    },
    languageItemText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.secondary,
    },
    languageItemTextSelected: {
      fontFamily: fontFamilies.body.medium,
      color: colors.absolute.white,
    },
    buttonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 18,
      gap: 8,
    },
    buttonText: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.headline,
      color: colors.absolute.white,
    },
    preferencesHeader: {
      alignItems: 'center',
      marginBottom: 32,
    },
    preferencesTitle: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.title2,
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    preferencesSubtitle: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    preferenceSection: {
      marginBottom: 20,
    },
    wellnessGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: WELLNESS_GAP,
      marginTop: 8,
    },
    wellnessChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      width: WELLNESS_CHIP_WIDTH,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    wellnessChipSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    wellnessChipText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.footnote,
      color: colors.text.secondary,
    },
    wellnessChipTextSelected: {
      color: colors.absolute.white,
    },
    sectionLabel: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
      marginBottom: 4,
    },
    sectionHint: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.footnote,
      color: colors.text.tertiary,
      marginBottom: 12,
    },
    optionRow: {
      flexDirection: 'row',
      gap: 12,
    },
    optionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    optionButtonSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    optionText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.callout,
      color: colors.text.secondary,
    },
    optionTextSelected: {
      color: colors.absolute.white,
    },
    textInputContainer: {
      position: 'relative' as const,
    },
    textInput: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingRight: 36,
      minHeight: 80,
    },
    clearButton: {
      position: 'absolute' as const,
      top: 8,
      right: 8,
      padding: 4,
    },
    quickPicksContainer: {
      marginTop: 12,
    },
    quickPicksLabel: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.footnote,
      color: colors.text.tertiary,
      marginBottom: 8,
    },
    skipButton: {
      marginTop: 16,
      alignItems: 'center',
    },
    skipText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.tertiary,
    },
    genreGridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 12,
      gap: GENRE_GAP,
    },
    genreChip: {
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      width: GENRE_CHIP_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    genreChipText: {
      fontSize: fontSizes.footnote,
      fontFamily: fontFamilies.body.medium,
      textAlign: 'center',
    },
    moreGenresToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      marginBottom: 4,
      paddingVertical: 6,
    },
    otherGenresLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.footnote,
      color: colors.text.tertiary,
    },
    otherGenreGridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: OTHER_GENRE_GAP,
      justifyContent: 'center',
    },
    otherGenreChip: {
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      width: OTHER_GENRE_CHIP_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    otherGenreChipText: {
      fontSize: 11,
      fontFamily: fontFamilies.body.medium,
      textAlign: 'center',
    },
  });
