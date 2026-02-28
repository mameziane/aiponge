/**
 * Credit Store Tab - Purchase song packs via RevenueCat
 * Extracted from CreditStoreScreen for use in unified Credits & Plan screen
 */

import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PurchasesStoreProduct } from 'react-native-purchases';
import { useTranslation } from '@/i18n';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { apiClient } from '@/lib/axiosApiClient';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { useAuthStore, selectUserId } from '@/auth/store';
import { useSubscriptionData, useSubscriptionActions } from '@/contexts/SubscriptionContext';
import { useCredits } from '@/hooks/commerce/useCredits';
import { logger } from '@/lib/logger';
import { LiquidGlassCard } from '../../ui';
import { LoadingState } from '../../shared';

interface CreditBalance {
  currentBalance: number;
  totalSpent: number;
}

export function CreditStoreTab() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = useAuthStore(selectUserId);
  const { creditsOffering, isLoading: subscriptionLoading } = useSubscriptionData();
  const { purchaseCredits } = useSubscriptionActions();
  const { creditCostPerSong } = useCredits();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);

  const WHITE = colors.absolute.white;
  const ACCENT = colors.brand.accent;
  const PRIMARY = colors.brand.primary;

  const revenueCatProducts = creditsOffering?.availablePackages.map(pkg => pkg.product) || [];

  const fetchData = async () => {
    try {
      setLoading(true);
      if (userId) {
        const balanceResponse =
          await apiClient.get<ServiceResponse<{ currentBalance: number; totalSpent: number }>>(
            '/api/v1/app/credits/balance'
          );
        if (balanceResponse.success && balanceResponse.data) {
          setBalance({
            currentBalance: balanceResponse.data.currentBalance,
            totalSpent: balanceResponse.data.totalSpent,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to fetch store data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePurchase = async (product: PurchasesStoreProduct) => {
    setPurchasing(product.identifier);
    try {
      const result = await purchaseCredits(product);
      if (result.success) {
        await fetchData();
      }
    } catch (error) {
      logger.error('Purchase failed', error);
    } finally {
      setPurchasing(null);
    }
  };

  const getCreditsFromProductId = (productId: string): number => {
    const match = productId.match(/credits_(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const renderProduct = (product: PurchasesStoreProduct) => {
    const credits = getCreditsFromProductId(product.identifier);
    const isPopular = product.identifier.includes('150');

    return (
      <View key={product.identifier} style={[styles.productCard, isPopular && styles.popularCard]}>
        {isPopular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>{t('creditStore.mostPopular')}</Text>
          </View>
        )}

        <View style={styles.productHeader}>
          <Text style={styles.productName}>{product.title}</Text>
          <Text style={styles.productPrice}>{product.priceString}</Text>
        </View>

        <Text style={styles.productDescription}>{product.description}</Text>

        {credits > 0 && creditCostPerSong !== null && creditCostPerSong > 0 && (
          <View style={styles.creditsRow}>
            <Ionicons name="musical-notes" size={16} color={ACCENT} />
            <Text style={styles.creditsText}>
              {t('creditStore.songCount', { count: Math.floor(credits / creditCostPerSong) })}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.purchaseButton,
            (purchasing === product.identifier || subscriptionLoading) && styles.purchaseButtonDisabled,
          ]}
          onPress={() => handlePurchase(product)}
          disabled={purchasing === product.identifier || subscriptionLoading}
        >
          {purchasing === product.identifier ? (
            <ActivityIndicator size="small" color={WHITE} />
          ) : (
            <>
              <Ionicons name="cart" size={18} color={WHITE} style={{ marginRight: 8 }} />
              <Text style={styles.purchaseButtonText}>{t('creditStore.purchase')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <View style={styles.container}>
      {balance && (
        <LiquidGlassCard intensity="medium" padding={20} elevated style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <Ionicons name="musical-notes" size={24} color={ACCENT} />
            <Text style={styles.balanceLabel}>{t('creditStore.songsAvailable')}</Text>
          </View>
          <Text style={styles.balanceAmount}>
            {creditCostPerSong !== null && creditCostPerSong > 0
              ? t('creditStore.songCount', { count: Math.floor(balance.currentBalance / creditCostPerSong) })
              : '—'}
          </Text>
        </LiquidGlassCard>
      )}

      <View style={styles.productsContainer}>
        <Text style={styles.sectionTitle}>{t('creditStore.songPacks')}</Text>
        <Text style={styles.sectionSubtitle}>{t('creditStore.songPacksDescription')}</Text>

        {revenueCatProducts.length > 0 ? (
          revenueCatProducts.map(product => renderProduct(product))
        ) : subscriptionLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="small" color={PRIMARY} />
            <Text style={styles.emptyStateText}>{t('creditStore.loadingProducts')}</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyStateText}>{t('creditStore.noProductsAvailable')}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('creditStore.securePayments')}</Text>
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
      marginBottom: 20,
    },
    balanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    balanceLabel: {
      fontSize: 14,
      color: colors.text.secondary,
      marginLeft: 8,
    },
    balanceAmount: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.text.primary,
    },
    productsContainer: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 16,
    },
    productCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    popularCard: {
      borderColor: colors.brand.primary,
      borderWidth: 2,
    },
    popularBadge: {
      position: 'absolute',
      top: -10,
      right: 16,
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.md,
    },
    popularBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    productHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    productName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    productPrice: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.brand.primary,
    },
    productDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 12,
    },
    creditsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    creditsText: {
      fontSize: 14,
      color: colors.brand.accent,
      marginLeft: 6,
      fontWeight: '500',
    },
    purchaseButton: {
      backgroundColor: colors.brand.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
    },
    purchaseButtonDisabled: {
      opacity: 0.6,
    },
    purchaseButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyStateText: {
      fontSize: 14,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 12,
    },
    footer: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    footerText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
  });
