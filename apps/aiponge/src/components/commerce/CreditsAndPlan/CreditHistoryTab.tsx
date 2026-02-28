/**
 * Credit History Tab - Balance and transaction history
 * Extracted from AccountCreditsScreen for unified Credits & Plan screen
 */

import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from '@/i18n';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { apiClient } from '@/lib/axiosApiClient';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { useAuthStore, selectUserId } from '@/auth/store';
import { logger } from '@/lib/logger';
import { LiquidGlassCard } from '../../ui';
import { LoadingState } from '../../shared';
import { useCredits } from '@/hooks/commerce/useCredits';
import type { IconName } from '@/types/ui.types';

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

export function CreditHistoryTab() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = useAuthStore(selectUserId);
  const { creditCostPerSong } = useCredits();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 10;

  const creditsToSongs = (credits: number): number => {
    if (creditCostPerSong === null || creditCostPerSong === 0) return 0;
    return Math.floor(credits / creditCostPerSong);
  };

  const formatSongCount = (credits: number): string => {
    const songs = creditsToSongs(credits);
    return songs === 1 ? '1 song' : `${songs} songs`;
  };

  const fetchData = async () => {
    if (!userId) return;
    try {
      setLoading(true);
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
    }
  };

  useEffect(() => {
    fetchData();
  }, [page]);

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

  if (loading) {
    return <LoadingState />;
  }

  const startingBalance = balance ? balance.currentBalance + balance.totalSpent : 0;

  return (
    <View style={styles.container}>
      {balance && (
        <>
          <LiquidGlassCard intensity="medium" style={styles.balanceCard} padding={24}>
            <Text style={styles.balanceLabel}>{t('credits.songsAvailable')}</Text>
            <Text style={styles.balanceAmount}>{formatSongCount(balance.currentBalance)}</Text>

            <View style={styles.balanceDetails}>
              <View style={styles.balanceDetailItem}>
                <Text style={styles.balanceDetailLabel}>{t('credits.purchased')}</Text>
                <Text style={styles.balanceDetailValue}>{formatSongCount(startingBalance)}</Text>
              </View>
              <View style={styles.balanceDetailDivider} />
              <View style={styles.balanceDetailItem}>
                <Text style={styles.balanceDetailLabel}>{t('credits.used')}</Text>
                <Text style={[styles.balanceDetailValue, styles.spentText]}>{formatSongCount(balance.totalSpent)}</Text>
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

          <TouchableOpacity style={styles.giftButton} onPress={() => router.push('/gift-history' as Href)}>
            <LiquidGlassCard intensity="medium" padding={16}>
              <View style={styles.giftRow}>
                <Ionicons name="gift" size={24} color={colors.brand.primary} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.giftTitle}>{t('credits.gifts.title')}</Text>
                  <Text style={styles.giftSubtitle}>{t('credits.gifts.sendGift')}</Text>
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
                <Text style={[styles.transactionAmount, { color: getTransactionColor(transaction.type) }]}>
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
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={hasPrevPage ? colors.brand.primary : colors.text.tertiary}
                  />
                </TouchableOpacity>
                <Text style={styles.paginationInfo}>
                  {page + 1} / {Math.ceil(totalTransactions / ITEMS_PER_PAGE)}
                </Text>
                <TouchableOpacity
                  style={[styles.paginationButton, !hasNextPage && styles.paginationButtonDisabled]}
                  onPress={() => setPage(p => p + 1)}
                  disabled={!hasNextPage}
                >
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
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    balanceCard: {
      marginBottom: 16,
    },
    balanceLabel: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    balanceAmount: {
      fontSize: 36,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginBottom: 16,
    },
    balanceDetails: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    balanceDetailItem: {
      alignItems: 'center',
    },
    balanceDetailLabel: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: 4,
    },
    balanceDetailValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    balanceDetailDivider: {
      width: 1,
      backgroundColor: colors.border.primary,
    },
    spentText: {
      color: colors.semantic.error,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 193, 7, 0.1)',
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 16,
    },
    warningText: {
      fontSize: 13,
      color: colors.semantic.warning,
      marginLeft: 8,
      flex: 1,
    },
    giftButton: {
      marginBottom: 20,
    },
    giftRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    giftTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    giftSubtitle: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyStateText: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginTop: 12,
    },
    transactionsList: {
      overflow: 'hidden',
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    transactionItemLast: {
      borderBottomWidth: 0,
    },
    transactionIcon: {
      width: 40,
      alignItems: 'center',
    },
    transactionDetails: {
      flex: 1,
      marginLeft: 12,
    },
    transactionDescription: {
      fontSize: 14,
      color: colors.text.primary,
      marginBottom: 2,
    },
    transactionDate: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    transactionAmount: {
      fontSize: 14,
      fontWeight: '600',
    },
    pagination: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    paginationButton: {
      padding: 8,
    },
    paginationButtonDisabled: {
      opacity: 0.5,
    },
    paginationInfo: {
      fontSize: 14,
      color: colors.text.secondary,
    },
  });
