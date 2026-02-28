/**
 * Upgrade Prompt Component
 * Shows when users hit their usage limits
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { fontFamilies } from '../../theme/typography';
import { LiquidGlassView } from '../ui';
import { TIER_DISPLAY } from '../../constants/tierDisplayConfig';

interface UpgradePromptProps {
  visible: boolean;
  onClose: () => void;
  feature: string;
  currentUsage: number;
  limit: number;
}

export function UpgradePrompt({ visible, onClose, feature, currentUsage, limit }: UpgradePromptProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleUpgrade = () => {
    onClose();
    router.push('/paywall');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <LiquidGlassView intensity="strong" borderRadius={24} showBorder style={styles.modal}>
          <View style={styles.iconContainer}>
            <View style={styles.iconBackground}>
              <Ionicons name="settings-outline" size={40} color={colors.brand.purple[400]} />
            </View>
            <Text style={styles.title}>{t('components.upgradePrompt.title')}</Text>
          </View>

          <Text style={styles.description}>{t('components.upgradePrompt.description', { feature })}</Text>

          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>{t('components.upgradePrompt.plusIncludes')}</Text>
            <View style={styles.benefitsList}>
              {TIER_DISPLAY.personal.upgradeBenefits.map((benefit, idx) => (
                <BenefitRow key={idx} text={t(benefit.i18nKey)} />
              ))}
            </View>
          </View>

          <View style={styles.ethicsNote}>
            <Text style={styles.ethicsText}>{t('components.upgradePrompt.ethicsNote')}</Text>
          </View>

          <TouchableOpacity onPress={handleUpgrade} style={styles.upgradeButton} data-testid="button-upgrade-now">
            <LinearGradient
              colors={colors.gradients.primaryReverse}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.upgradeButtonGradient}
            >
              <Text style={styles.upgradeButtonText}>{t('subscription.seePlusOptions')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.cancelButton} data-testid="button-cancel-upgrade">
            <Text style={styles.cancelButtonText}>{t('subscription.continueWithFree')}</Text>
          </TouchableOpacity>
        </LiquidGlassView>
      </View>
    </Modal>
  );
}

function BenefitRow({ text }: { text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.benefitRow}>
      <Ionicons name="checkmark-circle" size={18} color={colors.brand.purple[400]} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    modal: {
      padding: 24,
      width: '100%',
      maxWidth: 400,
      overflow: 'hidden',
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    iconBackground: {
      backgroundColor: colors.overlay.purple[30],
      borderRadius: 50,
      padding: 16,
      marginBottom: 12,
    },
    title: {
      color: colors.text.primary,
      fontSize: 24,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      textAlign: 'center',
    },
    description: {
      color: colors.text.gray[300],
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 24,
      fontFamily: fontFamilies.body.regular,
    },
    benefitsCard: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      marginBottom: 16,
    },
    benefitsTitle: {
      color: colors.text.primary,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
      marginBottom: 12,
    },
    benefitsList: {
      gap: 8,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    benefitText: {
      color: colors.text.gray[300],
      marginLeft: 8,
      fontFamily: fontFamilies.body.regular,
    },
    ethicsNote: {
      backgroundColor: colors.overlay.purple[8],
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.overlay.purple[30],
    },
    ethicsText: {
      color: colors.text.gray[400],
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.body.regular,
    },
    upgradeButton: {
      marginBottom: 12,
      borderRadius: 50,
      overflow: 'hidden',
    },
    upgradeButtonGradient: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    upgradeButtonText: {
      color: colors.absolute.white,
      fontWeight: 'bold',
      textAlign: 'center',
      fontSize: 18,
      fontFamily: fontFamilies.body.bold,
    },
    cancelButton: {
      paddingVertical: 12,
    },
    cancelButtonText: {
      color: colors.text.gray[400],
      textAlign: 'center',
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
    },
  });
