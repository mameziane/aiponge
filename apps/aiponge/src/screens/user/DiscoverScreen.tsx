import { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useSearchStore } from '../../stores/searchStore';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { usePlaybackState, usePlaybackQueue } from '../../contexts/PlaybackContext';
import { useExploreData, type ExploreTrack, type UserCreation } from '../../hooks/playlists/useExploreData';
import { useTrackPlayback, type PlayableTrack } from '../../hooks/music/useTrackPlayback';
import { useAutoPlayOnCompletion } from '../../hooks/music/useAutoPlayOnCompletion';
import { useGuestConversion } from '../../hooks/auth/useGuestConversion';
import { GuestConversionPrompt } from '../../components/auth/GuestConversionPrompt';
import { useFavorites } from '../../hooks/playlists/useFavorites';
import { useLyricsModal } from '../../hooks/music/useLyricsModal';
import { LyricsModal } from '../../components/music/LyricsModal';
import { useAuthStore, selectUserId } from '../../auth/store';
import { useToast } from '../../hooks/ui/use-toast';
import { useResponsiveLayout } from '../../hooks/ui/useResponsiveLayout';
import { CompactTrackRow } from '../../components/music/CompactTrackRow';
import { getNextTrack, getPreviousTrack, buildPlaybackTrack, buildPlaybackTracks } from '../../utils/trackUtils';
import { useThemeColors, type ColorScheme, commonStyles } from '../../theme';
import { spacing } from '../../theme/spacing';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { EmptyState } from '../../components/shared/EmptyState';
import {
  RecentlyPlayedSection,
  FeaturedPlaylistsSection,
  RecommendationsSection,
  TopChartsSection,
  TopSongsSection,
  PopularTracksSection,
  WorksInProgressSection,
  BrowseLibraryCTA,
  AlbumsContainer,
  CreationsContainer,
} from '../../components/discover';

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

  // Playback queue context — single source of truth for shuffle/repeat across screens
  const { setQueue, shuffleEnabled, repeatMode, toggleShuffle, cycleRepeat } = usePlaybackQueue();

  // Search functionality — use individual selectors to avoid re-renders from
  // currentConfig changes (useSearch() selects currentConfig which changes on registerSearch)
  const searchQuery = useSearchStore(state => state.query);
  const isSearchActive = useSearchStore(state => state.isSearchActive);
  const registerSearch = useSearchStore(state => state.registerSearch);
  const unregisterSearch = useSearchStore(state => state.unregisterSearch);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

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

  // Auto-play: seamless preview → CDN transition on track completion
  const { handleAutoPlayReady } = useAutoPlayOnCompletion({
    yourCreations,
    player,
    setCurrentTrack,
    setPlaybackPhase,
  });

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

  // Favorites functionality (consistent with all other screens)
  const userId = useAuthStore(selectUserId);
  const { isFavorite: isLiked, toggleFavorite: toggleLike } = useFavorites(userId || '');
  const canLike = !!userId;

  // Lyrics modal for viewing track lyrics
  const { lyricsModal, handleShowLyrics, handleCloseLyrics } = useLyricsModal();

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

  // Ref for allExploreTracks — used by handleNextTrack/handlePreviousTrack so they
  // don't need to depend on the array reference (which changes on every refetch)
  const allExploreTracksRef = useRef(allExploreTracks);
  allExploreTracksRef.current = allExploreTracks;

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

  // Playback integration with shuffle/repeat from queue context
  const { handlePlayTrack, currentTrack, isPlaying, pause, resume } = useTrackPlayback({
    shuffleEnabled,
    repeatMode,
    availableTracks: trackIdentities,
    onNewTrackStarted: trackTrackPlayed,
  });

  // ──────────────────────────────────────────────
  // Stable callbacks — wrapped in useCallback so memo() children don't re-render
  // ──────────────────────────────────────────────

  const handleTrackPress = useCallback(
    async (track: ExploreTrack | UserCreation) => {
      const trackIdentity = toTrackIdentity(track);
      if (!trackIdentity) {
        toast({
          title: t('explore.unableToPlay'),
          description: t('explore.trackNotAvailable'),
          variant: 'destructive',
        });
        return;
      }

      const trackIndex = allExploreTracksRef.current.findIndex(t => t.id === track.id);
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
    },
    [toTrackIdentity, trackIdentities, setQueue, handlePlayTrack, toast, t]
  );

  const handleTrackLongPress = useCallback(
    async (track: ExploreTrack | UserCreation) => {
      const trackIdentity = toTrackIdentity(track);
      if (trackIdentity) {
        await handlePlayTrack(trackIdentity);
      }
      router.push({
        pathname: '/private-track-detail',
        params: { track: JSON.stringify(track) },
      });
    },
    [toTrackIdentity, handlePlayTrack, router]
  );

  // Shuffle/repeat use context's toggle functions — stable identity
  const handleToggleShuffle = useCallback(() => {
    toggleShuffle();
  }, [toggleShuffle]);

  const handleCycleRepeat = useCallback(() => {
    cycleRepeat();
  }, [cycleRepeat]);

  // Next/previous use ref for allExploreTracks to avoid re-creating on data changes
  const handleNextTrack = useCallback(() => {
    const tracks = allExploreTracksRef.current;
    const current = currentTrack ? (tracks.find(t => t.id === currentTrack.id) ?? null) : null;
    const nextTrack = getNextTrack(tracks, current, shuffleEnabled, repeatMode);
    if (nextTrack) {
      const trackIdentity = toTrackIdentity(nextTrack);
      if (trackIdentity) {
        handlePlayTrack(trackIdentity);
      }
    }
  }, [currentTrack, shuffleEnabled, repeatMode, toTrackIdentity, handlePlayTrack]);

  const handlePreviousTrack = useCallback(() => {
    const tracks = allExploreTracksRef.current;
    const current = currentTrack ? (tracks.find(t => t.id === currentTrack.id) ?? null) : null;
    const prevTrack = getPreviousTrack(tracks, current, shuffleEnabled, repeatMode);
    if (prevTrack) {
      const trackIdentity = toTrackIdentity(prevTrack);
      if (trackIdentity) {
        handlePlayTrack(trackIdentity);
      }
    }
  }, [currentTrack, shuffleEnabled, repeatMode, toTrackIdentity, handlePlayTrack]);

  const handleTogglePlayPause = useCallback(() => {
    if (!currentTrack && allExploreTracksRef.current.length > 0) {
      // No track playing, start from first track
      const trackIdentity = toTrackIdentity(allExploreTracksRef.current[0]);
      if (trackIdentity) {
        handlePlayTrack(trackIdentity);
      }
    } else if (currentTrack) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    }
  }, [currentTrack, isPlaying, toTrackIdentity, handlePlayTrack, pause, resume]);

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  if (isLoading) {
    return <LoadingState message={t('explore.loadingMusic')} />;
  }

  if (isError) {
    return <ErrorState message={t('explore.connectionError')} />;
  }

  if (hasNoContent) {
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
                  audioUrl={track.audioUrl}
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

            {/* CreationsContainer owns useDraftTrack + useTrackCompletionHandler */}
            <CreationsContainer
              yourCreations={yourCreations}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
              onTrackPress={handleTrackPress}
              onTrackLongPress={handleTrackLongPress}
              refetch={refetch}
              onAutoPlayReady={handleAutoPlayReady}
            />

            <FeaturedPlaylistsSection featuredPlaylists={featuredPlaylists} />

            {/* AlbumsContainer owns useAlbums, useSharedAlbums, useDraft*, useCollapsibleSections */}
            <AlbumsContainer />

            <TopSongsSection
              yourTopSongs={yourTopSongs}
              onTrackPress={handleTrackPress}
              onTrackLongPress={handleTrackLongPress}
              onToggleFavorite={toggleLike}
              onShowLyrics={handleShowLyrics}
              isLiked={isLiked}
              canLike={canLike}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
            />

            <PopularTracksSection
              popularTracks={popularTracks}
              onTrackPress={handleTrackPress}
              onTrackLongPress={handleTrackLongPress}
              onToggleFavorite={toggleLike}
              onShowLyrics={handleShowLyrics}
              isLiked={isLiked}
              canLike={canLike}
              currentTrackId={currentTrack?.id}
              isPlaying={isPlaying}
            />

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

            <BrowseLibraryCTA visible={popularTracks.length > 0} />

            <WorksInProgressSection worksInProgress={worksInProgress} />
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
    pageContainer: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    scrollView: {
      flex: 1,
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
