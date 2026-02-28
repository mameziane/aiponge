/**
 * Guest Conversion Prompt Modal
 * Strategic prompts to convert guest users to registered users
 */

import React, { useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import type { IconName } from '../../types/ui.types';

interface GuestConversionPromptProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  triggerAction: string;
}

export function GuestConversionPrompt({ visible, onClose, title, message, triggerAction }: GuestConversionPromptProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSignUp = () => {
    onClose();
    router.push('/(auth)/register');
  };

  const handleContinueAsGuest = () => {
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.iconContainer}>
            <Ionicons name="star" size={48} color={colors.brand.primary} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.benefits}>
            <BenefitItem icon="save-outline" text={t('components.guestConversion.saveMusicEntries')} />
            <BenefitItem icon="cloud-outline" text={t('components.guestConversion.syncAcrossDevices')} />
            <BenefitItem icon="gift-outline" text={t('components.guestConversion.freeTierSongs')} />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSignUp}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('components.guestConversion.createFreeAccount')}
          >
            <Text style={styles.primaryButtonText}>{t('components.guestConversion.createFreeAccount')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleContinueAsGuest}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('components.guestConversion.maybeLater')}
          >
            <Text style={styles.secondaryButtonText}>{t('components.guestConversion.maybeLater')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function BenefitItem({ icon, text }: { icon: IconName; text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.benefitItem}>
      <Ionicons name={icon} size={20} color={colors.brand.primary} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modal: {
      backgroundColor: colors.background.primary,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.brand.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 12,
    },
    message: {
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    benefits: {
      width: '100%',
      gap: 12,
      marginBottom: 24,
    },
    benefitItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    benefitText: {
      fontSize: 15,
      color: colors.text.primary,
    },
    primaryButton: {
      width: '100%',
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      width: '100%',
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.text.secondary,
      fontSize: 15,
    },
  });
