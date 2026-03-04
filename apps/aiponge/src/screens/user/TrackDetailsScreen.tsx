import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme, commonStyles, Z_INDEX, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { fontFamilies, fontSizes, lineHeights } from '../../theme/typography';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassCard } from '../../components/ui';
import { SyncedLyricsDisplay } from '../../components/music/SyncedLyricsDisplay';
import { KaraokeLyricsDisplay } from '../../components/music/KaraokeLyricsDisplay';
import { useTranslation } from '../../i18n';
import { EditTrackModal } from '../../components/music/EditTrackModal';
import { useAuthStore, selectUser } from '../../auth/store';
import { PlaybackControls } from '../../components/music/PlaybackControls';
import { ShortsStyleReactions } from '../../components/music/ShortsStyleReactions';
import { useFavorites } from '../../hooks/playlists/useFavorites';
import { filterSectionHeadersFromContent } from '@aiponge/shared-contracts';
import { getApiGatewayUrl } from '../../lib/apiConfig';

import { useTrackData } from './track-details/useTrackData';
import { useTrackPlayback } from './track-details/useTrackPlayback';
import { useTrackShare } from './track-details/useTrackShare';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatDuration(seconds?: number) {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function TrackDetailsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore(selectUser);
  const displayName = user?.name || 'You';

  const { isFavorite: isLiked, toggleFavorite: toggleLike, isToggling } = useFavorites(user?.id || '');
  const canLike = !!user?.id;

  // Edit track modal state
  const [showEditModal, setShowEditModal] = useState(false);

  // ─── Extracted hooks ─────────────────────────────────────────────

  const { track, setTrack, lyrics, audioUrl, isLoadingTrack, isLoadingLyrics, trackError, lyricsError } =
    useTrackData(t);

  const playback = useTrackPlayback(track, audioUrl, displayName);

  const { handleShare } = useTrackShare(track, lyrics, displayName, t);

  // ─── Loading / Error states ──────────────────────────────────────

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

  // ─── Render ──────────────────────────────────────────────────────

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

      {/* Playback Controls */}
      {playback.showPlaybackControls && (
        <PlaybackControls
          shuffleEnabled={playback.shuffleEnabled}
          repeatMode={playback.repeatMode}
          onToggleShuffle={playback.toggleShuffle}
          onCycleRepeat={playback.cycleRepeat}
          onPrevious={playback.hasPrevious ? playback.handlePreviousTrack : undefined}
          onNext={playback.hasNext ? playback.handleNextTrack : undefined}
          onPlayPause={playback.handlePlayPause}
          isPlaying={playback.isCurrentTrackPlaying || false}
          trackCount={playback.trackCount}
          showTrackCount={playback.queue.length > 1}
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
            <Text style={styles.lyricsText}>{filterSectionHeadersFromContent(lyrics.content)}</Text>
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
          onSave={() => {
            /* Track data will be refreshed via cache invalidation */
          }}
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
  });
