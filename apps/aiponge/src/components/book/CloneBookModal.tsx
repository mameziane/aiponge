import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { useTranslation } from '../../i18n';
import { SUPPORTED_LANGUAGES } from '../../i18n/types';
import { normalizeMediaUrl } from '../../lib/apiConfig';
import { apiClient, apiRequest } from '../../lib/axiosApiClient';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { useIsLibrarianWithLoading } from '../../hooks/admin/useAdminQuery';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { useQueryClient } from '@tanstack/react-query';
import { LiquidGlassView } from '../ui';
import type { BookCardData } from './BookCard';

const MAX_PROMPT_LENGTH = 500;
const MIN_PROMPT_LENGTH = 10;
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_TIME_MS = 5 * 60 * 1000;

type Step = 'input' | 'generating' | 'creating' | 'done' | 'error';

const DEPTH_OPTIONS: Array<{ value: 'brief' | 'standard' | 'deep'; labelKey: string; descKey: string }> = [
  { value: 'brief', labelKey: 'books.generator.depth.brief', descKey: 'books.generator.depth.briefDesc' },
  { value: 'standard', labelKey: 'books.generator.depth.standard', descKey: 'books.generator.depth.standardDesc' },
  { value: 'deep', labelKey: 'books.generator.depth.deep', descKey: 'books.generator.depth.deepDesc' },
];

interface CloneBookModalProps {
  visible: boolean;
  onClose: () => void;
  sourceBook: BookCardData;
}

