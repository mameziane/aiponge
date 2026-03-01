import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { useTranslation } from '@/i18n';
import { useLibrarianDefaults } from '@/hooks/admin/useLibrarianDefaults';
import type { LibrarianDefaults } from '@/types/librarianDefaults.types';
import { GENRE_KEYS } from '@/constants/musicPreferences';

export function LibrarianDefaultsSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const {
    defaults: backendDefaults,
    isLoading,
    isError,
    updateDefaultsAsync,
    isUpdating,
    resetDefaultsAsync,
    isResetting,
  } = useLibrarianDefaults();

  const [localDefaults, setLocalDefaults] = useState<LibrarianDefaults | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (backendDefaults && !localDefaults) {
      setLocalDefaults(backendDefaults);
    }
  }, [backendDefaults, localDefaults]);

  const updateMusicDefaults = useCallback(
    (key: keyof LibrarianDefaults['musicDefaults'], value: string | number | boolean) => {
      setLocalDefaults(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          musicDefaults: { ...prev.musicDefaults, [key]: value },
        };
      });
      setHasChanges(true);
    },
    []
  );

  const updateBookDefaults = useCallback((key: keyof LibrarianDefaults['bookDefaults'], value: string | number) => {
    setLocalDefaults(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        bookDefaults: { ...prev.bookDefaults, [key]: value },
      };
    });
    setHasChanges(true);
  }, []);

  const updateLocalizationDefaults = useCallback(
    (key: keyof LibrarianDefaults['localizationDefaults'], value: string[] | boolean | string) => {
      setLocalDefaults(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          localizationDefaults: { ...prev.localizationDefaults, [key]: value },
        };
      });
      setHasChanges(true);
    },
    []
  );

  const toggleLocale = useCallback((locale: string) => {
    setLocalDefaults(prev => {
      if (!prev) return prev;
      const current = prev.localizationDefaults.preferredLocales;
      const newLocales = current.includes(locale) ? current.filter(l => l !== locale) : [...current, locale];
      return {
        ...prev,
        localizationDefaults: { ...prev.localizationDefaults, preferredLocales: newLocales },
      };
    });
    setHasChanges(true);
  }, []);

  const toggleGenre = useCallback((genreKey: string) => {
    setLocalDefaults(prev => {
      if (!prev) return prev;
      const backendGenres = prev.availableOptions?.genres || [];
      const backendGenreMap = new Map(backendGenres.map(g => [g.key, g]));

      // Build complete genre list from GENRE_KEYS, toggling the specified one
      const updatedGenres = GENRE_KEYS.map(key => {
        const existing = backendGenreMap.get(key);
        const currentEnabled = existing?.enabled !== false;
        return {
          key,
          labelKey: `create.genres.${key}`,
          enabled: key === genreKey ? !currentEnabled : currentEnabled,
        };
      });

      return {
        ...prev,
        availableOptions: { ...prev.availableOptions, genres: updatedGenres },
      };
    });
    setHasChanges(true);
  }, []);

  const enableAllGenres = useCallback(() => {
    setLocalDefaults(prev => {
      if (!prev) return prev;
      // Build complete genre list from GENRE_KEYS, all enabled
      const updatedGenres = GENRE_KEYS.map(key => ({
        key,
        labelKey: `create.genres.${key}`,
        enabled: true,
      }));
      return {
        ...prev,
        availableOptions: { ...prev.availableOptions, genres: updatedGenres },
      };
    });
    setHasChanges(true);
  }, []);

  const genreOptions = useMemo(() => {
    if (!localDefaults) return [];
    const backendGenres = localDefaults.availableOptions?.genres || [];
    const backendGenreMap = new Map(backendGenres.map(g => [g.key, g]));

    return GENRE_KEYS.map(key => {
      const backendGenre = backendGenreMap.get(key);
      return {
        key,
        labelKey: `create.genres.${key}`,
        enabled: backendGenre?.enabled !== false,
      };
    });
  }, [localDefaults?.availableOptions?.genres, localDefaults]);

  const saveDefaults = async () => {
    if (!localDefaults) return;
    try {
      await updateDefaultsAsync(localDefaults);
      setHasChanges(false);
      Alert.alert(t('common.success'), t('librarian.config.defaultsSaved'));
    } catch (error) {
      Alert.alert(t('common.error'), t('librarian.config.defaultsSaveFailed'));
    }
  };

  const resetDefaults = () => {
    Alert.alert(t('common.confirm'), t('librarian.config.resetDefaultsConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.reset'),
        style: 'destructive',
        onPress: async () => {
          try {
            const resetData = await resetDefaultsAsync();
            setLocalDefaults(resetData as LibrarianDefaults);
            setHasChanges(false);
          } catch (error) {
            Alert.alert(t('common.error'), t('librarian.config.defaultsSaveFailed'));
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.brand.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (isError || !localDefaults) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.status.needsAttention} />
        <Text style={styles.errorText}>{t('common.error')}</Text>
      </View>
    );
  }

  const languageOptions = localDefaults.availableOptions?.targetLanguages || [];
  const culturalStyles = localDefaults.availableOptions?.culturalStyles || [];
  const durations = localDefaults.availableOptions?.durations || [];

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="musical-notes-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t('librarian.config.musicDefaults')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('librarian.config.defaultLanguageLabel')}</Text>
          <View style={styles.optionsRow}>
            {languageOptions.map(opt => (
              <TouchableOpacity
                key={opt.code}
                style={[
                  styles.optionButton,
                  localDefaults.musicDefaults.defaultLanguage === opt.code && styles.optionButtonActive,
                ]}
                onPress={() => updateMusicDefaults('defaultLanguage', opt.code)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    localDefaults.musicDefaults.defaultLanguage === opt.code && styles.optionButtonTextActive,
                  ]}
                >
                  {opt.nativeLabel || opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('librarian.config.defaultDurationLabel')}</Text>
          <View style={styles.optionsRow}>
            {durations.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionButton,
                  localDefaults.musicDefaults.defaultDuration === opt.value && styles.optionButtonActive,
                ]}
                onPress={() => updateMusicDefaults('defaultDuration', opt.value)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    localDefaults.musicDefaults.defaultDuration === opt.value && styles.optionButtonTextActive,
                  ]}
                >
                  {opt.labelKey ? t(opt.labelKey, { defaultValue: opt.label }) : opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('librarian.config.defaultCulturalStyleLabel')}</Text>
          <View style={styles.optionsGrid}>
            {culturalStyles.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.optionButton,
                  styles.optionButtonWide,
                  localDefaults.musicDefaults.defaultCulturalStyle === opt.key && styles.optionButtonActive,
                ]}
                onPress={() => updateMusicDefaults('defaultCulturalStyle', opt.key)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    localDefaults.musicDefaults.defaultCulturalStyle === opt.key && styles.optionButtonTextActive,
                  ]}
                >
                  {t(opt.labelKey, { defaultValue: opt.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => updateMusicDefaults('defaultInstrumental', !localDefaults.musicDefaults.defaultInstrumental)}
        >
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>{t('librarian.config.defaultInstrumentalLabel')}</Text>
            <Text style={styles.toggleDescription}>{t('librarian.config.defaultInstrumentalDescription')}</Text>
          </View>
          <View style={[styles.toggle, localDefaults.musicDefaults.defaultInstrumental && styles.toggleActive]}>
            {localDefaults.musicDefaults.defaultInstrumental && (
              <Ionicons name="checkmark" size={14} color={colors.absolute.white} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="disc-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t('librarian.config.genreOptions')}</Text>
          <TouchableOpacity style={styles.enableAllButton} onPress={enableAllGenres}>
            <Text style={styles.enableAllText}>{t('librarian.config.enableAll')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.fieldHint}>{t('librarian.config.genreOptionsHint')}</Text>
        <View style={styles.genreGrid}>
          {genreOptions.map(genre => (
            <TouchableOpacity
              key={genre.key}
              style={[styles.genreChip, genre.enabled !== false && styles.genreChipActive]}
              onPress={() => toggleGenre(genre.key)}
            >
              <Text style={[styles.genreChipText, genre.enabled !== false && styles.genreChipTextActive]}>
                {t(`create.genres.${genre.key}`) || genre.key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="book-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t('librarian.config.bookDefaults')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('librarian.config.defaultLanguageLabel')}</Text>
          <View style={styles.optionsRow}>
            {languageOptions.map(opt => (
              <TouchableOpacity
                key={opt.code}
                style={[
                  styles.optionButton,
                  localDefaults.bookDefaults.defaultLanguage === opt.code && styles.optionButtonActive,
                ]}
                onPress={() => updateBookDefaults('defaultLanguage', opt.code)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    localDefaults.bookDefaults.defaultLanguage === opt.code && styles.optionButtonTextActive,
                  ]}
                >
                  {opt.nativeLabel || opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('librarian.config.defaultChapterCountLabel')}</Text>
          <TextInput
            style={styles.input}
            value={String(localDefaults.bookDefaults.defaultChapterCount)}
            onChangeText={value => updateBookDefaults('defaultChapterCount', parseInt(value) || 5)}
            keyboardType="numeric"
            placeholder="5"
            placeholderTextColor={colors.text.tertiary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('librarian.config.defaultEntriesLabel')}</Text>
          <TextInput
            style={styles.input}
            value={String(localDefaults.bookDefaults.defaultEntriesPerChapter)}
            onChangeText={value => updateBookDefaults('defaultEntriesPerChapter', parseInt(value) || 10)}
            keyboardType="numeric"
            placeholder="10"
            placeholderTextColor={colors.text.tertiary}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="globe-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t('librarian.config.localizationDefaults')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('librarian.config.preferredLocalesLabel')}</Text>
          <Text style={styles.fieldHint}>{t('librarian.config.preferredLocalesHint')}</Text>
          <View style={styles.optionsGrid}>
            {languageOptions.map(opt => (
              <TouchableOpacity
                key={opt.code}
                style={[
                  styles.optionButton,
                  styles.optionButtonWide,
                  localDefaults.localizationDefaults.preferredLocales.includes(opt.code) && styles.optionButtonActive,
                ]}
                onPress={() => toggleLocale(opt.code)}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    localDefaults.localizationDefaults.preferredLocales.includes(opt.code) &&
                      styles.optionButtonTextActive,
                  ]}
                >
                  {opt.nativeLabel || opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => updateLocalizationDefaults('autoTranslate', !localDefaults.localizationDefaults.autoTranslate)}
        >
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>{t('librarian.config.autoTranslateLabel')}</Text>
            <Text style={styles.toggleDescription}>{t('librarian.config.autoTranslateDescription')}</Text>
          </View>
          <View style={[styles.toggle, localDefaults.localizationDefaults.autoTranslate && styles.toggleActive]}>
            {localDefaults.localizationDefaults.autoTranslate && (
              <Ionicons name="checkmark" size={14} color={colors.absolute.white} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.resetButton} onPress={resetDefaults} disabled={isResetting}>
          {isResetting ? (
            <ActivityIndicator size="small" color={colors.text.secondary} />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={18} color={colors.text.secondary} />
              <Text style={styles.resetButtonText}>{t('common.reset')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
          onPress={saveDefaults}
          disabled={!hasChanges || isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color={colors.absolute.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.absolute.white} />
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      gap: 24,
    },
    loadingContainer: {
      padding: 48,
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      color: colors.text.secondary,
      fontSize: 14,
    },
    errorText: {
      color: colors.text.secondary,
      fontSize: 14,
    },
    section: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      gap: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    field: {
      gap: 8,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
    fieldHint: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    optionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    optionButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
      flexGrow: 1,
      alignItems: 'center' as const,
    },
    optionButtonWide: {
      minWidth: '45%',
      flexGrow: 1,
    },
    optionButtonActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    optionButtonText: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    optionButtonTextActive: {
      color: colors.absolute.white,
      fontWeight: '500',
    },
    input: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      padding: 12,
      fontSize: 14,
      color: colors.text.primary,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    toggleInfo: {
      flex: 1,
      marginRight: 16,
    },
    toggleLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
    toggleDescription: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    toggle: {
      width: 24,
      height: 24,
      borderRadius: 6,
      backgroundColor: colors.background.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    resetButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    resetButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.brand.primary,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    enableAllButton: {
      marginLeft: 'auto',
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.background.primary,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    enableAllText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    genreGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
    },
    genreChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: colors.background.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
      flexGrow: 1,
      flexBasis: '30%',
      alignItems: 'center' as const,
    },
    genreChipActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    genreChipText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    genreChipTextActive: {
      color: colors.absolute.white,
      fontWeight: '500',
    },
  });
