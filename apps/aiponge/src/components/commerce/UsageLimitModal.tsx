import { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { LiquidGlassView } from '../ui';
import { USAGE_LIMIT_BENEFITS } from '../../constants/tierDisplayConfig';

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

interface UsageLimitModalProps {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  limitType?: 'songs' | 'lyrics' | 'insights';
  limit?: number;
  resetDate?: string;
}

export function UsageLimitModal({
  visible,
  onClose,
  onUpgrade,
  limitType = 'songs',
  limit = 2,
  resetDate,
}: UsageLimitModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const title = t(`components.usageLimitModal.titles.${limitType}`);
  const description = t(`components.usageLimitModal.descriptions.${limitType}`);

  const benefits = USAGE_LIMIT_BENEFITS.map(b => t(b.i18nKey));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <LiquidGlassView intensity="strong" borderRadius={20} showBorder style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed" size={32} color={colors.brand.primary} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>

          <View style={styles.limitInfo}>
            <View style={styles.limitBadge}>
              <Ionicons name="calendar-outline" size={16} color={colors.text.secondary} />
              <Text style={styles.limitText}>
                {t('components.usageLimitModal.freeLimitBadge', { limit, type: limitType })}
              </Text>
            </View>
            {resetDate && (
              <Text style={styles.resetText}>{t('components.usageLimitModal.limitResetsOn', { date: resetDate })}</Text>
            )}
          </View>

          <View style={styles.benefitsContainer}>
            <Text style={styles.benefitsTitle}>{t('components.usageLimitModal.plusIncludes')}</Text>
            {benefits.map((benefit, index) => (
              <View key={index} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.brand.primary} />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

          <View style={styles.ethicsNote}>
            <Text style={styles.ethicsText}>{t('components.upgradePrompt.ethicsNote')}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade} activeOpacity={0.8}>
              <Text style={styles.upgradeButtonText}>{t('subscription.seePlusOptions')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>{t('subscription.continueWithFree')}</Text>
            </TouchableOpacity>
          </View>
        </LiquidGlassView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[80],
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    modalContainer: {
      padding: spacing.xl,
      width: '100%',
      maxWidth: 400,
      overflow: 'hidden',
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.overlay.purple[15],
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    description: {
      fontSize: 15,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    limitInfo: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      alignItems: 'center',
    },
    limitBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    limitText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    resetText: {
      fontSize: 13,
      color: colors.text.tertiary,
    },
    benefitsContainer: {
      marginBottom: spacing.lg,
    },
    benefitsTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    benefitText: {
      fontSize: 14,
      color: colors.text.secondary,
      flex: 1,
    },
    ethicsNote: {
      backgroundColor: colors.overlay.purple[8],
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.overlay.purple[20],
    },
    ethicsText: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 20,
      textAlign: 'center',
    },
    actions: {
      gap: spacing.sm,
    },
    upgradeButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    upgradeButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: 'white',
    },
    cancelButton: {
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
  });
