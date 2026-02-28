/**
 * SendGiftModal Component
 * Modal for sending credit gifts to other users
 */

import { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BaseModal } from '../shared/BaseModal';
import { useTranslation } from '../../i18n';
import { useThemeColors, commonStyles, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { useCreditGifts } from '../../hooks/commerce/useCreditGifts';
import { useCredits } from '../../hooks/commerce/useCredits';

const GIFT_AMOUNTS = [5, 10, 25, 50, 100];

interface SendGiftModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SendGiftModal({ visible, onClose }: SendGiftModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { sendGift, isSending } = useCreditGifts();
  const { balance } = useCredits();

  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const currentBalance = balance?.currentBalance || 0;
  const giftAmount = selectedAmount || parseInt(customAmount, 10) || 0;
  const hasEnoughCredits = currentBalance >= giftAmount && giftAmount > 0;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSend = async () => {
    setError('');

    if (!recipientEmail || !validateEmail(recipientEmail)) {
      setError(t('premium.invalidEmail'));
      return;
    }

    if (giftAmount <= 0) {
      setError(t('credits.gifts.amount'));
      return;
    }

    if (!hasEnoughCredits) {
      setError(t('credits.gifts.insufficientCredits'));
      return;
    }

    try {
      await sendGift({
        recipientEmail,
        creditsAmount: giftAmount,
        message: message || undefined,
      });
      handleClose();
    } catch (e) {
      setError(t('credits.gifts.sendFailed'));
    }
  };

  const handleClose = () => {
    setRecipientEmail('');
    setSelectedAmount(null);
    setCustomAmount('');
    setMessage('');
    setError('');
    onClose();
  };

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
    setError('');
  };

  const handleCustomAmountChange = (text: string) => {
    setCustomAmount(text.replace(/[^0-9]/g, ''));
    setSelectedAmount(null);
    setError('');
  };

  return (
    <BaseModal
      visible={visible}
      onClose={handleClose}
      title={t('credits.gifts.title')}
      headerIcon="gift"
      avoidKeyboard
      testID="modal-send-gift"
    >
      <View style={styles.container}>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>{t('credits.balance')}:</Text>
          <Text style={styles.balanceValue}>{currentBalance}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('credits.gifts.recipientEmail')}</Text>
          <TextInput
            style={styles.input}
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            placeholder={t('credits.gifts.recipientEmailPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="input-gift-email"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('credits.gifts.amount')}</Text>
          <View style={styles.amountGrid}>
            {GIFT_AMOUNTS.map(amount => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.amountButton,
                  selectedAmount === amount && styles.amountButtonSelected,
                  currentBalance < amount && styles.amountButtonDisabled,
                ]}
                onPress={() => handleAmountSelect(amount)}
                disabled={currentBalance < amount}
                testID={`button-amount-${amount}`}
              >
                <Text
                  style={[
                    styles.amountText,
                    selectedAmount === amount && styles.amountTextSelected,
                    currentBalance < amount && styles.amountTextDisabled,
                  ]}
                >
                  {amount}
                </Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.customAmountInput, customAmount && styles.customAmountInputActive]}
              value={customAmount}
              onChangeText={handleCustomAmountChange}
              placeholder="..."
              placeholderTextColor={colors.text.tertiary}
              keyboardType="number-pad"
              testID="input-custom-amount"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('credits.gifts.message')}</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder={t('credits.gifts.messagePlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            multiline
            numberOfLines={3}
            testID="input-gift-message"
          />
        </View>

        <Text style={styles.expiryNote}>
          <Ionicons name="time-outline" size={14} color={colors.text.tertiary} /> {t('credits.gifts.expiresIn')}
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color={colors.semantic.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.sendButton,
            (!hasEnoughCredits || !recipientEmail || giftAmount <= 0) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={isSending || !hasEnoughCredits || !recipientEmail || giftAmount <= 0}
          testID="button-send-gift"
        >
          {isSending ? (
            <ActivityIndicator color={colors.absolute.white} />
          ) : (
            <>
              <Ionicons name="gift" size={20} color={colors.absolute.white} />
              <Text style={styles.sendButtonText}>
                {t('credits.gifts.sendGift')} ({giftAmount})
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </BaseModal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      gap: 16,
    },
    balanceRow: {
      ...commonStyles.rowBetween,
      backgroundColor: colors.background.tertiary,
      padding: 12,
      borderRadius: 10,
    },
    balanceLabel: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    balanceValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    field: {
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    input: {
      backgroundColor: colors.background.tertiary,
      borderRadius: 10,
      padding: 14,
      fontSize: 16,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    messageInput: {
      height: 80,
      textAlignVertical: 'top',
    },
    amountGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    amountButton: {
      backgroundColor: colors.background.tertiary,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minWidth: 60,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    amountButtonSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    amountButtonDisabled: {
      opacity: 0.4,
    },
    amountText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    amountTextSelected: {
      color: colors.absolute.white,
    },
    amountTextDisabled: {
      color: colors.text.tertiary,
    },
    customAmountInput: {
      backgroundColor: colors.background.tertiary,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minWidth: 60,
      fontSize: 16,
      color: colors.text.primary,
      textAlign: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    customAmountInputActive: {
      borderColor: colors.brand.primary,
    },
    expiryNote: {
      fontSize: 12,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.semantic.error + '15',
      padding: 10,
      borderRadius: BORDER_RADIUS.sm,
    },
    errorText: {
      fontSize: 13,
      color: colors.semantic.error,
      flex: 1,
    },
    sendButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
  });
