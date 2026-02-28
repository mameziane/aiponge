/**
 * Admin Dashboard Screen
 * Overview tab with Dashboard and Providers sub-tabs.
 * Uses UnifiedHeader from layout (consistent with other admin tabs).
 */

import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, type ColorScheme } from '../../theme';
import { AdminDashboardSection } from '../../components/admin/AdminDashboard/AdminDashboardSection';
import { AdminProvidersSection } from '../../components/admin/AdminDashboard/AdminProvidersSection';
import { AdminSubTabBar } from '../../components/admin/AdminDashboard/AdminSubTabBar';
import { CONFIG } from '../../constants/appConfig';
import { useAdminCreateAction } from '../../contexts/AdminCreateContext';
import { CreateProviderModal } from '../../components/admin/CreateProviderModal';

type SubTab = 'dashboard' | 'providers';

const SUB_TABS = [
  { id: 'dashboard', label: 'admin.tabs.dashboard' },
  { id: 'providers', label: 'admin.tabs.providers' },
];

export default function DashboardScreen() {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateProvider, setShowCreateProvider] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { registerCreateAction } = useAdminCreateAction();

  useEffect(() => {
    if (activeSubTab === 'providers') {
      registerCreateAction({
        label: 'Add Provider',
        icon: 'add',
        onPress: () => setShowCreateProvider(true),
      });
    } else {
      registerCreateAction(null);
    }
    return () => {
      registerCreateAction(null);
    };
  }, [activeSubTab, registerCreateAction]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setRefreshing(false), CONFIG.ui.delays.refreshIndicatorMs);
  }, []);

  const handleSubTabChange = useCallback((tabId: string) => {
    setActiveSubTab(tabId as SubTab);
  }, []);

  return (
    <View style={styles.container}>
      <AdminSubTabBar
        tabs={SUB_TABS.map(tab => ({ ...tab, label: t(tab.label) }))}
        activeTab={activeSubTab}
        onTabChange={handleSubTabChange}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
          />
        }
      >
        {activeSubTab === 'dashboard' && <AdminDashboardSection key={`dashboard-${refreshKey}`} />}
        {activeSubTab === 'providers' && <AdminProvidersSection key={`providers-${refreshKey}`} />}
      </ScrollView>

      <CreateProviderModal visible={showCreateProvider} onClose={() => setShowCreateProvider(false)} />
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
