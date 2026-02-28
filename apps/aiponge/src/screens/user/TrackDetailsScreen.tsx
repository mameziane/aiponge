import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Share, Dimensions, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiRequest } from '../../lib/axiosApiClient';
import { logError, getTranslatedFriendlyMessage } from '../../utils/errorSerialization';
import { useThemeColors, type ColorScheme, commonStyles, Z_INDEX, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { fontFamilies, fontSizes, lineHeights } from '../../theme/typography';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassCard } from '../../components/ui';
import { SyncedLyricsDisplay } from '../../components/music/SyncedLyricsDisplay';
import { KaraokeLyricsDisplay } from '../../components/music/KaraokeLyricsDisplay';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';
import { usePlaybackState, usePlaybackQueue } from '../../contexts/PlaybackContext';
import { useUnifiedPlaybackControl } from '../../hooks/music/useUnifiedPlaybackControl';
import { configureAudioSession } from '../../hooks/music/audioSession';
import { getApiGatewayUrl } from '../../lib/apiConfig';
import { EditTrackModal } from '../../components/music/EditTrackModal';
import { useAuthStore, selectUser } from '../../auth/store';
import { PlaybackControls } from '../../components/music/PlaybackControls';
import { ShortsStyleReactions } from '../../components/music/ShortsStyleReactions';
import { useFavorites } from '../../hooks/playlists/useFavorites';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function filterSectionHeaders(content: string): string {
  return content
    .split('\n')
    .map(line => line.replace(/\[.*?\]/g, '').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

interface SyncedWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

interface SyncedLine {
  startTime: number;
  endTime: number;
  text: string;
  type?: 'line' | 'section' | 'backing' | 'instrumental';
  words?: SyncedWord[];
}

interface LyricsData {
  id: string;
  content: string;
  syncedLines?: SyncedLine[];
  title?: string;
  style?: string;
  mood?: string;
  themes?: string[];
}

interface TrackData {
  id: string;
  title: string;
  displayName?: string;
  artworkUrl?: string;
  fileUrl?: string;
  audioUrl?: string; // Alternative field name
  duration?: number;
  durationSeconds?: number; // Alternative field name from shared library
  lyricsId?: string;
  createdAt?: string;
  playCount?: number;
  hasSyncedLyrics?: boolean;
  // Inline lyrics data from shared library (included in album detail response)
  lyricsContent?: string;
  lyricsSyncedLines?: SyncedLine[];
  lyricsStyle?: string;
  lyricsMood?: string;
  lyricsThemes?: string[];
}

export default function TrackDetailsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { currentTrack, isPlaying } = usePlaybackState();
  const { togglePlayPause: unifiedToggle, playNewTrack } = useUnifiedPlaybackControl();
  const {
    queue,
    queueSource,
    currentIndex,
    shuffleEnabled,
    repeatMode,
    hasNext,
    hasPrevious,
    trackCount,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    syncCurrentIndex,
  } = usePlaybackQueue();
  const user = useAuthStore(selectUser);
  const displayName = user?.name || 'You';

  const { isFavorite: isLiked, toggleFavorite: toggleLike, isToggling } = useFavorites(user?.id || '');
  const canLike = !!user?.id;

  const [track, setTrack] = useState<TrackData | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Edit track modal state
  const [showEditModal, setShowEditModal] = useState(false);

  const isCurrentTrackPlaying = track && currentTrack?.id === track.id && isPlaying;

  const handlePlayPause = useCallback(async () => {
    if (!track || !audioUrl) {
      logger.warn('Cannot play - no track or audio URL');
      return;
    }

    try {
      if (currentTrack?.id === track.id) {
        await unifiedToggle();
        return;
      }

      await configureAudioSession();

      const playableTrack = {
        id: track.id,
        title: track.title,
        artworkUrl: track.artworkUrl || '',
        audioUrl: audioUrl,
        displayName: track.displayName || displayName,
        duration: track.duration,
        lyricsId: track.lyricsId,
        hasSyncedLyrics: track.hasSyncedLyrics,
      };

      await playNewTrack(playableTrack, audioUrl);

      logger.debug('[TrackDetail] Started playback', { trackId: track.id });
    } catch (error) {
      logger.error('[TrackDetail] Playback failed', error);
    }
  }, [track, audioUrl, currentTrack, unifiedToggle, playNewTrack, displayName]);

  // Sync queue index when track changes
  useEffect(() => {
    if (track?.id) {
      syncCurrentIndex(track.id);
    }
  }, [track?.id, syncCurrentIndex]);

  // Handle next track from queue
  const handleNextTrack = useCallback(async () => {
    const nextTrack = next();
    if (nextTrack) {
      if (!nextTrack.audioUrl) {
        logger.error('[TrackDetail] Next track has no audio URL', { trackId: nextTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        await playNewTrack(nextTrack, nextTrack.audioUrl);
        logger.debug('[TrackDetail] Playing next track', { trackId: nextTrack.id });
      } catch (error) {
        logger.error('[TrackDetail] Failed to play next track', error);
      }
    }
  }, [next, playNewTrack]);

  // Handle previous track from queue
  const handlePreviousTrack = useCallback(async () => {
    const prevTrack = previous();
    if (prevTrack) {
      if (!prevTrack.audioUrl) {
        logger.error('[TrackDetail] Previous track has no audio URL', { trackId: prevTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        await playNewTrack(prevTrack, prevTrack.audioUrl);
        logger.debug('[TrackDetail] Playing previous track', { trackId: prevTrack.id });
      } catch (error) {
        logger.error('[TrackDetail] Failed to play previous track', error);
      }
    }
  }, [previous, playNewTrack]);

  // Show playback controls whenever we have a playable track
  const showPlaybackControls = audioUrl !== null;

  const fetchTrackById = async (trackId: string, options?: { silentOnNotFound?: boolean }) => {
    setIsLoadingTrack(true);
    if (!options?.silentOnNotFound) {
      setTrackError(null);
    }

    try {
      const response = await apiRequest<{ data: TrackData }>(`/api/v1/app/library/track/${trackId}`);
      if (response?.data) {
        setTrack(response.data);
        if (response.data.lyricsId) {
          fetchLyrics(response.data.lyricsId);
        }
      } else if (!options?.silentOnNotFound) {
        setTrackError(t('components.trackDetails.trackNotFound'));
      }
    } catch (err) {
      const serialized = logError(err, 'Fetch Track', trackId);
      // Only show error if we don't have fallback track data (e.g., from navigation params)
      if (!options?.silentOnNotFound) {
        setTrackError(getTranslatedFriendlyMessage(serialized, t));
      } else {
        logger.debug('Track not found in database, using navigation params data', { trackId });
      }
    } finally {
      setIsLoadingTrack(false);
    }
  };

  useEffect(() => {
    if (params.track) {
      try {
        const parsedTrack = JSON.parse(params.track as string);
        setTrack(parsedTrack);

        // Check for inline lyrics data first (from shared library album details)
        if (parsedTrack.lyricsContent || parsedTrack.lyricsSyncedLines) {
          logger.debug('Using inline lyrics data from track', {
            hasContent: !!parsedTrack.lyricsContent,
            hasSyncedLines: !!parsedTrack.lyricsSyncedLines?.length,
            hasStyle: !!parsedTrack.lyricsStyle,
            hasMood: !!parsedTrack.lyricsMood,
          });
          setLyrics({
            id: parsedTrack.lyricsId || parsedTrack.id,
            content: parsedTrack.lyricsContent || '',
            syncedLines: parsedTrack.lyricsSyncedLines,
            style: parsedTrack.lyricsStyle,
            mood: parsedTrack.lyricsMood,
            themes: parsedTrack.lyricsThemes,
          });
        } else if (parsedTrack.lyricsId) {
          // Fetch lyrics by ID if we have one
          fetchLyrics(parsedTrack.lyricsId);
        } else if (parsedTrack.hasSyncedLyrics) {
          // If track has synced lyrics indicator but no lyricsId in params, fetch full track data
          // to get the lyricsId and load synced lyrics
          // Use silentOnNotFound since we already have basic track data from params
          fetchTrackById(parsedTrack.id, { silentOnNotFound: true });
        }
      } catch (error) {
        logger.error('Failed to parse track data', error);
      }
    } else if (params.trackId) {
      fetchTrackById(params.trackId as string);
    }
  }, [params.track, params.trackId]);

  useEffect(() => {
    // Check for fileUrl first (from API), then audioUrl (from queue/navigation params)
    const sourceUrl = track?.fileUrl || track?.audioUrl;
    if (sourceUrl) {
      const baseUrl = getApiGatewayUrl();
      const resolvedUrl = sourceUrl.startsWith('http')
        ? sourceUrl
        : `${baseUrl}${sourceUrl.startsWith('/') ? '' : '/'}${sourceUrl}`;
      setAudioUrl(resolvedUrl);
      logger.debug('[TrackDetail] Resolved audio URL', { sourceUrl, resolvedUrl });
    }
  }, [track]);

  const fetchLyrics = async (lyricsId: string) => {
    setIsLoadingLyrics(true);
    setLyricsError(null);

    try {
      const response = await apiRequest<{ data: LyricsData }>(`/api/v1/app/lyrics/id/${lyricsId}`);
      if (response?.data) {
        setLyrics(response.data);
      } else {
        setLyricsError(t('components.lyricsModal.lyricsNotFound'));
      }
    } catch (err) {
      const serialized = logError(err, 'Fetch Lyrics', lyricsId);
      setLyricsError(getTranslatedFriendlyMessage(serialized, t));
    } finally {
      setIsLoadingLyrics(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const extractLyricPreview = (lyricsData: LyricsData | null): string => {
    if (!lyricsData) return '';

    // If we have synced lines, extract first 2-3 lines
    if (lyricsData.syncedLines && lyricsData.syncedLines.length > 0) {
      const previewLines = lyricsData.syncedLines
        .slice(0, 3)
        .map(line => line.text)
        .filter(text => text && text.trim().length > 0);
      return previewLines.join('\n');
    }

    // Otherwise, extract first 2-3 lines from content
    if (lyricsData.content) {
      const lines = lyricsData.content
        .split('\n')
        .filter(line => line.trim().length > 0)
        .slice(0, 3);
      return lines.join('\n');
    }

    return '';
  };

  const handleShare = async () => {
    if (!track) return;

    // Show options to user
    Alert.alert(
      t('components.trackDetails.shareTrack'),
      track.lyricsId
        ? t('components.trackDetails.includeLyricsQuestion')
        : t('components.trackDetails.shareWithOthers'),
      track.lyricsId
        ? [
            {
              text: t('common.cancel'),
              style: 'cancel',
            },
            {
              text: t('components.trackDetails.withoutLyrics'),
              onPress: () => shareTrack(false),
            },
            {
              text: t('components.trackDetails.withLyricsPreview'),
              onPress: () => shareTrack(true),
            },
          ]
        : [
            {
              text: t('common.cancel'),
              style: 'cancel',
            },
            {
              text: t('components.trackDetails.share'),
              onPress: () => shareTrack(false),
            },
          ],
      { cancelable: true }
    );
  };

  const shareTrack = async (includeLyrics: boolean) => {
    if (!track) return;

    try {
      // Get the effective display name
      const effectiveDisplayName = track.displayName;

      // Determine if this is a user-created track or a library track
      const isUserCreated = effectiveDisplayName === 'You' || effectiveDisplayName === displayName;

      let message: string;

      if (isUserCreated) {
        // User-created track
        message = `🎵 "${track.title}"\n\n${t('components.trackDetails.shareUserCreatedMessage')}`;
      } else {
        // Library track
        const artistInfo = effectiveDisplayName ? ` ${t('common.by')} ${effectiveDisplayName}` : '';
        message = `🎵 "${track.title}"${artistInfo}\n\n${t('components.trackDetails.shareLibraryTrackMessage')}`;
      }

      // Add lyrics preview if requested and available
      if (includeLyrics && lyrics) {
        const preview = extractLyricPreview(lyrics);
        if (preview) {
          message += `\n\n📝 ${t('components.trackDetails.lyricPreview')}:\n"${preview}..."\n`;
        }
      }

      // Add app download link
      message += `\n\n${t('components.trackDetails.discoverYourSound')}:\n🎵 www.aiponge.app`;

      const result = await Share.share({ message });

      if (result.action === Share.sharedAction) {
        logger.debug('Track shared successfully');
      }
    } catch (error: unknown) {
      const typedError = error as { message?: string };
      Alert.alert(
        t('components.trackDetails.unableToShare'),
        typedError?.message || t('components.trackDetails.shareError')
      );
    }
  };

  if (isLoadingTrack) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (trackError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBackRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.errorBackButton}
            testID="button-back"
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
            <Text style={styles.errorBackText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.semantic.error} />
          <Text style={styles.errorText}>{trackError}</Text>
        </View>
      </View>
    );
  }

  if (!track) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.semantic.error} />
          <Text style={styles.errorText}>{t('components.trackDetails.trackNotFound')}</Text>
        </View>
      </View>
    );
  }

  const resolvedArtworkUrl = track.artworkUrl
    ? track.artworkUrl.startsWith('http')
      ? track.artworkUrl
      : `${getApiGatewayUrl()}${track.artworkUrl}`
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.heroArtworkContainer}>
        {resolvedArtworkUrl ? (
          <Image
            source={{ uri: resolvedArtworkUrl }}
            style={styles.heroArtwork}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={[colors.brand.primary + '60', colors.background.primary]}
            style={styles.heroArtworkPlaceholder}
          >
            <Ionicons name="musical-note" size={80} color={colors.brand.primary} />
          </LinearGradient>
        )}
        <LinearGradient
          colors={[colors.overlay.black[50], 'transparent', colors.overlay.black[70]]}
          style={styles.heroOverlay}
        />
        <View style={styles.heroHeaderActions}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.heroBackButton}
            testID="button-back"
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.heroRightActions}>
            <TouchableOpacity
              onPress={() => setShowEditModal(true)}
              style={styles.heroScheduleButton}
              testID="button-schedule"
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('activityCalendar.scheduleTrack')}
            >
              <Ionicons name="create-outline" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.heroShareButton}
              testID="button-share"
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('components.trackDetails.shareTrack')}
            >
              <Ionicons name="share-outline" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroContent}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {track.title || ''}
          </Text>
          <Text style={styles.heroArtist} numberOfLines={1}>
            {track.displayName || displayName || ''}
          </Text>

          <View style={styles.heroMetaRow}>
            {track.duration != null && track.duration > 0 ? (
              <View style={styles.heroMetaItem}>
                <Ionicons name="time-outline" size={14} color={colors.text.secondary} />
                <Text style={styles.heroMetaText}>{formatDuration(track.duration)}</Text>
              </View>
            ) : null}
            {track.playCount != null && track.playCount > 0 ? (
              <View style={styles.heroMetaItem}>
                <Ionicons name="play-outline" size={14} color={colors.text.secondary} />
                <Text style={styles.heroMetaText}>{track.playCount} plays</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* YouTube Shorts-style like button for shared library tracks */}
        {(() => {
          const effectiveDisplayName = track.displayName;
          const isUserCreated = effectiveDisplayName === 'You' || effectiveDisplayName === displayName;
          const showReactions = canLike && !isUserCreated;
          return showReactions ? (
            <ShortsStyleReactions
              isLiked={isLiked(track.id)}
              onLike={() => toggleLike(track.id)}
              disabled={isToggling}
              style={styles.reactionsOverlay}
            />
          ) : null;
        })()}
      </View>

      {/* Playback Controls - show whenever track is playable */}
      {showPlaybackControls && (
        <PlaybackControls
          shuffleEnabled={shuffleEnabled}
          repeatMode={repeatMode}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
          onPrevious={hasPrevious ? handlePreviousTrack : undefined}
          onNext={hasNext ? handleNextTrack : undefined}
          onPlayPause={handlePlayPause}
          isPlaying={isCurrentTrackPlaying || false}
          trackCount={trackCount}
          showTrackCount={queue.length > 1}
        />
      )}

      {isLoadingLyrics ? (
        <LoadingState fullScreen={false} message={t('components.lyricsModal.loadingLyrics')} />
      ) : lyricsError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
          <Text style={styles.errorText}>{lyricsError}</Text>
        </View>
      ) : lyrics ? (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {(lyrics.style || lyrics.mood) && (
            <LiquidGlassCard intensity="light" padding={16} style={styles.metadataCard}>
              <View style={styles.metadataInner}>
                {lyrics.style && (
                  <View style={styles.metadataItem}>
                    <Text style={styles.metadataLabel}>{t('components.trackDetails.style')}:</Text>
                    <Text style={styles.metadataValue}>{lyrics.style}</Text>
                  </View>
                )}
                {lyrics.mood && (
                  <View style={styles.metadataItem}>
                    <Text style={styles.metadataLabel}>{t('components.trackDetails.mood')}:</Text>
                    <Text style={styles.metadataValue}>{lyrics.mood}</Text>
                  </View>
                )}
              </View>
            </LiquidGlassCard>
          )}

          {lyrics.syncedLines && lyrics.syncedLines.length > 0 ? (
            lyrics.syncedLines.some(line => line.words && line.words.length > 0) ? (
              <KaraokeLyricsDisplay
                syncedLines={lyrics.syncedLines}
                variant="fullscreen"
                containerStyle={styles.syncedLyricsWrapper}
                showTimingBadge={true}
                timingMethod="whisper-audio-analysis"
              />
            ) : (
              <SyncedLyricsDisplay
                syncedLines={lyrics.syncedLines}
                variant="fullscreen"
                containerStyle={styles.syncedLyricsWrapper}
              />
            )
          ) : lyrics.content ? (
            <Text style={styles.lyricsText}>{filterSectionHeaders(lyrics.content)}</Text>
          ) : (
            <Text style={styles.noLyricsText}>{t('components.trackDetails.noLyrics')}</Text>
          )}

          {lyrics.themes && lyrics.themes.length > 0 && (
            <LiquidGlassCard intensity="light" padding={16} style={styles.themesCard}>
              <Text style={styles.themesLabel}>{t('components.trackDetails.themes')}:</Text>
              <View style={styles.themesGrid}>
                {lyrics.themes.slice(0, 4).map((themeItem, index) => (
                  <View key={index} style={styles.themeGridItem}>
                    <View style={styles.themeTag}>
                      <Text style={styles.themeText} numberOfLines={2}>
                        {themeItem}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </LiquidGlassCard>
          )}
        </ScrollView>
      ) : track.lyricsId ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="document-text-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.noLyricsText}>{t('components.lyricsModal.noLyricsAvailable')}</Text>
        </View>
      ) : (
        <View style={styles.loadingContainer}>
          <Ionicons name="musical-notes-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.noLyricsText}>{t('components.trackDetails.noLyrics')}</Text>
        </View>
      )}

      {/* Edit Track Modal */}
      {track && (
        <EditTrackModal
          visible={showEditModal}
          onClose={() => setShowEditModal(false)}
          track={{
            id: track.id,
            title: track.title,
            displayName: track.displayName || displayName,
            artworkUrl: track.artworkUrl,
          }}
          onSave={() => fetchTrackById(track.id)}
        />
      )}
    </View>
  );
}

