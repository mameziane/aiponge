import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useSearch } from '../../stores';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { usePlaybackState, usePlaybackQueue } from '../../contexts/PlaybackContext';
import { useExploreData, type ExploreTrack, type UserCreation } from '../../hooks/playlists/useExploreData';
import { useTrackPlayback, type PlayableTrack } from '../../hooks/music/useTrackPlayback';
import { useGuestConversion } from '../../hooks/auth/useGuestConversion';
import { GuestConversionPrompt } from '../../components/auth/GuestConversionPrompt';
import { useAlbums } from '../../hooks/music/useAlbums';
import { useSharedAlbums } from '../../hooks/playlists/useSharedAlbums';
import { useFavorites } from '../../hooks/playlists/useFavorites';
import { useLyricsModal } from '../../hooks/music/useLyricsModal';
import { useFeedbackPrompt } from '../../hooks/ui/useFeedbackPrompt';
import { LyricsModal } from '../../components/music/LyricsModal';
import { FeedbackPromptModal } from '../../components/shared/FeedbackPromptModal';
import { useAuthStore, selectUserId } from '../../auth/store';
import { useToast } from '../../hooks/ui/use-toast';
import { useResponsiveLayout } from '../../hooks/ui/useResponsiveLayout';
import { SectionHeader } from '../../components/shared/SectionHeader';
import { useCollapsibleSections } from '../../hooks/ui/useCollapsibleSections';
import { HorizontalCarousel } from '../../components/shared/HorizontalCarousel';
import { CompactTrackRow } from '../../components/music/CompactTrackRow';
import { LargeTrackCard } from '../../components/music/LargeTrackCard';
import { WorkInProgressTile } from '../../components/shared/WorkInProgressTile';
import type { RepeatMode } from '../../components/playlists/PlaylistDropdown';
import { getNextTrack, getPreviousTrack, buildPlaybackTrack, buildPlaybackTracks } from '../../utils/trackUtils';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { spacing } from '../../theme/spacing';
import { LiquidGlassCard } from '../../components/ui';
import { useDraftAlbum, useDraftAlbumShared } from '../../components/playlists/DraftAlbumCard';
import { useDraftTrack } from '../../components/playlists/DraftTrackCard';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { EmptyState } from '../../components/shared/EmptyState';
import { useTrackCompletionHandler } from '../../hooks/music/useTrackCompletionHandler';
import {
  RecentlyPlayedSection,
  YourCreationsSection,
  AlbumsSection,
  FeaturedPlaylistsSection,
  RecommendationsSection,
  TopChartsSection,
} from '../../components/discover';
import { logger } from '../../lib/logger';

