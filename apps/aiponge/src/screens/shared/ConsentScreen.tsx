import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { useLocation } from '../../hooks/system/useLocation';

export function ConsentScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [analyticsConsent, setAnalyticsConsent] = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [personalizationConsent, setPersonalizationConsent] = useState(true);

  const { locationContext, requestLocationPermission, revokeLocationConsent } = useLocation();

  const handleLocationToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestLocationPermission();
      if (!granted) {
        Alert.alert(t('location.permissionRequired'), t('location.permissionDescription'));
      }
    } else {
      await revokeLocationConsent();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="consent-page">
          <View style={styles.consentItem}>
            <View style={styles.consentInfo}>
              <View style={styles.consentHeader}>
                <Ionicons name="analytics-outline" size={20} color={colors.brand.primary} />
                <Text style={styles.consentTitle}>{t('consent.analytics.title')}</Text>
              </View>
              <Text style={styles.consentDescription}>{t('consent.analytics.description')}</Text>
            </View>
            <Switch
              value={analyticsConsent}
              onValueChange={setAnalyticsConsent}
              trackColor={{ false: colors.border.primary, true: colors.brand.primary }}
              thumbColor={colors.absolute.white}
              testID="toggle-analytics"
            />
          </View>

          <View style={styles.consentItem}>
            <View style={styles.consentInfo}>
              <View style={styles.consentHeader}>
                <Ionicons name="mail-outline" size={20} color={colors.brand.primary} />
                <Text style={styles.consentTitle}>{t('consent.marketing.title')}</Text>
              </View>
              <Text style={styles.consentDescription}>{t('consent.marketing.description')}</Text>
            </View>
            <Switch
              value={marketingConsent}
              onValueChange={setMarketingConsent}
              trackColor={{ false: colors.border.primary, true: colors.brand.primary }}
              thumbColor={colors.absolute.white}
              testID="toggle-marketing"
            />
          </View>

          <View style={styles.consentItem}>
            <View style={styles.consentInfo}>
              <View style={styles.consentHeader}>
                <Ionicons name="person-outline" size={20} color={colors.brand.primary} />
                <Text style={styles.consentTitle}>{t('consent.personalization.title')}</Text>
              </View>
              <Text style={styles.consentDescription}>{t('consent.personalization.description')}</Text>
            </View>
            <Switch
              value={personalizationConsent}
              onValueChange={setPersonalizationConsent}
              trackColor={{ false: colors.border.primary, true: colors.brand.primary }}
              thumbColor={colors.absolute.white}
              testID="toggle-personalization"
            />
          </View>

          <View style={styles.consentItem}>
            <View style={styles.consentInfo}>
              <View style={styles.consentHeader}>
                <Ionicons name="location-outline" size={20} color={colors.brand.primary} />
                <Text style={styles.consentTitle}>{t('location.enableLocation')}</Text>
              </View>
              <Text style={styles.consentDescription}>{t('location.enableLocationDescription')}</Text>
              {locationContext.isGranted && locationContext.city && (
                <Text style={styles.locationStatus}>{locationContext.city}</Text>
              )}
            </View>
            <Switch
              value={locationContext.isGranted}
              onValueChange={handleLocationToggle}
              trackColor={{ false: colors.border.primary, true: colors.brand.primary }}
              thumbColor={colors.absolute.white}
              testID="toggle-location"
            />
          </View>

          <TouchableOpacity style={styles.linkButton} testID="link-privacy-policy">
            <Ionicons name="document-text-outline" size={20} color={colors.brand.primary} />
            <Text style={styles.linkText}>{t('consent.privacyPolicy')}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} testID="link-terms-of-service">
            <Ionicons name="document-text-outline" size={20} color={colors.brand.primary} />
            <Text style={styles.linkText}>{t('consent.termsOfService')}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    consentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.overlay.purple[15],
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.overlay.purple[20],
    },
    consentInfo: {
      flex: 1,
      marginRight: 16,
    },
    consentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    consentTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 8,
    },
    consentDescription: {
      fontSize: 14,
      color: colors.text.tertiary,
      lineHeight: 20,
    },
    locationStatus: {
      fontSize: 12,
      color: colors.brand.primary,
      marginTop: 4,
      fontWeight: '500',
    },
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.overlay.purple[15],
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.overlay.purple[20],
    },
    linkText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
      marginLeft: 12,
    },
  });
