import { useState, useCallback, useMemo } from 'react';
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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useAuthStore, selectUser } from '../../auth/store';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { fontFamilies } from '../../theme/typography';
import { useResponsiveLayout } from '../../hooks/ui/useResponsiveLayout';
import { useToast } from '../../hooks/ui/use-toast';
import { LiquidGlassCard, LiquidGlassButton, LiquidGlassView } from '../../components/ui';
import { BaseModal } from '../../components/shared/BaseModal';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';

interface Creator {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorEmail?: string;
  creatorAvatar?: string | null;
  isLibrarian: boolean;
  status: string;
  followedAt: string;
}

export function FollowingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { toast } = useToast();
  const { horizontalPadding } = useResponsiveLayout();
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteToken, setInviteToken] = useState('');

  const {
    data: following,
    isLoading,
    refetch,
  } = useQuery<Creator[]>({
    queryKey: queryKeys.creatorMembers.following(),
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: Creator[] }>('/api/v1/app/creator-members/following');
      return response.data;
    },
    enabled: !!user?.id,
  });

  const unfollowMutation = useMutation({
    mutationFn: async (creatorId: string) => {
      return apiRequest(`/api/v1/app/creator-members/following/${creatorId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'CREATOR_MEMBER_JOINED' });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: 'destructive' });
    },
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: async (token: string) => {
      const sanitized = encodeURIComponent(token.trim());
      return apiRequest(`/api/v1/app/creator-members/invitations/${sanitized}/accept`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'CREATOR_MEMBER_JOINED' });
      setShowJoinModal(false);
      setInviteToken('');
      toast({ title: t('creatorMembers.joinedCreator') });
    },
    onError: () => {
      toast({ title: t('creatorMembers.invalidInvitation'), variant: 'destructive' });
    },
  });

  const handleUnfollow = useCallback(
    (creator: Creator) => {
      if (creator.isLibrarian) {
        toast({ title: t('creatorMembers.cannotUnfollowLibrarian'), variant: 'destructive' });
        return;
      }

      Alert.alert(
        t('creatorMembers.unfollowTitle'),
        t('creatorMembers.unfollowConfirm', { name: creator.creatorName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('creatorMembers.unfollow'),
            style: 'destructive',
            onPress: () => unfollowMutation.mutate(creator.creatorId),
          },
        ]
      );
    },
    [unfollowMutation, toast, t]
  );

  const handleJoinWithToken = () => {
    if (!inviteToken.trim()) {
      toast({ title: t('creatorMembers.enterToken'), variant: 'destructive' });
      return;
    }
    acceptInvitationMutation.mutate(inviteToken.trim());
  };

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const librarians = following?.filter(c => c.isLibrarian) || [];
  const creators = following?.filter(c => !c.isLibrarian) || [];

  const renderCreatorItem = ({ item }: { item: Creator }) => (
    <LiquidGlassCard intensity="light" padding={16} style={styles.creatorCard}>
      <View style={styles.creatorContent}>
        {item.creatorAvatar ? (
          <Image
            source={{ uri: item.creatorAvatar }}
            style={[styles.creatorAvatar, styles.creatorAvatarImage, item.isLibrarian && styles.librarianAvatar]}
          />
        ) : (
          <View style={[styles.creatorAvatar, item.isLibrarian && styles.librarianAvatar]}>
            <Ionicons
              name={item.isLibrarian ? 'library' : 'person'}
              size={24}
              color={item.isLibrarian ? colors.semantic.success : colors.brand.primary}
            />
          </View>
        )}
        <View style={styles.creatorInfo}>
          <View style={styles.creatorNameRow}>
            <Text style={styles.creatorName}>{item.creatorName || item.creatorEmail || '—'}</Text>
            {item.isLibrarian && (
              <View style={styles.librarianBadge}>
                <Text style={styles.librarianBadgeText}>{t('creatorMembers.librarian')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.creatorDate}>
            {t('creatorMembers.followingSince', { date: new Date(item.followedAt).toLocaleDateString() })}
          </Text>
        </View>
        {!item.isLibrarian && (
          <TouchableOpacity style={styles.unfollowButton} onPress={() => handleUnfollow(item)}>
            <Ionicons name="person-remove" size={20} color={colors.semantic.error} />
          </TouchableOpacity>
        )}
      </View>
    </LiquidGlassCard>
  );

  if (isLoading) {
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
        <Text style={styles.title}>{t('creatorMembers.followingTitle')}</Text>

        <LiquidGlassCard intensity="medium" padding={16} style={styles.joinCard}>
          <View style={styles.joinContent}>
            <Ionicons name="ticket" size={32} color={colors.brand.primary} />
            <View style={styles.joinText}>
              <Text style={styles.joinTitle}>{t('creatorMembers.haveInvitation')}</Text>
              <Text style={styles.joinDescription}>{t('creatorMembers.enterTokenToJoin')}</Text>
            </View>
            <LiquidGlassButton
              label={t('creatorMembers.join')}
              onPress={() => setShowJoinModal(true)}
              size="small"
              testID="button-join-creator"
            />
          </View>
        </LiquidGlassCard>

        {librarians.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('creatorMembers.officialLibrary')}</Text>
            <FlatList
              data={librarians}
              renderItem={renderCreatorItem}
              keyExtractor={item => item.creatorId}
              scrollEnabled={false}
              style={styles.listContent}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('creatorMembers.creatorsYouFollow')}</Text>
          {creators.length > 0 ? (
            <FlatList
              data={creators}
              renderItem={renderCreatorItem}
              keyExtractor={item => item.creatorId}
              scrollEnabled={false}
              style={styles.listContent}
            />
          ) : (
            <LiquidGlassCard intensity="light" padding={24} style={styles.emptyCard}>
              <Ionicons name="people-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>{t('creatorMembers.notFollowingAnyone')}</Text>
              <Text style={styles.emptySubtext}>{t('creatorMembers.useInvitationToFollow')}</Text>
            </LiquidGlassCard>
          )}
        </View>

        <LiquidGlassCard intensity="medium" style={styles.infoCard} padding={16}>
          <View style={styles.infoRow}>
            <Ionicons name="eye" size={24} color={colors.brand.primary} />
            <Text style={styles.infoText}>{t('creatorMembers.followingBenefits')}</Text>
          </View>
        </LiquidGlassCard>
      </ScrollView>

      <BaseModal
        visible={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title={t('creatorMembers.joinCreatorTitle')}
        headerIcon="ticket"
        testID="modal-join-creator"
        avoidKeyboard
        scrollable={false}
        maxHeight="45%"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalDescription}>{t('creatorMembers.joinCreatorDescription')}</Text>

          <LiquidGlassView intensity="light" borderRadius={12} style={styles.tokenInput}>
            <View style={styles.tokenInputContent}>
              <Ionicons name="key" size={20} color={colors.text.tertiary} />
              <TextInput
                style={styles.tokenInputText}
                value={inviteToken}
                onChangeText={text => setInviteToken(text.replace(/\s/g, ''))}
                placeholder={t('creatorMembers.tokenPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                testID="input-invite-token"
              />
            </View>
          </LiquidGlassView>

          <LiquidGlassButton
            label={acceptInvitationMutation.isPending ? t('common.loading') : t('creatorMembers.acceptInvitation')}
            onPress={handleJoinWithToken}
            disabled={acceptInvitationMutation.isPending || !inviteToken}
            fullWidth
            testID="button-confirm-join"
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
    title: {
      fontSize: 28,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 16,
      textAlign: 'center',
    },
    joinCard: {
      marginBottom: 24,
      borderRadius: BORDER_RADIUS.lg,
    },
    joinContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    joinText: {
      flex: 1,
    },
    joinTitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    joinDescription: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
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
    creatorCard: {
      borderRadius: BORDER_RADIUS.md,
    },
    creatorContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    creatorAvatar: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.overlay.purple[20],
      justifyContent: 'center',
      alignItems: 'center',
    },
    creatorAvatarImage: {
      resizeMode: 'cover',
    },
    librarianAvatar: {
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.semantic.success,
    },
    creatorInfo: {
      flex: 1,
    },
    creatorNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    creatorName: {
      fontSize: 16,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
    },
    librarianBadge: {
      backgroundColor: colors.semantic.success,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    librarianBadgeText: {
      fontSize: 10,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      textTransform: 'uppercase',
    },
    creatorDate: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
    },
    unfollowButton: {
      padding: 8,
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
    tokenInput: {
      padding: 16,
    },
    tokenInputContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    tokenInputText: {
      flex: 1,
      fontSize: 18,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      letterSpacing: 2,
    },
  });

export default FollowingScreen;