export function DiscoverScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const scrollViewRef = useRef<ScrollView>(null);
  const { horizontalPadding } = useResponsiveLayout();

  // Audio player for seamless preview-to-final transition
  const player = useGlobalAudioPlayer();
  const { setCurrentTrack, setPlaybackPhase } = usePlaybackState();

  // Track ID pending auto-play after refetch (set when preview was playing on completion)
  const pendingAutoPlayTrackId = useRef<string | null>(null);
  // Position to seek to when auto-playing (for seamless resume from preview)
  const pendingSeekPosition = useRef<number>(0);

  // Search functionality
  const { query: searchQuery, isSearchActive, registerSearch, unregisterSearch } = useSearch();
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  // Playback controls state
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');

  const {
    recentlyPlayed,
    yourCreations,
    yourTopSongs,
    featuredPlaylists,
    popularTracks,
    topCharts,
    recommendations,
    worksInProgress,
    isLoading,
    isError,
    hasNoContent,
    formatDuration,
    hasRecentCreations,
    refetch,
  } = useExploreData();

  const handleAutoPlayReady = useCallback((trackId: string, seekPosition: number) => {
    logger.debug('[MusicScreen] Preview was playing, will auto-play final track', {
      trackId,
      seekPosition,
    });
    pendingAutoPlayTrackId.current = trackId;
    pendingSeekPosition.current = seekPosition;
  }, []);

  const { isRefetchingAfterCompletion } = useTrackCompletionHandler({
    refetch,
    onAutoPlayReady: handleAutoPlayReady,
  });

  // Auto-play the final track when it becomes available after refetch
  useEffect(() => {
    const pendingId = pendingAutoPlayTrackId.current;
    if (!pendingId) return;

    logger.debug('[MusicScreen] Auto-play check', {
      pending: pendingId,
      creationsCount: yourCreations?.length || 0,
    });

    if (!yourCreations || yourCreations.length === 0) {
      logger.debug('[MusicScreen] No creations yet, waiting for refetch');
      return;
    }

    // Find the newly completed track in creations
    const newTrack = yourCreations.find(c => c.id === pendingId);

    if (!newTrack) {
      logger.debug('[MusicScreen] Track not found in creations yet', {
        availableIds: yourCreations.slice(0, 5).map(c => c.id),
      });
      return;
    }

    if (!newTrack.audioUrl) {
      logger.debug('[MusicScreen] Track found but no audioUrl yet', { trackId: newTrack.id });
      return;
    }

    // Capture values before async IIFE (TypeScript narrowing)
    const trackId = newTrack.id;
    const trackTitle = newTrack.title || 'Untitled';
    const trackArtist = newTrack.displayName || 'You';
    const trackArtworkUrl = newTrack.artworkUrl || undefined;
    const trackDuration = newTrack.duration || undefined;
    const audioUrl = newTrack.audioUrl; // Already verified non-null above
    const trackLyricsId = newTrack.lyricsId || undefined;
    const trackHasSyncedLyrics = newTrack.hasSyncedLyrics || false;

    logger.debug('[MusicScreen] Auto-playing completed track', {
      trackTitle,
      trackId,
      audioUrlPreview: audioUrl?.substring(0, 50),
    });
    pendingAutoPlayTrackId.current = null;

    // Use async IIFE to handle async operations in useEffect
    (async () => {
      try {
        // Capture seek position before clearing ref
        const seekPosition = pendingSeekPosition.current;
        pendingSeekPosition.current = 0;

        // IMPORTANT: Do NOT pause here - let the streaming preview continue playing
        // while we prepare the CDN audio. This prevents audio gap during transition.

        // Set up playback state BEFORE loading audio
        setCurrentTrack({
          id: trackId,
          audioUrl: audioUrl,
          title: trackTitle,
          displayName: trackArtist,
          artworkUrl: trackArtworkUrl,
          duration: trackDuration,
          lyricsId: trackLyricsId,
          hasSyncedLyrics: trackHasSyncedLyrics,
        });

        // Load the CDN audio file first (this downloads/buffers the file)
        // The replace call will automatically pause the current playback
        logger.debug('[MusicScreen] Loading CDN audio for seamless transition', { seekPosition });
        await player.replace({ uri: audioUrl });

        // Seek to the position where preview was playing (seamless resume)
        // CRITICAL: Seek BEFORE play to avoid starting from beginning
        if (seekPosition > 0) {
          logger.debug('[MusicScreen] Seeking to preview position', { seekPosition });
          player.seekTo(seekPosition);
          // Small delay to allow seek to complete before play
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Now start playback from the seeked position
        setPlaybackPhase('buffering');
        player.play();
        logger.debug('[MusicScreen] Auto-play started successfully', {
          note: seekPosition > 0 ? `at position ${seekPosition}s` : 'from start',
        });
      } catch (err) {
        logger.warn('[MusicScreen] Failed to auto-play completed track', { error: err });
        setPlaybackPhase('idle');
      }
    })();
  }, [yourCreations, player, setCurrentTrack, setPlaybackPhase]);

  // Register search when screen is focused
  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });

      registerSearch({
        placeholder: t('search.musicPlaceholder'),
        enabled: true,
        onSearch: query => setLocalSearchQuery(query),
        onClear: () => setLocalSearchQuery(''),
      });

      return () => {
        unregisterSearch();
      };
    }, [registerSearch, unregisterSearch, t])
  );

  // Load user's albums for quick access
  const { albums } = useAlbums();

  // Load shared library albums (visible to all users)
  const { albums: sharedAlbums, isLibrarian } = useSharedAlbums();

  // Check for active album generations (draft albums - private)
  const { draftAlbums, hasDraftAlbum } = useDraftAlbum();

  // Check for active shared library album generations (draft albums - public)
  const { draftAlbums: draftSharedAlbums, hasDraftAlbum: hasDraftSharedAlbum } = useDraftAlbumShared();

  // Check for active track generations (draft tracks)
  const { draftTracks, hasDraftTrack, isPendingGeneration } = useDraftTrack();

  // Collapsible sections state with persistence
  const { isSectionExpanded, toggleSection } = useCollapsibleSections('music_screen');

  // Favorites functionality (consistent with all other screens)
  const userId = useAuthStore(selectUserId);
  const { isFavorite: isLiked, toggleFavorite: toggleLike } = useFavorites(userId || '');
  const canLike = !!userId;

  // Lyrics modal for viewing track lyrics
  const { lyricsModal, handleShowLyrics, handleCloseLyrics } = useLyricsModal();

  // Feedback prompt for track helpfulness
  const {
    showFeedbackModal,
    feedbackTrackId,
    feedbackTrackTitle,
    handleTrackFinished,
    closeFeedbackModal,
    markFeedbackGiven,
  } = useFeedbackPrompt();

  // Guest conversion tracking
  const {
    showPrompt: showGuestPrompt,
    promptContent: guestPromptContent,
    trackTrackPlayed,
    closePrompt: closeGuestPrompt,
  } = useGuestConversion();

  // Collect all playable tracks from Explore feed into a unified queue
  // Deduplicate by track ID to prevent shuffle/repeat issues
  const allExploreTracks = useMemo(() => {
    const tracks: (ExploreTrack | UserCreation)[] = [
      ...recentlyPlayed,
      ...yourCreations,
      ...yourTopSongs,
      ...popularTracks,
      ...recommendations,
      ...topCharts,
    ];

    // Deduplicate by track ID (use Map to preserve first occurrence)
    const uniqueTracks = new Map<string, ExploreTrack | UserCreation>();
    tracks.forEach(track => {
      if (track.audioUrl && !uniqueTracks.has(track.id)) {
        uniqueTracks.set(track.id, track);
      }
    });

    return Array.from(uniqueTracks.values());
  }, [recentlyPlayed, yourCreations, yourTopSongs, popularTracks, recommendations, topCharts]);

  // Filter tracks based on search query
  const filteredTracks = useMemo(() => {
    if (!localSearchQuery.trim()) return [];
    const query = localSearchQuery.toLowerCase().trim();
    return allExploreTracks.filter(
      track =>
        track.title.toLowerCase().includes(query) ||
        (track.displayName && track.displayName.toLowerCase().includes(query))
    );
  }, [allExploreTracks, localSearchQuery]);

  // Transform explore tracks to PlaybackTrack format using shared helper (memoized)
  // buildPlaybackTrack ensures consistent artwork URL normalization across the app
  const toTrackIdentity = useCallback((track: ExploreTrack | UserCreation): PlayableTrack | null => {
    return buildPlaybackTrack({
      id: track.id,
      audioUrl: track.audioUrl,
      title: track.title,
      displayName: track.displayName,
      artworkUrl: track.artworkUrl,
      duration: track.duration,
      lyricsId: track.lyricsId,
      hasSyncedLyrics: track.hasSyncedLyrics,
    });
  }, []);

  // Convert Explore tracks to PlaybackTrack format for playback hook
  // Uses buildPlaybackTracks for consistent URL normalization
  const trackIdentities = useMemo(() => {
    return buildPlaybackTracks(
      allExploreTracks.map(t => ({
        id: t.id,
        audioUrl: t.audioUrl,
        title: t.title,
        displayName: t.displayName,
        artworkUrl: t.artworkUrl,
        duration: t.duration,
        lyricsId: t.lyricsId,
        hasSyncedLyrics: t.hasSyncedLyrics,
      }))
    );
  }, [allExploreTracks]);

  // Playback queue context for cross-screen navigation
  const { setQueue } = usePlaybackQueue();

  // Playback integration with shuffle/repeat support
  const { handlePlayTrack, currentTrack, isPlaying, pause, resume } = useTrackPlayback({
    shuffleEnabled,
    repeatMode,
    availableTracks: trackIdentities,
    onNewTrackStarted: trackTrackPlayed,
    onTrackFinished: handleTrackFinished,
  });

  const handleTrackPress = async (track: ExploreTrack | UserCreation) => {
    const trackIdentity = toTrackIdentity(track);
    if (!trackIdentity) {
      toast({
        title: t('explore.unableToPlay'),
        description: t('explore.trackNotAvailable'),
        variant: 'destructive',
      });
      return;
    }

    const trackIndex = allExploreTracks.findIndex(t => t.id === track.id);
    const queueTracks = trackIdentities.map(t => ({
      id: t.id,
      title: t.title || '',
      audioUrl: t.audioUrl,
      artworkUrl: t.artworkUrl,
      displayName: t.displayName,
      duration: t.duration,
      lyricsId: t.lyricsId,
      hasSyncedLyrics: t.hasSyncedLyrics,
    }));
    setQueue(
      queueTracks,
      { type: 'library', id: 'music', title: t('navigation.myMusic') },
      trackIndex >= 0 ? trackIndex : 0
    );

    await handlePlayTrack(trackIdentity);
  };

  // Handle long press: start playing and navigate to track detail screen
  const handleTrackLongPress = async (track: ExploreTrack | UserCreation) => {
    const trackIdentity = toTrackIdentity(track);
    if (trackIdentity) {
      await handlePlayTrack(trackIdentity);
    }
    router.push({
      pathname: '/private-track-detail',
      params: { track: JSON.stringify(track) },
    });
  };

  // Playback control handlers
  const handleToggleShuffle = () => {
    setShuffleEnabled(prev => !prev);
  };

  const popularTracksExtraData = useMemo(
    () => ({ currentTrackId: currentTrack?.id, isPlaying }),
    [currentTrack?.id, isPlaying]
  );

  const handleCycleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  // Navigate to next track
  const handleNextTrack = () => {
    const current = currentTrack ? (allExploreTracks.find(t => t.id === currentTrack.id) ?? null) : null;
    const nextTrack = getNextTrack(allExploreTracks, current, shuffleEnabled, repeatMode);
    if (nextTrack) {
      const trackIdentity = toTrackIdentity(nextTrack);
      if (trackIdentity) {
        handlePlayTrack(trackIdentity);
      }
    }
  };

  // Navigate to previous track
  const handlePreviousTrack = () => {
    const current = currentTrack ? (allExploreTracks.find(t => t.id === currentTrack.id) ?? null) : null;
    const prevTrack = getPreviousTrack(allExploreTracks, current, shuffleEnabled, repeatMode);
    if (prevTrack) {
      const trackIdentity = toTrackIdentity(prevTrack);
      if (trackIdentity) {
        handlePlayTrack(trackIdentity);
      }
    }
  };

  // Toggle play/pause
  const handleTogglePlayPause = () => {
    if (!currentTrack && allExploreTracks.length > 0) {
      // No track playing, start from first track
      const trackIdentity = toTrackIdentity(allExploreTracks[0]);
      if (trackIdentity) {
        handlePlayTrack(trackIdentity);
      }
    } else if (currentTrack) {
      // Toggle current track play/pause
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    }
  };

  if (isLoading) {
    return <LoadingState message={t('explore.loadingMusic')} />;
  }

  if (isError) {
    return <ErrorState message={t('explore.connectionError')} />;
  }

  if (hasNoContent && !hasDraftAlbum && !hasDraftTrack && !isRefetchingAfterCompletion && sharedAlbums.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          icon="compass-outline"
          title={t('explore.startExploring')}
          description={t('explore.startExploringDescription')}
          testID="empty-discover"
        />
      </View>
    );
  }

  return (
    <View style={styles.pageContainer}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        testID="explore-page"
      >
        {/* Search Results */}
        {isSearchActive && localSearchQuery.trim() && (
          <View style={styles.searchResultsContainer}>
            <Text style={styles.searchResultsTitle}>{t('search.results', { count: filteredTracks.length })}</Text>
            {filteredTracks.length === 0 ? (
              <View style={styles.noResultsContainer}>
                <Ionicons name="search" size={48} color={colors.text.tertiary} />
                <Text style={styles.noResultsText}>{t('search.noResults')}</Text>
                <Text style={styles.noResultsHint}>{t('search.tryDifferentTerms')}</Text>
              </View>
            ) : (
              filteredTracks.map(track => (
                <CompactTrackRow
                  key={track.id}
                  id={track.id}
                  title={track.title}
                  displayName={track.displayName || t('explore.unknownCreator')}
                  artworkUrl={track.artworkUrl}
                  duration={track.duration}
                  isPlaying={currentTrack?.id === track.id && isPlaying}
                  isFavorite={isLiked(track.id)}
                  lyricsId={'lyricsId' in track ? (track as UserCreation).lyricsId : undefined}
                  onPress={() => handleTrackPress(track)}
                  onLongPress={() => handleTrackLongPress(track)}
                  onToggleFavorite={canLike ? () => toggleLike(track.id) : undefined}
                  onShowLyrics={
                    'lyricsId' in track && (track as UserCreation).lyricsId
                      ? () => handleShowLyrics({ title: track.title, lyricsId: (track as UserCreation).lyricsId })
                      : undefined
                  }
                />
              ))
            )}
          </View>
        )}

        {/* Normal Content - Hidden when search is active */}
        {!isSearchActive && (
          <>
            <RecentlyPlayedSection
              recentlyPlayed={recentlyPlayed}
              onTrackPress={handleTrackPress}
              onTrackLongPress={handleTrackLongPress}
              onToggleFavorite={toggleLike}
              onShowLyrics={handleShowLyrics}
              isLiked={isLiked}
              canLike={canLike}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
            />

            <YourCreationsSection
              yourCreations={yourCreations}
              draftTracks={draftTracks}
              hasDraftTrack={hasDraftTrack}
              isPendingGeneration={isPendingGeneration}
              isRefetchingAfterCompletion={isRefetchingAfterCompletion}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
              onTrackPress={handleTrackPress}
              onTrackLongPress={handleTrackLongPress}
            />

            <FeaturedPlaylistsSection featuredPlaylists={featuredPlaylists} />

            <AlbumsSection
              albums={albums}
              sharedAlbums={sharedAlbums}
              draftAlbums={draftAlbums}
              draftSharedAlbums={draftSharedAlbums}
              hasDraftAlbum={hasDraftAlbum}
              hasDraftSharedAlbum={hasDraftSharedAlbum}
              isSectionExpanded={isSectionExpanded}
              toggleSection={toggleSection}
            />

            {yourTopSongs.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <SectionHeader
                    title={t('explore.yourTopSongs')}
                    subtitle={t('explore.yourMostPlayed')}
                    onSeeAllPress={() => router.push('/private-music-library')}
                    testID="your-top-songs-header"
                  />
                </View>
                {yourTopSongs.slice(0, 5).map(track => (
                  <CompactTrackRow
                    key={track.id}
                    id={track.id}
                    title={track.title}
                    displayName={track.displayName || t('explore.youCreator')}
                    artworkUrl={track.artworkUrl}
                    duration={track.duration}
                    playCount={track.playCount}
                    isPlaying={currentTrack?.id === track.id && isPlaying}
                    isFavorite={isLiked(track.id)}
                    lyricsId={'lyricsId' in track ? (track as UserCreation).lyricsId : undefined}
                    onPress={() => handleTrackPress(track)}
                    onLongPress={() => handleTrackLongPress(track)}
                    onToggleFavorite={canLike ? () => toggleLike(track.id) : undefined}
                    onShowLyrics={
                      'lyricsId' in track && (track as UserCreation).lyricsId
                        ? () => handleShowLyrics({ title: track.title, lyricsId: (track as UserCreation).lyricsId })
                        : undefined
                    }
                  />
                ))}
              </View>
            )}

            {popularTracks.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <SectionHeader
                    title={t('explore.popularTracks')}
                    subtitle={t('explore.popular')}
                    testID="popular-tracks-header"
                  />
                </View>
                <HorizontalCarousel
                  data={popularTracks}
                  extraData={popularTracksExtraData}
                  renderItem={track => {
                    if (!track?.id) return <></>;
                    return (
                      <LargeTrackCard
                        key={track.id}
                        id={track.id}
                        title={track.title}
                        displayName={track.displayName || t('explore.unknownCreator')}
                        artworkUrl={track.artworkUrl}
                        duration={track.duration}
                        playCount={track.playCount}
                        isPlaying={currentTrack?.id === track.id && isPlaying}
                        isFavorite={isLiked(track.id)}
                        lyricsId={'lyricsId' in track ? (track as UserCreation).lyricsId : undefined}
                        onPress={() => handleTrackPress(track)}
                        onLongPress={() => handleTrackLongPress(track)}
                        onToggleFavorite={canLike ? () => toggleLike(track.id) : undefined}
                        onShowLyrics={
                          'lyricsId' in track && (track as UserCreation).lyricsId
                            ? () => handleShowLyrics({ title: track.title, lyricsId: (track as UserCreation).lyricsId })
                            : undefined
                        }
                      />
                    );
                  }}
                  keyExtractor={track => track?.id || ''}
                  testID="popular-tracks-carousel"
                />
              </View>
            )}

            <RecommendationsSection
              recommendations={recommendations}
              onTrackPress={handleTrackPress}
              onTrackLongPress={handleTrackLongPress}
              onToggleFavorite={toggleLike}
              onShowLyrics={handleShowLyrics}
              isLiked={isLiked}
              canLike={canLike}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
            />

            <TopChartsSection
              topCharts={topCharts}
              onTrackPress={handleTrackPress}
              onTrackLongPress={handleTrackLongPress}
              onToggleFavorite={toggleLike}
              isLiked={isLiked}
              canLike={canLike}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
            />

            {/* Browse Full Library CTA - only show when shared library has content */}
            {(popularTracks.length > 0 || sharedAlbums.length > 0) && (
              <View style={styles.section}>
                <TouchableOpacity
                  onPress={() => router.push('/music-library')}
                  testID="browse-full-library-button"
                  activeOpacity={0.8}
                  style={styles.browseLibraryWrapper}
                >
                  <LiquidGlassCard intensity="medium" padding={16}>
                    <View style={styles.browseLibraryInner}>
                      <View style={styles.browseLibraryContent}>
                        <Ionicons name="library" size={24} color={colors.brand.primary} />
                        <View style={styles.browseLibraryText}>
                          <Text style={styles.browseLibraryTitle}>{t('explore.browseFullLibrary')}</Text>
                          <Text style={styles.browseLibrarySubtitle}>{t('explore.discoverAllTracks')}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                    </View>
                  </LiquidGlassCard>
                </TouchableOpacity>
              </View>
            )}

            {worksInProgress.length > 0 && (
              <View style={[styles.section, styles.lastSection]}>
                <View style={styles.sectionHeader}>
                  <SectionHeader
                    title={t('explore.worksInProgress')}
                    subtitle={t('explore.draftsPending')}
                    testID="works-in-progress-header"
                  />
                </View>
                <View style={styles.wipContainer}>
                  {worksInProgress.map(wip => (
                    <WorkInProgressTile
                      key={wip.id}
                      id={wip.id}
                      title={wip.title}
                      status={wip.status}
                      updatedAt={wip.updatedAt}
                      onPress={() => router.push('/(user)/create' as Href)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Guest Conversion Prompt - only render when content is available */}
      {showGuestPrompt && guestPromptContent.title && (
        <GuestConversionPrompt
          visible={showGuestPrompt}
          onClose={closeGuestPrompt}
          title={guestPromptContent.title}
          message={guestPromptContent.message}
          triggerAction={guestPromptContent.triggerAction}
        />
      )}

      {/* Lyrics Modal */}
      <LyricsModal
        visible={lyricsModal.visible}
        onClose={handleCloseLyrics}
        lyricsId={lyricsModal.lyricsId}
        trackTitle={lyricsModal.trackTitle}
      />

      {/* Feedback Prompt Modal - appears after track finishes first play */}
      {feedbackTrackId && (
        <FeedbackPromptModal
          visible={showFeedbackModal}
          trackId={feedbackTrackId}
          trackTitle={feedbackTrackTitle}
          onClose={closeFeedbackModal}
          onFeedbackSubmitted={markFeedbackGiven}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    contentContainer: {
      flexGrow: 1,
      paddingBottom: 100,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      paddingHorizontal: 32,
    },
    section: {
      marginTop: 24,
    },
    lastSection: {
      marginBottom: 24,
    },
    sectionHeader: {
      paddingHorizontal: spacing.screenHorizontal,
    },
    wipContainer: {
      paddingHorizontal: spacing.screenHorizontal,
    },
    pageContainer: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    scrollView: {
      flex: 1,
    },
    browseLibraryWrapper: {
      marginHorizontal: spacing.screenHorizontal,
    },
    browseLibraryInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    browseLibraryContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    browseLibraryText: {
      marginLeft: 12,
    },
    browseLibraryTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    browseLibrarySubtitle: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
    searchResultsContainer: {
      paddingHorizontal: spacing.screenHorizontal,
      paddingTop: 16,
      paddingBottom: 24,
    },
    searchResultsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 16,
    },
    noResultsContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    noResultsText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
    },
    noResultsHint: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },
  });
