import { useState, useCallback, useMemo, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Platform,
} from 'react-native';

const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { SUPPORTED_LANGUAGES } from '../../i18n/types';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { fontFamilies, fontSizes, lineHeights } from '../../theme/typography';
import { setOnboardingCompleted } from '../../utils/onboarding';
import { savePendingBookGeneration } from '../../utils/pendingBookGeneration';
import { useAuthStore, selectUser } from '../../auth/store';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { prefetchBooks } from '../../hooks/book/useUnifiedLibrary';
import { useBookGenerator, type DepthLevel } from '../../hooks/book/useBookGenerator';
import {
  BOOK_TYPE_CATEGORY_CONFIGS,
  getBookTypesForCategory,
  getBookTypeConfig,
  getCategoryColor,
} from '../../constants/bookTypes';
import type { BookTypeCategory, BookTypeId } from '@aiponge/shared-contracts';

import { PROFILE_QUERY_KEY } from '../../hooks/profile/useProfile';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { LiquidGlassCard } from '../../components/ui/LiquidGlassCard';

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
  const router = useRouter();
  const { generateBook } = useBookGenerator({ bypassTierCheck: true });

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [selectedCategory, setSelectedCategory] = useState<BookTypeCategory | null>(null);
  const [selectedBookTypeId, setSelectedBookTypeId] = useState<BookTypeId | null>(null);
  const [bookDescription, setBookDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'en-US');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [depthLevel, setDepthLevel] = useState<DepthLevel>('brief');

  const selectedBookTypeConfig = useMemo(
    () => (selectedBookTypeId ? getBookTypeConfig(selectedBookTypeId) : null),
    [selectedBookTypeId]
  );

  // Only show categories that have book types defined
  const categoriesWithTypes = useMemo(
    () => BOOK_TYPE_CATEGORY_CONFIGS.filter(c => getBookTypesForCategory(c.id).length > 0),
    []
  );

  const typeColor = useMemo(() => {
    if (selectedBookTypeConfig) return getCategoryColor(selectedBookTypeConfig.category, colors);
    if (selectedCategory) return getCategoryColor(selectedCategory, colors);
    return colors.brand.primary;
  }, [selectedBookTypeConfig, selectedCategory, colors]);

  const handleToggleCategory = useCallback((categoryId: BookTypeCategory) => {
    setSelectedCategory(prev => (prev === categoryId ? null : categoryId));
  }, []);

  const handleSelectType = useCallback((typeId: BookTypeId) => {
    setSelectedBookTypeId(typeId);
    setStep('describeBook');
  }, []);

  const handleBackFromDescribe = useCallback(() => {
    setSelectedBookTypeId(null);
    setStep('chooseBookType');
  }, []);

  const handleDepthPress = useCallback(
    (depth: DepthLevel) => {
      if (depth === 'brief') {
        setDepthLevel(depth);
      } else {
        // Locked depth — open paywall
        router.push('/paywall' as any);
      }
    },
    [router]
  );

  const handleSkip = useCallback(async () => {
    // Complete onboarding without generating a book — lets guests explore shared content
    try {
      try {
        await apiClient.post(
          '/api/v1/app/onboarding/complete',
          { preferences: {}, locale: i18n.language || 'en-US' },
          { timeout: 15000 }
        );
        invalidateOnEvent(queryClient, { type: 'ONBOARDING_COMPLETED', userId: user?.id });
      } catch (err) {
        logger.error('Onboarding complete API failed during skip (non-fatal)', err);
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
      logger.error('Failed to skip onboarding', error);
      // Still complete — don't trap the user
      if (user?.id) {
        await setOnboardingCompleted(user.id);
      }
      onComplete();
    }
  }, [queryClient, user?.id, onComplete, i18n.language]);

  const handleGenerate = useCallback(async () => {
    if (isSubmitting || bookDescription.trim().length < 10) return;
    setIsSubmitting(true);

    try {
      const language = selectedLanguage.split('-')[0] || 'en';
      const requestId = await generateBook({
        primaryGoal: bookDescription.trim(),
        depthLevel,
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
    selectedLanguage,
    depthLevel,
    generateBook,
    queryClient,
    user?.id,
    onComplete,
    i18n.language,
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

        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipButtonText}>
            {t('onboardingFlow.skip', { defaultValue: 'Skip & explore the app' })}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  // ─── Step 2: Choose Book Type (accordion) ─────────────────────────────────────

  const handleBackFromChooseBookType = useCallback(() => {
    setSelectedCategory(null);
    setStep('welcome');
  }, []);

  const renderAccordionList = () => (
    <>
      <View style={styles.describeHeader}>
        <TouchableOpacity onPress={handleBackFromChooseBookType} style={styles.typeBackButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.preferencesHeader}>
        <Ionicons name="library-outline" size={40} color={colors.text.primary} />
        <Text style={styles.preferencesTitle}>
          {t('onboardingFlow.chooseCategoryTitle', { defaultValue: 'What kind of book?' })}
        </Text>
        <Text style={styles.preferencesSubtitle}>
          {t('onboardingFlow.chooseCategorySubtitle', { defaultValue: 'Pick a theme that resonates' })}
        </Text>
      </View>

      <View style={styles.accordionList}>
        {categoriesWithTypes.map(config => {
          const catColor = getCategoryColor(config.id, colors);
          const isExpanded = selectedCategory === config.id;
          const types = isExpanded ? getBookTypesForCategory(config.id) : [];

          return (
            <LiquidGlassCard
              key={config.id}
              intensity={isExpanded ? 'medium' : 'light'}
              padding={0}
              borderRadius={BORDER_RADIUS.md}
            >
              <TouchableOpacity
                style={[styles.categoryRow, isExpanded && styles.categoryRowExpanded]}
                onPress={() => handleToggleCategory(config.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
              >
                <View style={[styles.categoryIconCircle, { backgroundColor: catColor + '20' }]}>
                  <Ionicons name={config.icon as ComponentProps<typeof Ionicons>['name']} size={22} color={catColor} />
                </View>
                <Text style={[styles.categoryRowText, isExpanded && { color: catColor }]}>{t(config.nameKey)}</Text>
                <Ionicons
                  name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={isExpanded ? catColor : colors.text.tertiary}
                />
              </TouchableOpacity>

              {isExpanded &&
                types.map(typeConfig => (
                  <TouchableOpacity
                    key={typeConfig.id}
                    style={styles.typeRow}
                    onPress={() => handleSelectType(typeConfig.id)}
                    accessibilityRole="button"
                  >
                    <View style={[styles.typeIconCircle, { backgroundColor: catColor + '15' }]}>
                      <Ionicons
                        name={typeConfig.icon as ComponentProps<typeof Ionicons>['name']}
                        size={20}
                        color={catColor}
                      />
                    </View>
                    <View style={styles.typeTextContainer}>
                      <Text style={styles.typeRowTitle}>{t(typeConfig.nameKey)}</Text>
                      <Text style={styles.typeRowDesc} numberOfLines={2}>
                        {t(typeConfig.descriptionKey)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                  </TouchableOpacity>
                ))}
            </LiquidGlassCard>
          );
        })}
      </View>
    </>
  );

  const renderChooseBookTypeStep = () => (
    <Animated.View entering={isIOS26OrLater ? undefined : FadeIn.duration(500)} style={styles.stepContainer}>
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
        {renderAccordionList()}
      </ScrollView>
    </Animated.View>
  );

  // ─── Step 3: Describe & Generate ─────────────────────────────────────────────

  const renderDescribeBookStep = () => {
    const canGenerate = bookDescription.trim().length >= 10;
    const placeholderKey = selectedBookTypeConfig?.generatorPlaceholderKey || 'books.generator.placeholder';

    // Use the book-type-specific depth label or fall back to a generic one
    const depthLabelKey = selectedBookTypeConfig?.generatorDepthLabelKey || 'books.generator.depth.label';

    // Build depth options from the book type config or use generic keys
    const depthOptions: { value: DepthLevel; labelKey: string; descriptionKey: string }[] = [
      {
        value: 'brief',
        labelKey: selectedBookTypeConfig?.generatorDepthBriefLabelKey || 'books.generator.depth.brief',
        descriptionKey: selectedBookTypeConfig?.generatorDepthBriefDescKey || 'books.generator.depth.briefDesc',
      },
      {
        value: 'standard',
        labelKey: selectedBookTypeConfig?.generatorDepthStandardLabelKey || 'books.generator.depth.standard',
        descriptionKey: selectedBookTypeConfig?.generatorDepthStandardDescKey || 'books.generator.depth.standardDesc',
      },
      {
        value: 'deep',
        labelKey: selectedBookTypeConfig?.generatorDepthDeepLabelKey || 'books.generator.depth.deep',
        descriptionKey: selectedBookTypeConfig?.generatorDepthDeepDescKey || 'books.generator.depth.deepDesc',
      },
    ];

    const currentLangLabel =
      SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.nativeLabel || selectedLanguage;

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

          {/* Language selector */}
          <View style={styles.languageContainer}>
            <TouchableOpacity
              style={styles.languageSelector}
              onPress={() => setShowLanguagePicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.languageSelectorLeft}>
                <Ionicons name="language-outline" size={18} color={typeColor} />
                <Text style={styles.languageSelectorLabel}>
                  {t('books.generator.language', { defaultValue: 'Language' })}
                </Text>
              </View>
              <View style={styles.languageSelectorRight}>
                <Text style={styles.languageSelectorValue}>{currentLangLabel}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Depth selector */}
          <View style={styles.depthContainer}>
            <Text style={styles.depthLabel}>{t(depthLabelKey, { defaultValue: 'Choose depth' })}</Text>
            <View style={styles.depthOptions}>
              {depthOptions.map(option => {
                const isLocked = option.value !== 'brief';
                const isActive = depthLevel === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.depthOption,
                      isActive && !isLocked && { borderColor: typeColor, backgroundColor: typeColor + '15' },
                      isLocked && styles.depthOptionLocked,
                    ]}
                    onPress={() => handleDepthPress(option.value)}
                  >
                    <View style={styles.depthOptionHeader}>
                      <Text
                        style={[
                          styles.depthOptionLabel,
                          isActive && !isLocked && { color: typeColor },
                          isLocked && { color: colors.text.tertiary },
                        ]}
                      >
                        {t(option.labelKey)}
                      </Text>
                      {isLocked && <Ionicons name="lock-closed" size={14} color={colors.text.tertiary} />}
                    </View>
                    <Text style={[styles.depthOptionDesc, isLocked && { color: colors.text.tertiary }]}>
                      {t(option.descriptionKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
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

        {/* Language picker modal */}
        <Modal
          visible={showLanguagePicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowLanguagePicker(false)}
        >
          <TouchableOpacity
            style={styles.languagePickerOverlay}
            activeOpacity={1}
            onPress={() => setShowLanguagePicker(false)}
          >
            <View style={styles.languagePickerSheet}>
              <Text style={styles.languagePickerTitle}>
                {t('books.generator.language', { defaultValue: 'Language' })}
              </Text>
              {SUPPORTED_LANGUAGES.map(lang => {
                const isSelected = lang.code === selectedLanguage;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.languagePickerOption, isSelected && styles.languagePickerOptionActive]}
                    onPress={() => {
                      setSelectedLanguage(lang.code);
                      setShowLanguagePicker(false);
                    }}
                  >
                    <Text
                      style={[styles.languagePickerOptionText, isSelected && { color: typeColor, fontWeight: '600' }]}
                    >
                      {lang.nativeLabel}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={typeColor} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>
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
    skipButton: {
      alignItems: 'center',
      paddingVertical: 14,
    },
    skipButtonText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.footnote,
      color: colors.text.tertiary,
    },

    // ─── Step 2: Accordion categories ──────────────────────────────
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
    accordionList: {
      gap: 4,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 16,
      paddingHorizontal: 14,
    },
    categoryRowExpanded: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    categoryIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryRowText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
      flex: 1,
    },

    // ─── Type rows (inside expanded category) ──────────────────────
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      paddingLeft: 28,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    typeIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeTextContainer: {
      flex: 1,
    },
    typeRowTitle: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.footnote,
      color: colors.text.primary,
      marginBottom: 2,
    },
    typeRowDesc: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.caption1,
      color: colors.text.secondary,
      lineHeight: 16,
    },
    typeBackButton: {
      padding: 4,
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

    // ─── Language selector ────────────────────────────────────────
    languageContainer: {
      marginTop: 20,
    },
    languageSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
      borderRadius: BORDER_RADIUS.md,
    },
    languageSelectorLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    languageSelectorLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
    },
    languageSelectorRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    languageSelectorValue: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.secondary,
    },

    // Language picker modal
    languagePickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    languagePickerSheet: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 16,
      paddingVertical: 20,
    },
    languagePickerTitle: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.headline,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 12,
    },
    languagePickerOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.sm,
    },
    languagePickerOptionActive: {
      backgroundColor: colors.brand.primary + '15',
    },
    languagePickerOptionText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
    },

    // ─── Depth selector ──────────────────────────────────────────
    depthContainer: {
      marginTop: 20,
    },
    depthLabel: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.text.primary,
      marginBottom: 10,
    },
    depthOptions: {
      gap: 8,
    },
    depthOption: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.primary,
      backgroundColor: colors.background.subtle,
    },
    depthOptionLocked: {
      opacity: 0.6,
    },
    depthOptionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    depthOptionLabel: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.footnote,
      color: colors.text.primary,
    },
    depthOptionDesc: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.caption1,
      color: colors.text.secondary,
      lineHeight: 16,
    },
  });
