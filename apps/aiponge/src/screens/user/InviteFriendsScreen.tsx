import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useAuthStore, selectUser } from '../../auth/store';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { fontFamilies } from '../../theme/typography';
import { useResponsiveLayout } from '../../hooks/ui/useResponsiveLayout';
import { useToast } from '../../hooks/ui/use-toast';
import { CONFIG } from '../../constants/appConfig';
import { LiquidGlassCard, LiquidGlassView, LiquidGlassButton } from '../../components/ui';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';

interface Invitation {
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

const CREDITS_PER_REFERRAL = 50;

export function InviteFriends() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { horizontalPadding } = useResponsiveLayout();
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();

  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const {
    data: invitations,
    isLoading: loadingInvitations,
    isError: queryError,
    refetch,
  } = useQuery<Invitation[]>({
    queryKey: queryKeys.creatorMembers.invitations(),
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: Invitation[] }>(
        '/api/v1/app/creator-members/invitations'
      );
      return response.data;
    },
    enabled: !!user?.id,
    retry: 2,
  });

  const createInvitationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ success: boolean; data: { token: string } }>('/api/v1/app/creator-members/invitations', {
        method: 'POST',
        data: {},
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'CREATOR_INVITATION_CREATED' });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
  });

  const activeInvitation = invitations?.find(inv => !inv.isExpired && !inv.isMaxedOut);
  const inviteCode = activeInvitation?.token;
  const totalUses = invitations?.reduce((sum, inv) => sum + inv.useCount, 0) ?? 0;

  const handleCreateInvitation = () => {
    createInvitationMutation.mutate();
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCodeCopied(true);
    toast({ title: t('sharing.codeCopied') });
    setTimeout(() => setCodeCopied(false), CONFIG.ui.delays.toastDurationMs);
  };

  const handleCopyLink = async () => {
    if (!inviteCode) return;
    const link = `https://aiponge.app/invite/${inviteCode}`;
    await Clipboard.setStringAsync(link);
    setLinkCopied(true);
    toast({ title: t('sharing.linkCopied') });
    setTimeout(() => setLinkCopied(false), CONFIG.ui.delays.toastDurationMs);
  };

  const handleShare = async () => {
    if (!inviteCode) return;
    try {
      const message = t('sharing.inviteMessage', { code: inviteCode });
      const link = `https://aiponge.app/invite/${inviteCode}`;
      await Share.share({
        message: `${message}\n\n${link}`,
        title: t('sharing.inviteTitle'),
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'User did not share') {
        toast({ title: t('common.error'), variant: 'destructive' });
      }
    }
  };

  if (loadingInvitations) {
    return <LoadingState />;
  }

  if (queryError) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.text.tertiary} />
          <Text style={[styles.emptyText, { marginTop: 12 }]}>{t('common.error')}</Text>
          <TouchableOpacity
            style={[styles.shareButton, { marginTop: 16, width: '60%' }]}
            onPress={() => refetch()}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shareButtonGradient}
            >
              <Ionicons name="refresh" size={20} color={colors.text.primary} />
              <Text style={styles.shareButtonText}>{t('common.retry')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('sharing.inviteTitle')}</Text>

        {inviteCode ? (
          <>
            <View style={styles.codeSection}>
              <Text style={styles.sectionLabel}>{t('sharing.yourInviteCode')}</Text>
              <LiquidGlassView intensity="medium" borderRadius={12} showBorder style={styles.codeContainer}>
                <Text style={styles.codeText} testID="text-invite-code">
                  {inviteCode}
                </Text>
                <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode} testID="button-copy-code">
                  <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={24} color={colors.brand.primary} />
                </TouchableOpacity>
              </LiquidGlassView>
            </View>

            <LiquidGlassCard intensity="light" style={styles.rewardCard} padding={16}>
              <View style={styles.rewardRow}>
                <Ionicons name="sparkles" size={24} color={colors.semantic.warning} />
                <Text style={styles.rewardText}>{t('sharing.inviteReward', { credits: CREDITS_PER_REFERRAL })}</Text>
              </View>
            </LiquidGlassCard>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
              activeOpacity={0.8}
              testID="button-share-invite"
            >
              <LinearGradient
                colors={colors.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shareButtonGradient}
              >
                <Ionicons name="share-social" size={24} color={colors.text.primary} />
                <Text style={styles.shareButtonText}>{t('sharing.shareInvite')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.copyLinkButton} onPress={handleCopyLink} testID="button-copy-link">
              <Ionicons name={linkCopied ? 'checkmark-circle' : 'link'} size={20} color={colors.brand.primary} />
              <Text style={styles.copyLinkText}>{t('sharing.copyLink')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <LiquidGlassCard intensity="medium" padding={16} style={styles.createCard}>
            <View style={styles.createContent}>
              <Ionicons name="ticket" size={32} color={colors.brand.primary} />
              <View style={styles.createText}>
                <Text style={styles.createTitle}>{t('sharing.noActiveInvitation')}</Text>
                <Text style={styles.createDescription}>{t('sharing.createInvitationPrompt')}</Text>
              </View>
              <LiquidGlassButton
                label={
                  createInvitationMutation.isPending
                    ? t('common.loading')
                    : t('sharing.create', { defaultValue: 'Create' })
                }
                onPress={handleCreateInvitation}
                disabled={createInvitationMutation.isPending}
                size="small"
                testID="button-create-invitation"
              />
            </View>
          </LiquidGlassCard>
        )}

        <View style={styles.statsSection}>
          <LiquidGlassCard intensity="medium" style={styles.statCard} padding={10}>
            <Text style={styles.statValue}>{invitations?.length ?? 0}</Text>
            <Text style={styles.statLabel}>{t('sharing.friendsInvited')}</Text>
          </LiquidGlassCard>
          <LiquidGlassCard intensity="medium" style={styles.statCard} padding={10}>
            <Text style={styles.statValue}>{totalUses}</Text>
            <Text style={styles.statLabel}>{t('sharing.friendsJoined', { count: totalUses })}</Text>
          </LiquidGlassCard>
          <LiquidGlassCard intensity="medium" style={styles.statCard} padding={10}>
            <Text style={styles.statValue}>{totalUses * CREDITS_PER_REFERRAL}</Text>
            <Text style={styles.statLabel}>{t('sharing.creditsEarned')}</Text>
          </LiquidGlassCard>
        </View>

        <LiquidGlassCard intensity="medium" style={styles.howItWorksSection} padding={16}>
          <Text style={styles.howItWorksTitle}>{t('sharing.howItWorks')}</Text>

          <View style={styles.stepContainer}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepText}>{t('sharing.step1')}</Text>
          </View>

          <View style={styles.stepContainer}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepText}>{t('sharing.step2')}</Text>
          </View>

          <View style={styles.stepContainer}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.stepText}>{t('sharing.step3')}</Text>
          </View>
        </LiquidGlassCard>

        <View style={styles.socialProofSection}>
          <Ionicons name="people" size={20} color={colors.text.secondary} />
          <Text style={styles.socialProofText}>{t('sharing.socialProof.joinCommunity', { count: 10000 })}</Text>
        </View>
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
    loadingContainer: commonStyles.loadingContainer,
    title: {
      fontSize: 28,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 16,
      textAlign: 'center',
    },
    codeSection: {
      marginBottom: 16,
    },
    sectionLabel: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    codeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
    },
    codeText: {
      flex: 1,
      fontSize: 24,
      fontFamily: fontFamilies.body.bold,
      color: colors.brand.primary,
      letterSpacing: 2,
      textAlign: 'center',
    },
    copyButton: {
      padding: 4,
    },
    rewardCard: {
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 16,
    },
    rewardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rewardText: {
      flex: 1,
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.primary,
    },
    createCard: {
      marginBottom: 24,
      borderRadius: BORDER_RADIUS.lg,
    },
    createContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    createText: {
      flex: 1,
    },
    createTitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    createDescription: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
      textAlign: 'center',
    },
    shareButton: {
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
      marginBottom: 12,
    },
    shareButtonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      gap: 8,
    },
    shareButtonText: {
      fontSize: 17,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    copyLinkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      gap: 4,
      marginBottom: 24,
    },
    copyLinkText: {
      fontSize: 17,
      fontFamily: fontFamilies.body.medium,
      color: colors.brand.primary,
    },
    statsSection: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 22,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    statLabel: {
      fontSize: 11,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      marginTop: 1,
    },
    howItWorksSection: {
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 16,
    },
    howItWorksTitle: {
      fontSize: 17,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 12,
    },
    stepContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
      gap: 8,
    },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepNumberText: {
      fontSize: 12,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    stepText: {
      flex: 1,
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    socialProofSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    socialProofText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
    },
  });

export default InviteFriends;