const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 48, 320);

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    heroArtworkContainer: {
      width: SCREEN_WIDTH,
      height: SCREEN_WIDTH,
      position: 'relative',
    },
    heroArtwork: {
      width: '100%',
      height: '100%',
    },
    heroArtworkPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroOverlay: {
      ...StyleSheet.absoluteFillObject,
      pointerEvents: 'none',
    },
    heroHeaderActions: {
      position: 'absolute',
      top: 50,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    heroBackButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.overlay.black[40],
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroShareButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.overlay.black[40],
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroContent: {
      position: 'absolute',
      bottom: 20,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    reactionsOverlay: {
      position: 'absolute',
      right: 16,
      bottom: 100,
      zIndex: Z_INDEX.dropdown,
    },
    heroTitle: {
      fontFamily: fontFamilies.serif.bold,
      fontSize: fontSizes.title1,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 4,
      textShadowColor: colors.overlay.black[50],
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    },
    heroArtist: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.title3,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
      textShadowColor: colors.overlay.black[50],
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    heroMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    heroMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 8,
    },
    heroMetaText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.footnote,
      color: colors.text.secondary,
      marginLeft: 4,
    },
    heroPlayButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.absolute.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    scrollContent: {
      flex: 1,
    },
    scrollContentContainer: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 60,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
    },
    errorBackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 56,
      paddingHorizontal: 16,
    },
    errorBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
    },
    errorBackText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.body,
      color: colors.text.primary,
      marginLeft: 4,
    },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    errorText: {
      fontFamily: fontFamilies.body.regular,
      color: colors.semantic.error,
      fontSize: fontSizes.body,
      marginTop: 16,
      textAlign: 'center',
      lineHeight: lineHeights.body,
    },
    noLyricsText: {
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      fontSize: fontSizes.body,
      marginTop: 16,
      textAlign: 'center',
      lineHeight: lineHeights.body,
    },
    metadataCard: {
      marginBottom: 28,
    },
    metadataInner: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 20,
      justifyContent: 'center',
    },
    metadataItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metadataLabel: {
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      fontSize: fontSizes.subhead,
      marginRight: 8,
    },
    metadataValue: {
      fontFamily: fontFamilies.body.semibold,
      color: colors.brand.primary,
      fontSize: fontSizes.subhead,
    },
    lyricsText: {
      fontFamily: fontFamilies.body.regular,
      color: colors.text.primary,
      fontSize: fontSizes.body,
      lineHeight: lineHeights.body + 8,
      textAlign: 'center',
    },
    syncedLyricsWrapper: {
      flex: 1,
      minHeight: 320,
      marginHorizontal: -18,
    },
    themesCard: {
      marginTop: 40,
    },
    themesLabel: {
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.secondary,
      fontSize: fontSizes.subhead,
      marginBottom: 16,
      textAlign: 'center',
    },
    themesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -6,
    },
    themeGridItem: {
      width: '50%',
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    themeTag: {
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 12,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.muted,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    themeText: {
      fontFamily: fontFamilies.body.regular,
      textAlign: 'center',
      color: colors.brand.secondary,
      fontSize: fontSizes.footnote,
    },
    heroRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    heroScheduleButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.overlay.black[40],
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[60],
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    modalTitle: {
      fontFamily: fontFamilies.serif.bold,
      fontSize: fontSizes.title2,
      color: colors.text.primary,
    },
    modalCloseButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scheduleSection: {
      marginBottom: 24,
    },
    scheduleSectionLabel: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.subhead,
      color: colors.text.secondary,
      marginBottom: 12,
    },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.subtle,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    dateButtonText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.body,
      color: colors.text.primary,
      marginLeft: 12,
    },
    repeatOptionsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    repeatOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '48%',
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    repeatOptionSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    repeatOptionText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.callout,
      color: colors.text.secondary,
      marginLeft: 8,
      textAlign: 'center',
    },
    repeatOptionTextSelected: {
      color: colors.text.primary,
    },
    scheduleSubmitButton: {
      backgroundColor: colors.brand.primary,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      marginTop: 8,
    },
    scheduleSubmitButtonDisabled: {
      opacity: 0.6,
    },
    scheduleSubmitButtonText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.body,
      color: colors.text.primary,
    },
  });
