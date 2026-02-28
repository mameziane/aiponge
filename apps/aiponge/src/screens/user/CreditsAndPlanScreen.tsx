/**
 * Credits & Plan Screen - Unified account management
 * Combines subscription, credit purchases, and transaction history
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme, commonStyles } from '../../theme';
import { TabBar, type TabConfig } from '../../components/shared/TabBar';
import { SubscriptionTab } from '../../components/commerce/SubscriptionTabScreen';
import { CreditStoreTab, CreditHistoryTab } from '../../components/commerce/CreditsAndPlan';

export default function CreditsAndPlanScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string }>();

  const getInitialTab = () => {
    if (params.tab === 'store') return 'store';
    if (params.tab === 'history') return 'history';
    return 'plan';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [refreshing, setRefreshing] = useState(false);

  const TABS: TabConfig[] = useMemo(
    () => [
      { id: 'plan', label: t('creditsAndPlan.myPlan'), icon: 'star-outline' },
      { id: 'store', label: t('creditsAndPlan.getCredits'), icon: 'add-circle-outline' },
      { id: 'history', label: t('creditsAndPlan.history'), icon: 'time-outline' },
    ],
    [t]
  );

  const handleTabChange = useCallback((tab: string) => {
    const validTabs = ['plan', 'store', 'history'];
    setActiveTab(validTabs.includes(tab) ? tab : 'plan');
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.tabBarContainer}>
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} testIDPrefix="credits-plan-tab" />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
            progressBackgroundColor={colors.background.darkCard}
          />
        }
      >
        {activeTab === 'plan' && <SubscriptionTab />}
        {activeTab === 'store' && <CreditStoreTab />}
        {activeTab === 'history' && <CreditHistoryTab />}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainerDark,
      backgroundColor: colors.background.primary,
    },
    tabBarContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    scrollView: commonStyles.flexOne,
    content: {
      flexGrow: 1,
    },
  });
