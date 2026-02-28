/**
 * Account Credits Page - Display credit balance and transaction history
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { apiClient } from '../../lib/axiosApiClient';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { useAuthStore, selectUserId } from '../../auth/store';
import { logger } from '../../lib/logger';
import { LiquidGlassCard } from '../../components/ui';
import type { IconName } from '../../types/ui.types';
import { useCredits } from '../../hooks/commerce/useCredits';

interface CreditBalance {
  userId: string;
  currentBalance: number;
  totalSpent: number;
  remaining: number;
}

interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'deduction' | 'refund' | 'purchase' | 'bonus';
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface OpenAITestResult {
  imageGeneration: {
    available: boolean;
    error?: string;
  };
  textGeneration: {
    available: boolean;
    error?: string;
  };
}

export default function AccountCreditsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const userId = useAuthStore(selectUserId);
  const { creditCostPerSong } = useCredits();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const [openaiTestResult, setOpenaiTestResult] = useState<OpenAITestResult | null>(null);
  const [testingOpenai, setTestingOpenai] = useState(false);

  const creditsToSongs = (credits: number): number => {
    if (creditCostPerSong === null || creditCostPerSong === 0) return 0;
    return Math.floor(credits / creditCostPerSong);
  };

  const formatSongCount = (credits: number): string => {
    const songs = creditsToSongs(credits);
    return songs === 1 ? '1 song' : `${songs} songs`;
  };

  const fetchData = async (showRefreshing = false) => {
    if (!userId) return;

    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [balanceResponse, transactionsResponse] = await Promise.all([
        apiClient.get<ServiceResponse<CreditBalance>>('/api/v1/app/credits/balance'),
        apiClient.get<ServiceResponse<{ transactions: CreditTransaction[]; total: number }>>(
          `/api/v1/app/credits/transactions?limit=${ITEMS_PER_PAGE}&offset=${page * ITEMS_PER_PAGE}`
        ),
      ]);

      if (balanceResponse.success && balanceResponse.data) {
        setBalance(balanceResponse.data);
      }

      if (transactionsResponse.success && transactionsResponse.data) {
        setTransactions(transactionsResponse.data.transactions);
        setTotalTransactions(transactionsResponse.data.total);
      }
    } catch (error) {
      logger.error('Failed to fetch credit data', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  const onRefresh = () => {
    setPage(0);
    fetchData(true);
  };

  const testOpenAICredits = async () => {
    setTestingOpenai(true);
    try {
      const response = await apiClient.get<ServiceResponse<OpenAITestResult>>('/api/v1/app/test-openai-credits');
      if (response.success && response.data) {
        setOpenaiTestResult(response.data);
      }
    } catch (error) {
      logger.error('Failed to test OpenAI credits', error);
      setOpenaiTestResult({
        imageGeneration: { available: false, error: 'Test failed' },
        textGeneration: { available: false, error: 'Test failed' },
      });
    } finally {
      setTestingOpenai(false);
    }
  };

  const getTransactionIcon = (type: string): IconName => {
    switch (type) {
      case 'deduction':
        return 'remove-circle';
      case 'refund':
        return 'arrow-undo-circle';
      case 'purchase':
        return 'add-circle';
      case 'bonus':
        return 'gift';
      default:
        return 'help-circle';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'deduction':
        return colors.semantic.error;
      case 'refund':
      case 'purchase':
      case 'bonus':
        return colors.semantic.success;
      default:
        return colors.text.tertiary;
    }
  };

  const formatAmount = (amount: number, type: string) => {
    const sign = type === 'deduction' ? '-' : '+';
    const songs = creditsToSongs(Math.abs(amount));
    return `${sign}${songs} ${songs === 1 ? 'song' : 'songs'}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const hasNextPage = (page + 1) * ITEMS_PER_PAGE < totalTransactions;
  const hasPrevPage = page > 0;

  if (loading && !refreshing) {
    return <LoadingState />;
  }

  const startingBalance = balance ? balance.currentBalance + balance.totalSpent : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="cloud" size={20} color={colors.brand.primary} />
          <Text style={styles.sectionHeaderTitle}>{t('credits.externalProviderStatus')}</Text>
        </View>
        <Text style={styles.sectionHeaderSubtitle}>{t('credits.externalProviderDescription')}</Text>

        <LiquidGlassCard intensity="medium" style={styles.musicapiCard} padding={16}>
          <View style={styles.providerHeader}>
            <View style={styles.providerTitleRow}>
              <Ionicons name="musical-note" size={20} color={colors.brand.primary} />
              <Text style={styles.providerTitle}>{t('credits.musicApiTitle')}</Text>
            </View>
            <View style={styles.creditsBadge}>
              <Text style={styles.creditsAmount}>2,079</Text>
              <Text style={styles.creditsLabel}>{t('credits.creditsLabel')}</Text>
            </View>
          </View>
          <Text style={styles.providerDescription}>{t('credits.musicApiDescription')}</Text>
          <View style={styles.usageInfo}>
            <Ionicons name="information-circle-outline" size={14} color={colors.text.tertiary} />
            <Text style={styles.usageInfoText}>{t('credits.generationUsage')}</Text>
          </View>
        </LiquidGlassCard>

        <LiquidGlassCard intensity="medium" style={styles.openaiTestCard} padding={16}>
          <View style={styles.openaiTestHeader}>
            <Text style={styles.openaiTestTitle}>{t('credits.openaiApiTitle')}</Text>
            <TouchableOpacity
              style={styles.testButton}
              onPress={testOpenAICredits}
              disabled={testingOpenai}
              testID="button-test-openai"
            >
              {testingOpenai ? (
                <ActivityIndicator size="small" color={colors.brand.primary} />
              ) : (
                <>
                  <Ionicons name="flask" size={16} color={colors.brand.primary} />
                  <Text style={styles.testButtonText}>{t('credits.test')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {openaiTestResult && (
            <View style={styles.testResults}>
              <View style={styles.testResultItem}>
                <View style={styles.testResultLabel}>
                  <Ionicons name="image" size={16} color={colors.text.tertiary} />
                  <Text style={styles.testResultText}>{t('credits.imageGeneration')}</Text>
                </View>
                <View style={styles.testResultStatus}>
                  {openaiTestResult.imageGeneration.available ? (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={colors.semantic.success} />
                      <Text style={[styles.statusText, styles.statusSuccess]}>{t('credits.available')}</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={20} color={colors.semantic.error} />
                      <Text style={[styles.statusText, styles.statusError]}>{t('credits.unavailable')}</Text>
                    </>
                  )}
                </View>
                {openaiTestResult.imageGeneration.error && (
                  <Text style={styles.errorText}>{openaiTestResult.imageGeneration.error}</Text>
                )}
              </View>

              <View style={styles.testResultDivider} />

              <View style={styles.testResultItem}>
                <View style={styles.testResultLabel}>
                  <Ionicons name="musical-notes" size={16} color={colors.text.tertiary} />
                  <Text style={styles.testResultText}>{t('credits.textGeneration')}</Text>
                </View>
                <View style={styles.testResultStatus}>
                  {openaiTestResult.textGeneration.available ? (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={colors.semantic.success} />
                      <Text style={[styles.statusText, styles.statusSuccess]}>{t('credits.available')}</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={20} color={colors.semantic.error} />
                      <Text style={[styles.statusText, styles.statusError]}>{t('credits.unavailable')}</Text>
                    </>
                  )}
                </View>
                {openaiTestResult.textGeneration.error && (
                  <Text style={styles.errorText}>{openaiTestResult.textGeneration.error}</Text>
                )}
              </View>
            </View>
          )}

          {!openaiTestResult && !testingOpenai && (
            <Text style={styles.testPrompt}>{t('credits.testOpenaiPrompt')}</Text>
          )}
        </LiquidGlassCard>

        <View style={styles.sectionDivider} />

        {balance && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet" size={20} color={colors.brand.primary} />
              <Text style={styles.sectionHeaderTitle}>{t('credits.aipongeCredits')}</Text>
            </View>
            <Text style={styles.sectionHeaderSubtitle}>{t('credits.aipongeCreditsSubtitle')}</Text>

            <LiquidGlassCard intensity="medium" style={styles.balanceCard} padding={24}>
              <Text style={styles.balanceLabel}>{t('credits.songsAvailable')}</Text>
              <Text style={styles.balanceAmount} testID="text-current-balance">
                {formatSongCount(balance.currentBalance)}
              </Text>

              <View style={styles.balanceDetails}>
                <View style={styles.balanceDetailItem}>
                  <Text style={styles.balanceDetailLabel}>{t('credits.purchased')}</Text>
                  <Text style={styles.balanceDetailValue} testID="text-starting-balance">
                    {formatSongCount(startingBalance)}
                  </Text>
                </View>
                <View style={styles.balanceDetailDivider} />
                <View style={styles.balanceDetailItem}>
                  <Text style={styles.balanceDetailLabel}>{t('credits.used')}</Text>
                  <Text style={[styles.balanceDetailValue, styles.spentText]} testID="text-spent">
                    {formatSongCount(balance.totalSpent)}
                  </Text>
                </View>
              </View>

              {!!creditCostPerSong && balance.currentBalance < creditCostPerSong && (
                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={20} color={colors.semantic.warning} />
                  <Text style={styles.warningText}>
                    {balance.currentBalance === 0 ? t('credits.noSongsRemaining') : t('credits.lowSongsWarning')}
                  </Text>
                </View>
              )}
            </LiquidGlassCard>

            <LiquidGlassCard intensity="light" style={styles.infoCard} padding={16}>
              <View style={styles.infoRow}>
                <Ionicons name="information-circle" size={20} color={colors.brand.primary} />
                <Text style={styles.infoText}>{t('credits.songGenerationCost')}</Text>
              </View>
            </LiquidGlassCard>

            <TouchableOpacity
              style={styles.giftCreditsButton}
              onPress={() => router.push('/gift-history' as Href)}
              testID="button-gift-credits"
            >
              <LiquidGlassCard intensity="medium" padding={16}>
                <View style={styles.giftCreditsRow}>
                  <View style={styles.giftCreditsLeft}>
                    <Ionicons name="gift" size={24} color={colors.brand.primary} />
                    <View>
                      <Text style={styles.giftCreditsTitle}>{t('credits.gifts.title')}</Text>
                      <Text style={styles.giftCreditsSubtitle}>{t('credits.gifts.sendGift')}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                </View>
              </LiquidGlassCard>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('credits.transactionHistory')}</Text>

          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyStateText}>{t('credits.noTransactions')}</Text>
            </View>
          ) : (
            <LiquidGlassCard intensity="medium" style={styles.transactionsList} padding={0}>
              {transactions.map((transaction, index) => (
                <View
                  key={transaction.id}
                  style={[styles.transactionItem, index === transactions.length - 1 && styles.transactionItemLast]}
                  testID={`transaction-item-${index}`}
                >
                  <View style={styles.transactionIcon}>
                    <Ionicons
                      name={getTransactionIcon(transaction.type)}
                      size={24}
                      color={getTransactionColor(transaction.type)}
                    />
                  </View>
                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionDescription}>{transaction.description}</Text>
                    <Text style={styles.transactionDate}>{formatDate(transaction.createdAt)}</Text>
                  </View>
                  <Text
                    style={[styles.transactionAmount, { color: getTransactionColor(transaction.type) }]}
                    testID={`transaction-amount-${index}`}
                  >
                    {formatAmount(transaction.amount, transaction.type)}
                  </Text>
                </View>
              ))}

              {(hasNextPage || hasPrevPage) && (
                <View style={styles.pagination}>
                  <TouchableOpacity
                    style={[styles.paginationButton, !hasPrevPage && styles.paginationButtonDisabled]}
                    onPress={() => setPage(p => Math.max(0, p - 1))}
                    disabled={!hasPrevPage}
                    testID="button-prev-page"
                  >
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={hasPrevPage ? colors.brand.primary : colors.text.tertiary}
                    />
                    <Text style={[styles.paginationButtonText, !hasPrevPage && styles.paginationButtonTextDisabled]}>
                      {t('common.previous')}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.paginationInfo}>
                    {t('credits.pageInfo', { current: page + 1, total: Math.ceil(totalTransactions / ITEMS_PER_PAGE) })}
                  </Text>

                  <TouchableOpacity
                    style={[styles.paginationButton, !hasNextPage && styles.paginationButtonDisabled]}
                    onPress={() => setPage(p => p + 1)}
                    disabled={!hasNextPage}
                    testID="button-next-page"
                  >
                    <Text style={[styles.paginationButtonText, !hasNextPage && styles.paginationButtonTextDisabled]}>
                      {t('common.next')}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={hasNextPage ? colors.brand.primary : colors.text.tertiary}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </LiquidGlassCard>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    scrollView: commonStyles.flexOne,
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
    },
    sectionHeaderTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.dark,
    },
    sectionHeaderSubtitle: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    sectionDivider: {
      height: 2,
      backgroundColor: colors.border.light,
      marginVertical: 24,
      marginHorizontal: 16,
    },
    musicapiCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: BORDER_RADIUS.md,
    },
    providerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    providerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    providerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.dark,
    },
    creditsBadge: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 12,
      backgroundColor: colors.semantic.successLight,
      borderRadius: BORDER_RADIUS.md,
    },
    creditsAmount: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.semantic.success,
    },
    creditsLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.semantic.success,
      opacity: 0.8,
    },
    providerDescription: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginBottom: 8,
      lineHeight: 18,
    },
    linkText: {
      color: colors.brand.primary,
      fontWeight: '500',
    },
    usageInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
    usageInfoText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    balanceCard: {
      margin: 16,
      borderRadius: BORDER_RADIUS.lg,
    },
    balanceLabel: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginBottom: 8,
    },
    balanceAmount: {
      fontSize: 36,
      fontWeight: '700',
      color: colors.brand.primary,
      marginBottom: 24,
    },
    balanceDetails: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 16,
    },
    balanceDetailItem: {
      alignItems: 'center',
      flex: 1,
    },
    balanceDetailLabel: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: 4,
    },
    balanceDetailValue: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.dark,
    },
    balanceDetailDivider: {
      width: 1,
      backgroundColor: colors.border.light,
      marginHorizontal: 12,
    },
    spentText: {
      color: colors.semantic.error,
    },
    remainingText: {
      color: colors.semantic.success,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.semantic.warningLight,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    warningText: {
      flex: 1,
      fontSize: 14,
      color: colors.semantic.warning,
    },
    infoCard: {
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: BORDER_RADIUS.md,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      color: colors.brand.primary,
    },
    section: {
      marginHorizontal: 16,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.dark,
      marginBottom: 12,
    },
    emptyState: {
      alignItems: 'center',
      padding: 48,
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.text.tertiary,
      marginTop: 12,
    },
    transactionsList: {
      borderRadius: BORDER_RADIUS.md,
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    transactionItemLast: {
      borderBottomWidth: 0,
    },
    transactionIcon: {
      marginRight: 12,
    },
    transactionDetails: {
      flex: 1,
    },
    transactionDescription: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.dark,
      marginBottom: 4,
    },
    transactionDate: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    transactionAmount: {
      fontSize: 16,
      fontWeight: '600',
    },
    pagination: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
    paginationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      padding: 8,
    },
    paginationButtonDisabled: {
      opacity: 0.4,
    },
    paginationButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.brand.primary,
    },
    paginationButtonTextDisabled: {
      color: colors.text.tertiary,
    },
    paginationInfo: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
    openaiTestCard: {
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: BORDER_RADIUS.md,
    },
    openaiTestHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    openaiTestTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.dark,
    },
    testButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.semantic.infoLight,
      borderRadius: BORDER_RADIUS.sm,
    },
    testButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.brand.primary,
    },
    testResults: {
      gap: 12,
    },
    testResultItem: {
      gap: 8,
    },
    testResultLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    testResultText: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
    testResultStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    testResultDivider: {
      height: 1,
      backgroundColor: colors.border.light,
      marginVertical: 4,
    },
    statusText: {
      fontSize: 14,
      fontWeight: '500',
    },
    statusSuccess: {
      color: colors.semantic.success,
    },
    statusError: {
      color: colors.semantic.error,
    },
    errorText: {
      fontSize: 12,
      color: colors.semantic.error,
      marginTop: 4,
    },
    testPrompt: {
      fontSize: 13,
      color: colors.text.tertiary,
      fontStyle: 'italic',
    },
    giftCreditsButton: {
      marginTop: 8,
    },
    giftCreditsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    giftCreditsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    giftCreditsTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    giftCreditsSubtitle: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginTop: 2,
    },
  });
