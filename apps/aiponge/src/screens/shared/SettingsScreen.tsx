import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsMenuItem } from '../../components/shared/SettingsMenuItem';
import { useThemeColors, useThemeMode, type ColorScheme, type ThemeMode } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { LiquidGlassCard } from '../../components/ui';
import { useIsAdmin } from '../../hooks/admin/useAdminQuery';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { TIER_IDS } from '@aiponge/shared-contracts';

const THEME_OPTIONS: { mode: ThemeMode; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { mode: 'light', icon: 'sunny-outline', label: 'settingsPage.themeLight' },
  { mode: 'dark', icon: 'moon-outline', label: 'settingsPage.themeDark' },
  { mode: 'system', icon: 'phone-portrait-outline', label: 'settingsPage.themeSystem' },
];

export function SettingsScreen() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const { currentTier } = useSubscriptionData();
  const colors = useThemeColors();
  const { mode, setMode } = useThemeMode();
  const isProfessionalTier = currentTier === TIER_IDS.PRACTICE || currentTier === TIER_IDS.STUDIO;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const menuItems = [
    {
      icon: 'person-circle-outline' as const,
      label: t('settingsPage.signUpOrLogin'),
      route: '/auth',
      testId: 'menu-item-auth',
    },
    {
      icon: 'people-outline' as const,
      label: t('settingsPage.yourAudience'),
      route: '/creator-dashboard',
      testId: 'menu-item-creator-dashboard',
    },
    ...(isProfessionalTier
      ? [
          {
            icon: 'business-outline' as const,
            label: t('settingsPage.organization'),
            route: '/organization',
            testId: 'menu-item-organization',
          },
        ]
      : []),
    {
      icon: 'language-outline' as const,
      label: t('settingsPage.language'),
      route: '/language',
      testId: 'menu-item-language',
    },
    {
      icon: 'sparkles-outline' as const,
      label: t('settingsPage.ethicsValues'),
      route: '/ethics',
      testId: 'menu-item-ethics',
    },
    {
      icon: 'help-circle-outline' as const,
      label: t('settingsPage.help'),
      route: '/help',
      testId: 'menu-item-help',
    },
    {
      icon: 'shield-checkmark-outline' as const,
      label: t('settingsPage.consent'),
      route: '/consent',
      testId: 'menu-item-consent',
    },
    {
      icon: 'warning-outline' as const,
      label: t('settingsPage.explicitContent'),
      route: '/explicit-content',
      testId: 'menu-item-explicit-content',
    },
  ];

  const adminMenuItems = isAdmin
    ? [
        {
          icon: 'shield-checkmark' as const,
          label: t('admin.adminDashboard'),
          route: '/admin',
          testId: 'menu-item-admin',
        },
      ]
    : [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="settings-page">
          {adminMenuItems.map((item, index) => (
            <SettingsMenuItem
              key={`admin-${index}`}
              icon={item.icon}
              label={item.label}
              onPress={() => router.push(item.route as Href)}
              testId={item.testId}
            />
          ))}
          {menuItems.map((item, index) => (
            <SettingsMenuItem
              key={index}
              icon={item.icon}
              label={item.label}
              onPress={() => router.push(item.route as Href)}
              testId={item.testId}
            />
          ))}

          <LiquidGlassCard intensity="medium" padding={16} style={styles.themeSection} testID="theme-selector">
            <View style={styles.themeLabelRow}>
              <View style={styles.themeIconContainer}>
                <Ionicons name="color-palette-outline" size={24} color={colors.brand.primary} />
              </View>
              <Text style={styles.themeLabel}>{t('settingsPage.appearance')}</Text>
            </View>
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
          </LiquidGlassCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
    },
    content: {
      flex: 1,
    },
    themeSection: {
      marginBottom: 12,
    },
    themeLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    themeIconContainer: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    themeLabel: {
      fontSize: 16,
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
      backgroundColor: colors.background.subtle,
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
