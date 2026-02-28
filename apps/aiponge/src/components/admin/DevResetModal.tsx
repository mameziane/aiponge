import { useState, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { fontFamilies, fontSizes } from '../../theme/typography';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectLogout } from '../../auth';

interface DevResetModalProps {
  visible: boolean;
  onClose: () => void;
  onResetComplete: () => void;
}

interface ResetOption {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  dangerous?: boolean;
}

const getResetOptions = (colors: ColorScheme): ResetOption[] => [
  {
    id: 'libraryBooks',
    label: 'Library Books',
    description: 'Books, chapters, entries, user libraries',
    icon: 'book-outline',
    color: colors.brand.purple[500],
  },
  {
    id: 'personalBooks',
    label: 'Personal Books & Entries',
    description: 'Personal books, entries, insights, reflections',
    icon: 'book-outline',
    color: colors.semantic.success,
  },
  {
    id: 'musicLibrary',
    label: 'Music Library',
    description: 'Albums, tracks, playlists, favorites',
    icon: 'musical-notes-outline',
    color: colors.semantic.info,
  },
  {
    id: 'uploads',
    label: 'Uploaded Files',
    description: 'All user uploads (avatars, entries, images, etc.)',
    icon: 'cloud-upload-outline',
    color: colors.semantic.warning,
  },
  {
    id: 'aiAnalytics',
    label: 'AI Analytics',
    description: 'Traces, spans, provider usage, metrics, activity logs',
    icon: 'analytics-outline' as keyof typeof Ionicons.glyphMap,
    color: colors.brand.accent,
  },
  {
    id: 'bookGenerationRequests',
    label: 'Book Generation Requests',
    description: 'All book generation request records',
    icon: 'construct-outline' as keyof typeof Ionicons.glyphMap,
    color: colors.text.secondary,
  },
  {
    id: 'userSessions',
    label: 'User Sessions',
    description: 'All user session records',
    icon: 'log-out-outline' as keyof typeof Ionicons.glyphMap,
    color: colors.semantic.warning,
  },
  {
    id: 'nonSystemUsers',
    label: 'Non-System Users',
    description: 'Users + all associated data',
    icon: 'people-outline',
    color: colors.brand.pink,
    dangerous: true,
  },
];

