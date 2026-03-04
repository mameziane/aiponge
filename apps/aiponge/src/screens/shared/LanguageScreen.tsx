import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { spacing } from '../../theme/spacing';
import { AVAILABLE_LANGUAGES, UPCOMING_LANGUAGES, type SupportedLanguage } from '../../i18n';

// NOTE: This screen is dead code — the /language route redirects to /preferences.
// Kept on disk for reference; safe to delete entirely in a future cleanup.
export function LanguageScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { i18n, t } = useTranslation();

  const currentLanguage = i18n.language as SupportedLanguage;

  // Language picker removed — app now follows device language.
  // This screen is dead code (route redirects to /preferences).
  const handleLanguageChange = (_language: SupportedLanguage) => {
    // No-op: language is controlled by the OS per-app setting
  };

  const unavailableLanguages = UPCOMING_LANGUAGES;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="language-page">
          {AVAILABLE_LANGUAGES.map(language => (
            <TouchableOpacity
              key={language.code}
              style={[styles.languageItem, currentLanguage === language.code && styles.selectedLanguageItem]}
              onPress={() => handleLanguageChange(language.code)}
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
