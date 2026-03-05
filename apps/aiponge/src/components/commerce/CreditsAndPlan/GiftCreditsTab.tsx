/**
 * Gift Credits Tab - Send/receive gift credits
 * Replaces the old CreditHistoryTab with a unified gift experience.
 * Eliminates deep navigation: tab → send button → modal, all in one place.
 */

import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { useCreditGifts, type CreditGift } from '@/hooks/commerce/useCreditGifts';
import { SendGiftModal } from '../SendGiftModal';
import { LiquidGlassCard, LiquidGlassView } from '../../ui';
import { LoadingState } from '../../shared/LoadingState';
import { EmptyState } from '../../shared/EmptyState';
import { TabBar } from '../../shared/TabBar';

type GiftTabType = 'sent' | 'received';

export function GiftCreditsTab() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeGiftTab, setActiveGiftTab] = useState<GiftTabType>('sent');
  const [sendModalVisible, setSendModalVisible] = useState(false);

  const { sentGifts, receivedGifts, pendingReceivedGifts, isLoading, refetch, claimGift, isClaiming } =
    useCreditGifts();

  const gifts = activeGiftTab === 'sent' ? sentGifts : receivedGifts;

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
    const isSent = activeGiftTab === 'sent';
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
      title={activeGiftTab === 'sent' ? t('credits.gifts.noSentGifts') : t('credits.gifts.noReceivedGifts')}
      description=""
      action={
        activeGiftTab === 'sent'
          ? {
              label: t('credits.gifts.sendGift'),
              onPress: () => setSendModalVisible(true),
              testID: 'button-send-first-gift',
            }
          : undefined
      }
    />
  );

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <View style={styles.container}>
      {/* Send Gift CTA — prominent, always visible */}
      <TouchableOpacity
        style={styles.sendGiftButton}
        onPress={() => setSendModalVisible(true)}
        testID="button-open-send-gift"
        activeOpacity={0.8}
      >
        <Ionicons name="gift" size={22} color={colors.absolute.white} />
        <Text style={styles.sendGiftButtonText}>{t('credits.gifts.sendGift')}</Text>
      </TouchableOpacity>

      {/* Pending received gifts banner */}
      {pendingReceivedGifts.length > 0 && (
        <LiquidGlassView intensity="medium" borderRadius={12} style={styles.pendingBanner}>
          <Ionicons name="gift" size={20} color={colors.brand.primary} />
          <Text style={styles.pendingText}>
            {pendingReceivedGifts.length} {t('credits.gifts.pending').toLowerCase()} gift
            {pendingReceivedGifts.length > 1 ? 's' : ''}
          </Text>
        </LiquidGlassView>
      )}

      {/* Sent / Received sub-tabs */}
      <View style={styles.tabBarWrapper}>
        <TabBar
          tabs={[
            { id: 'sent', label: t('credits.gifts.sentGifts') },
            {
              id: 'received',
              label: t('credits.gifts.receivedGifts'),
              badge: pendingReceivedGifts.length || undefined,
            },
          ]}
          activeTab={activeGiftTab}
          onTabChange={id => setActiveGiftTab(id as GiftTabType)}
          testIDPrefix="gift-tab"
        />
      </View>

      {/* Gift history list */}
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

      <SendGiftModal visible={sendModalVisible} onClose={() => setSendModalVisible(false)} />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    sendGiftButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: 16,
    },
    sendGiftButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    pendingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
      padding: 12,
    },
    pendingText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    tabBarWrapper: {
      marginBottom: 12,
    },
    listContent: {
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
