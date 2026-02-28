import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import { LoadingState } from '../../components/shared';
import { LiquidGlassCard } from '../../components/ui';
import { BORDER_RADIUS } from '../../theme/constants';
import { useAuthStore, selectUser } from '../../auth';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { TIER_IDS } from '@aiponge/shared-contracts';

export function OrganizationScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore(selectUser);
  const { currentTier } = useSubscriptionData();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isProfessionalTier = currentTier === TIER_IDS.PRACTICE || currentTier === TIER_IDS.STUDIO;

  const { organization, members, isLoading, error, createOrganization, updateOrganization, fetchMembers } =
    useOrganization(user?.id);

  const [orgName, setOrgName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!organization;

  useEffect(() => {
    if (organization) {
      setOrgName(organization.name || '');
      setDisplayName(organization.branding?.displayName || '');
      fetchMembers(organization.id);
    }
  }, [organization, fetchMembers]);

  const handleCreate = useCallback(async () => {
    if (!orgName.trim()) {
      Alert.alert(t('common.error'), t('settingsPage.organizationNameRequired', 'Organization name is required'));
      return;
    }
    setIsSaving(true);
    try {
      await createOrganization(orgName.trim(), {
        displayName: displayName.trim() || undefined,
      });
      Alert.alert(t('common.success'), t('settingsPage.organizationCreated', 'Organization created successfully'));
    } catch (err: unknown) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setIsSaving(false);
    }
  }, [orgName, displayName, createOrganization, t]);

  const handleSave = useCallback(async () => {
    if (!organization) return;
    if (!orgName.trim()) {
      Alert.alert(t('common.error'), t('settingsPage.organizationNameRequired', 'Organization name is required'));
      return;
    }
    setIsSaving(true);
    try {
      await updateOrganization(organization.id, {
        name: orgName.trim(),
        branding: {
          displayName: displayName.trim() || undefined,
        },
      });
      Alert.alert(t('common.success'), t('settingsPage.organizationUpdated', 'Organization updated successfully'));
    } catch (err: unknown) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setIsSaving(false);
    }
  }, [organization, orgName, displayName, updateOrganization, t]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settingsPage.organization', 'Organization')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {!isProfessionalTier ? (
          <View style={styles.tierGateContainer} testID="tier-gate">
            <Ionicons name="lock-closed-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.tierGateTitle}>
              {t('settingsPage.organizationProfessionalOnly', 'Professional Feature')}
            </Text>
            <Text style={styles.tierGateDescription}>
              {t(
                'settingsPage.organizationUpgradeMessage',
                'Organization branding is available on Practice and Studio plans. Upgrade to customize your branding for clients.'
              )}
            </Text>
          </View>
        ) : isLoading && !isSaving ? (
          <LoadingState fullScreen={false} />
        ) : (
          <View style={styles.content} testID="organization-page">
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.semantic.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <LiquidGlassCard intensity="medium" padding={16} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isEditing
                  ? t('settingsPage.editBranding', 'Edit Branding')
                  : t('settingsPage.createOrganization', 'Create Organization')}
              </Text>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('settingsPage.organizationName', 'Organization Name')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder={t('settingsPage.organizationNamePlaceholder', 'Legal or internal name')}
                  placeholderTextColor={colors.text.tertiary}
                  testID="org-name-input"
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('settingsPage.displayName', 'Display Name')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={t('settingsPage.displayNamePlaceholder', 'What clients see')}
                  placeholderTextColor={colors.text.tertiary}
                  testID="display-name-input"
                />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, (isSaving || !orgName.trim()) && styles.saveButtonDisabled]}
                onPress={isEditing ? handleSave : handleCreate}
                disabled={isSaving || !orgName.trim()}
                testID="save-org-button"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.absolute.white} />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {isEditing
                      ? t('settingsPage.saveChanges', 'Save Changes')
                      : t('settingsPage.createOrganization', 'Create Organization')}
                  </Text>
                )}
              </TouchableOpacity>
            </LiquidGlassCard>

            {isEditing && (
              <LiquidGlassCard intensity="subtle" padding={16} style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settingsPage.members', 'Members')}</Text>
                <View style={styles.membersInfo}>
                  <Ionicons name="people-outline" size={20} color={colors.text.secondary} />
                  <Text style={styles.membersCount}>
                    {members.length}{' '}
                    {members.length === 1
                      ? t('settingsPage.member', 'member')
                      : t('settingsPage.membersPlural', 'members')}
                  </Text>
                </View>
              </LiquidGlassCard>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 32,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
    },
    content: {
      flex: 1,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.semantic.errorLight,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      marginBottom: 16,
      gap: 8,
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 14,
      flex: 1,
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
    },
    fieldContainer: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
      marginBottom: 6,
    },
    textInput: {
      backgroundColor: colors.background.surface,
      color: colors.text.primary,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      fontSize: 16,
    },
    saveButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: '600',
    },
    membersInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    membersCount: {
      fontSize: 15,
      color: colors.text.secondary,
    },
    tierGateContainer: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: 60,
      paddingHorizontal: 24,
      gap: 12,
    },
    tierGateTitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.text.primary,
      textAlign: 'center' as const,
    },
    tierGateDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center' as const,
      lineHeight: 20,
    },
  });
