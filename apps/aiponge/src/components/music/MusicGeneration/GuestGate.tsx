import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { spacing } from '@/theme/spacing';
import { useTranslation } from '@/i18n';

export function GuestGate() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} testID="music-generation-guest-gate">
      <View style={styles.guestGateContainer}>
        <View style={styles.guestGateContent}>
          <Ionicons name="musical-notes" size={64} color={colors.brand.primary} />
          <Text style={styles.guestGateTitle}>{t('subscription.tiers.guest.generationBlocked.title')}</Text>
          <Text style={styles.guestGateDescription}>{t('subscription.tiers.guest.generationBlocked.description')}</Text>

          <TouchableOpacity
            style={styles.guestGateSubscribeButton}
            onPress={() => router.push('/paywall')}
            testID="button-view-plans"
          >
            <Text style={styles.guestGateSubscribeText}>{t('subscription.chooseYourPlan')}</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.absolute.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestGateLibraryButton}
            onPress={() => router.replace('/(user)/music' as Href)}
            testID="button-browse-library"
          >
            <Ionicons name="library-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.guestGateLibraryText}>{t('subscription.tiers.guest.browseLibrary')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    guestGateContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      paddingHorizontal: spacing.screenHorizontal,
    },
    guestGateContent: {
      alignItems: 'center',
      width: '100%',
      maxWidth: 360,
    },
    guestGateTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
      marginTop: 24,
      marginBottom: 12,
      textAlign: 'center',
    },
    guestGateDescription: {
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 32,
    },
    guestGateSubscribeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 16,
    },
    guestGateSubscribeText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    guestGateLibraryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    guestGateLibraryText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
  });

export default GuestGate;
