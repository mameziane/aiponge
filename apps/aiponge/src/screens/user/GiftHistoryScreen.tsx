/**
 * GiftHistoryScreen - Display sent and received credit gifts
 */

import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { useCreditGifts, CreditGift } from '../../hooks/commerce/useCreditGifts';
import { SendGiftModal } from '../../components/commerce/SendGiftModal';
import { LiquidGlassCard, LiquidGlassView } from '../../components/ui';
import { LoadingState } from '../../components/shared/LoadingState';
import { EmptyState } from '../../components/shared/EmptyState';

type TabType = 'sent' | 'received';

export default function GiftHistoryScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('sent');
  const [sendModalVisible, setSendModalVisible] = useState(false);

  const { sentGifts, receivedGifts, pendingReceivedGifts, isLoading, refetch, claimGift, isClaiming } =
    useCreditGifts();

  const gifts = activeTab === 'sent' ? sentGifts : receivedGifts;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: CreditGift['status']) => {
    switch (status) {
      case 'pending':
        return colors.semantic.warning;
      case 'claimed':
        return colors.semantic.success;
      case 'expired':
        return colors.text.tertiary;
      default:
        return colors.text.secondary;
    }
  };

  const getStatusLabel = (status: CreditGift['status']) => {
    switch (status) {
      case 'pending':
        return t('credits.gifts.pending');
      case 'claimed':
        return t('credits.gifts.claimed');
      case 'expired':
        return t('credits.gifts.expired');
      default:
        return status;
    }
  };

  const renderGiftItem = ({ item }: { item: CreditGift }) => {
    const isSent = activeTab === 'sent';
    const canClaim = !isSent && item.status === 'pending';

    return (
      <LiquidGlassCard style={styles.giftCard} testID={`card-gift-${item.id}`}>
        <View style={styles.giftHeader}>
          <View style={styles.giftIcon}>
            <Ionicons
              name={isSent ? 'arrow-up-circle' : 'arrow-down-circle'}
              size={28}
              color={isSent ? colors.semantic.error : colors.semantic.success}
            />
          </View>
          <View style={styles.giftInfo}>
            <Text style={styles.giftTitle}>
              {isSent
                ? t('credits.gifts.giftTo', { email: item.recipientEmail })
                : t('credits.gifts.giftFrom', { name: item.senderName || 'Unknown' })}
            </Text>
            <Text style={styles.giftDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={styles.giftAmount}>
            <Text style={styles.giftAmountValue}>{item.creditsAmount}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>

        {item.message ? (
          <View style={styles.messageContainer}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.text.tertiary} />
            <Text style={styles.messageText} numberOfLines={2}>
              {item.message}
            </Text>
          </View>
        ) : null}

        {canClaim && item.claimToken ? (
          <TouchableOpacity
            style={styles.claimButton}
            onPress={() => claimGift(item.claimToken!)}
            disabled={isClaiming}
            testID={`button-claim-${item.id}`}
          >
            {isClaiming ? (
              <ActivityIndicator color={colors.absolute.white} size="small" />
            ) : (
              <>
                <Ionicons name="gift" size={18} color={colors.absolute.white} />
                <Text style={styles.claimButtonText}>{t('credits.gifts.claimNow')}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </LiquidGlassCard>
    );
  };

  const renderEmptyList = () => (
    <EmptyState
      icon="gift-outline"
      title={activeTab === 'sent' ? t('credits.gifts.noSentGifts') : t('credits.gifts.noReceivedGifts')}
      description=""
      action={
        activeTab === 'sent'
          ? {
              label: t('credits.gifts.sendGift'),
              onPress: () => setSendModalVisible(true),
              testID: 'button-send-first-gift',
            }
          : undefined
      }
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} testID="button-back">
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('credits.gifts.title')}</Text>
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => setSendModalVisible(true)}
          testID="button-open-send-gift"
        >
          <Ionicons name="add-circle" size={28} color={colors.brand.primary} />
        </TouchableOpacity>
      </View>

      {pendingReceivedGifts.length > 0 ? (
        <LiquidGlassView intensity="medium" borderRadius={12} style={styles.pendingBanner}>
          <Ionicons name="gift" size={20} color={colors.brand.primary} />
          <Text style={styles.pendingText}>
            {pendingReceivedGifts.length} {t('credits.gifts.pending').toLowerCase()} gift
            {pendingReceivedGifts.length > 1 ? 's' : ''}
          </Text>
        </LiquidGlassView>
      ) : null}

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setActiveTab('sent')}
          testID="tab-sent"
        >
          <Ionicons
            name="arrow-up-circle-outline"
            size={18}
            color={activeTab === 'sent' ? colors.brand.primary : colors.text.tertiary}
          />
          <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
            {t('credits.gifts.sentGifts')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setActiveTab('received')}
          testID="tab-received"
        >
          <Ionicons
            name="arrow-down-circle-outline"
            size={18}
            color={activeTab === 'received' ? colors.brand.primary : colors.text.tertiary}
          />
          <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
            {t('credits.gifts.receivedGifts')}
          </Text>
          {pendingReceivedGifts.length > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingReceivedGifts.length}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={gifts}
          keyExtractor={item => item.id}
          renderItem={renderGiftItem}
          ListEmptyComponent={renderEmptyList}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.brand.primary} />}
        />
      )}

      <SendGiftModal visible={sendModalVisible} onClose={() => setSendModalVisible(false)} />
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    sendButton: {
      padding: 8,
    },
    pendingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 12,
    },
    pendingText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    tabContainer: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.md,
      padding: 4,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: colors.background.secondary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.tertiary,
    },
    tabTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    badge: {
      backgroundColor: colors.brand.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.absolute.white,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
      flexGrow: 1,
    },
    giftCard: {
      padding: 16,
      marginBottom: 12,
    },
    giftHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    giftIcon: {
      marginRight: 12,
    },
    giftInfo: {
      flex: 1,
    },
    giftTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    giftDate: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    giftAmount: {
      alignItems: 'flex-end',
    },
    giftAmountValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 4,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    messageContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    messageText: {
      flex: 1,
      fontSize: 13,
      color: colors.text.secondary,
      fontStyle: 'italic',
    },
    claimButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.brand.primary,
      paddingVertical: 12,
      borderRadius: 10,
      marginTop: 12,
    },
    claimButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.absolute.white,
    },
  });
