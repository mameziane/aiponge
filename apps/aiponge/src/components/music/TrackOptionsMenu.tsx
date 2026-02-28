import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable, Share, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { EditTrackModal } from './EditTrackModal';
import { useMyMusicPlaylists, MyPlaylist } from '../../hooks/playlists/useMyMusicPlaylists';
import { usePlaylistMutations } from '../../hooks/playlists/usePlaylistMutations';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { LiquidGlassView } from '../ui';
import { useAuthStore, selectUser } from '../../auth/store';
import { useIsAdmin } from '../../hooks/admin/useAdminQuery';
import { useTrackDownload } from '../../offline/useTrackDownload';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';

export interface TrackForMenu {
  id: string;
  title: string;
  displayName?: string;
  artworkUrl?: string;
  audioUrl?: string;
  duration?: number;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
  isUserGenerated?: boolean;
  playOnDate?: string | null;
}

interface TrackOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  track: TrackForMenu;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onShowLyrics?: () => void;
  onRemoveFromLibrary?: () => void;
  onTrackUpdated?: () => void;
  showEditOption?: boolean;
}

interface MenuItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  hidden?: boolean;
  iconColor?: string;
}

export function TrackOptionsMenu({
  visible,
  onClose,
  track,
  isFavorite = false,
  onToggleFavorite,
  onShowLyrics,
  onRemoveFromLibrary,
  onTrackUpdated,
  showEditOption = false,
}: TrackOptionsMenuProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const { playlists } = useMyMusicPlaylists();
  const { addTrackToPlaylist, isAddingTrack } = usePlaylistMutations();
  const user = useAuthStore(selectUser);
  const isAdmin = useIsAdmin();
  const { tierConfig } = useSubscriptionData();

  // Offline download support
  const trackDownloadInfo = useMemo(() => {
    if (!track.audioUrl) return null;
    return {
      trackId: track.id,
      title: track.title,
      displayName: track.displayName || 'Unknown',
      duration: track.duration || 0,
      artworkUrl: track.artworkUrl,
      audioUrl: track.audioUrl,
    };
  }, [track]);

  const {
    state: downloadState,
    isOfflineSupported,
    startDownload,
    removeDownload,
  } = useTrackDownload(trackDownloadInfo);

  const handleSetReminder = () => {
    onClose();
    router.push({
      pathname: '/set-reminder',
      params: {
        trackId: track.id,
        trackTitle: track.title,
        trackDisplayName: track.displayName || '',
      },
    });
  };

  const handleAddToPlaylist = () => {
    setShowPlaylistPicker(true);
  };

  const handleSelectPlaylist = async (playlistId: string) => {
    setShowPlaylistPicker(false);
    onClose();
    try {
      await addTrackToPlaylist({ playlistId, trackId: track.id });
    } catch (error: unknown) {
      logger.error('Failed to add track to playlist', error);
    }
  };

  const handleShare = async () => {
    const trackTitle = track.title;
    const trackDisplayName = track.displayName;
    const message = `Check out "${trackTitle}"${trackDisplayName ? ` by ${trackDisplayName}` : ''} on aiponge!\n\nwww.aiponge.app`;
    logger.debug('Share starting', { trackTitle, message });
    try {
      const result = await Share.share({
        message,
        title: trackTitle,
      });
      logger.debug('Share result', { action: result.action });
    } catch (error) {
      logger.error('Share failed', error);
    } finally {
      onClose();
    }
  };

  const handleViewLyrics = () => {
    onClose();
    onShowLyrics?.();
  };

  const handleEditTrack = () => {
    onClose();
    setShowEditModal(true);
  };

  const handleRemoveFromLibrary = () => {
    onClose();
    Alert.alert(t('trackOptions.removeFromLibrary'), t('trackOptions.removeConfirmation', { title: track.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: onRemoveFromLibrary,
      },
    ]);
  };

  const handleToggleFavorite = () => {
    onClose();
    onToggleFavorite?.();
  };

  const handleDownload = async () => {
    if (!isOfflineSupported) {
      Alert.alert(t('offline.notSupported'), t('offline.requiresDevBuild'));
      onClose();
      return;
    }

    if (downloadState.isDownloaded) {
      // Already downloaded - offer to remove
      Alert.alert(t('offline.removeDownload'), t('offline.removeDownloadConfirm', { title: track.title }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            await removeDownload();
            onClose();
          },
        },
      ]);
    } else if (downloadState.isDownloading) {
      // Already downloading - just close
      onClose();
    } else {
      // Start download
      await startDownload();
      onClose();
    }
  };

  const handleShareToLibrary = async () => {
    if (!track.isUserGenerated) return;

    Alert.alert(t('trackOptions.shareToLibrary'), t('trackOptions.shareToLibraryConfirm', { title: track.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.share'),
        onPress: async () => {
          try {
            const response = await apiClient.post<{ success: boolean; error?: string }>(
              '/api/v1/app/library/share-to-public',
              {
                trackId: track.id,
              }
            );
            if (response.success) {
              Alert.alert(t('common.success'), t('trackOptions.shareSuccess'));
              onTrackUpdated?.();
            } else {
              Alert.alert(t('common.error'), response.error || t('trackOptions.shareError'));
            }
          } catch (error: unknown) {
            logger.error('Failed to share track to library', error);
            Alert.alert(t('common.error'), t('trackOptions.shareError'));
          } finally {
            onClose();
          }
        },
      },
    ]);
  };

  const handleMoveToSharedLibrary = async () => {
    if (!isAdmin) return;

    Alert.alert(
      t('trackOptions.moveToSharedLibrary'),
      t('trackOptions.moveToSharedLibraryConfirm', { title: track.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.move'),
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiClient.post<{ success: boolean; error?: string }>(
                '/api/v1/app/library/admin/move-to-public',
                {
                  trackId: track.id,
                  userRole: user?.role,
                }
              );
              if (response.success) {
                Alert.alert(t('common.success'), t('trackOptions.moveSuccess'));
                onTrackUpdated?.();
              } else {
                Alert.alert(t('common.error'), response.error || t('trackOptions.moveError'));
              }
            } catch (error: unknown) {
              logger.error('Failed to move track to shared library', error);
              Alert.alert(t('common.error'), t('trackOptions.moveError'));
            } finally {
              onClose();
            }
          },
        },
      ]
    );
  };

  const menuItems: MenuItem[] = [
    {
      id: 'favorite',
      icon: isFavorite ? 'heart' : 'heart-outline',
      label: isFavorite ? t('trackOptions.removeFromFavorites') : t('trackOptions.addToFavorites'),
      onPress: handleToggleFavorite,
      hidden: !onToggleFavorite,
      iconColor: isFavorite ? colors.social.like : undefined,
    },
    {
      id: 'playlist',
      icon: 'add-circle-outline',
      label: t('trackOptions.addToPlaylist'),
      onPress: handleAddToPlaylist,
    },
    {
      id: 'reminder',
      icon: 'notifications-outline',
      label: t('trackOptions.setReminder'),
      onPress: handleSetReminder,
    },
    {
      id: 'share',
      icon: 'share-outline',
      label: t('trackOptions.share'),
      onPress: handleShare,
    },
    {
      id: 'download',
      icon: downloadState.isDownloaded
        ? 'checkmark-circle'
        : downloadState.isDownloading
          ? 'cloud-download'
          : 'cloud-download-outline',
      label: downloadState.isDownloaded
        ? t('offline.downloaded')
        : downloadState.isDownloading
          ? t('offline.downloading')
          : t('offline.downloadForOffline'),
      onPress: handleDownload,
      hidden: !track.audioUrl || !tierConfig.canDownload,
      iconColor: downloadState.isDownloaded ? colors.semantic.success : undefined,
    },
    {
      id: 'lyrics',
      icon: 'document-text-outline',
      label: t('trackOptions.viewLyrics'),
      onPress: handleViewLyrics,
      hidden: !track.lyricsId || !onShowLyrics,
    },
    {
      id: 'edit',
      icon: 'create-outline',
      label: t('trackOptions.editDetails'),
      onPress: handleEditTrack,
      hidden: !showEditOption && !track.isUserGenerated,
    },
    {
      id: 'shareToLibrary',
      icon: 'globe-outline',
      label: t('trackOptions.shareToLibrary'),
      onPress: handleShareToLibrary,
      hidden: !track.isUserGenerated,
    },
    {
      id: 'moveToSharedLibrary',
      icon: 'arrow-forward-circle-outline',
      label: t('trackOptions.moveToSharedLibrary'),
      onPress: handleMoveToSharedLibrary,
      hidden: !isAdmin || !track.isUserGenerated,
      iconColor: colors.brand.secondary,
    },
    {
      id: 'remove',
      icon: 'trash-outline',
      label: t('trackOptions.removeFromLibrary'),
      onPress: handleRemoveFromLibrary,
      destructive: true,
      hidden: !onRemoveFromLibrary,
    },
  ];

  const visibleItems = menuItems.filter(item => !item.hidden);

  if (showPlaylistPicker) {
    return (
      <>
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setShowPlaylistPicker(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowPlaylistPicker(false)}>
            <LiquidGlassView intensity="strong" borderRadius={20} showBorder={false} style={styles.menuContainer}>
              <View style={styles.trackHeader}>
                <Text style={styles.headerTitle}>{t('trackOptions.selectPlaylist')}</Text>
              </View>
              <View style={styles.divider} />
              {playlists && playlists.length > 0 ? (
                <ScrollView style={styles.playlistScrollView} bounces={false}>
                  {playlists.map((playlist: MyPlaylist, index: number) => (
                    <View key={playlist.id}>
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleSelectPlaylist(playlist.id)}
                        disabled={isAddingTrack}
                        testID={`playlist-option-${playlist.id}`}
                      >
                        <Ionicons name="list" size={22} color={colors.brand.primary} />
                        <Text style={styles.menuItemText} numberOfLines={1}>
                          {playlist.name}
                        </Text>
                      </TouchableOpacity>
                      {index < playlists.length - 1 && <View style={styles.menuDivider} />}
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.emptyPlaylists}>
                  <Ionicons name="musical-notes-outline" size={32} color={colors.text.tertiary} />
                  <Text style={styles.emptyText}>{t('trackOptions.noPlaylists')}</Text>
                </View>
              )}
            </LiquidGlassView>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable
          style={styles.overlay}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <LiquidGlassView intensity="strong" borderRadius={20} showBorder={false} style={styles.menuContainer}>
            <View style={styles.trackHeader}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {track.title}
              </Text>
              {track.displayName && (
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {track.displayName}
                </Text>
              )}
            </View>
            <View style={styles.divider} />
            {visibleItems.map((item, index) => (
              <View key={item.id}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={item.onPress}
                  testID={`track-option-${item.id}`}
                  accessibilityRole="menuitem"
                  accessibilityLabel={item.label}
                >
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={item.destructive ? colors.semantic.error : item.iconColor || colors.text.primary}
                  />
                  <Text style={[styles.menuItemText, item.destructive && styles.menuItemTextDestructive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
                {index < visibleItems.length - 1 && <View style={styles.menuDivider} />}
              </View>
            ))}
          </LiquidGlassView>
        </Pressable>
      </Modal>

      <EditTrackModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        track={track}
        onSave={onTrackUpdated}
      />
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'flex-end',
    },
    menuContainer: {
      paddingBottom: 34,
    },
    trackHeader: {
      padding: 20,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    trackTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    trackArtist: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.muted,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      gap: 16,
    },
    menuItemText: {
      fontSize: 16,
      color: colors.text.primary,
      fontWeight: '500',
      flex: 1,
    },
    menuItemTextDestructive: {
      color: colors.semantic.error,
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.border.muted,
      marginHorizontal: 20,
    },
    playlistScrollView: {
      maxHeight: 400,
    },
    emptyPlaylists: {
      padding: 32,
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
  });
