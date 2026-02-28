import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { SectionHeader, createSharedStyles } from './shared';
import { useTranslation } from 'react-i18next';

type ExperimentsSubTab = 'active' | 'archive';

export function AdminExperimentsSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<ExperimentsSubTab>('active');
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'active' && styles.subTabActive]}
          onPress={() => setSubTab('active')}
        >
          <Ionicons
            name="flask-outline"
            size={16}
            color={subTab === 'active' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'active' && styles.subTabTextActive]}>
            {t('admin.tabs.activeTests')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'archive' && styles.subTabActive]}
          onPress={() => setSubTab('archive')}
        >
          <Ionicons
            name="archive-outline"
            size={16}
            color={subTab === 'archive' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'archive' && styles.subTabTextActive]}>
            {t('admin.tabs.archive')}
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'active' && (
        <View style={sharedStyles.section}>
          <SectionHeader title={t('admin.experiments.activeExperiments')} icon="flask-outline" />
          <View style={styles.comingSoon}>
            <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
            <Text style={styles.comingSoonText}>{t('admin.experiments.comingSoonActive')}</Text>
            <View style={styles.plannedFeatures}>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedActiveFeatures.hypothesis')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedActiveFeatures.variants')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedActiveFeatures.metrics')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedActiveFeatures.significance')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedActiveFeatures.guardrails')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedActiveFeatures.rollout')}`}</Text>
            </View>
          </View>
          <View style={styles.noExperiments}>
            <Ionicons name="beaker-outline" size={32} color={colors.text.tertiary} />
            <Text style={styles.noExperimentsText}>{t('admin.experiments.noActiveExperiments')}</Text>
          </View>
        </View>
      )}

      {subTab === 'archive' && (
        <View style={sharedStyles.section}>
          <SectionHeader title={t('admin.experiments.experimentArchive')} icon="archive-outline" />
          <View style={styles.comingSoon}>
            <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
            <Text style={styles.comingSoonText}>{t('admin.experiments.comingSoonArchive')}</Text>
            <View style={styles.plannedFeatures}>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedArchiveFeatures.concluded')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedArchiveFeatures.outcome')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedArchiveFeatures.learnings')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.experiments.plannedArchiveFeatures.reports')}`}</Text>
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
      gap: 8,
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
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    subTabActive: {
      backgroundColor: colors.background.primary,
    },
    subTabText: {
      fontSize: 13,
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
    noExperiments: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 16,
      gap: 8,
    },
    noExperimentsText: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
  });