export function DevResetModal({ visible, onClose, onResetComplete }: DevResetModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const RESET_OPTIONS = useMemo(() => getResetOptions(colors), [colors]);
  const queryClient = useQueryClient();
  const logout = useAuthStore(selectLogout);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [showResults, setShowResults] = useState(false);

  const toggleOption = (id: string) => {
    setSelectedOptions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedOptions(new Set(RESET_OPTIONS.map(o => o.id)));
  };

  const deselectAll = () => {
    setSelectedOptions(new Set());
  };

  const handleReset = async () => {
    if (selectedOptions.size === 0) return;

    setIsDeleting(true);
    setResults({});
    setShowResults(false);

    const newResults: Record<string, { success: boolean; message: string }> = {};

    for (const optionId of selectedOptions) {
      try {
        const response = await apiClient.post<{ success?: boolean; message?: string; data?: { message?: string } }>(
          '/api/v1/dev/reset',
          {
            category: optionId,
          }
        );
        newResults[optionId] = {
          success: true,
          message: response?.message || 'Deleted successfully',
        };
      } catch (error: unknown) {
        let errorMessage = 'Failed to delete';
        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as { response?: { data?: { error?: unknown; message?: unknown } } };
          const rawError = axiosError.response?.data?.error ?? axiosError.response?.data?.message;
          if (typeof rawError === 'string') {
            errorMessage = rawError;
          } else if (rawError && typeof rawError === 'object') {
            const errObj = rawError as { message?: unknown };
            errorMessage = typeof errObj.message === 'string' ? errObj.message : JSON.stringify(rawError);
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        newResults[optionId] = {
          success: false,
          message: errorMessage,
        };
      }
    }

    setResults(newResults);
    setShowResults(true);
    setIsDeleting(false);

    // Clear React Query cache for deleted categories to prevent stale data
    const successfulCategories = Object.entries(newResults)
      .filter(([, result]) => result.success)
      .map(([categoryId]) => categoryId);

    if (successfulCategories.length > 0) {
      const CACHE_KEY_PREFIXES: Record<string, string[]> = {
        musicLibrary: ['music', 'track', 'album', 'playlist', 'song', 'explore'],
        personalBooks: ['book', 'entry', 'chapter', 'insight', 'reflection', 'library'],
        libraryBooks: ['library', 'book', 'entry'],
      };

      for (const [category, prefixes] of Object.entries(CACHE_KEY_PREFIXES)) {
        if (successfulCategories.includes(category)) {
          queryClient.removeQueries({
            predicate: query => {
              const key = query.queryKey[0] as string;
              return prefixes.some(p => key?.includes(p));
            },
          });
        }
      }

      if (successfulCategories.includes('uploads') || successfulCategories.includes('nonSystemUsers')) {
        // Full cache clear for broad resets
        queryClient.clear();
      }

      // If users were deleted, logout the current user to prevent stale auth state
      // This ensures a clean redirect to welcome screen without double-render issues
      if (successfulCategories.includes('nonSystemUsers')) {
        await logout();
      }
    }
  };

  const handleClose = () => {
    // Only call onResetComplete if there were successful resets AND the user wasn't deleted
    // When nonSystemUsers is deleted, we've already logged out - no need to navigate again
    // This prevents double-render of Welcome screen (Welcome → AuthGate → Welcome)
    const hasSuccessfulReset = showResults && Object.values(results).some(r => r.success);
    const userWasDeleted = results['nonSystemUsers']?.success === true;

    if (hasSuccessfulReset && !userWasDeleted) {
      onResetComplete();
    }
    setSelectedOptions(new Set());
    setResults({});
    setShowResults(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="warning" size={24} color={colors.status.needsAttention} />
            </View>
            <Text style={styles.title}>{t('admin.devReset.title')}</Text>
            <Text style={styles.subtitle}>{t('admin.devReset.description')}</Text>
          </View>

          {!showResults ? (
            <>
              <View style={styles.selectActions}>
                <TouchableOpacity onPress={selectAll} style={styles.selectAction}>
                  <Text style={styles.selectActionText}>{t('admin.devReset.selectAll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deselectAll} style={styles.selectAction}>
                  <Text style={styles.selectActionText}>{t('admin.devReset.deselectAll')}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.optionsList}>
                {RESET_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.optionItem,
                      selectedOptions.has(option.id) && styles.optionItemSelected,
                      option.dangerous && styles.optionItemDangerous,
                    ]}
                    onPress={() => toggleOption(option.id)}
                    disabled={isDeleting}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: `${option.color}20` }]}>
                      <Ionicons name={option.icon} size={20} color={option.color} />
                    </View>
                    <View style={styles.optionContent}>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                      <Text style={styles.optionDescription}>{option.description}</Text>
                    </View>
                    <Switch
                      value={selectedOptions.has(option.id)}
                      onValueChange={() => toggleOption(option.id)}
                      trackColor={{ false: colors.background.secondary, true: option.color }}
                      thumbColor={colors.absolute.white}
                      disabled={isDeleting}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleClose} disabled={isDeleting}>
                  <Text style={styles.cancelButtonText}>{t('admin.devReset.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteButton, selectedOptions.size === 0 && styles.deleteButtonDisabled]}
                  onPress={handleReset}
                  disabled={selectedOptions.size === 0 || isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator color={colors.absolute.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={18} color={colors.absolute.white} />
                      <Text style={styles.deleteButtonText}>
                        Delete {selectedOptions.size > 0 ? `(${selectedOptions.size})` : ''}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <ScrollView style={styles.resultsList}>
                <Text style={styles.resultsTitle}>{t('admin.devReset.resetResults')}</Text>
                {Object.entries(results).map(([optionId, result]) => {
                  const option = RESET_OPTIONS.find(o => o.id === optionId);
                  return (
                    <View key={optionId} style={styles.resultItem}>
                      <Ionicons
                        name={result.success ? 'checkmark-circle' : 'close-circle'}
                        size={20}
                        color={result.success ? colors.semantic.success : colors.semantic.error}
                      />
                      <View style={styles.resultContent}>
                        <Text style={styles.resultLabel}>{option?.label}</Text>
                        <Text style={[styles.resultMessage, !result.success && styles.resultMessageError]}>
                          {typeof result.message === 'string' ? result.message : JSON.stringify(result.message)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                  <Text style={styles.doneButtonText}>{t('admin.devReset.done')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[70],
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modal: {
      width: '100%',
      maxWidth: 400,
      maxHeight: '80%',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    header: {
      padding: 20,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    headerIcon: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    title: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.title3,
      color: colors.absolute.white,
      marginBottom: 8,
    },
    subtitle: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.footnote,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
    selectActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    selectAction: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    selectActionText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.footnote,
      color: colors.brand.primary,
    },
    optionsList: {
      maxHeight: 300,
    },
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
      gap: 12,
    },
    optionItemSelected: {
      backgroundColor: colors.background.subtle,
    },
    optionItemDangerous: {
      borderLeftWidth: 3,
      borderLeftColor: colors.semantic.error,
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionContent: {
      flex: 1,
    },
    optionLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.callout,
      color: colors.absolute.white,
      marginBottom: 2,
    },
    optionDescription: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.caption1,
      color: colors.text.tertiary,
    },
    footer: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.background.subtle,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.callout,
      color: colors.text.secondary,
    },
    deleteButton: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.semantic.error,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    deleteButtonDisabled: {
      backgroundColor: colors.background.secondary,
    },
    deleteButtonText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.absolute.white,
    },
    resultsList: {
      padding: 16,
      maxHeight: 300,
    },
    resultsTitle: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.headline,
      color: colors.absolute.white,
      marginBottom: 16,
    },
    resultItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    resultContent: {
      flex: 1,
    },
    resultLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.callout,
      color: colors.absolute.white,
      marginBottom: 2,
    },
    resultMessage: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.caption1,
      color: colors.text.tertiary,
    },
    resultMessageError: {
      color: colors.semantic.error,
    },
    doneButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
    },
    doneButtonText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.absolute.white,
    },
  });
