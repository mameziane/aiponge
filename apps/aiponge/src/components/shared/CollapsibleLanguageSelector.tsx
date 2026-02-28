import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, BORDER_RADIUS, spacing, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleLanguageSelectorProps {
  selectedLanguages: string[];
  onLanguagesChange: (languages: string[]) => void;
  defaultLanguage?: string;
  initialExpanded?: boolean;
}

export function CollapsibleLanguageSelector({
  selectedLanguages,
  onLanguagesChange,
  defaultLanguage,
  initialExpanded = false,
}: CollapsibleLanguageSelectorProps) {
  const colors = useThemeColors();
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(initialExpanded);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const effectiveDefault = defaultLanguage || i18n.language || 'en-US';

  const effectiveSelected = useMemo(() => {
    if (selectedLanguages.length === 0) {
      return [effectiveDefault];
    }
    return selectedLanguages;
  }, [selectedLanguages, effectiveDefault]);

  const latestSelectedRef = useRef(effectiveSelected);
  latestSelectedRef.current = effectiveSelected;

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => !prev);
  }, []);

  const toggleLanguage = useCallback(
    (langCode: string) => {
      const current = latestSelectedRef.current;
      const isSelected = current.includes(langCode);

      let newLangs: string[];
      if (isSelected) {
        if (current.length <= 1) return;
        newLangs = current.filter(l => l !== langCode);
      } else {
        newLangs = [...current, langCode];
      }
      latestSelectedRef.current = newLangs;
      onLanguagesChange(newLangs);
    },
    [onLanguagesChange]
  );

  const selectAll = useCallback(() => {
    const allLangs = SUPPORTED_LANGUAGES.map(l => l.code);
    latestSelectedRef.current = allLangs;
    onLanguagesChange(allLangs);
  }, [onLanguagesChange]);

  const selectOnly = useCallback(
    (langCode: string) => {
      const onlyLang = [langCode];
      latestSelectedRef.current = onlyLang;
      onLanguagesChange(onlyLang);
    },
    [onLanguagesChange]
  );

  const selectedLabels = useMemo(() => {
    if (effectiveSelected.length === SUPPORTED_LANGUAGES.length) {
      return t('create.allLanguages');
    }
    return effectiveSelected
      .map(code => {
        const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
        return lang?.nativeLabel || code;
      })
      .join(', ');
  }, [effectiveSelected, t]);

  const isAllSelected = effectiveSelected.length === SUPPORTED_LANGUAGES.length;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpanded} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <Ionicons name="language-outline" size={18} color={colors.brand.primary} />
          <Text style={styles.headerTitle}>{t('create.outputLanguages')}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{effectiveSelected.length}</Text>
          </View>
          <Text style={styles.headerSummary} numberOfLines={1}>
            {selectedLabels}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          <Text style={styles.hint}>{t('create.outputLanguagesHint')}</Text>

          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickAction, isAllSelected && styles.quickActionActive]}
              onPress={selectAll}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickActionText, isAllSelected && styles.quickActionTextActive]}>
                {t('create.allLanguages')} ({SUPPORTED_LANGUAGES.length})
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chipsContainer}>
            {SUPPORTED_LANGUAGES.map(lang => {
              const isSelected = effectiveSelected.includes(lang.code);
              const isOnly = isSelected && effectiveSelected.length === 1;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleLanguage(lang.code)}
                  onLongPress={() => selectOnly(lang.code)}
                  activeOpacity={0.7}
                  disabled={isOnly}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color={colors.brand.primary} style={styles.chipIcon} />
                  )}
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{lang.nativeLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.darkCard,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.elementPadding,
      paddingVertical: spacing.componentGap,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      justifyContent: 'flex-end',
    },
    badge: {
      backgroundColor: colors.brand.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.absolute.white,
    },
    headerSummary: {
      fontSize: 12,
      color: colors.text.secondary,
      maxWidth: 120,
    },
    content: {
      paddingHorizontal: spacing.elementPadding,
      paddingBottom: spacing.elementPadding,
    },
    hint: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: spacing.componentGap,
      lineHeight: 16,
    },
    quickActions: {
      flexDirection: 'row',
      marginBottom: spacing.componentGap,
    },
    quickAction: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    quickActionActive: {
      borderColor: colors.brand.primary,
      backgroundColor: `${colors.brand.primary}15`,
    },
    quickActionText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    quickActionTextActive: {
      color: colors.brand.primary,
    },
    chipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.primary,
      backgroundColor: colors.background.primary,
    },
    chipSelected: {
      borderColor: colors.brand.primary,
      backgroundColor: `${colors.brand.primary}10`,
    },
    chipIcon: {
      marginRight: 4,
    },
    chipText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    chipTextSelected: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
  });
