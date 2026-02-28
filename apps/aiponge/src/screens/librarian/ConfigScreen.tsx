import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useThemeColors, commonStyles, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { LibrarianSubTabBar } from '../../components/admin/LibrarianDashboard/LibrarianSubTabBar';
import { AdminPromptsSection } from '../../components/admin/AdminDashboard/AdminPromptsSection';
import { AdminTemplatesSection } from '../../components/admin/AdminDashboard/AdminTemplatesSection';
import { LibrarianDefaultsSection } from '../../components/admin/LibrarianDashboard/LibrarianDefaultsSection';

type SubTab = 'prompts' | 'templates' | 'defaults';

export default function LibrarianConfigScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<SubTab>('prompts');

  const subTabs = useMemo(
    () => [
      { id: 'prompts', label: t('librarian.config.subtabs.prompts') },
      { id: 'templates', label: t('librarian.config.subtabs.templates') },
      { id: 'defaults', label: t('librarian.config.subtabs.defaults') },
    ],
    [t]
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as SubTab);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container}>
      <LibrarianSubTabBar tabs={subTabs} activeTab={activeTab} onTabChange={handleTabChange} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        {activeTab === 'prompts' && <AdminPromptsSection key={`prompts-${refreshKey}`} />}
        {activeTab === 'templates' && <AdminTemplatesSection key={`templates-${refreshKey}`} />}
        {activeTab === 'defaults' && <LibrarianDefaultsSection key={`defaults-${refreshKey}`} />}
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
      gap: 16,
    },
  });
