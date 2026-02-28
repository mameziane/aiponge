import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { AdminPromptsSection } from './AdminPromptsSection';
import { AdminTemplatesSection } from './AdminTemplatesSection';
import { AdminFrameworksSection } from './AdminFrameworksSection';
import { SectionHeader, createSharedStyles } from './shared';
import { useTranslation } from 'react-i18next';

type ConfigSubTab = 'prompts' | 'templates' | 'frameworks' | 'settings';

export function AdminConfigSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<ConfigSubTab>('prompts');
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'prompts' && styles.subTabActive]}
          onPress={() => setSubTab('prompts')}
        >
          <Ionicons
            name="document-text-outline"
            size={16}
            color={subTab === 'prompts' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'prompts' && styles.subTabTextActive]}>
            {t('admin.tabs.prompts')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'templates' && styles.subTabActive]}
          onPress={() => setSubTab('templates')}
        >
          <Ionicons
            name="albums-outline"
            size={16}
            color={subTab === 'templates' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'templates' && styles.subTabTextActive]}>
            {t('admin.tabs.templates')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'frameworks' && styles.subTabActive]}
          onPress={() => setSubTab('frameworks')}
        >
          <Ionicons
            name="git-branch-outline"
            size={16}
            color={subTab === 'frameworks' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'frameworks' && styles.subTabTextActive]}>
            {t('admin.tabs.frameworks')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'settings' && styles.subTabActive]}
          onPress={() => setSubTab('settings')}
        >
          <Ionicons
            name="settings-outline"
            size={16}
            color={subTab === 'settings' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'settings' && styles.subTabTextActive]}>
            {t('admin.tabs.settings')}
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'prompts' && <AdminPromptsSection />}
      {subTab === 'templates' && <AdminTemplatesSection />}
      {subTab === 'frameworks' && <AdminFrameworksSection />}

      {subTab === 'settings' && (
        <View style={sharedStyles.section}>
          <SectionHeader title={t('admin.config.globalSettings')} icon="settings-outline" />
          <View style={styles.comingSoon}>
            <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
            <Text style={styles.comingSoonText}>{t('admin.systems.comingSoonSettings')}</Text>
            <View style={styles.plannedFeatures}>
              <Text style={styles.featureItem}>{`• ${t('admin.systems.plannedFeatures.musicGenParams')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.systems.plannedFeatures.riskThresholds')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.systems.plannedFeatures.featureFlags')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.systems.plannedFeatures.rateLimiting')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.systems.plannedFeatures.cacheDuration')}`}</Text>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    subTabBar: {
      flexDirection: 'row',
      gap: 4,
      marginBottom: 16,
      backgroundColor: colors.background.secondary,
      padding: 4,
      borderRadius: BORDER_RADIUS.sm,
    },
    subTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    subTabActive: {
      backgroundColor: colors.background.primary,
    },
    subTabText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    subTabTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    comingSoon: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      gap: 12,
    },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    comingSoonText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    plannedFeatures: {
      marginTop: 16,
      alignSelf: 'stretch',
      backgroundColor: colors.background.tertiary,
      padding: 16,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    featureItem: {
      fontSize: 13,
      color: colors.text.secondary,
    },
  });
