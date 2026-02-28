import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { SUPPORTED_LANGUAGES } from '../../i18n/types';

export interface LanguageFilterOption {
  code: string;
  name: string;
}

const DEFAULT_LANGUAGE_OPTIONS: LanguageFilterOption[] = SUPPORTED_LANGUAGES.map(lang => ({
  code: lang.code.split('-')[0],
  name: lang.nativeLabel,
}));

interface LanguageFilterRowProps {
  selectedLanguage: string;
  onSelectLanguage: (language: string) => void;
  languages?: LanguageFilterOption[];
  testIdPrefix?: string;
}

export function LanguageFilterRow({
  selectedLanguage,
  onSelectLanguage,
  languages = DEFAULT_LANGUAGE_OPTIONS,
  testIdPrefix = 'language',
}: LanguageFilterRowProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={[styles.chip, !selectedLanguage && styles.chipActive]}
          onPress={() => onSelectLanguage('')}
          activeOpacity={0.7}
          testID={`${testIdPrefix}-all`}
          accessibilityRole="button"
          accessibilityLabel={t('components.sharedLibrary.allLanguages') || 'All'}
          accessibilityState={{ selected: !selectedLanguage }}
        >
          <Ionicons
            name="globe-outline"
            size={14}
            color={!selectedLanguage ? colors.text.primary : colors.text.tertiary}
            style={styles.globeIcon}
          />
          <Text style={[styles.chipText, !selectedLanguage && styles.chipTextActive]}>
            {t('components.sharedLibrary.allLanguages') || 'All'}
          </Text>
        </TouchableOpacity>
        {languages.map(lang => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.chip, selectedLanguage === lang.code && styles.chipActive]}
            onPress={() => onSelectLanguage(lang.code)}
            activeOpacity={0.7}
            testID={`${testIdPrefix}-${lang.code}`}
            accessibilityRole="button"
            accessibilityLabel={lang.name}
            accessibilityState={{ selected: selectedLanguage === lang.code }}
          >
            <Text style={[styles.chipText, selectedLanguage === lang.code && styles.chipTextActive]}>{lang.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      paddingBottom: 4,
    },
    content: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    chipActive: {
      backgroundColor: colors.brand.secondary,
      borderColor: colors.brand.secondary,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    chipTextActive: {
      color: colors.text.primary,
    },
    globeIcon: {
      marginRight: 4,
    },
  });
