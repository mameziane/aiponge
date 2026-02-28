import { View, ScrollView, StyleSheet, RefreshControl, Text } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { AdminSubTabBar } from '../../components/admin/AdminDashboard/AdminSubTabBar';
import { AdminPromptsSection } from '../../components/admin/AdminDashboard/AdminPromptsSection';
import { AdminTemplatesSection } from '../../components/admin/AdminDashboard/AdminTemplatesSection';
import { AdminFrameworksSection } from '../../components/admin/AdminDashboard/AdminFrameworksSection';
import { AdminProvidersSection } from '../../components/admin/AdminDashboard/AdminProvidersSection';

type SubTab = 'prompts' | 'templates' | 'frameworks' | 'settings' | 'providers';

const SUB_TABS = [
  { id: 'prompts', label: 'admin.tabs.prompts' },
  { id: 'templates', label: 'admin.tabs.templates' },
  { id: 'frameworks', label: 'admin.tabs.frameworks' },
  { id: 'settings', label: 'admin.tabs.settings' },
  { id: 'providers', label: 'admin.tabs.providers' },
];

const VALID_TABS = SUB_TABS.map(t => t.id);

export default function SystemsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<SubTab>('prompts');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (params.tab && VALID_TABS.includes(params.tab)) {
      setActiveTab(params.tab as SubTab);
    }
  }, [params.tab]);

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId as SubTab);
      router.replace(`/(admin)/systems?tab=${tabId}` as Href);
    },
    [router]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container}>
      <AdminSubTabBar
        tabs={SUB_TABS.map(tab => ({ ...tab, label: t(tab.label) }))}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        {activeTab === 'prompts' && <AdminPromptsSection key={`prompts-${refreshKey}`} />}
        {activeTab === 'templates' && <AdminTemplatesSection key={`templates-${refreshKey}`} />}
        {activeTab === 'frameworks' && <AdminFrameworksSection key={`frameworks-${refreshKey}`} />}
        {activeTab === 'settings' && (
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
        )}
        {activeTab === 'providers' && <AdminProvidersSection key={`providers-${refreshKey}`} />}
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
    content: commonStyles.flexOne,
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
    },
    comingSoon: {
      alignItems: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    comingSoonText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    plannedFeatures: {
      alignSelf: 'stretch',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
    },
    featureItem: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 8,
    },
  });
