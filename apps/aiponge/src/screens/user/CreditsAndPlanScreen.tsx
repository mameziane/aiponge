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
import { CreditStoreTab, GiftCreditsTab } from '../../components/commerce/CreditsAndPlan';
import { SendGiftModal } from '../../components/commerce/SendGiftModal';

export default function CreditsAndPlanScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string }>();

  const getInitialTab = () => {
    if (params.tab === 'store') return 'store';
    if (params.tab === 'history' || params.tab === 'giftCredits') return 'giftCredits';
    return 'plan';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [refreshing, setRefreshing] = useState(false);
  const [sendGiftModalVisible, setSendGiftModalVisible] = useState(false);

  const TABS: TabConfig[] = useMemo(
    () => [
      { id: 'plan', label: t('creditsAndPlan.myPlan') },
      { id: 'store', label: t('creditsAndPlan.getCredits') },
      { id: 'giftCredits', label: t('creditsAndPlan.giftCredits') },
    ],
    [t]
  );

  const handleTabChange = useCallback((tab: string) => {
    const validTabs = ['plan', 'store', 'giftCredits'];
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
        {activeTab === 'giftCredits' && <GiftCreditsTab onOpenSendGift={() => setSendGiftModalVisible(true)} />}
      </ScrollView>

      <SendGiftModal visible={sendGiftModalVisible} onClose={() => setSendGiftModalVisible(false)} />
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
