import { useState, useCallback, useMemo, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Dimensions,
  Platform,
} from 'react-native';

const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_PADDING = 48;
const CATEGORY_GAP = 8;
const CATEGORY_COLS = 2;
const CATEGORY_CHIP_WIDTH = Math.floor(
  (SCREEN_WIDTH - CONTAINER_PADDING - CATEGORY_GAP * (CATEGORY_COLS - 1)) / CATEGORY_COLS
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
import { savePendingBookGeneration } from '../../utils/pendingBookGeneration';
import { useAuthStore, selectUser } from '../../auth/store';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { prefetchBooks } from '../../hooks/book/useUnifiedLibrary';
import { useBookGenerator } from '../../hooks/book/useBookGenerator';
import {
  BOOK_TYPE_CATEGORY_CONFIGS,
  getBookTypesForCategory,
  getBookTypeConfig,
  getCategoryColor,
  type BookTypeCategoryConfig,
  type BookTypeConfig,
} from '../../constants/bookTypes';
import type { BookTypeCategory, BookTypeId } from '@aiponge/shared-contracts';

import { PROFILE_QUERY_KEY } from '../../hooks/profile/useProfile';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type OnboardingStep = 'welcome' | 'chooseBookType' | 'describeBook';

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();
  const { generateBook } = useBookGenerator({ bypassTierCheck: true });

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [selectedCategory, setSelectedCategory] = useState<BookTypeCategory | null>(null);
  const [selectedBookTypeId, setSelectedBookTypeId] = useState<BookTypeId | null>(null);
  const [bookDescription, setBookDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedBookTypeConfig = useMemo(
    () => (selectedBookTypeId ? getBookTypeConfig(selectedBookTypeId) : null),
    [selectedBookTypeId]
  );

  const categoryTypes = useMemo(
    () => (selectedCategory ? getBookTypesForCategory(selectedCategory) : []),
    [selectedCategory]
  );

  const typeColor = useMemo(() => {
    if (selectedBookTypeConfig) return getCategoryColor(selectedBookTypeConfig.category, colors);
    if (selectedCategory) return getCategoryColor(selectedCategory, colors);
    return colors.brand.primary;
  }, [selectedBookTypeConfig, selectedCategory, colors]);

  const handleSelectCategory = useCallback((categoryId: BookTypeCategory) => {
    setSelectedCategory(categoryId);
  }, []);

  const handleSelectType = useCallback((typeId: BookTypeId) => {
    setSelectedBookTypeId(typeId);
    setStep('describeBook');
  }, []);

  const handleBackFromTypes = useCallback(() => {
    setSelectedCategory(null);
  }, []);

  const handleBackFromDescribe = useCallback(() => {
    setSelectedBookTypeId(null);
    setStep('chooseBookType');
  }, []);

  const handleGenerate = useCallback(async () => {
    if (isSubmitting || bookDescription.trim().length < 10) return;
    setIsSubmitting(true);

    try {
      const language = i18n.language?.split('-')[0] || 'en';
      const requestId = await generateBook({
        primaryGoal: bookDescription.trim(),
        depthLevel: 'brief',
        bookTypeId: selectedBookTypeId || undefined,
        language,
        isOnboarding: true,
      });

      if (requestId) {
        await savePendingBookGeneration({
          requestId,
          bookTypeId: selectedBookTypeId || '',
          description: bookDescription.trim(),
          startedAt: Date.now(),
        });
      }

      // Complete onboarding on the server (preferences only, no book)
      try {
        await apiClient.post(
          '/api/v1/app/onboarding/complete',
          {
            preferences: {},
            locale: i18n.language || 'en-US',
          },
          { timeout: 15000 }
        );
        invalidateOnEvent(queryClient, { type: 'ONBOARDING_COMPLETED', userId: user?.id });
      } catch (err) {
        logger.error('Onboarding complete API failed (non-fatal)', err);
      }

      await Promise.all([
        prefetchBooks(queryClient),
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
      logger.error('Failed to generate onboarding book', error);
      // Still complete onboarding even if generation fails
      if (user?.id) {
        await setOnboardingCompleted(user.id);
      }
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    bookDescription,
    selectedBookTypeId,
    i18n.language,
    generateBook,
    queryClient,
    user?.id,
    onComplete,
    t,
  ]);

  // ─── Step 1: Welcome ─────────────────────────────────────────────────────────

  const renderWelcomeStep = () => (
    <Animated.View
      entering={isIOS26OrLater ? undefined : FadeIn.duration(500)}
      exiting={isIOS26OrLater ? undefined : FadeOut.duration(300)}
      style={styles.stepContainer}
    >
      <View style={styles.content}>
        <View style={styles.centerContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="book-outline" size={56} color={colors.text.primary} />
          </View>

          <Text style={styles.title}>
            {t('onboardingFlow.welcomeTitle', { defaultValue: 'Create your first AI book' })}
          </Text>
          <Text style={styles.subtitle}>
            {t('onboardingFlow.welcomeSubtitle', {
              defaultValue:
                'Choose a theme, describe what matters to you, and we\u2019ll generate a personalized book with music',
            })}
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="book-outline" size={24} color={colors.brand.primary} />
              <Text style={styles.featureText}>
                {t('onboardingFlow.feature1', { defaultValue: 'Choose a book that speaks to you' })}
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="sparkles-outline" size={24} color={colors.brand.primary} />
              <Text style={styles.featureText}>
                {t('onboardingFlow.feature2', { defaultValue: 'AI generates chapters & reflections' })}
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="musical-notes-outline" size={24} color={colors.brand.primary} />
              <Text style={styles.featureText}>
                {t('onboardingFlow.feature3', { defaultValue: 'Each entry becomes a personalized song' })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('chooseBookType')}>
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

  // ─── Step 2: Choose Book Type (category → type) ──────────────────────────────

  const renderCategoryGrid = () => (
    <>
      <View style={styles.preferencesHeader}>
        <Ionicons name="library-outline" size={40} color={colors.text.primary} />
        <Text style={styles.preferencesTitle}>
          {t('onboardingFlow.chooseCategoryTitle', { defaultValue: 'What kind of book?' })}
        </Text>
        <Text style={styles.preferencesSubtitle}>
          {t('onboardingFlow.chooseCategorySubtitle', { defaultValue: 'Pick a theme that resonates' })}
        </Text>
      </View>

      <View style={styles.categoryGrid}>
        {BOOK_TYPE_CATEGORY_CONFIGS.map(config => {
          const catColor = getCategoryColor(config.id, colors);
          return (
            <TouchableOpacity
              key={config.id}
              style={styles.categoryChip}
              onPress={() => handleSelectCategory(config.id)}
              accessibilityRole="button"
            >
              <Ionicons name={config.icon as ComponentProps<typeof Ionicons>['name']} size={20} color={catColor} />
              <Text style={styles.categoryChipText}>{t(config.nameKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  const renderTypeList = () => (
    <>
      <View style={styles.typeListHeader}>
        <TouchableOpacity onPress={handleBackFromTypes} style={styles.typeBackButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.typeListTitle}>
          {selectedCategory ? t(BOOK_TYPE_CATEGORY_CONFIGS.find(c => c.id === selectedCategory)?.nameKey || '') : ''}
        </Text>
      </View>

      {categoryTypes.map(typeConfig => (
        <TouchableOpacity
          key={typeConfig.id}
          style={styles.typeRow}
          onPress={() => handleSelectType(typeConfig.id)}
          accessibilityRole="button"
        >
          <View style={[styles.typeIconCircle, { backgroundColor: typeColor + '20' }]}>
            <Ionicons name={typeConfig.icon as ComponentProps<typeof Ionicons>['name']} size={22} color={typeColor} />
          </View>
          <View style={styles.typeTextContainer}>
            <Text style={styles.typeRowTitle}>{t(typeConfig.nameKey)}</Text>
            <Text style={styles.typeRowDesc} numberOfLines={2}>
              {t(typeConfig.descriptionKey)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      ))}
    </>
  );

  const renderChooseBookTypeStep = () => (
    <Animated.View entering={isIOS26OrLater ? undefined : FadeIn.duration(500)} style={styles.stepContainer}>
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
        {selectedCategory === null ? renderCategoryGrid() : renderTypeList()}
      </ScrollView>
    </Animated.View>
  );

  // ─── Step 3: Describe & Generate ─────────────────────────────────────────────

  const renderDescribeBookStep = () => {
    const canGenerate = bookDescription.trim().length >= 10;
    const placeholderKey = selectedBookTypeConfig?.generatorPlaceholderKey || 'books.generator.placeholder';

    return (
      <Animated.View entering={isIOS26OrLater ? undefined : FadeIn.duration(500)} style={styles.stepContainer}>
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
          <View style={styles.describeHeader}>
            <TouchableOpacity onPress={handleBackFromDescribe} style={styles.typeBackButton}>
              <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.describeIconRow}>
            {selectedBookTypeConfig && (
              <View style={[styles.describeIconCircle, { backgroundColor: typeColor + '20' }]}>
                <Ionicons
                  name={selectedBookTypeConfig.icon as ComponentProps<typeof Ionicons>['name']}
                  size={32}
                  color={typeColor}
                />
              </View>
            )}
            <Text style={styles.describeTitle}>
              {t('onboardingFlow.describeTitle', {
                defaultValue: 'Describe your {{bookTypeName}}',
                bookTypeName: selectedBookTypeConfig ? t(selectedBookTypeConfig.nameKey) : 'Book',
              })}
            </Text>
          </View>

          <TextInput
            style={styles.describeInput}
            multiline
            value={bookDescription}
            onChangeText={setBookDescription}
            placeholder={t(placeholderKey, { defaultValue: 'Describe what this book means to you...' })}
            placeholderTextColor={colors.text.tertiary}
            textAlignVertical="top"
          />

          <Text style={[styles.describeHint, canGenerate && { color: colors.semantic.success }]}>
            {t('onboardingFlow.describeHint', { defaultValue: 'At least 10 characters' })}
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, !canGenerate && styles.buttonDisabled]}
            onPress={handleGenerate}
            disabled={!canGenerate || isSubmitting}
          >
            <LinearGradient
              colors={canGenerate ? [typeColor, colors.brand.accent] : [colors.text.tertiary, colors.text.tertiary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.absolute.white} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color={colors.absolute.white} />
                  <Text style={styles.buttonText}>
                    {t('onboardingFlow.generateButton', { defaultValue: 'Generate My Book' })}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.gradients.onboarding.slideA as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {step === 'welcome' && renderWelcomeStep()}
        {step === 'chooseBookType' && renderChooseBookTypeStep()}
        {step === 'describeBook' && renderDescribeBookStep()}
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
    buttonDisabled: {
      opacity: 0.5,
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

    // ─── Step 2: Choose Book Type ────────────────────────────────
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
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: CATEGORY_GAP,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: CATEGORY_CHIP_WIDTH,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    categoryChipText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.footnote,
      color: colors.text.primary,
      flex: 1,
    },

    // ─── Type list (within category) ─────────────────────────────
    typeListHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    typeBackButton: {
      padding: 4,
    },
    typeListTitle: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.title3,
      color: colors.text.primary,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    typeIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeTextContainer: {
      flex: 1,
    },
    typeRowTitle: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
      marginBottom: 2,
    },
    typeRowDesc: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.footnote,
      color: colors.text.secondary,
      lineHeight: 18,
    },

    // ─── Step 3: Describe & Generate ─────────────────────────────
    describeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    describeIconRow: {
      alignItems: 'center',
      marginBottom: 24,
    },
    describeIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    describeTitle: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.title2,
      color: colors.text.primary,
      textAlign: 'center',
    },
    describeInput: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      minHeight: 120,
    },
    describeHint: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.footnote,
      color: colors.text.tertiary,
      marginTop: 8,
      textAlign: 'center',
    },
  });
