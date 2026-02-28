import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { SectionHeader, ErrorSection, createSharedStyles } from './shared';
import { useIsAdmin } from '@/hooks/admin';
import { apiClient } from '@/lib/axiosApiClient';

type UsersSubTab = 'lookup' | 'support';

interface UserProfile {
  profile?: {
    id: string;
    email?: string;
    username?: string;
    displayName?: string;
    role?: string;
    tier?: string;
    isGuest?: boolean;
    language?: string;
    createdAt?: string;
    lastLoginAt?: string;
  } | null;
  summary?: {
    totalEntries?: number;
    totalSongs?: number;
    totalJournals?: number;
    totalChapters?: number;
  } | null;
  themes?: Record<string, unknown> | null;
  metrics?: Record<string, unknown> | null;
}

function UserProfileCard({ data, colors }: { data: UserProfile; colors: ReturnType<typeof useThemeColors> }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const profile = data.profile;
  const summary = data.summary;

  if (!profile) {
    return (
      <View style={styles.noResult}>
        <Ionicons name="person-outline" size={32} color={colors.text.tertiary} />
        <Text style={styles.noResultText}>{t('admin.users.userNotFound')}</Text>
      </View>
    );
  }

  const infoRows = [
    { label: t('admin.users.userId'), value: profile.id, icon: 'finger-print-outline' as const },
    { label: t('admin.users.email'), value: profile.email || 'N/A', icon: 'mail-outline' as const },
    { label: t('admin.users.username'), value: profile.username || 'N/A', icon: 'at-outline' as const },
    { label: t('admin.users.displayName'), value: profile.displayName || 'N/A', icon: 'person-outline' as const },
    { label: t('admin.users.role'), value: profile.role || 'user', icon: 'shield-outline' as const },
    { label: t('admin.users.tier'), value: profile.tier || 'free', icon: 'diamond-outline' as const },
    {
      label: t('admin.users.guest'),
      value: profile.isGuest ? t('admin.users.yes') : t('admin.users.no'),
      icon: 'eye-off-outline' as const,
    },
    { label: t('admin.users.language'), value: profile.language || 'en-US', icon: 'globe-outline' as const },
    {
      label: t('admin.users.joined'),
      value: profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A',
      icon: 'calendar-outline' as const,
    },
    {
      label: t('admin.users.lastLogin'),
      value: profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : 'N/A',
      icon: 'time-outline' as const,
    },
  ];

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={28} color={colors.brand.primary} />
        </View>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileName}>
            {profile.displayName || profile.username || profile.email || profile.id}
          </Text>
          <Text style={styles.profileSubtext}>
            {profile.role} · {profile.tier}
          </Text>
        </View>
      </View>

      {infoRows.map(row => (
        <View key={row.label} style={styles.infoRow}>
          <View style={styles.infoRowLeft}>
            <Ionicons name={row.icon} size={16} color={colors.text.tertiary} />
            <Text style={styles.infoLabel}>{row.label}</Text>
          </View>
          <Text style={styles.infoValue} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
      ))}

      {summary && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{summary.totalEntries ?? 0}</Text>
            <Text style={styles.statLabel}>{t('admin.users.entries')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{summary.totalSongs ?? 0}</Text>
            <Text style={styles.statLabel}>{t('admin.users.songs')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{summary.totalJournals ?? 0}</Text>
            <Text style={styles.statLabel}>{t('admin.users.journals')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{summary.totalChapters ?? 0}</Text>
            <Text style={styles.statLabel}>{t('admin.users.chapters')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export function AdminUsersSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<UsersSubTab>('lookup');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const isAdmin = useIsAdmin();

  const handleLookup = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !isAdmin) return;

    setIsLoading(true);
    setError(null);
    setUserProfile(null);

    try {
      const response = await apiClient.get<{ success: boolean; data: UserProfile }>(
        `/api/v1/admin/user-profile/${encodeURIComponent(trimmed)}`
      );
      if (response.success && response.data) {
        setUserProfile(response.data);
      } else {
        setError(t('admin.users.userNotFound'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('admin.users.lookupFailed');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, isAdmin, t]);

  return (
    <ScrollView>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'lookup' && styles.subTabActive]}
          onPress={() => setSubTab('lookup')}
        >
          <Ionicons
            name="search-outline"
            size={16}
            color={subTab === 'lookup' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'lookup' && styles.subTabTextActive]}>
            {t('admin.users.userLookup')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'support' && styles.subTabActive]}
          onPress={() => setSubTab('support')}
        >
          <Ionicons
            name="help-buoy-outline"
            size={16}
            color={subTab === 'support' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'support' && styles.subTabTextActive]}>
            {t('admin.users.supportTools')}
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'lookup' && (
        <View style={sharedStyles.section}>
          <SectionHeader title={t('admin.users.userLookup')} icon="search-outline" />

          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={colors.text.tertiary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('admin.users.searchPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleLookup}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.lookupButton, (!searchQuery.trim() || isLoading) && styles.lookupButtonDisabled]}
              onPress={handleLookup}
              disabled={!searchQuery.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.absolute.white} />
              ) : (
                <Ionicons name="search" size={18} color={colors.absolute.white} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.searchHint}>{t('admin.users.searchHint')}</Text>

          {error && <ErrorSection message={error} />}
          {userProfile && <UserProfileCard data={userProfile} colors={colors} />}

          {!userProfile && !error && !isLoading && (
            <View style={styles.emptyState}>
              <Ionicons name="person-circle-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyStateText}>{t('admin.users.enterUserId')}</Text>
            </View>
          )}
        </View>
      )}

      {subTab === 'support' && (
        <View style={sharedStyles.section}>
          <SectionHeader title={t('admin.users.supportTools')} icon="help-buoy-outline" />
          <View style={styles.comingSoon}>
            <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
            <Text style={styles.comingSoonText}>{t('admin.users.comingSoonSupport')}</Text>
            <View style={styles.plannedFeatures}>
              <Text style={styles.featureItem}>{`• ${t('admin.users.plannedSupport.resetPassword')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.users.plannedSupport.clearCache')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.users.plannedSupport.regenerateSongs')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.users.plannedSupport.promoCredits')}`}</Text>
              <Text style={styles.featureItem}>{`• ${t('admin.users.plannedSupport.suspendAccount')}`}</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    subTabBar: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
      backgroundColor: colors.background.secondary,
      padding: 4,
      borderRadius: BORDER_RADIUS.sm,
    },
    subTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    subTabActive: {
      backgroundColor: colors.background.primary,
    },
    subTabText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    subTabTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    searchRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.text.primary,
    },
    searchHint: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: 16,
    },
    lookupButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    lookupButtonDisabled: {
      opacity: 0.5,
    },
    profileCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    avatarCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.background.tertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileHeaderText: {
      flex: 1,
    },
    profileName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    profileSubtext: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    infoRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    infoLabel: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    infoValue: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.primary,
      maxWidth: '50%',
      textAlign: 'right',
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    statLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    emptyState: {
      alignItems: 'center',
      padding: 40,
    },
    emptyStateText: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginTop: 12,
      textAlign: 'center',
    },
    noResult: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
    },
    noResultText: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginTop: 8,
    },
    comingSoon: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      gap: 12,
    },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    comingSoonText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    plannedFeatures: {
      marginTop: 16,
      alignSelf: 'stretch',
      backgroundColor: colors.background.tertiary,
      padding: 16,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    featureItem: {
      fontSize: 13,
      color: colors.text.secondary,
    },
  });
