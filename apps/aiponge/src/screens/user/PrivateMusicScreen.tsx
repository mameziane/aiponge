import type { ServiceResponse } from '@aiponge/shared-contracts';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Animated, Alert, Share } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useMyMusic, MyMusicTrack } from '../../hooks/playlists/useMyMusic';
import { useMyMusicPlaylists } from '../../hooks/playlists/useMyMusicPlaylists';
import { useAlbums } from '../../hooks/music/useAlbums';
import { useFavorites } from '../../hooks/playlists/useFavorites';
import { useLyricsModal } from '../../hooks/music/useLyricsModal';
import { useTrackListOptimization } from '../../hooks/music/useTrackListOptimization';
import { useTrackOptionsScreen } from '../../hooks/music/useTrackOptions';
import { LyricsModal } from '../../components/music/LyricsModal';
import { TrackItem } from '../../components/music/TrackItem';
import { PlaybackControls } from '../../components/music/PlaybackControls';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../theme';
import { useAuthStore, selectUser } from '../../auth/store';
import { apiRequest } from '../../lib/axiosApiClient';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { useDownloadStore } from '../../offline/store';
import { LiquidGlassCard } from '../../components/ui';
import { usePlaybackQueue } from '../../contexts/PlaybackContext';

export function PrivateMusicScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ selectPlaylist?: string }>();

  const {
    tracks,
    total,
    currentTrack,
    isPlaying,
    isLoading,
    isError,
    selectedPlaylistId,
    setSelectedPlaylistId,
    shuffleEnabled,
    repeatMode,
    handleToggleShuffle,
    handleCycleRepeat,
    handleNextTrack,
    handlePreviousTrack,
    handleTogglePlayPause,
    handlePlayTrack,
    handleDeleteTrack,
    isDeletingTrack,
    formatDuration,
    getRelativeTimeString,
    hasNoTracks,
  } = useMyMusic();

  // Load user's playlists
  const { playlists } = useMyMusicPlaylists();

  // Load user's albums
  const { albums } = useAlbums();

  // Favorites management
  const user = useAuthStore(selectUser);
  const userId = user?.id;
  const displayName = user?.name || 'You';
  const { isFavorite, toggleFavorite } = useFavorites(userId || '');

  // Query client for cache invalidation
  const queryClient = useQueryClient();

  // Handler to refresh library after track edit
  const handleTrackUpdated = useCallback(async () => {
    logger.debug('[MyMusic] handleTrackUpdated called, starting refetch');
    // Use centralized cache invalidation
    invalidateOnEvent(queryClient, { type: 'PRIVATE_LIBRARY_UPDATED', playlistId: selectedPlaylistId || undefined });
    // Force immediate refetch to ensure UI updates
    const refetchPromises = [queryClient.refetchQueries({ queryKey: queryKeys.tracks.private() })];
    if (selectedPlaylistId) {
      refetchPromises.push(queryClient.refetchQueries({ queryKey: queryKeys.playlists.tracks(selectedPlaylistId) }));
    }
    await Promise.all(refetchPromises);
    logger.debug('[MyMusic] handleTrackUpdated refetch completed');
  }, [queryClient, selectedPlaylistId]);

  // Shared hooks for common functionality
  const { lyricsModal, handleShowLyrics, handleCloseLyrics } = useLyricsModal();
  const { getItemLayout, flatListProps } = useTrackListOptimization<MyMusicTrack>();

  // Centralized track options
  const { getMenuPropsForTrack } = useTrackOptionsScreen<MyMusicTrack>('myMusic', {
    handleShowLyrics,
    toggleFavorite,
    isFavorite,
    handleDeleteTrack,
    handleTrackUpdated,
  });

  const keyExtractor = useCallback((item: MyMusicTrack) => item.id, []);
  const extraData = useMemo(() => ({ isFavorite, tracksData: tracks }), [isFavorite, tracks]);

  interface LyricsData {
    syncedLines?: Array<{ text: string; startMs?: number }>;
    content?: string;
  }

  const extractLyricPreview = useCallback((lyricsData: LyricsData | null): string => {
    if (!lyricsData) return '';

    // If we have synced lines, extract first 2-3 lines
    if (lyricsData.syncedLines && lyricsData.syncedLines.length > 0) {
      const previewLines = lyricsData.syncedLines
        .slice(0, 3)
        .map(line => line.text)
        .filter((text: string) => text && text.trim().length > 0);
      return previewLines.join('\n');
    }

    // Otherwise, extract first 2-3 lines from content
    if (lyricsData.content) {
      const lines = lyricsData.content
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .slice(0, 3);
      return lines.join('\n');
    }

    return '';
  }, []);

  const shareTrackWithOptions = useCallback(
    async (track: MyMusicTrack, includeLyrics: boolean) => {
      try {
        // Determine if this is a user-created track or a library track
        const isUserCreated = track.displayName === 'You' || track.displayName === displayName;

        let message: string;

        if (isUserCreated) {
          // User-created track
          message = `🎵 "${track.title}"\n\nA personal track I created on aiponge - music born from my own emotions.`;
        } else {
          // Library track
          const artistInfo = track.displayName ? ` by ${track.displayName}` : '';
          message = `🎵 "${track.title}"${artistInfo}\n\nA track I discovered on aiponge that resonates with my journey.`;
        }

        // Fetch and add lyrics preview if requested
        if (includeLyrics && track.lyricsId) {
          try {
            const response = (await apiRequest(
              `/api/v1/app/lyrics/id/${track.lyricsId}`
            )) as ServiceResponse<LyricsData>;
            if (response?.data) {
              const preview = extractLyricPreview(response.data);
              if (preview) {
                message += `\n\n📝 Lyric Preview:\n"${preview}..."\n`;
              }
            }
          } catch (error) {
            logger.error('Failed to fetch lyrics for share', error);
            // Continue with sharing even if lyrics fetch fails
          }
        }

        // Add app download link
        message += `\n\nDiscover your own sound:\n🎵 www.aiponge.app`;

        const result = await Share.share({ message });

        if (result.action === Share.sharedAction) {
          logger.debug('Track shared successfully');
        }
      } catch (error: unknown) {
        const typedError = error as { message?: string };
        Alert.alert(t('myMusic.unableToShare'), typedError?.message || t('myMusic.shareError'));
      }
    },
    [extractLyricPreview, t, displayName]
  );

  const handleShareTrack = useCallback(
    async (track: MyMusicTrack) => {
      Alert.alert(
        t('myMusic.shareTrack'),
        track.lyricsId ? t('myMusic.includePreview') : t('myMusic.shareThisTrack'),
        track.lyricsId
          ? [
              {
                text: t('common.cancel'),
                style: 'cancel',
              },
              {
                text: t('myMusic.withoutLyrics'),
                onPress: () => shareTrackWithOptions(track, false),
              },
              {
                text: t('myMusic.withLyricsPreview'),
                onPress: () => shareTrackWithOptions(track, true),
              },
            ]
          : [
              {
                text: t('common.cancel'),
                style: 'cancel',
              },
              {
                text: t('myMusic.share'),
                onPress: () => shareTrackWithOptions(track, false),
              },
            ],
        { cancelable: true }
      );
    },
    [t, shareTrackWithOptions]
  );

  // Auto-select playlist if passed as param (only on mount or param change)
  useEffect(() => {
    if (params.selectPlaylist) {
      setSelectedPlaylistId(params.selectPlaylist);
    }
  }, [params.selectPlaylist]);

  // Playback queue context for cross-screen navigation
  const { setQueue } = usePlaybackQueue();

  // Convert tracks to queue format
  const queueTracks = useMemo(
    () =>
      tracks.map(t => ({
        id: t.id,
        title: t.title,
        audioUrl: t.audioUrl,
        artworkUrl: t.artworkUrl,
        displayName: t.displayName,
        duration: t.duration,
        lyricsId: t.lyricsId,
        hasSyncedLyrics: t.hasSyncedLyrics,
      })),
    [tracks]
  );

  // Handle track tap: toggle play/pause and set queue
  const handleTrackTap = useCallback(
    (track: MyMusicTrack) => {
      const trackIndex = tracks.findIndex(t => t.id === track.id);
      const playlistTitle = playlists.find(p => p.id === selectedPlaylistId)?.name;
      setQueue(
        queueTracks,
        {
          type: selectedPlaylistId ? 'playlist' : 'library',
          id: selectedPlaylistId || 'my-music',
          title: playlistTitle || t('navigation.myMusic'),
        },
        trackIndex >= 0 ? trackIndex : 0
      );
      handlePlayTrack(track);
    },
    [handlePlayTrack, tracks, queueTracks, setQueue, selectedPlaylistId, playlists, t]
  );

  // Handle long press: navigate to track detail screen
  // If track is already playing, just show full screen without restarting
  // If different track, start playing it first
  const handleTrackLongPress = useCallback(
    async (track: MyMusicTrack) => {
      // Only start playing if it's a different track
      if (currentTrack?.id !== track.id) {
        await handlePlayTrack(track);
      }
      router.push({
        pathname: '/private-track-detail',
        params: { track: JSON.stringify(track) },
      });
    },
    [router, handlePlayTrack, currentTrack]
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderRightActions = useCallback(
    (track: MyMusicTrack) =>
      (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
        const trans = dragX.interpolate({
          inputRange: [-80, 0],
          outputRange: [0, 80],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            style={[
              styles.deleteAction,
              {
                transform: [{ translateX: trans }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => {
                Alert.alert(
                  t('myMusic.deleteTrack'),
                  t('myMusic.deleteConfirmation', { title: track.title }),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: () => handleDeleteTrack(track.id),
                    },
                  ],
                  { cancelable: true }
                );
              }}
              testID={`button-delete-${track.id}`}
            >
              <Ionicons name="trash" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </Animated.View>
        );
      },
    [handleDeleteTrack]
  );

  const handleClearFilter = useCallback(() => {
    setSelectedPlaylistId(null);
    router.setParams({ selectPlaylist: undefined });
  }, [setSelectedPlaylistId, router]);

  const handleGoToPlaylists = useCallback(() => {
    router.push('/playlists');
  }, [router]);

  const handleGoToDownloads = useCallback(() => {
    router.push('/(library)/downloads');
  }, [router]);

  const handleGoToAlbums = useCallback(() => {
    router.push('/(library)/albums');
  }, [router]);

  const handleGoToCreate = useCallback(() => {
    router.push('/create');
  }, [router]);

  // Offline downloads count
  const downloads = useDownloadStore(state => state.downloads);
  const downloadCount = Object.values(downloads).filter(d => d.status === 'completed' && d.localAudioPath).length;

  const renderTrackItem = useCallback(
    ({ item: track }: { item: MyMusicTrack }) => {
      const trackWithFlag = { ...track, isUserGenerated: true };
      const menuProps = getMenuPropsForTrack(trackWithFlag);

      return (
        <Swipeable renderRightActions={renderRightActions(track)} overshootRight={false}>
          <TrackItem
            track={trackWithFlag}
            isActive={currentTrack?.id === track.id}
            isPlaying={isPlaying}
            onPress={() => handleTrackTap(track)}
            onLongPress={() => handleTrackLongPress(track)}
            formatDuration={formatDuration}
            subtitleExtra={
              track.addedAt && getRelativeTimeString(track.addedAt)
                ? `(${getRelativeTimeString(track.addedAt)})`
                : undefined
            }
            {...menuProps}
          />
        </Swipeable>
      );
    },
    [
      currentTrack?.id,
      isPlaying,
      handleTrackTap,
      handleTrackLongPress,
      formatDuration,
      getRelativeTimeString,
      renderRightActions,
      getMenuPropsForTrack,
    ]
  );

  const ListHeaderComponent = useMemo(
    () => (
      <>
        {/* Downloads CTA */}
        {downloadCount > 0 && (
          <TouchableOpacity
            onPress={handleGoToDownloads}
            activeOpacity={0.8}
            testID="button-view-downloads"
            style={styles.viewPlaylistsCTAWrapper}
          >
            <LiquidGlassCard intensity="medium" padding={16}>
              <View style={styles.playlistsCTAInner}>
                <View style={styles.playlistsCTAContent}>
                  <Ionicons name="cloud-download-outline" size={24} color={colors.brand.primary} />
                  <View style={styles.playlistsCTAText}>
                    <Text style={styles.playlistsCTATitle}>{t('myMusic.downloads')}</Text>
                    <Text style={styles.playlistsCTASubtitle}>
                      {t('downloads.trackCount', { count: downloadCount })}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
              </View>
            </LiquidGlassCard>
          </TouchableOpacity>
        )}

        {/* Albums CTA */}
        {albums.length > 0 && (
          <TouchableOpacity
            onPress={handleGoToAlbums}
            activeOpacity={0.8}
            testID="button-view-all-albums"
            style={styles.viewPlaylistsCTAWrapper}
          >
            <LiquidGlassCard intensity="medium" padding={16}>
              <View style={styles.playlistsCTAInner}>
                <View style={styles.playlistsCTAContent}>
                  <Ionicons name="library-outline" size={24} color={colors.brand.primary} />
                  <View style={styles.playlistsCTAText}>
                    <Text style={styles.playlistsCTATitle}>{t('myMusic.viewAllAlbums')}</Text>
                    <Text style={styles.playlistsCTASubtitle}>{t('albums.albumCount', { count: albums.length })}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
              </View>
            </LiquidGlassCard>
          </TouchableOpacity>
        )}

        {/* Playlists CTA */}
        {playlists.length > 0 && (
          <TouchableOpacity
            onPress={handleGoToPlaylists}
            activeOpacity={0.8}
            testID="button-view-all-playlists"
            style={styles.viewPlaylistsCTAWrapper}
          >
            <LiquidGlassCard intensity="medium" padding={16}>
              <View style={styles.playlistsCTAInner}>
                <View style={styles.playlistsCTAContent}>
                  <Ionicons name="albums-outline" size={24} color={colors.brand.primary} />
                  <View style={styles.playlistsCTAText}>
                    <Text style={styles.playlistsCTATitle}>{t('myMusic.viewAllPlaylists')}</Text>
                    <Text style={styles.playlistsCTASubtitle}>
                      {t('counts.playlists', { count: playlists.length })}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
              </View>
            </LiquidGlassCard>
          </TouchableOpacity>
        )}

        {selectedPlaylistId && (
          <LiquidGlassCard intensity="light" padding={12} style={styles.filterBannerWrapper}>
            <View style={styles.filterBannerInner}>
              <Ionicons name="funnel" size={16} color={colors.brand.primary} />
              <Text style={styles.filterText}>
                {playlists.find((p: { id: string; name?: string }) => p.id === selectedPlaylistId)?.name || 'Playlist'}
              </Text>
              <TouchableOpacity
                onPress={handleClearFilter}
                style={styles.clearFilterButton}
                testID="button-clear-filter"
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </LiquidGlassCard>
        )}
      </>
    ),
    [
      playlists,
      albums,
      selectedPlaylistId,
      handleGoToPlaylists,
      handleGoToAlbums,
      handleGoToDownloads,
      handleClearFilter,
      t,
      downloadCount,
    ]
  );

  const ListEmptyComponent = useMemo(() => {
    if (isLoading) {
      return <LoadingState message={t('myMusic.loadingMusic')} fullScreen={false} />;
    }

    if (isError) {
      return (
        <EmptyState
          icon="musical-notes"
          title={t('myMusic.failedToLoad')}
          description={t('myMusic.checkConnection')}
          testID="error"
        />
      );
    }

    const isFilteredPlaylist = !!selectedPlaylistId;
    const playlistName =
      playlists.find((p: { id: string; name?: string }) => p.id === selectedPlaylistId)?.name || t('myMusic.playlists');

    if (isFilteredPlaylist) {
      return (
        <EmptyState
          icon="disc"
          title={t('myMusic.startBuildingCollection')}
          description={t('myMusic.addTracksTo', { playlistName })}
          action={{
            label: t('myMusic.viewLibrary'),
            onPress: handleClearFilter,
            testID: 'button-view-library',
          }}
          testID="empty"
        />
      );
    }

    return (
      <EmptyState
        icon="library"
        title={t('myMusic.noTracksYet')}
        description={t('myMusic.createFirstSong')}
        action={{
          label: t('myMusic.createFirstSongButton'),
          onPress: handleGoToCreate,
          testID: 'button-create-first-song',
        }}
        testID="empty"
      />
    );
  }, [isLoading, isError, selectedPlaylistId, playlists, handleClearFilter, handleGoToCreate, t]);

  // Debug: Log tracks to console (development only)
  React.useEffect(() => {
    if (__DEV__) {
      // Log first 3 tracks with artworkUrl for debugging
      const trackSample = tracks?.slice(0, 3).map(t => ({
        id: t.id.substring(0, 8),
        title: t.title.substring(0, 15),
        artworkUrl: t.artworkUrl?.substring(t.artworkUrl.lastIndexOf('/') + 1),
      }));
      logger.debug('MyMusic tracks state', {
        tracksLoaded: tracks?.length || 0,
        isLoading,
        isError,
        trackSample,
      });
    }
  }, [tracks, isLoading, isError]);

  return (
    <View style={styles.container} testID="my-music-page">
      <PlaybackControls
        shuffleEnabled={shuffleEnabled}
        repeatMode={repeatMode}
        onToggleShuffle={handleToggleShuffle}
        onCycleRepeat={handleCycleRepeat}
        onPrevious={handlePreviousTrack}
        onNext={handleNextTrack}
        onPlayPause={handleTogglePlayPause}
        isPlaying={isPlaying}
      />

      <FlatList
        data={tracks}
        renderItem={renderTrackItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.contentContainer}
        testID="track-list"
        {...flatListProps}
        extraData={extraData}
      />

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
      paddingBottom: 20,
    },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border.muted,
      gap: 12,
    },
    statsText: {
      fontSize: 16,
      color: colors.text.primary,
      fontWeight: '600',
    },
    trackListContainer: {
      paddingBottom: 20,
    },
    trackList: {
      gap: 4,
    },
    deleteAction: {
      backgroundColor: colors.semantic.error,
      justifyContent: 'center',
      alignItems: 'flex-end',
      width: 80,
      borderRadius: 6,
    },
    deleteButton: {
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      height: '100%',
    },
    addToPlaylistButton: {
      padding: 8,
      marginLeft: 4,
    },
    trackActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    actionButton: {
      padding: 8,
    },
    filterBannerWrapper: {
      marginHorizontal: 16,
      marginBottom: 8,
    },
    filterBannerInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    filterText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    clearFilterButton: {
      padding: 4,
    },
    viewPlaylistsCTAWrapper: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 12,
    },
    playlistsCTAInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    playlistsCTAContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    playlistsCTAText: {
      flex: 1,
    },
    playlistsCTATitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    playlistsCTASubtitle: {
      fontSize: 13,
      color: colors.text.secondary,
    },
  });

// Default export for Expo Router compatibility
export default PrivateMusicScreen;
