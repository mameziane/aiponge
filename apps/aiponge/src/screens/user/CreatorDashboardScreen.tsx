import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Share,
  RefreshControl,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useAuthStore, selectUser } from '../../auth/store';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { useResponsiveLayout } from '../../hooks/ui/useResponsiveLayout';
import { useToast } from '../../hooks/ui/use-toast';
import { LiquidGlassCard, LiquidGlassButton, LiquidGlassView } from '../../components/ui';
import { BaseModal } from '../../components/shared/BaseModal';
import { LoadingState } from '../../components/shared/LoadingState';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';

interface Member {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail?: string;
  status: string;
  createdAt: string;
  acceptedAt?: string;
}

interface Invitation {
  id: string;
  token: string;
  useCount: number;
  maxUses?: number;
  expiresAt?: string;
  email?: string;
  createdAt: string;
}

export function CreatorDashboard() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { toast } = useToast();
  const { horizontalPadding } = useResponsiveLayout();
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();

  const [showCreateInviteModal, setShowCreateInviteModal] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState<number | undefined>(undefined);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const {
    data: members,
    isLoading: membersLoading,
    refetch: refetchMembers,
  } = useQuery<Member[]>({
    queryKey: queryKeys.creatorMembers.members(),
    queryFn: () => apiRequest<Member[]>('/api/v1/app/creator-members/members'),
    enabled: !!user?.id,
  });

  const {
    data: invitations,
    isLoading: invitationsLoading,
    refetch: refetchInvitations,
  } = useQuery<Invitation[]>({
    queryKey: queryKeys.creatorMembers.invitations(),
    queryFn: () => apiRequest<Invitation[]>('/api/v1/app/creator-members/invitations'),
    enabled: !!user?.id,
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (data: { maxUses?: number; email?: string }) => {
      return apiRequest('/api/v1/app/creator-members/invitations', {
        method: 'POST',
        data,
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'CREATOR_INVITATION_CREATED' });
      setShowCreateInviteModal(false);
      toast({ title: t('creatorMembers.invitationCreated') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest(`/api/v1/app/creator-members/members/${memberId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'CREATOR_MEMBER_REMOVED' });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return apiRequest(`/api/v1/app/creator-members/invitations/${invitationId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'CREATOR_INVITATION_DELETED' });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
  });

  const handleDeleteInvitation = useCallback(
    (invitationId: string) => {
      Alert.alert(t('creatorMembers.deleteInvitationTitle'), t('creatorMembers.deleteInvitationConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteInvitationMutation.mutate(invitationId),
        },
      ]);
    },
    [deleteInvitationMutation, t]
  );

  const handleCopyInviteLink = useCallback(
    async (token: string) => {
      const link = `https://aiponge.app/join/${token}`;
      await Clipboard.setStringAsync(link);
      setCopiedToken(token);
      toast({ title: t('creatorMembers.linkCopied') });
      setTimeout(() => setCopiedToken(null), 2000);
    },
    [toast, t]
  );

  const handleShareInviteLink = useCallback(
    async (token: string) => {
      const link = `https://aiponge.app/join/${token}`;
      try {
        await Share.share({
          message: t('creatorMembers.shareMessage', { link }),
          title: t('creatorMembers.shareTitle'),
        });
      } catch (error) {
        if ((error as { message?: string }).message !== 'User did not share') {
          toast({ title: t('common.error'), variant: 'destructive' });
        }
      }
    },
    [toast, t]
  );

  const handleCreateInvitation = () => {
    createInvitationMutation.mutate({ maxUses: inviteMaxUses });
  };

  const handleRefresh = useCallback(() => {
    refetchMembers();
    refetchInvitations();
  }, [refetchMembers, refetchInvitations]);

  const isLoading = membersLoading || invitationsLoading;
  const isRefreshing = false;

  const renderMemberItem = ({ item }: { item: Member }) => (
    <LiquidGlassCard intensity="light" padding={16} style={styles.memberCard}>
      <View style={styles.memberContent}>
        <View style={styles.memberAvatar}>
          <Ionicons name="person" size={24} color={colors.brand.primary} />
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.memberName || t('creatorMembers.anonymousMember')}</Text>
          <Text style={styles.memberDate}>
            {t('creatorMembers.joinedOn', { date: new Date(item.acceptedAt || item.createdAt).toLocaleDateString() })}
          </Text>
        </View>
        <TouchableOpacity style={styles.removeButton} onPress={() => removeMemberMutation.mutate(item.memberId)}>
          <Ionicons name="close-circle" size={24} color={colors.semantic.error} />
        </TouchableOpacity>
      </View>
    </LiquidGlassCard>
  );

  const renderInvitationItem = ({ item }: { item: Invitation }) => {
    const isCopied = copiedToken === item.token;
    const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
    const usesExhausted = item.maxUses && item.useCount >= item.maxUses;

    return (
      <LiquidGlassCard
        intensity="light"
        padding={16}
        style={{
          ...styles.inviteCard,
          ...(isExpired || usesExhausted ? styles.inviteCardExpired : {}),
        }}
      >
        <View style={styles.inviteHeader}>
          <View style={styles.inviteTokenContainer}>
            <Text style={styles.inviteToken}>{item.token.slice(0, 8)}...</Text>
            {item.email && <Text style={styles.inviteEmail}>{item.email}</Text>}
          </View>
          <View style={styles.inviteHeaderRight}>
            <View style={styles.inviteStats}>
              <Text style={styles.inviteUseCount}>
                {item.maxUses ? `${item.useCount}/${item.maxUses}` : item.useCount} {t('creatorMembers.uses')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteInviteButton}
              onPress={() => handleDeleteInvitation(item.id)}
              testID={`button-delete-invite-${item.id}`}
            >
              <Ionicons name="trash-outline" size={18} color={colors.semantic.error} />
            </TouchableOpacity>
          </View>
        </View>
        {!isExpired && !usesExhausted && (
          <View style={styles.inviteActions}>
            <TouchableOpacity style={styles.inviteActionButton} onPress={() => handleCopyInviteLink(item.token)}>
              <Ionicons name={isCopied ? 'checkmark' : 'copy-outline'} size={20} color={colors.brand.primary} />
              <Text style={styles.inviteActionText}>
                {isCopied ? t('creatorMembers.copied') : t('creatorMembers.copyLink')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.inviteActionButton} onPress={() => handleShareInviteLink(item.token)}>
              <Ionicons name="share-outline" size={20} color={colors.brand.primary} />
              <Text style={styles.inviteActionText}>{t('creatorMembers.share')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {(isExpired || usesExhausted) && (
          <Text style={styles.inviteExpiredLabel}>
            {isExpired ? t('creatorMembers.expired') : t('creatorMembers.usesExhausted')}
          </Text>
        )}
      </LiquidGlassCard>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LoadingState />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />
        }
      >
        <View style={styles.headerSection}>
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}
            >
              <Ionicons name="people" size={48} color={colors.text.primary} />
            </LinearGradient>
          </View>
          <Text style={styles.title}>{t('creatorMembers.dashboardTitle')}</Text>
          <Text style={styles.subtitle}>{t('creatorMembers.dashboardSubtitle')}</Text>
        </View>

        <LiquidGlassCard intensity="medium" padding={16} style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{members?.length || 0}</Text>
              <Text style={styles.statLabel}>{t('creatorMembers.members')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{invitations?.length || 0}</Text>
              <Text style={styles.statLabel}>{t('creatorMembers.invitations')}</Text>
            </View>
          </View>
        </LiquidGlassCard>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('creatorMembers.invitations')}</Text>
            <LiquidGlassButton
              label={t('creatorMembers.createInvite')}
              onPress={() => setShowCreateInviteModal(true)}
              size="small"
              testID="button-create-invite"
            />
          </View>
          {invitations && invitations.length > 0 ? (
            <FlatList
              data={invitations}
              renderItem={renderInvitationItem}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <LiquidGlassCard intensity="light" padding={24} style={styles.emptyCard}>
              <Ionicons name="mail-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>{t('creatorMembers.noInvitations')}</Text>
              <Text style={styles.emptySubtext}>{t('creatorMembers.createInviteHint')}</Text>
            </LiquidGlassCard>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('creatorMembers.yourMembers')}</Text>
          {members && members.length > 0 ? (
            <FlatList
              data={members}
              renderItem={renderMemberItem}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <LiquidGlassCard intensity="light" padding={24} style={styles.emptyCard}>
              <Ionicons name="people-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>{t('creatorMembers.noMembers')}</Text>
              <Text style={styles.emptySubtext}>{t('creatorMembers.inviteToGetMembers')}</Text>
            </LiquidGlassCard>
          )}
        </View>

        <LiquidGlassCard intensity="medium" style={styles.infoCard} padding={16}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle" size={24} color={colors.brand.primary} />
            <Text style={styles.infoText}>{t('creatorMembers.howItWorksInfo')}</Text>
          </View>
        </LiquidGlassCard>
      </ScrollView>

      <BaseModal
        visible={showCreateInviteModal}
        onClose={() => setShowCreateInviteModal(false)}
        title={t('creatorMembers.createInviteTitle')}
        headerIcon="mail-open"
        testID="modal-create-invite"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalDescription}>{t('creatorMembers.createInviteDescription')}</Text>

          <View style={styles.useLimitSection}>
            <Text style={styles.useLimitLabel}>{t('creatorMembers.useLimitLabel')}</Text>
            <View style={styles.useLimitOptions}>
              {[undefined, 1, 5, 10, 25].map(limit => (
                <TouchableOpacity
                  key={limit || 'unlimited'}
                  style={[styles.useLimitOption, inviteMaxUses === limit && styles.useLimitOptionSelected]}
                  onPress={() => setInviteMaxUses(limit)}
                >
                  <Text
                    style={[styles.useLimitOptionText, inviteMaxUses === limit && styles.useLimitOptionTextSelected]}
                  >
                    {limit ? limit.toString() : t('creatorMembers.unlimited')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <LiquidGlassButton
            label={createInvitationMutation.isPending ? t('common.loading') : t('creatorMembers.createInvite')}
            onPress={handleCreateInvitation}
            disabled={createInvitationMutation.isPending}
            fullWidth
            testID="button-confirm-create-invite"
          />
        </View>
      </BaseModal>
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
    headerSection: {
      alignItems: 'center',
      marginBottom: 24,
    },
    iconContainer: {
      marginBottom: 16,
    },
    iconGradient: {
      width: 100,
      height: 100,
      borderRadius: 50,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 4,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    statsCard: {
      marginBottom: 24,
      borderRadius: BORDER_RADIUS.lg,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 32,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    statLabel: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border.muted,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    listContent: {
      gap: 12,
    },
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
    memberInfo: {
      flex: 1,
    },
    memberName: {
      fontSize: 16,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
    },
    memberDate: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
    },
    removeButton: {
      padding: 4,
    },
    inviteCard: {
      borderRadius: BORDER_RADIUS.md,
    },
    inviteCardExpired: {
      opacity: 0.6,
    },
    inviteHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    inviteTokenContainer: {
      flex: 1,
    },
    inviteToken: {
      fontSize: 16,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      letterSpacing: 1,
    },
    inviteEmail: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
    },
    inviteHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    inviteStats: {
      alignItems: 'flex-end',
    },
    deleteInviteButton: {
      padding: 4,
    },
    inviteUseCount: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.brand.primary,
    },
    inviteActions: {
      flexDirection: 'row',
      gap: 16,
    },
    inviteActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 8,
    },
    inviteActionText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.brand.primary,
    },
    inviteExpiredLabel: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.semantic.error,
      textAlign: 'center',
      marginTop: 8,
    },
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
    modalContent: {
      gap: 20,
    },
    modalDescription: {
      fontSize: 15,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      lineHeight: 22,
    },
    useLimitSection: {
      gap: 8,
    },
    useLimitLabel: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.secondary,
    },
    useLimitOptions: {
      flexDirection: 'row',
      gap: 8,
    },
    useLimitOption: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.subtle,
      alignItems: 'center',
    },
    useLimitOptionSelected: {
      backgroundColor: colors.overlay.purple[30],
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    useLimitOptionText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.tertiary,
    },
    useLimitOptionTextSelected: {
      color: colors.text.primary,
    },
  });

export default CreatorDashboard;
