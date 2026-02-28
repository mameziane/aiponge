import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { spacing } from '../../theme/spacing';
import {
  AVAILABLE_LANGUAGES,
  UPCOMING_LANGUAGES,
  changeLanguage,
  reloadAppForRTL,
  type SupportedLanguage,
} from '../../i18n';
import { logger } from '../../lib/logger';

export function LanguageScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { i18n, t } = useTranslation();
  const [isChanging, setIsChanging] = useState(false);

  const currentLanguage = i18n.language as SupportedLanguage;

  const handleLanguageChange = async (language: SupportedLanguage) => {
    if (language === currentLanguage || isChanging) return;

    setIsChanging(true);
    try {
      const result = await changeLanguage(language);

      if (result.requiresReload) {
        Alert.alert(t('settings.restartRequired'), t('settings.restartMessage'), [
          { text: t('common.later'), style: 'cancel' },
          {
            text: t('common.restartNow'),
            onPress: () => reloadAppForRTL(),
          },
        ]);
      }
    } catch (error) {
      logger.error('[LanguageScreen] Failed to change language', error instanceof Error ? error : undefined, { error });
    } finally {
      setIsChanging(false);
    }
  };

  const unavailableLanguages = UPCOMING_LANGUAGES;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="language-page">
          {isChanging && (
            <ActivityIndicator size="small" color={colors.brand.primary} style={styles.loadingIndicator} />
          )}

          {AVAILABLE_LANGUAGES.map(language => (
            <TouchableOpacity
              key={language.code}
              style={[styles.languageItem, currentLanguage === language.code && styles.selectedLanguageItem]}
              onPress={() => handleLanguageChange(language.code)}
              disabled={isChanging}
              testID={`language-option-${language.code}`}
            >
              <View style={styles.languageInfo}>
                <Text style={[styles.languageName, currentLanguage === language.code && styles.selectedText]}>
                  {language.nativeLabel}
                </Text>
                <Text style={styles.nativeName}>{language.label}</Text>
              </View>
              {language.isRTL && (
                <View style={styles.rtlBadge}>
                  <Text style={styles.rtlBadgeText}>{t('languageScreen.rtl')}</Text>
                </View>
              )}
              {currentLanguage === language.code && (
                <Ionicons name="checkmark-circle" size={24} color={colors.brand.primary} />
              )}
            </TouchableOpacity>
          ))}

          {unavailableLanguages.length > 0 && (
            <View style={styles.comingSoonSection}>
              <Text style={styles.comingSoonTitle}>{t('settings.comingSoon')}</Text>
              {unavailableLanguages.map(language => (
                <View key={language.code} style={styles.unavailableItem}>
                  <Text style={styles.unavailableName}>{language.nativeLabel}</Text>
                  <Text style={styles.unavailableLabel}>{language.label}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.note}>{t('settings.languageNote')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    scrollView: commonStyles.flexOne,
    scrollContent: {
      paddingHorizontal: spacing.screenHorizontal,
      paddingBottom: 40,
    },
    content: {
      flex: 1,
    },
    loadingIndicator: {
      marginBottom: spacing.componentGap,
    },
    languageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.elementPadding,
      marginBottom: spacing.componentGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    selectedLanguageItem: {
      borderColor: colors.brand.primary,
      borderWidth: 2,
      backgroundColor: colors.background.subtle,
    },
    languageInfo: {
      flex: 1,
    },
    languageName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    selectedText: {
      color: colors.brand.primary,
    },
    nativeName: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
    rtlBadge: {
      backgroundColor: colors.background.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.xs,
      marginRight: 12,
    },
    rtlBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    note: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginTop: spacing.sectionGap,
      lineHeight: 20,
      textAlign: 'center',
    },
    comingSoonSection: {
      marginTop: spacing.sectionGap,
      paddingTop: spacing.sectionGap,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    comingSoonTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.tertiary,
      marginBottom: spacing.componentGap,
    },
    unavailableItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: spacing.elementPadding * 0.75,
      marginBottom: spacing.componentGap * 0.5,
      opacity: 0.5,
    },
    unavailableName: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
    unavailableLabel: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
  });
