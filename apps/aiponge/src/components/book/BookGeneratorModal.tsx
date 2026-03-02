/**
 * Book Blueprint Generator Modal
 * AI-powered book structure generation for paid tier users
 *
 * This modal generates book blueprints based on the 'mode' prop:
 * - 'blueprint': Creates personal book blueprints with guided entries
 * - 'book': Creates full library books with chapters and reflections
 *
 * Note: "Blueprint" represents the AI-generated structure before becoming
 * real Book/Chapter/Entry entities.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type ComponentProps } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useTranslation, i18n } from '../../i18n';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n/types';
import { logger } from '../../lib/logger';
import {
  useBookGenerator,
  GeneratedBookBlueprint,
  DepthLevel,
  type GenerationProgress,
} from '../../hooks/book/useBookGenerator';
import {
  getBookTypeConfig,
  resolveBookTypeColor,
  BOOK_TYPE_IDS,
  type BookTypeId,
  type BookTypeConfig,
} from '../../constants/bookTypes';
import { LoadingState } from '../shared';

type DepthOption = { value: DepthLevel; labelKey: string; descriptionKey: string };

function getDepthOptions(config: BookTypeConfig): DepthOption[] {
  return [
    {
      value: 'brief',
      labelKey: config.generatorDepthBriefLabelKey || 'books.generator.depth.brief',
      descriptionKey: config.generatorDepthBriefDescKey || 'books.generator.depth.briefDesc',
    },
    {
      value: 'standard',
      labelKey: config.generatorDepthStandardLabelKey || 'books.generator.depth.standard',
      descriptionKey: config.generatorDepthStandardDescKey || 'books.generator.depth.standardDesc',
    },
    {
      value: 'deep',
      labelKey: config.generatorDepthDeepLabelKey || 'books.generator.depth.deep',
      descriptionKey: config.generatorDepthDeepDescKey || 'books.generator.depth.deepDesc',
    },
  ];
}

interface GenerationProgressViewProps {
  progress: GenerationProgress;
  colors: ColorScheme;
  typeColor: string;
  t: (key: string, params?: Record<string, unknown>) => string;
}

function GenerationProgressView({ progress, colors, typeColor, t }: GenerationProgressViewProps) {
  const progressStyles = useMemo(() => createProgressStyles(colors), [colors]);
  const completionRatio = progress.totalChapters > 0 ? progress.completedChapters / progress.totalChapters : 0;

  return (
    <View style={progressStyles.container}>
      <ActivityIndicator size="large" color={typeColor} style={progressStyles.spinner} />
      {progress.bookTitle && (
        <Text style={progressStyles.bookTitle} numberOfLines={2}>
          {progress.bookTitle}
        </Text>
      )}
      <Text style={progressStyles.phaseText}>
        {progress.phase === 'outline'
          ? t('books.generator.progress.creatingOutline')
          : t('books.generator.progress.writingChapters')}
      </Text>
      {progress.phase === 'chapters' && progress.totalChapters > 0 && (
        <>
          <View style={progressStyles.progressBarContainer}>
            <View
              style={[
                progressStyles.progressBarFill,
                { width: `${Math.round(completionRatio * 100)}%`, backgroundColor: typeColor },
              ]}
            />
          </View>
          <Text style={progressStyles.progressCount}>
            {progress.completedChapters} / {progress.totalChapters}
          </Text>
          <ScrollView style={progressStyles.chapterList} showsVerticalScrollIndicator={false}>
            {progress.chapters.map((ch, idx) => (
              <View key={idx} style={progressStyles.chapterRow}>
                <Ionicons
                  name={
                    ch.status === 'completed'
                      ? 'checkmark-circle'
                      : ch.status === 'generating'
                        ? 'sync-circle'
                        : ch.status === 'failed'
                          ? 'close-circle'
                          : 'ellipse-outline'
                  }
                  size={16}
                  color={
                    ch.status === 'completed'
                      ? colors.semantic.success
                      : ch.status === 'generating'
                        ? typeColor
                        : ch.status === 'failed'
                          ? colors.semantic.error
                          : colors.text.tertiary
                  }
                />
                <Text
                  style={[
                    progressStyles.chapterTitle,
                    ch.status === 'completed' && { color: colors.text.secondary },
                    ch.status === 'generating' && { color: typeColor, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {ch.title}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

interface BookGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateBook: (blueprint: GeneratedBookBlueprint) => Promise<void>;
  bookTypeId?: BookTypeId;
}

export function BookGeneratorModal({
  visible,
  onClose,
  onCreateBook,
  bookTypeId = BOOK_TYPE_IDS.PERSONAL,
}: BookGeneratorModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { status, blueprint, error, progress, canGenerate, roleLoading, generating, generateBook, reset } =
    useBookGenerator();

  const bookTypeConfig = getBookTypeConfig(bookTypeId);
  const typeColor = resolveBookTypeColor(bookTypeConfig.colorKey, colors);

  const [primaryGoal, setPrimaryGoal] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState<'input' | 'loading'>('input');
  const [depthLevel, setDepthLevel] = useState<DepthLevel>('standard');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(i18n.language as SupportedLanguage);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const creationInitiatedRef = useRef(false);
  const onCreateBookRef = useRef(onCreateBook);
  const onCloseRef = useRef(onClose);

  onCreateBookRef.current = onCreateBook;
  onCloseRef.current = onClose;

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const MIN_DESCRIPTION_LENGTH = 10;
  const isDescriptionValid = primaryGoal.trim().length >= MIN_DESCRIPTION_LENGTH;

  useEffect(() => {
    if (!visible) {
      setPrimaryGoal('');
      setStep('input');
      setDepthLevel('standard');
      setSelectedLanguage(i18n.language as SupportedLanguage);
      setShowLanguagePicker(false);
      setIsCreating(false);
      creationInitiatedRef.current = false;
      reset();
    }
  }, [visible, reset]);

  useEffect(() => {
    if (status === 'processing' || status === 'pending') {
      setStep('loading');
    } else if (status === 'completed' && blueprint) {
      if (!creationInitiatedRef.current) {
        creationInitiatedRef.current = true;
        onCreateBookRef
          .current({ ...blueprint, language: selectedLanguage })
          .then(() => {
            onCloseRef.current();
          })
          .catch(e => {
            logger.warn('[BookGenerator] Failed to create book from blueprint', e);
            creationInitiatedRef.current = false;
            setStep('input');
            setIsCreating(false);
          });
      }
    } else if (status === 'failed') {
      setStep('input');
      setIsCreating(false);
    }
  }, [status, blueprint]);

  const handleGenerateAndCreate = async () => {
    if (!primaryGoal.trim()) return;
    // Prevent double-clicks by checking if already creating
    if (isCreating || creationInitiatedRef.current) return;

    setIsCreating(true);
    setStep('loading');

    await generateBook({
      primaryGoal: primaryGoal.trim(),
      language: selectedLanguage,
      depthLevel: bookTypeConfig.hasDepthSelection ? depthLevel : undefined,
      bookTypeId: bookTypeId,
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Show role loading state
  if (roleLoading) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.content}>
            <LoadingState fullScreen={false} message={t('common.loading')} />
          </View>
        </View>
      </Modal>
    );
  }

  // Show paid tier required state
  if (!canGenerate) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.content}>
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={32} color={typeColor} />
            </View>
            <Text style={styles.title}>{t(bookTypeConfig.generatorPremiumRequiredKey)}</Text>
            <Text style={styles.description}>{t(bookTypeConfig.generatorPremiumDescriptionKey)}</Text>
            <TouchableOpacity style={[styles.closeButton, { backgroundColor: typeColor }]} onPress={handleClose}>
              <Text style={styles.closeButtonText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (step === 'loading') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.content}>
            {progress ? (
              <GenerationProgressView progress={progress} colors={colors} typeColor={typeColor} t={t} />
            ) : (
              <LoadingState fullScreen={false} message={t(bookTypeConfig.generatorGeneratingKey)} />
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // Default: Input step
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.overlay}>
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons
                  name={bookTypeConfig.iconFilled as ComponentProps<typeof Ionicons>['name']}
                  size={24}
                  color={typeColor}
                />
                <Text style={styles.title}>{t(bookTypeConfig.generatorTitleKey)}</Text>
              </View>
              {keyboardVisible && (
                <TouchableOpacity onPress={Keyboard.dismiss} style={styles.doneButton}>
                  <Ionicons name="checkmark-circle" size={28} color={typeColor} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.description}>{t(bookTypeConfig.generatorDescriptionKey)}</Text>

            <TextInput
              style={styles.textArea}
              placeholder={t(bookTypeConfig.generatorPlaceholderKey)}
              placeholderTextColor={colors.text.tertiary}
              value={primaryGoal}
              onChangeText={setPrimaryGoal}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.languageContainer}>
              <TouchableOpacity
                style={styles.languageHeader}
                onPress={() => setShowLanguagePicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.languageHeaderLeft}>
                  <Ionicons name="language-outline" size={18} color={typeColor} />
                  <Text style={styles.languageHeaderTitle}>{t('books.generator.language')}</Text>
                </View>
                <View style={styles.languageHeaderRight}>
                  <Text style={styles.languageHeaderValue}>
                    {SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.nativeLabel || selectedLanguage}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.text.tertiary} />
                </View>
              </TouchableOpacity>

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
                  <View style={styles.languagePickerDropdown}>
                    <Text style={styles.languagePickerTitle}>{t('books.generator.language')}</Text>
                    {SUPPORTED_LANGUAGES.map(lang => {
                      const isSelected = lang.code === selectedLanguage;
                      return (
                        <TouchableOpacity
                          key={lang.code}
                          style={[styles.languagePickerOption, isSelected && styles.languagePickerOptionSelected]}
                          onPress={() => {
                            setSelectedLanguage(lang.code);
                            setShowLanguagePicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.languagePickerOptionText,
                              isSelected && { color: typeColor, fontWeight: '600' },
                            ]}
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
            </View>

            {bookTypeConfig.hasDepthSelection && bookTypeConfig.generatorDepthLabelKey && (
              <View style={styles.depthContainer}>
                <Text style={styles.depthLabel}>{t(bookTypeConfig.generatorDepthLabelKey)}</Text>
                <View style={styles.depthOptions}>
                  {getDepthOptions(bookTypeConfig).map((option: DepthOption) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.depthOption,
                        depthLevel === option.value && { borderColor: typeColor, backgroundColor: typeColor + '15' },
                      ]}
                      onPress={() => setDepthLevel(option.value)}
                    >
                      <Text style={[styles.depthOptionLabel, depthLevel === option.value && { color: typeColor }]}>
                        {t(option.labelKey)}
                      </Text>
                      <Text style={styles.depthOptionDesc}>{t(option.descriptionKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.semantic.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {primaryGoal.trim().length > 0 && !isDescriptionValid && (
              <Text style={styles.hintText}>
                {t(bookTypeConfig.generatorMinLengthHintKey, { minLength: MIN_DESCRIPTION_LENGTH })}
              </Text>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: typeColor },
                  (!isDescriptionValid || isCreating) && styles.buttonDisabled,
                ]}
                onPress={handleGenerateAndCreate}
                disabled={!isDescriptionValid || generating || isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color={colors.absolute.white} />
                ) : (
                  <>
                    <Ionicons
                      name={bookTypeConfig.iconFilled as ComponentProps<typeof Ionicons>['name']}
                      size={16}
                      color={colors.absolute.white}
                    />
                    <Text style={styles.primaryButtonText}>{t('common.generate')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    content: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    doneButton: {
      padding: 4,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    description: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    textArea: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      fontSize: 16,
      color: colors.text.primary,
      minHeight: 120,
      borderWidth: 1,
      borderColor: colors.border.muted,
      marginBottom: 16,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    primaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    premiumBadge: {
      alignSelf: 'center',
      marginBottom: 16,
    },
    closeButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    closeButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.semantic.error + '20',
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 16,
    },
    errorText: {
      fontSize: 14,
      color: colors.semantic.error,
      flex: 1,
    },
    hintText: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginBottom: 12,
    },
    inputScroll: {
      flex: 1,
    },
    languageContainer: {
      marginBottom: 16,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.darkCard,
      overflow: 'hidden',
    },
    languageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    languageHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    languageHeaderTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    languageHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    languageHeaderValue: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    languagePickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    languagePickerDropdown: {
      backgroundColor: colors.background.dark,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      width: '100%',
      maxWidth: 340,
    },
    languagePickerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    languagePickerOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 4,
    },
    languagePickerOptionSelected: {
      backgroundColor: colors.brand.primary + '15',
    },
    languagePickerOptionText: {
      fontSize: 15,
      color: colors.text.primary,
    },
    depthContainer: {
      marginBottom: 16,
    },
    depthLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    depthOptions: {
      gap: 8,
    },
    depthOption: {
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.muted,
      backgroundColor: colors.background.darkCard,
    },
    depthOptionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    depthOptionDesc: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    viewPromptLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginBottom: 12,
      paddingVertical: 4,
    },
    viewPromptLinkText: {
      fontSize: 13,
      color: colors.text.secondary,
      textDecorationLine: 'underline',
    },
  });

const createProgressStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    spinner: {
      marginBottom: 16,
    },
    bookTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    phaseText: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 16,
    },
    progressBarContainer: {
      width: '100%',
      height: 6,
      backgroundColor: colors.background.darkCard,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    progressCount: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginBottom: 12,
    },
    chapterList: {
      width: '100%',
      maxHeight: 200,
    },
    chapterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    chapterTitle: {
      fontSize: 13,
      color: colors.text.primary,
      flex: 1,
    },
  });