export function CloneBookModal({ visible, onClose, sourceBook }: CloneBookModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tierConfig } = useSubscriptionData();
  const { isLibrarian } = useIsLibrarianWithLoading();

  const canClone = tierConfig.canCreateCustomBooks || isLibrarian;

  const [step, setStep] = useState<Step>('input');
  const [prompt, setPrompt] = useState('');
  const [depthLevel, setDepthLevel] = useState<'brief' | 'standard' | 'deep'>('standard');
  const [language, setLanguage] = useState('en-US');
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('');

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);
  const requestIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      cleanup();
      setStep('input');
      setPrompt('');
      setError(null);
      setLanguageExpanded(false);
      requestIdRef.current = null;
    }
  }, [visible, cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  const createBookFromBlueprint = useCallback(
    async (blueprint: Record<string, unknown>) => {
      setStep('creating');
      setProgressMessage(t('books.clone.creatingBook') || 'Creating your book…');

      const response = (await apiRequest('/api/v1/app/library/books', {
        method: 'POST',
        data: {
          ...blueprint,
          language,
          visibility: 'personal',
        },
      })) as { data?: { book?: { id: string }; id?: string }; book?: { id: string }; id?: string };

      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_CREATED' });

      const bookId = response?.data?.book?.id || response?.data?.id || response?.book?.id || response?.id;
      if (bookId) {
        setStep('done');
        onClose();
        router.push(`/book-detail?bookId=${bookId}` as Parameters<typeof router.push>[0]);
      } else {
        throw new Error('No book ID returned');
      }
    },
    [language, queryClient, onClose, router, t]
  );

  const pollStatus = useCallback(
    async (requestId: string): Promise<void> => {
      if (Date.now() - pollStartRef.current > MAX_POLL_TIME_MS) {
        setStep('error');
        setError(t('books.clone.timeout') || 'Generation timed out. Please try again.');
        return;
      }

      try {
        const response = await apiClient.get<{
          success: boolean;
          data?: {
            status: string;
            blueprint?: Record<string, unknown>;
            error?: string;
            progress?: { phase: string; totalChapters: number; completedChapters: number };
          };
        }>(`/api/v1/app/books/generate/${requestId}`);

        const data = response?.data;
        if (!data) {
          pollTimeoutRef.current = setTimeout(() => pollStatus(requestId), POLL_INTERVAL_MS);
          return;
        }

        if (data.status === 'completed') {
          if (data.blueprint) {
            try {
              await createBookFromBlueprint(data.blueprint);
            } catch (createError) {
              setStep('error');
              setError(
                createError instanceof Error
                  ? createError.message
                  : t('books.clone.generationFailed') || 'Failed to create book. Please try again.'
              );
            }
          } else {
            setStep('error');
            setError(t('books.clone.generationFailed') || 'Generation completed but data is missing.');
          }
        } else if (data.status === 'failed') {
          setStep('error');
          setError(data.error || t('books.clone.generationFailed') || 'Generation failed. Please try again.');
        } else {
          if (data.progress) {
            const { phase, completedChapters, totalChapters } = data.progress;
            if (phase === 'chapters' && totalChapters > 0) {
              setProgressMessage(
                `${t('books.clone.writingChapters') || 'Writing chapters'} ${completedChapters}/${totalChapters}…`
              );
            }
          }
          pollTimeoutRef.current = setTimeout(() => pollStatus(requestId), POLL_INTERVAL_MS);
        }
      } catch {
        pollTimeoutRef.current = setTimeout(() => pollStatus(requestId), POLL_INTERVAL_MS * 2);
      }
    },
    [createBookFromBlueprint, t]
  );

  const handleSubmit = useCallback(async () => {
    if (prompt.trim().length < MIN_PROMPT_LENGTH) return;
    cleanup();
    setError(null);
    setStep('generating');
    setProgressMessage(t('books.clone.starting') || 'Starting your personalized book…');

    try {
      const response = await apiClient.post<{
        success: boolean;
        data?: { requestId: string };
        error?: string;
      }>(`/api/v1/app/library/books/${sourceBook.id}/clone`, {
        modificationPrompt: prompt.trim(),
        language,
        depthLevel,
      });

      if (!response?.success || !response.data?.requestId) {
        setStep('error');
        setError(response?.error || t('books.clone.startFailed') || 'Failed to start cloning. Please try again.');
        return;
      }

      const requestId = response.data.requestId;
      requestIdRef.current = requestId;
      pollStartRef.current = Date.now();
      setProgressMessage(t('books.clone.generating') || 'Generating your personalized book…');
      pollTimeoutRef.current = setTimeout(() => pollStatus(requestId), POLL_INTERVAL_MS);
    } catch {
      setStep('error');
      setError(t('books.clone.startFailed') || 'Failed to start cloning. Please try again.');
    }
  }, [prompt, language, depthLevel, sourceBook.id, cleanup, pollStatus, t]);

  const handleClose = useCallback(() => {
    if (step === 'generating' || step === 'creating') return;
    cleanup();
    onClose();
  }, [step, cleanup, onClose]);

  const isGenerating = step === 'generating' || step === 'creating';

  if (!canClone) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <LiquidGlassView intensity="strong" borderRadius={0} showBorder={false} style={styles.sheet}>
                <View style={styles.header}>
                  <Text style={styles.title}>{t('books.clone.title') || 'Clone this book'}</Text>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={22} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.upgradeContainer}>
                  <Ionicons name="star-outline" size={40} color={colors.brand.primary} />
                  <Text style={styles.upgradeTitle}>
                    {t('books.clone.upgradeRequired') || 'Personal plan required'}
                  </Text>
                  <Text style={styles.upgradeDesc}>
                    {t('books.clone.upgradeDesc') || 'Upgrade to Personal or higher to clone and personalize books.'}
                  </Text>
                </View>
              </LiquidGlassView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableWithoutFeedback
        onPress={() => {
          Keyboard.dismiss();
        }}
        accessible={false}
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <LiquidGlassView intensity="strong" borderRadius={0} showBorder={false} style={styles.sheet}>
              <View style={styles.header}>
                <Text style={styles.title}>{t('books.clone.title') || 'Clone this book'}</Text>
                {!isGenerating && (
                  <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={22} color={colors.text.secondary} />
                  </TouchableOpacity>
                )}
              </View>

              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.brand.primary} />
                  <Text style={styles.loadingTitle}>
                    {step === 'creating'
                      ? t('books.clone.creatingBook') || 'Creating your book…'
                      : t('books.clone.generating') || 'Generating your personalized book…'}
                  </Text>
                  {progressMessage.length > 0 && <Text style={styles.loadingSubtitle}>{progressMessage}</Text>}
                </View>
              ) : step === 'error' ? (
                <View style={styles.loadingContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color={colors.semantic.error} />
                  <Text style={[styles.loadingTitle, { color: colors.semantic.error }]}>
                    {t('books.clone.errorTitle') || 'Something went wrong'}
                  </Text>
                  {error && <Text style={styles.errorText}>{error}</Text>}
                  <TouchableOpacity style={styles.retryButton} onPress={() => setStep('input')}>
                    <Text style={styles.retryButtonText}>{t('common.tryAgain') || 'Try again'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContent}
                >
                  <View style={styles.sourceCard}>
                    {sourceBook.coverIllustrationUrl ? (
                      <Image
                        source={{ uri: normalizeMediaUrl(sourceBook.coverIllustrationUrl) }}
                        style={styles.sourceCover}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.sourceCover, styles.sourceCoverPlaceholder]}>
                        <Ionicons name="book-outline" size={22} color={colors.text.tertiary} />
                      </View>
                    )}
                    <View style={styles.sourceInfo}>
                      <Text style={styles.sourceLabelText}>{t('books.clone.sourceLabel') || 'Based on'}</Text>
                      <Text style={styles.sourceTitle} numberOfLines={2}>
                        {sourceBook.title}
                      </Text>
                      {sourceBook.author && (
                        <Text style={styles.sourceAuthor} numberOfLines={1}>
                          {sourceBook.author}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>
                    {t('books.clone.promptLabel') || 'How would you like to adapt this book?'}
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    placeholder={
                      t('books.clone.promptPlaceholder') ||
                      'Example: Focus on dealing with anxiety in the workplace, using more practical techniques and less theory…'
                    }
                    placeholderTextColor={colors.text.tertiary}
                    value={prompt}
                    onChangeText={setPrompt}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    maxLength={MAX_PROMPT_LENGTH}
                  />
                  <Text style={styles.charCount}>
                    {t('books.clone.charCount', { count: prompt.length, max: MAX_PROMPT_LENGTH }) ||
                      `${prompt.length} / ${MAX_PROMPT_LENGTH}`}
                  </Text>

                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                    {t('books.generator.depth.brief')
                      ? t('books.wisdomBook.depthLabel') || 'Choose depth'
                      : 'Choose depth'}
                  </Text>
                  <View style={styles.depthRow}>
                    {DEPTH_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.depthOption,
                          depthLevel === opt.value && {
                            borderColor: colors.brand.primary,
                            backgroundColor: colors.brand.primary + '18',
                          },
                        ]}
                        onPress={() => setDepthLevel(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.depthLabel, depthLevel === opt.value && { color: colors.brand.primary }]}>
                          {t(opt.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.languageHeader}
                    onPress={() => setLanguageExpanded(p => !p)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.languageHeaderLeft}>
                      <Ionicons name="language-outline" size={16} color={colors.text.secondary} />
                      <Text style={styles.languageHeaderLabel}>{t('books.generator.language') || 'Language'}</Text>
                    </View>
                    <View style={styles.languageHeaderRight}>
                      <Text style={styles.languageValue}>
                        {SUPPORTED_LANGUAGES.find(l => l.code === language)?.nativeLabel || language}
                      </Text>
                      <Ionicons
                        name={languageExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={colors.text.tertiary}
                      />
                    </View>
                  </TouchableOpacity>

                  {languageExpanded && (
                    <View style={styles.languageChips}>
                      {SUPPORTED_LANGUAGES.map(lang => {
                        const selected = lang.code === language;
                        return (
                          <TouchableOpacity
                            key={lang.code}
                            style={[
                              styles.languageChip,
                              selected && {
                                borderColor: colors.brand.primary,
                                backgroundColor: colors.brand.primary + '15',
                              },
                            ]}
                            onPress={() => {
                              setLanguage(lang.code);
                              setLanguageExpanded(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {selected && (
                              <Ionicons
                                name="checkmark"
                                size={13}
                                color={colors.brand.primary}
                                style={{ marginRight: 3 }}
                              />
                            )}
                            <Text
                              style={[
                                styles.languageChipText,
                                selected && { color: colors.brand.primary, fontWeight: '600' },
                              ]}
                            >
                              {lang.nativeLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {error && (
                    <View style={styles.inlineError}>
                      <Ionicons name="alert-circle" size={14} color={colors.semantic.error} />
                      <Text style={styles.inlineErrorText}>{error}</Text>
                    </View>
                  )}

                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                      <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.submitButton,
                        { backgroundColor: colors.brand.primary },
                        prompt.trim().length < MIN_PROMPT_LENGTH && styles.buttonDisabled,
                      ]}
                      onPress={handleSubmit}
                      disabled={prompt.trim().length < MIN_PROMPT_LENGTH}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="copy-outline" size={16} color={colors.absolute.white} />
                      <Text style={styles.submitButtonText}>
                        {t('books.clone.submitButton') || 'Generate my version'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </LiquidGlassView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function createStyles(colors: ColorScheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      maxHeight: '92%',
      paddingBottom: 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    title: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: 17,
      color: colors.text.primary,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 8,
    },
    sourceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.muted,
      padding: 12,
      marginBottom: 20,
      gap: 12,
    },
    sourceCover: {
      width: 50,
      height: 70,
      borderRadius: BORDER_RADIUS.sm,
    },
    sourceCoverPlaceholder: {
      backgroundColor: colors.overlay.purple[8],
      alignItems: 'center',
      justifyContent: 'center',
    },
    sourceInfo: {
      flex: 1,
    },
    sourceLabelText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sourceTitle: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: 14,
      color: colors.text.primary,
      marginBottom: 2,
    },
    sourceAuthor: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 12,
      color: colors.text.secondary,
    },
    fieldLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    textArea: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.muted,
      padding: 12,
      fontFamily: fontFamilies.body.regular,
      fontSize: 14,
      color: colors.text.primary,
      minHeight: 100,
    },
    charCount: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 11,
      color: colors.text.tertiary,
      textAlign: 'right',
      marginTop: 4,
    },
    depthRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    depthOption: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.muted,
      alignItems: 'center',
    },
    depthLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: 12,
      color: colors.text.secondary,
    },
    languageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
      marginBottom: 4,
    },
    languageHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    languageHeaderLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: 13,
      color: colors.text.secondary,
    },
    languageHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    languageValue: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 13,
      color: colors.text.tertiary,
    },
    languageChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 12,
    },
    languageChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    languageChipText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 12,
      color: colors.text.secondary,
    },
    inlineError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.semantic.error + '18',
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
      marginTop: 8,
    },
    inlineErrorText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 13,
      color: colors.semantic.error,
      flex: 1,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.muted,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: 14,
      color: colors.text.secondary,
    },
    submitButton: {
      flex: 2,
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 13,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: 14,
      color: colors.absolute.white,
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 14,
    },
    loadingTitle: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: 16,
      color: colors.text.primary,
      textAlign: 'center',
    },
    loadingSubtitle: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    errorText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.brand.primary,
    },
    retryButtonText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: 14,
      color: colors.absolute.white,
    },
    upgradeContainer: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 24,
      gap: 12,
    },
    upgradeTitle: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: 16,
      color: colors.text.primary,
      textAlign: 'center',
    },
    upgradeDesc: {
      fontFamily: fontFamilies.body.regular,
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
    },
  });
}
