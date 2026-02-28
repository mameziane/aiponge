import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isContentPubliclyAccessible } from '@aiponge/shared-contracts';
import { useAlbumDetail } from '../../hooks/music/useAlbums';
import { useSharedAlbumDetail } from '../../hooks/playlists/useSharedAlbums';
import { useFavorites } from '../../hooks/playlists/useFavorites';
import { useAuthStore, selectUserId } from '../../auth/store';
import { TrackItem } from '../../components/music/TrackItem';
import { EditAlbumModal } from '../../components/playlists/EditAlbumModal';
import { PlaybackControls } from '../../components/music/PlaybackControls';
import { LyricsModal } from '../../components/music/LyricsModal';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';
import { usePlaybackQueue, usePlaybackState } from '../../contexts/PlaybackContext';
import { useUnifiedPlaybackControl } from '../../hooks/music/useUnifiedPlaybackControl';
import { configureAudioSession } from '../../hooks/music/audioSession';
import { getApiGatewayUrl } from '../../lib/apiConfig';
import { apiRequest } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { useIsLibrarian } from '../../hooks/admin/useAdminQuery';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';

interface AlbumTrack {
  id: string;
  title: string;
  displayName: string;
  audioUrl: string;
  artworkUrl?: string;
  durationSeconds: number;
  trackNumber: number;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type TranslateFunc = (key: string, options?: Record<string, unknown>) => string;

function formatTotalDuration(seconds: number, t: TranslateFunc): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    return t('common.durationMinutes', { count: mins });
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return t('common.durationHoursMinutes', { hours, minutes: remainingMins });
}

