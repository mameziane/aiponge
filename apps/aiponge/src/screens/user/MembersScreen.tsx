/**
 * Members Screen — Shows users who joined via your invitation codes
 * Two sections: Joined Members (with details) and Pending Invitations (with re-invite)
 * Follows the same component patterns as FollowingScreen for consistency
 */

import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  RefreshControl,
  Alert,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useAuthStore, selectUser } from '../../auth/store';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { fontFamilies } from '../../theme/typography';
import { useResponsiveLayout } from '../../hooks/ui/useResponsiveLayout';
import { useToast } from '../../hooks/ui/use-toast';
import { LiquidGlassCard } from '../../components/ui';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';

interface Member {
  memberId: string;
  memberName: string | null;
  memberEmail: string | null;
  memberAvatar: string | null;
  status: string;
  followedAt: string;
  invitationToken: string | null;
}

interface PendingInvitation {
  id: string;
  token: string;
  useCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  email: string | null;
  createdAt: string;
  isExpired: boolean;
  isMaxedOut: boolean;
}

export function MembersScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { toast } = useToast();
  const { horizontalPadding } = useResponsiveLayout();
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();

  // Fetch members who follow this user
  const {
    data: members,
    isLoading: loadingMembers,
    refetch: refetchMembers,
  } = useQuery<Member[]>({
    queryKey: queryKeys.creatorMembers.members(),
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: Member[] }>('/api/v1/app/creator-members/members');
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Fetch active invitations to show pending ones
  const {
    data: allInvitations,
    isLoading: loadingInvitations,
    refetch: refetchInvitations,
  } = useQuery<PendingInvitation[]>({
    queryKey: queryKeys.creatorMembers.invitations(),
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: PendingInvitation[] }>(
        '/api/v1/app/creator-members/invitations'
      );
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Active invitations that can still accept new members
  const pendingInvitations = useMemo(
    () => allInvitations?.filter(inv => !inv.isExpired && !inv.isMaxedOut) || [],
    [allInvitations]
  );

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest(`/api/v1/app/creator-members/members/${memberId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'CREATOR_MEMBER_REMOVED' });
      toast({ title: t('creatorMembers.memberRemoved') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
  });

  const handleRemoveMember = useCallback(
    (member: Member) => {
      const displayName = member.memberName || member.memberEmail || t('creatorMembers.anonymousMember');
      Alert.alert(
        t('creatorMembers.removeMemberTitle'),
        t('creatorMembers.removeMemberConfirm', { name: displayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.remove', { defaultValue: 'Remove' }),
            style: 'destructive',
            onPress: () => removeMemberMutation.mutate(member.memberId),
          },
        ]
      );
    },
    [removeMemberMutation, toast, t]
  );

  const handleReInvite = useCallback(
    async (invitation: PendingInvitation) => {
      try {
        const link = `https://aiponge.app/invite/${invitation.token}`;
        const message = invitation.email
          ? t('creatorMembers.reInviteMessageEmail', { email: invitation.email })
          : t('creatorMembers.reInviteMessage');
        await Share.share({
          message: `${message}\n\n${link}`,
          title: t('creatorMembers.reInviteTitle'),
        });
      } catch (error) {
        if (error instanceof Error && error.message !== 'User did not share') {
          toast({ title: t('common.error'), variant: 'destructive' });
        }
      }
    },
    [t, toast]
  );

  const handleCopyInviteLink = useCallback(
    async (token: string) => {
      const link = `https://aiponge.app/invite/${token}`;
      await Clipboard.setStringAsync(link);
      toast({ title: t('creatorMembers.linkCopied') });
    },
    [t, toast]
  );

  const handleRefresh = useCallback(() => {
    refetchMembers();
    refetchInvitations();
  }, [refetchMembers, refetchInvitations]);

  const renderMemberItem = ({ item }: { item: Member }) => (
    <LiquidGlassCard intensity="light" padding={16} style={styles.memberCard}>
      <View style={styles.memberContent}>
        {item.memberAvatar ? (
          <Image source={{ uri: item.memberAvatar }} style={[styles.memberAvatar, styles.memberAvatarImage]} />
        ) : (
          <View style={styles.memberAvatar}>
            <Ionicons name="person" size={24} color={colors.brand.primary} />
          </View>
        )}
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {item.memberName || item.memberEmail || t('creatorMembers.anonymousMember')}
            </Text>
          </View>
          <Text style={styles.memberDate}>
            {t('creatorMembers.joinedOn', { date: new Date(item.followedAt).toLocaleDateString() })}
          </Text>
          {item.invitationToken && (
            <Text style={styles.memberInvitationBadge}>
              {t('creatorMembers.viaInvitation', { token: item.invitationToken.substring(0, 7) + '...' })}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveMember(item)}>
          <Ionicons name="person-remove" size={20} color={colors.semantic.error} />
        </TouchableOpacity>
      </View>
    </LiquidGlassCard>
  );

  const renderInvitationItem = ({ item }: { item: PendingInvitation }) => {
    const usesText = item.maxUses
      ? t('creatorMembers.usesCount', { used: item.useCount, max: item.maxUses })
      : t('creatorMembers.usesUnlimited', { used: item.useCount });

    return (
      <LiquidGlassCard intensity="light" padding={16} style={styles.invitationCard}>
        <View style={styles.invitationContent}>
          <View style={styles.invitationIcon}>
            <Ionicons name={item.email ? 'mail' : 'ticket'} size={24} color={colors.brand.primary} />
          </View>
          <View style={styles.invitationInfo}>
            <Text style={styles.invitationTitle} numberOfLines={1}>
              {item.email || item.token}
            </Text>
            <Text style={styles.invitationMeta}>{usesText}</Text>
          </View>
          <View style={styles.invitationActions}>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleReInvite(item)}>
              <Ionicons name="share-social" size={20} color={colors.brand.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleCopyInviteLink(item.token)}>
              <Ionicons name="copy-outline" size={20} color={colors.brand.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </LiquidGlassCard>
    );
  };

  if (loadingMembers && loadingInvitations) {
    return <LoadingState />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.brand.primary} />
        }
      >
        <Text style={styles.title}>{t('creatorMembers.membersTitle', { defaultValue: 'Your Members' })}</Text>

        {/* Joined Members Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('creatorMembers.joinedMembers')}</Text>
          {members && members.length > 0 ? (
            <FlatList
              data={members}
              renderItem={renderMemberItem}
              keyExtractor={item => item.memberId}
              scrollEnabled={false}
              style={styles.listContent}
            />
          ) : (
            <LiquidGlassCard intensity="light" padding={24} style={styles.emptyCard}>
              <Ionicons name="people-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>{t('creatorMembers.noMembers')}</Text>
              <Text style={styles.emptySubtext}>{t('creatorMembers.inviteToGetMembers')}</Text>
            </LiquidGlassCard>
          )}
        </View>

        {/* Pending Invitations Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('creatorMembers.pendingInvitations')}</Text>
          {pendingInvitations.length > 0 ? (
            <FlatList
              data={pendingInvitations}
              renderItem={renderInvitationItem}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              style={styles.listContent}
            />
          ) : (
            <Text style={styles.noPendingText}>{t('creatorMembers.noPendingInvitations')}</Text>
          )}
        </View>

        {/* Info card */}
        <LiquidGlassCard intensity="medium" style={styles.infoCard} padding={16}>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={24} color={colors.brand.primary} />
            <Text style={styles.infoText}>{t('creatorMembers.howItWorksInfo')}</Text>
          </View>
        </LiquidGlassCard>
      </ScrollView>
    </View>
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
      paddingTop: 24,
      paddingBottom: 48,
    },
    title: {
      fontSize: 28,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 16,
      textAlign: 'center',
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 12,
    },
    listContent: {
      gap: 12,
    },
    // Member card styles (mirrors creatorCard from FollowingScreen)
    memberCard: {
      borderRadius: BORDER_RADIUS.md,
    },
    memberContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    memberAvatar: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.overlay.purple[20],
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberAvatarImage: {
      resizeMode: 'cover',
    },
    memberInfo: {
      flex: 1,
    },
    memberNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    memberName: {
      fontSize: 16,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
      flex: 1,
    },
    memberDate: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
    },
    memberInvitationBadge: {
      fontSize: 11,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    removeButton: {
      padding: 8,
    },
    // Invitation card styles
    invitationCard: {
      borderRadius: BORDER_RADIUS.md,
    },
    invitationContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    invitationIcon: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.overlay.purple[10],
      justifyContent: 'center',
      alignItems: 'center',
    },
    invitationInfo: {
      flex: 1,
    },
    invitationTitle: {
      fontSize: 15,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
    },
    invitationMeta: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
    },
    invitationActions: {
      flexDirection: 'row',
      gap: 4,
    },
    actionButton: {
      padding: 8,
    },
    // Empty / info states
    emptyCard: {
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
    noPendingText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      textAlign: 'center',
      paddingVertical: 16,
    },
    infoCard: {
      borderRadius: BORDER_RADIUS.md,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      lineHeight: 20,
    },
  });

export default MembersScreen;
