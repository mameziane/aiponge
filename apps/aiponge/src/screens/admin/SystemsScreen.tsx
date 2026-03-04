import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, type ColorScheme } from '../../theme';
import { TabBar } from '../../components/shared/TabBar';
import { AdminPromptsSection } from '../../components/admin/AdminDashboard/AdminPromptsSection';
import { AdminFrameworksSection } from '../../components/admin/AdminDashboard/AdminFrameworksSection';
import { LibrarianDefaultsSection } from '../../components/admin/LibrarianDashboard/LibrarianDefaultsSection';

type SubTab = 'prompts' | 'frameworks' | 'settings';

const SUB_TABS = [
  { id: 'prompts', label: 'admin.tabs.prompts' },
  { id: 'frameworks', label: 'admin.tabs.frameworks' },
  { id: 'settings', label: 'admin.tabs.settings' },
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
      <TabBar
        tabs={SUB_TABS.map(tab => ({ ...tab, label: t(tab.label) }))}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        testIDPrefix="admin-subtab"
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        {activeTab === 'prompts' && <AdminPromptsSection key={`prompts-${refreshKey}`} />}
        {activeTab === 'frameworks' && <AdminFrameworksSection key={`frameworks-${refreshKey}`} />}
        {activeTab === 'settings' && <LibrarianDefaultsSection key={`settings-${refreshKey}`} />}
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
  });
