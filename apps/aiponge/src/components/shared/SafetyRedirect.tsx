import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';
import type { RiskLevel } from '../../safety/riskAssessment';

interface SafetyRedirectProps {
  riskLevel: RiskLevel;
  onDismiss?: () => void;
  showResources?: boolean;
}

interface CrisisResource {
  name: string;
  number?: string;
  sms?: { number: string; body: string };
  url?: string;
  country?: string;
}

const CRISIS_HOTLINES: CrisisResource[] = [
  { name: 'National Suicide Prevention Lifeline', number: '988', country: 'US' },
  { name: 'Crisis Text Line', sms: { number: '741741', body: 'HOME' }, country: 'US' },
  { name: 'International Association for Suicide Prevention', url: 'https://www.iasp.info/resources/Crisis_Centres/' },
];

export const SafetyRedirect: React.FC<SafetyRedirectProps> = ({ riskLevel, onDismiss, showResources = true }) => {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleCallHotline = async (number: string): Promise<void> => {
    const phoneUrl = `tel:${number}`;
    const canOpen = await Linking.canOpenURL(phoneUrl);
    if (canOpen) {
      await Linking.openURL(phoneUrl);
    }
  };

  const handleSendSms = async (number: string, body: string): Promise<void> => {
    const smsUrl = `sms:${number}?body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(smsUrl);
    if (canOpen) {
      await Linking.openURL(smsUrl);
    }
  };

  const handleOpenUrl = async (url: string): Promise<void> => {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  const handleResourcePress = (hotline: CrisisResource): void => {
    if (hotline.url) {
      handleOpenUrl(hotline.url);
    } else if (hotline.sms) {
      handleSendSms(hotline.sms.number, hotline.sms.body);
    } else if (hotline.number) {
      handleCallHotline(hotline.number);
    }
  };

  const handleNavigateToHelp = (): void => {
    router.push('/(shared)/help' as Href);
    onDismiss?.();
  };

  if (riskLevel === 'none' || riskLevel === 'low') {
    return null;
  }

  const isCritical = riskLevel === 'critical' || riskLevel === 'high';

  return (
    <View style={[styles.container, isCritical && styles.criticalContainer]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, isCritical && styles.criticalIconContainer]}>
          <Ionicons
            name={isCritical ? 'heart' : 'hand-left-outline'}
            size={24}
            color={isCritical ? colors.status.needsAttention : colors.status.moderate}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{isCritical ? t('safety.wereHereForYou') : t('safety.takeAMoment')}</Text>
          <Text style={styles.subtitle}>{isCritical ? t('safety.wellbeingMatters') : t('safety.thingsTough')}</Text>
        </View>
      </View>

      {showResources && (
        <View style={styles.resourcesSection}>
          <Text style={styles.resourcesTitle}>{t('safety.immediateSupport')}</Text>
          {CRISIS_HOTLINES.map((hotline, index) => (
            <TouchableOpacity
              key={index}
              style={styles.resourceItem}
              onPress={() => handleResourcePress(hotline)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={hotline.url ? 'globe-outline' : hotline.sms ? 'chatbubble-outline' : 'call-outline'}
                size={20}
                color={colors.brand.primary}
              />
              <View style={styles.resourceTextContainer}>
                <Text style={styles.resourceName}>{hotline.name}</Text>
                <Text style={styles.resourceNumber}>
                  {hotline.url
                    ? t('safety.findLocalResources')
                    : hotline.sms
                      ? t('safety.textTo', { body: hotline.sms.body, number: hotline.sms.number })
                      : hotline.number}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.helpButton} onPress={handleNavigateToHelp} activeOpacity={0.7}>
          <Text style={styles.helpButtonText}>{t('safety.moreResources')}</Text>
        </TouchableOpacity>
        {onDismiss && riskLevel !== 'critical' && (
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.dismissButtonText}>{t('common.continue')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isCritical && <Text style={styles.disclaimer}>{t('safety.emergencyDisclaimer')}</Text>}
    </View>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 20,
      margin: 16,
      borderWidth: 1,
      borderColor: colors.status.moderate,
    },
    criticalContainer: {
      borderColor: colors.status.needsAttention,
      borderWidth: 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: `${colors.status.moderate}20`,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    criticalIconContainer: {
      backgroundColor: `${colors.status.needsAttention}20`,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    resourcesSection: {
      marginBottom: 16,
    },
    resourcesTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    resourceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 8,
    },
    resourceTextContainer: {
      flex: 1,
      marginLeft: 12,
    },
    resourceName: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
    resourceNumber: {
      fontSize: 12,
      color: colors.brand.primary,
      marginTop: 2,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
    },
    helpButton: {
      flex: 1,
      backgroundColor: colors.brand.primary,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
    },
    helpButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    dismissButton: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    dismissButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    disclaimer: {
      fontSize: 12,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 16,
      fontStyle: 'italic',
    },
  });

export default SafetyRedirect;