export function AlbumDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ albumId: string; visibility?: string }>();
  const albumId = params.albumId;
  const isShared = isContentPubliclyAccessible(params.visibility || '');

  const userAlbumQuery = useAlbumDetail(isShared ? undefined : albumId);
  const sharedAlbumQuery = useSharedAlbumDetail(isShared ? albumId : undefined);

  const { album, tracks, isLoading, isError, refetch } = isShared ? sharedAlbumQuery : userAlbumQuery;
  const userId = useAuthStore(selectUserId);
  const isLibrarian = useIsLibrarian();
  const queryClient = useQueryClient();
  const { isFavorite, toggleFavorite } = useFavorites(userId || '');
  const [showEditModal, setShowEditModal] = useState(false);
  const [lyricsModal, setLyricsModal] = useState<{ visible: boolean; lyricsId?: string; trackTitle: string }>({
    visible: false,
    lyricsId: undefined,
    trackTitle: '',
  });

  const isOwner = album && 'userId' in album && album.userId === userId;
  const canDelete = isOwner || (isShared && isLibrarian);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!albumId) throw new Error('Missing albumId');
      await apiRequest(`/api/v1/app/library/albums/${albumId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      if (albumId) {
        const filterAlbumOut = (old: unknown): unknown => {
          if (!old || typeof old !== 'object') return old;
          const d = old as Record<string, unknown>;
          if (d.data && typeof d.data === 'object') {
            const data = d.data as Record<string, unknown>;
            if (Array.isArray(data.albums)) {
              return {
                ...d,
                data: {
                  ...data,
                  albums: data.albums.filter((a: { id: string }) => a.id !== albumId),
                  total: Math.max(0, ((data.total as number) || 0) - 1),
                },
              };
            }
          }
          return old;
        };

        queryClient.setQueriesData({ queryKey: queryKeys.albums.list() }, filterAlbumOut);
        queryClient.setQueriesData({ queryKey: queryKeys.albums.public() }, filterAlbumOut);

        queryClient.removeQueries({ queryKey: queryKeys.albums.detail(albumId) });
        queryClient.removeQueries({ queryKey: queryKeys.albums.publicDetail(albumId) });

        invalidateOnEvent(queryClient, { type: 'ALBUM_DELETED', albumId });
      }
      router.back();
    },
    onError: (error: Error) => {
      logger.error('[AlbumDetail] Delete failed', error);
      Alert.alert(t('common.error'), t('albums.deleteFailed'));
    },
  });

  const handleDeleteAlbum = useCallback(() => {
    if (!albumId) return;
    Alert.alert(t('albums.deleteAlbum'), t('albums.deleteAlbumConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  }, [t, deleteMutation, albumId]);

  const handleShowLyrics = useCallback((track: AlbumTrack) => {
    if (track.lyricsId) {
      setLyricsModal({
        visible: true,
        lyricsId: track.lyricsId,
        trackTitle: track.title,
      });
    }
  }, []);

  const handleCloseLyrics = useCallback(() => {
    setLyricsModal({ visible: false, lyricsId: undefined, trackTitle: '' });
  }, []);
  const {
    setQueue,
    shuffleEnabled,
    repeatMode,
    toggleShuffle,
    cycleRepeat,
    next,
    previous,
    hasNext,
    hasPrevious,
    trackCount,
    syncCurrentIndex,
  } = usePlaybackQueue();

  const resolveUrl = useCallback((url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const baseUrl = getApiGatewayUrl();
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }, []);

  const queueTracks = useMemo(
    () =>
      tracks.map(t => ({
        id: t.id,
        title: t.title,
        audioUrl: resolveUrl(t.audioUrl),
        artworkUrl: resolveUrl(t.artworkUrl),
        displayName: t.displayName,
        duration: t.durationSeconds,
        lyricsId: t.lyricsId,
        hasSyncedLyrics: t.hasSyncedLyrics,
      })),
    [tracks, resolveUrl]
  );

  const { currentTrack, isPlaying } = usePlaybackState();
  const { togglePlayPause: unifiedToggle, playNewTrack } = useUnifiedPlaybackControl();

  const onPlayTrack = useCallback(
    async (track: AlbumTrack, index: number) => {
      if (album && queueTracks.length > 0) {
        setQueue(queueTracks, { type: 'album', id: album.id, title: album.title }, index);
      }

      const resolvedAudioUrl = resolveUrl(track.audioUrl);
      const resolvedArtworkUrl = resolveUrl(track.artworkUrl);

      if (!resolvedAudioUrl) {
        logger.error('[AlbumDetail] Track has no audio URL', { trackId: track.id });
        return;
      }

      try {
        await configureAudioSession();
        const playableTrack = {
          id: track.id,
          title: track.title,
          audioUrl: resolvedAudioUrl,
          artworkUrl: resolvedArtworkUrl,
          displayName: track.displayName,
          duration: track.durationSeconds,
          lyricsId: track.lyricsId,
          hasSyncedLyrics: track.hasSyncedLyrics,
        };
        await playNewTrack(playableTrack, resolvedAudioUrl);
        syncCurrentIndex(track.id);
        logger.debug('[AlbumDetail] Started playback', { trackId: track.id });
      } catch (error) {
        logger.error('[AlbumDetail] Playback failed', error);
      }
    },
    [playNewTrack, album, queueTracks, setQueue, resolveUrl, syncCurrentIndex]
  );

  const handleTogglePlayPause = useCallback(async () => {
    if (currentTrack) {
      await unifiedToggle();
    } else if (tracks.length > 0) {
      onPlayTrack(tracks[0], 0);
    }
  }, [currentTrack, unifiedToggle, tracks, onPlayTrack]);

  const handleNextTrack = useCallback(async () => {
    const nextTrack = next();
    if (nextTrack) {
      if (!nextTrack.audioUrl) {
        logger.error('[AlbumDetail] Next track has no audio URL', { trackId: nextTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        await playNewTrack(nextTrack, nextTrack.audioUrl);
        logger.debug('[AlbumDetail] Playing next track', { trackId: nextTrack.id });
      } catch (error) {
        logger.error('[AlbumDetail] Failed to play next track', error);
      }
    }
  }, [next, playNewTrack]);

  const handlePreviousTrack = useCallback(async () => {
    const prevTrack = previous();
    if (prevTrack) {
      if (!prevTrack.audioUrl) {
        logger.error('[AlbumDetail] Previous track has no audio URL', { trackId: prevTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        await playNewTrack(prevTrack, prevTrack.audioUrl);
        logger.debug('[AlbumDetail] Playing previous track', { trackId: prevTrack.id });
      } catch (error) {
        logger.error('[AlbumDetail] Failed to play previous track', error);
      }
    }
  }, [previous, playNewTrack]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderTrackItem = useCallback(
    ({ item: track, index }: { item: AlbumTrack; index: number }) => {
      const isActive = currentTrack?.id === track.id;

      return (
        <TrackItem
          track={{
            id: track.id,
            title: track.title,
            displayName: track.displayName,
            artworkUrl: track.artworkUrl,
            duration: track.durationSeconds,
            lyricsId: track.lyricsId,
            hasSyncedLyrics: track.hasSyncedLyrics,
          }}
          isActive={isActive}
          isPlaying={isActive && isPlaying}
          onPress={() => onPlayTrack(track, index)}
          formatDuration={formatDuration}
          onToggleFavorite={() => toggleFavorite(track.id)}
          isFavorite={isFavorite(track.id)}
          onShowLyrics={track.lyricsId ? () => handleShowLyrics(track) : undefined}
        />
      );
    },
    [currentTrack?.id, isPlaying, onPlayTrack, isFavorite, toggleFavorite, handleShowLyrics]
  );

  const handleOpenEditModal = useCallback(() => {
    setShowEditModal(true);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
  }, []);

  const handleAlbumSaved = useCallback(() => {
    refetch();
  }, [refetch]);

  const ListHeaderComponent = useMemo(() => {
    if (!album) return null;

    return (
      <View style={styles.header}>
        <View style={styles.headerNav}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            testID="button-back"
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{album?.title ?? t('albums.detailTitle')}</Text>
          <View style={styles.headerActions}>
            {!isShared && (
              <TouchableOpacity
                onPress={handleOpenEditModal}
                style={styles.headerActionButton}
                testID="button-edit-album"
                accessibilityRole="button"
                accessibilityLabel={t('common.edit')}
              >
                <Ionicons name="create-outline" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            )}
            {canDelete &&
              (deleteMutation.isPending ? (
                <View style={styles.headerActionButton}>
                  <ActivityIndicator size="small" color={colors.semantic.error} />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleDeleteAlbum}
                  style={styles.headerActionButton}
                  testID="button-delete-album"
                  accessibilityRole="button"
                  accessibilityLabel={t('albums.deleteAlbum')}
                >
                  <Ionicons name="trash-outline" size={22} color={colors.semantic.error} />
                </TouchableOpacity>
              ))}
            {!canDelete && isShared && <View style={styles.headerActionButton} />}
          </View>
        </View>

        <View style={styles.albumHeader}>
          {album.coverArtworkUrl ? (
            <Image
              source={{ uri: album.coverArtworkUrl }}
              style={styles.albumArtwork}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <View style={styles.albumArtworkPlaceholder}>
              <Ionicons name="musical-notes" size={64} color={colors.brand.primary} />
            </View>
          )}

          <Text style={styles.albumTitle} numberOfLines={2}>
            {album.title}
          </Text>

          {'mood' in album && album.mood && (
            <View style={styles.moodBadge}>
              <Text style={styles.moodText}>{album.mood}</Text>
            </View>
          )}

          <Text style={styles.albumMeta}>
            {t('albums.trackCount', { count: tracks.length })}
            {'totalDurationSeconds' in album &&
              album.totalDurationSeconds > 0 &&
              ` · ${formatTotalDuration(album.totalDurationSeconds, t)}`}
          </Text>

          {'description' in album && album.description && (
            <Text style={styles.albumDescription} numberOfLines={3}>
              {album.description}
            </Text>
          )}
        </View>

        {/* Playback Controls - below album artwork */}
        <PlaybackControls
          shuffleEnabled={shuffleEnabled}
          repeatMode={repeatMode}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
          onPrevious={hasPrevious ? handlePreviousTrack : undefined}
          onNext={hasNext ? handleNextTrack : undefined}
          onPlayPause={handleTogglePlayPause}
          isPlaying={isPlaying}
        />

        <View style={styles.trackListHeader}>
          <Text style={styles.trackListTitle}>{t('albums.tracks')}</Text>
        </View>
      </View>
    );
  }, [
    album,
    tracks.length,
    handleOpenEditModal,
    router,
    t,
    shuffleEnabled,
    repeatMode,
    toggleShuffle,
    cycleRepeat,
    hasPrevious,
    hasNext,
    handlePreviousTrack,
    handleNextTrack,
    handleTogglePlayPause,
    isPlaying,
    canDelete,
    deleteMutation.isPending,
    handleDeleteAlbum,
  ]);

  if (isLoading) {
    return <LoadingState message={t('albums.loading')} />;
  }

  if (isError || !album) {
    return <ErrorState message={t('albums.failedToLoad')} />;
  }

  return (
    <View style={styles.container} testID="album-detail-page">
      <Stack.Screen
        options={{
          title: album?.title ?? t('albums.detailTitle'),
          headerShown: false,
        }}
      />

      <FlatList
        data={tracks}
        renderItem={renderTrackItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeaderComponent}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        testID="album-track-list"
      />

      {album && !isShared && (
        <EditAlbumModal
          visible={showEditModal}
          onClose={handleCloseEditModal}
          album={{
            id: album.id,
            title: album.title,
            description: 'description' in album ? album.description : undefined,
            coverArtworkUrl: album.coverArtworkUrl,
          }}
          onSave={handleAlbumSaved}
        />
      )}

      <LyricsModal
        visible={lyricsModal.visible}
        onClose={handleCloseLyrics}
        lyricsId={lyricsModal.lyricsId}
        trackTitle={lyricsModal.trackTitle}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    contentContainer: {
      paddingBottom: 100,
    },
    backButtonError: {
      position: 'absolute',
      top: 60,
      left: 16,
      padding: 8,
    },
    header: {
      paddingTop: 60,
    },
    headerNav: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    backButton: {
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
    },
    editButton: {
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerActionButton: {
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    albumHeader: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 24,
    },
    albumArtwork: {
      width: 200,
      height: 200,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 16,
    },
    placeholderArtwork: {
      width: 200,
      height: 200,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    albumArtworkPlaceholder: {
      width: 200,
      height: 200,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.state.hover,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    albumTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    moodBadge: {
      backgroundColor: `${colors.brand.primary}20`,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: 8,
    },
    moodText: {
      fontSize: 13,
      color: colors.brand.primary,
      fontWeight: '500',
      textTransform: 'capitalize',
    },
    albumMeta: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    albumDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    trackListHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    trackListTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });

const styles = StyleSheet.create({});
