import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LiquidGlassCard } from '../../components/ui';

const SUPPORT_EMAIL = 'support@aiponge.com';
const FAQ_URL = 'https://aiponge.com/faq';
const USER_GUIDE_URL = 'https://aiponge.com/guide';

interface HelpSection {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  descriptionKey: string;
  descriptionParams?: Record<string, string>;
  action: () => void;
  testId: string;
}

export function HelpScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [aboutModalVisible, setAboutModalVisible] = useState(false);

  const appVersion = Application.nativeApplicationVersion || '1.0.0';
  const buildNumber = Application.nativeBuildVersion || '1';

  const openUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t('help.errors.cantOpenUrl'), url);
      }
    } catch (error) {
      Alert.alert(t('help.errors.openFailed'));
    }
  };

  const sendEmail = async (subject: string, bodyTemplate: string) => {
    const deviceInfo = `\n\n---\nDevice: ${Device.modelName || 'Unknown'}\nOS: ${Platform.OS} ${Platform.Version}\nApp Version: ${appVersion} (${buildNumber})`;
    const body = encodeURIComponent(bodyTemplate + deviceInfo);
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${body}`;

    try {
      await Linking.openURL(mailtoUrl);
    } catch (error) {
      Alert.alert(t('help.errors.emailFailed'), t('help.errors.emailFailedDescription', { email: SUPPORT_EMAIL }));
    }
  };

  const handleUserGuide = () => {
    openUrl(USER_GUIDE_URL);
  };

  const handleContactSupport = () => {
    sendEmail(t('help.contactSupport.emailSubject'), t('help.contactSupport.emailBody'));
  };

  const handleReportBug = () => {
    sendEmail(t('help.reportBug.emailSubject'), t('help.reportBug.emailBody'));
  };

  const handleFaq = () => {
    openUrl(FAQ_URL);
  };

  const handleAbout = () => {
    setAboutModalVisible(true);
  };

  const helpSections: HelpSection[] = [
    {
      icon: 'book-outline',
      titleKey: 'help.userGuide.title',
      descriptionKey: 'help.userGuide.description',
      action: handleUserGuide,
      testId: 'help-user-guide',
    },
    {
      icon: 'chatbubble-ellipses-outline',
      titleKey: 'help.contactSupport.title',
      descriptionKey: 'help.contactSupport.description',
      action: handleContactSupport,
      testId: 'help-contact-support',
    },
    {
      icon: 'bug-outline',
      titleKey: 'help.reportBug.title',
      descriptionKey: 'help.reportBug.description',
      action: handleReportBug,
      testId: 'help-report-bug',
    },
    {
      icon: 'help-circle-outline',
      titleKey: 'help.faq.title',
      descriptionKey: 'help.faq.description',
      action: handleFaq,
      testId: 'help-faq',
    },
    {
      icon: 'information-circle-outline',
      titleKey: 'help.about.title',
      descriptionKey: 'help.about.description',
      descriptionParams: { version: appVersion },
      action: handleAbout,
      testId: 'help-about',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="help-page">
          {helpSections.map((section, index) => (
            <TouchableOpacity
              key={index}
              style={styles.helpItemWrapper}
              onPress={section.action}
              testID={section.testId}
            >
              <LiquidGlassCard intensity="subtle" padding={16} style={styles.helpItem}>
                <View style={styles.helpItemRow}>
                  <View style={styles.iconContainer}>
                    <Ionicons name={section.icon} size={24} color={colors.brand.primary} />
                  </View>
                  <View style={styles.helpContent}>
                    <Text style={styles.helpTitle}>{t(section.titleKey)}</Text>
                    <Text style={styles.helpDescription}>{t(section.descriptionKey, section.descriptionParams)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
                </View>
              </LiquidGlassCard>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={aboutModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('help.about.modalTitle')}</Text>
              <TouchableOpacity
                onPress={() => setAboutModalVisible(false)}
                style={styles.closeButton}
                testID="close-about-modal"
              >
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.aboutLogo}>
              <Ionicons name="musical-notes" size={48} color={colors.brand.primary} />
            </View>

            <Text style={styles.appName}>aiponge</Text>
            <Text style={styles.appTagline}>{t('help.about.tagline')}</Text>

            <View style={styles.versionInfo}>
              <View style={styles.versionRow}>
                <Text style={styles.versionLabel}>{t('help.about.version')}</Text>
                <Text style={styles.versionValue}>{appVersion}</Text>
              </View>
              <View style={styles.versionRow}>
                <Text style={styles.versionLabel}>{t('help.about.build')}</Text>
                <Text style={styles.versionValue}>{buildNumber}</Text>
              </View>
            </View>

            <Text style={styles.copyright}>{t('help.about.copyright', { year: new Date().getFullYear() })}</Text>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setAboutModalVisible(false)}
              testID="done-about-button"
            >
              <Text style={styles.doneButtonText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    scrollView: commonStyles.flexOne,
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    content: commonStyles.flexOne,
    helpItemWrapper: {
      marginBottom: 12,
    },
    helpItem: {},
    helpItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    helpContent: {
      flex: 1,
    },
    helpTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    helpDescription: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
    modalOverlay: {
      ...commonStyles.modalOverlayDark,
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: 24,
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    closeButton: {
      padding: 4,
    },
    aboutLogo: {
      width: 80,
      height: 80,
      borderRadius: 20,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    appName: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 4,
    },
    appTagline: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 24,
      textAlign: 'center',
    },
    versionInfo: {
      width: '100%',
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 16,
    },
    versionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    versionLabel: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    versionValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    copyright: {
      fontSize: 12,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginBottom: 20,
    },
    doneButton: {
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 32,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.xl,
    },
    doneButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
  });
