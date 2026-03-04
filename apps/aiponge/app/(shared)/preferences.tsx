import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useThemeColors,
  useThemeMode,
  type ColorScheme,
  type ThemeMode,
  commonStyles,
  BORDER_RADIUS,
} from '../../src/theme';
import { spacing } from '../../src/theme/spacing';
import { useAuthStore, selectUserId } from '../../src/auth/store';
import { UnifiedSongPreferences } from '../../src/components/shared/UnifiedSongPreferences';
import type { IconName } from '../../src/types/ui.types';
import { LiquidGlassCard } from '../../src/components/ui/LiquidGlassCard';

const THEME_OPTIONS: { mode: ThemeMode; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { mode: 'light', icon: 'sunny-outline', label: 'settingsPage.themeLight' },
  { mode: 'dark', icon: 'moon-outline', label: 'settingsPage.themeDark' },
  { mode: 'system', icon: 'phone-portrait-outline', label: 'settingsPage.themeSystem' },
];

function CollapsibleSection({
  icon,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  colors,
  styles,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.sectionWrapper}>
      <LiquidGlassCard intensity={expanded ? 'medium' : 'light'} padding={0} borderRadius={12}>
        <TouchableOpacity style={[styles.card, expanded && styles.cardExpanded]} onPress={onToggle} activeOpacity={0.7}>
          <Ionicons name={icon} size={18} color={colors.brand.primary} />
          <Text style={styles.cardLabel} numberOfLines={1}>
            {!expanded && subtitle ? `${title} — ${subtitle}` : title}
          </Text>
        </TouchableOpacity>
        {expanded && <View style={styles.sectionContent}>{children}</View>}
      </LiquidGlassCard>
    </View>
  );
}

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { mode, setMode } = useThemeMode();
  const userId = useAuthStore(selectUserId);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const currentThemeLabel = THEME_OPTIONS.find(o => o.mode === mode);
  const themeSubtitle = currentThemeLabel ? t(currentThemeLabel.label) : '';

  const otherSettingsItems = [
    { icon: 'sparkles-outline' as const, label: t('settingsPage.ethicsValues'), route: '/ethics' },
    { icon: 'shield-checkmark-outline' as const, label: t('settingsPage.consent'), route: '/consent' },
    { icon: 'warning-outline' as const, label: t('settingsPage.explicitContent'), route: '/explicit-content' },
    { icon: 'help-circle-outline' as const, label: t('settingsPage.help'), route: '/help' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <CollapsibleSection
          icon="color-palette-outline"
          title={t('settingsPage.appearance')}
          subtitle={themeSubtitle}
          expanded={!!expandedSections.appearance}
          onToggle={() => toggleSection('appearance')}
          colors={colors}
          styles={styles}
        >
          <View style={styles.themeToggleRow}>
            {THEME_OPTIONS.map(option => {
              const isActive = mode === option.mode;
              return (
                <TouchableOpacity
                  key={option.mode}
                  style={[styles.themeOption, isActive && styles.themeOptionActive]}
                  onPress={() => setMode(option.mode)}
                  activeOpacity={0.7}
                  testID={`theme-option-${option.mode}`}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={isActive ? colors.brand.primary : colors.text.secondary}
                  />
                  <Text style={[styles.themeOptionText, isActive && styles.themeOptionTextActive]}>
                    {t(option.label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </CollapsibleSection>

        <CollapsibleSection
          icon="musical-notes-outline"
          title={t('create.songGeneration', { defaultValue: 'Song Generation' })}
          expanded={!!expandedSections.song}
          onToggle={() => toggleSection('song')}
          colors={colors}
          styles={styles}
        >
          <UnifiedSongPreferences userId={userId} mode="expanded" initialExpanded={true} showStyleSuggestions={true} />
        </CollapsibleSection>

        {otherSettingsItems.map((item, index) => (
          <LiquidGlassCard key={index} intensity="light" padding={0} borderRadius={12}>
            <TouchableOpacity style={styles.card} onPress={() => router.push(item.route as Href)} activeOpacity={0.7}>
              <Ionicons name={item.icon} size={18} color={colors.brand.primary} />
              <Text style={styles.cardLabel}>{item.label}</Text>
            </TouchableOpacity>
          </LiquidGlassCard>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    scrollView: commonStyles.flexOne,
    contentContainer: {
      paddingHorizontal: spacing.screenHorizontal,
      paddingBottom: 100,
      gap: 8,
    },
    sectionWrapper: {},
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 10,
    },
    cardExpanded: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    sectionContent: {
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    cardLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: colors.text.primary,
    },
    themeToggleRow: {
      flexDirection: 'row',
      gap: 8,
    },
    themeOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    themeOptionActive: {
      backgroundColor: colors.brand.primary + '20',
      borderColor: colors.brand.primary,
    },
    themeOptionText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    themeOptionTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
  });
