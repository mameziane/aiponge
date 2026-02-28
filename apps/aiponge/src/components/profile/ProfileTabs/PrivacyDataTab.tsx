import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useTranslation } from '@/i18n';
import { useThemeColors, type ColorScheme } from '@/theme';
import { LiquidGlassView } from '../../ui';
import { logger } from '@/lib/logger';
import { useAuthStore, selectLogout, selectToken, selectUser } from '@/auth/store';
import { apiRequest } from '@/lib/axiosApiClient';

interface PrivacyDataTabProps {
  userId: string;
}

export const PrivacyDataTab: React.FC<PrivacyDataTabProps> = ({ userId }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const logout = useAuthStore(selectLogout);
  const token = useAuthStore(selectToken);
  const user = useAuthStore(selectUser);
  const isSystemAccount = user?.isSystemAccount === true;

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const data = await apiRequest('/api/v1/app/privacy/export');

      const jsonString = JSON.stringify(data, null, 2);
      const fileName = `aiponge-data-export-${new Date().toISOString().split('T')[0]}.json`;

      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.document, fileName);
      file.create();
      file.write(jsonString);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: t('privacy.exportComplete'),
        });
      } else {
        Alert.alert(t('privacy.exportComplete'), t('privacy.exportSavedTo', { path: file.uri }));
      }

      logger.info('Data export completed successfully', { userId });
    } catch (error) {
      logger.error('Data export failed', { userId, error });
      Alert.alert(t('common.error'), t('privacy.exportFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('privacy.deleteAccountTitle'), t('privacy.deleteAccountWarning'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('privacy.deleteAccountConfirm'),
        style: 'destructive',
        onPress: confirmDeleteAccount,
      },
    ]);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(t('privacy.deleteAccountFinalTitle'), t('privacy.deleteAccountFinalWarning'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('privacy.deleteAccountFinalConfirm'),
        style: 'destructive',
        onPress: executeDeleteAccount,
      },
    ]);
  };

  const executeDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await apiRequest('/api/v1/app/privacy/data', { method: 'DELETE' });

      logger.info('Account deletion completed', { userId });

      await logout();
    } catch (error) {
      logger.error('Account deletion failed', { userId, error });
      Alert.alert(t('common.error'), t('privacy.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewPrivacyPolicy = () => {
    Linking.openURL('https://aiponge.com/privacy');
  };

  return (
    <View style={styles.container}>
      <LiquidGlassView style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="download-outline" size={24} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t('privacy.downloadDataTitle')}</Text>
        </View>
        <Text style={styles.sectionDescription}>{t('privacy.downloadDataDescription')}</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleExportData}
          disabled={isExporting}
          testID="button-export-data"
          data-testid="button-export-data"
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={20} color={colors.text.primary} />
              <Text style={styles.primaryButtonText}>{t('privacy.downloadData')}</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.dataIncluded}>{t('privacy.dataIncluded')}</Text>
      </LiquidGlassView>

      <LiquidGlassView style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-checkmark-outline" size={24} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t('privacy.privacyPolicyTitle')}</Text>
        </View>
        <Text style={styles.sectionDescription}>{t('privacy.privacyPolicyDescription')}</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleViewPrivacyPolicy}
          testID="button-view-privacy-policy"
          data-testid="button-view-privacy-policy"
        >
          <Ionicons name="document-text-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.secondaryButtonText}>{t('privacy.viewPrivacyPolicy')}</Text>
        </TouchableOpacity>
      </LiquidGlassView>

      {!isSystemAccount && (
        <LiquidGlassView style={StyleSheet.flatten([styles.section, styles.dangerSection])}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trash-outline" size={24} color={colors.semantic.error} />
            <Text style={[styles.sectionTitle, styles.dangerTitle]}>{t('privacy.deleteAccountTitle')}</Text>
          </View>
          <Text style={styles.sectionDescription}>{t('privacy.deleteAccountDescription')}</Text>
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={20} color={colors.semantic.warning} />
            <Text style={styles.warningText}>{t('privacy.deleteWarning')}</Text>
          </View>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleDeleteAccount}
            disabled={isDeleting}
            testID="button-delete-account"
            data-testid="button-delete-account"
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color={colors.text.primary} />
                <Text style={styles.dangerButtonText}>{t('privacy.deleteAccount')}</Text>
              </>
            )}
          </TouchableOpacity>
        </LiquidGlassView>
      )}
    </View>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      gap: 16,
      paddingBottom: 32,
    },
    section: {
      padding: 20,
      borderRadius: 16,
    },
    dangerSection: {
      borderWidth: 1,
      borderColor: colors.semantic.error + '40',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    dangerTitle: {
      color: colors.semantic.error,
    },
    sectionDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 20,
      marginBottom: 16,
    },
    dataIncluded: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 12,
      lineHeight: 18,
    },
    primaryButton: {
      backgroundColor: colors.brand.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 12,
    },
    primaryButtonText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.brand.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 12,
    },
    secondaryButtonText: {
      color: colors.brand.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    dangerButton: {
      backgroundColor: colors.semantic.error,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 12,
    },
    dangerButtonText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.semantic.warningLight,
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      color: colors.semantic.warning,
      lineHeight: 18,
    },
  });
