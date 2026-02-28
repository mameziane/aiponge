import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { AdminOverviewSection } from './AdminOverviewSection';
import { AdminServicesSection } from './AdminServicesSection';
import { AdminAlertsSection } from './AdminAlertsSection';
import { SectionHeader, createSharedStyles } from './shared';

type SystemSubTab = 'health' | 'performance' | 'alerts';

export function AdminSystemSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<SystemSubTab>('health');

  return (
    <>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'health' && styles.subTabActive]}
          onPress={() => setSubTab('health')}
        >
          <Ionicons
            name="pulse-outline"
            size={16}
            color={subTab === 'health' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'health' && styles.subTabTextActive]}>
            {t('admin.system.health')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'performance' && styles.subTabActive]}
          onPress={() => setSubTab('performance')}
        >
          <Ionicons
            name="speedometer-outline"
            size={16}
            color={subTab === 'performance' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'performance' && styles.subTabTextActive]}>
            {t('admin.system.performance')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'alerts' && styles.subTabActive]}
          onPress={() => setSubTab('alerts')}
        >
          <Ionicons
            name="notifications-outline"
            size={16}
            color={subTab === 'alerts' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'alerts' && styles.subTabTextActive]}>
            {t('admin.system.alerts')}
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'health' && (
        <>
          <AdminOverviewSection />
          <AdminServicesSection />
        </>
      )}

      {subTab === 'performance' && (
        <View style={sharedStyles.section}>
          <SectionHeader title={t('admin.system.performanceMonitoring')} icon="speedometer-outline" />
          <View style={styles.comingSoon}>
            <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
            <Text style={styles.comingSoonText}>
              Performance forecasting, capacity planning, and anomaly detection will be available here.
            </Text>
            <View style={styles.plannedFeatures}>
              <Text style={styles.featureItem}>• Trend charts (hourly/daily/weekly)</Text>
              <Text style={styles.featureItem}>• Capacity forecasting</Text>
              <Text style={styles.featureItem}>• Anomaly detection alerts</Text>
              <Text style={styles.featureItem}>• Bottleneck identification</Text>
            </View>
          </View>
        </View>
      )}

      {subTab === 'alerts' && <AdminAlertsSection />}
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
  });
