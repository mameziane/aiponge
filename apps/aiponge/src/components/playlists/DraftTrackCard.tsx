import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { memo, useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';
import {
  useTrackGenerationStore,
  isTrackGenerationActive,
  setStreamingPreviewPlaying,
  clearStreamingPreviewPlaying,
  updatePreviewPosition,
  isRequestCompleted,
  selectTrackActiveGenerations,
  selectTrackCheckActiveGenerations,
  selectTrackIsPolling,
  selectTrackIsPendingGeneration,
  type TrackGenerationProgress,
} from '../../stores';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { usePlaybackState } from '../../contexts/PlaybackContext';
import { configureAudioSession } from '../../hooks/music/audioSession';
import { useThemeColors, type ColorScheme } from '../../theme';
import { Z_INDEX, BORDER_RADIUS } from '../../theme/constants';
import { IconRevealPixelGrid, getGridSize, easeOutQuad } from './IconRevealAnimation';

interface DraftTrackCardProps {
  generation: TrackGenerationProgress;
  onPress?: () => void;
  testID?: string;
}

const getPurpleShades = (colors: ColorScheme) => [
  colors.brand.purple[900],
  colors.brand.purple[800],
  colors.brand.purple[700],
  colors.brand.purple[600],
  colors.brand.purple[500],
  colors.brand.purple[400],
  colors.brand.purple[300],
];

const EXPECTED_GENERATION_TIME_SEC = 120;

const GENERATION_PHASES = [
  { threshold: 0, label: 'analyzing...' },
  { threshold: 10, label: 'writing lyrics...' },
  { threshold: 25, label: 'crafting melody...' },
  { threshold: 40, label: 'creating artwork...' },
  { threshold: 55, label: 'composing music...' },
  { threshold: 75, label: 'mixing audio...' },
  { threshold: 90, label: 'finalizing...' },
];

export const DraftTrackCard = memo(
  function DraftTrackCard({ generation, onPress, testID }: DraftTrackCardProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const router = useRouter();
    const player = useGlobalAudioPlayer();
    const { setCurrentTrack, setPlaybackPhase, playbackPhase } = usePlaybackState();
    const [interpolatedProgress, setInterpolatedProgress] = useState(2);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);
    const generationStartTime = useRef<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Refs to track latest values for cleanup function
    const statusRef = useRef(generation.status);
    const isPlayingPreviewRef = useRef(isPlayingPreview);
    statusRef.current = generation.status;
    isPlayingPreviewRef.current = isPlayingPreview;

    // Early playback: Check if streaming URL is available
    const hasStreamingUrl = !!generation.streamingUrl;

    // Handle play/pause for early preview
    const handlePlayPreview = useCallback(async () => {
      if (!generation.streamingUrl) return;

      try {
        if (isPlayingPreview) {
          player.pause();
          setIsPlayingPreview(false);
          clearStreamingPreviewPlaying(generation.id);
          // Clear current track so mini player hides
          setCurrentTrack(null);
          setPlaybackPhase('idle');
        } else {
          // CRITICAL: Configure audio session first to enable playback on mobile
          // This sets playsInSilentMode=true and interruptionMode='doNotMix'
          await configureAudioSession();

          // Set current track and buffering state BEFORE loading audio
          // This shows the mini player immediately with correct "loading" state
          setCurrentTrack({
            id: generation.id,
            audioUrl: generation.streamingUrl,
            title: generation.trackTitle || t('tracks.generatingTrack', { defaultValue: 'Creating your song...' }),
            displayName: t('tracks.preview', { defaultValue: 'Preview' }),
            artworkUrl: generation.artworkUrl || undefined,
          });
          setPlaybackPhase('buffering'); // Start with buffering - will transition to 'playing' when player actually starts

          await player.replace({ uri: generation.streamingUrl });
          player.play();
          setIsPlayingPreview(true);
          // Track that this streaming preview is now playing (for seamless transition on completion)
          setStreamingPreviewPlaying(generation.id, generation.streamingUrl);
        }
      } catch (error) {
        logger.warn('[DraftTrackCard] Early playback failed:', { error });
        setPlaybackPhase('idle'); // Reset on error
      }
    }, [
      generation.id,
      generation.streamingUrl,
      generation.trackTitle,
      generation.artworkUrl,
      isPlayingPreview,
      player,
      setCurrentTrack,
      setPlaybackPhase,
      t,
    ]);

    // Sync playback phase with actual player state for preview playback
    // This ensures the mini player shows the correct play/pause icon
    // GUARD: Only sync when this component initiated the preview playback
    // This prevents conflicts with useTrackPlayback which also syncs phase
    const isLoadingPreviewRef = useRef(false);

    useEffect(() => {
      // Only sync if we're the ones playing preview AND we initiated the playback
      if (!isPlayingPreview) return;

      // When player actually starts playing, update phase from buffering to playing
      if (player.playing && playbackPhase === 'buffering' && !isLoadingPreviewRef.current) {
        setPlaybackPhase('playing');
        // Small delay before allowing pause transitions to avoid transient states
        isLoadingPreviewRef.current = true;
        setTimeout(() => {
          isLoadingPreviewRef.current = false;
        }, 500);
      }
      // When player stops (and we were playing), update phase to paused
      // Only if we're not in the loading grace period
      else if (!player.playing && playbackPhase === 'playing' && !isLoadingPreviewRef.current) {
        setPlaybackPhase('paused');
      }
    }, [player.playing, playbackPhase, isPlayingPreview, setPlaybackPhase]);

    // Track current playback position for seamless resume when switching to final track
    useEffect(() => {
      if (!isPlayingPreview || !player.playing) return;

      // Update position every 500ms while playing
      const interval = setInterval(() => {
        if (player.currentTime != null) {
          updatePreviewPosition(generation.id, player.currentTime);
        }
      }, 500);

      return () => clearInterval(interval);
    }, [isPlayingPreview, player.playing, player.currentTime, generation.id]);

    // Cleanup: stop preview when component unmounts, but NOT if track completed
    // (MusicScreen handles seamless transition to final track on completion)
    // IMPORTANT: Check the completedRequestIds Set directly because when a track completes:
    // 1. The generation is deleted from activeGenerations before this component unmounts
    // 2. The status in props/refs might still be 'processing'
    // 3. Only completedRequestIds accurately tracks if the request completed successfully
    useEffect(() => {
      const generationId = generation.id;
      return () => {
        // Check if this request completed successfully using the dedicated tracking Set
        const wasCompleted = isRequestCompleted(generationId);

        // Only pause on unmount if NOT completing successfully (e.g., user navigated away)
        // When track completes, MusicScreen will seamlessly transition to final CDN track
        logger.debug('[DraftTrackCard] Cleanup running, wasCompleted:', {
          wasCompleted,
          isPlayingPreview: isPlayingPreviewRef.current,
        });
        if (isPlayingPreviewRef.current && !wasCompleted) {
          logger.debug('[DraftTrackCard] Pausing preview on unmount (not completed)');
          player.pause();
          clearStreamingPreviewPlaying(generationId);
        } else if (isPlayingPreviewRef.current && wasCompleted) {
          logger.debug('[DraftTrackCard] NOT pausing - track completed, MusicScreen will handle transition');
        }
      };
    }, [player, generation.id]);

    // Handle failure case - stop playback
    useEffect(() => {
      if (generation.status === 'failed' && isPlayingPreview) {
        player.pause();
        setIsPlayingPreview(false);
        clearStreamingPreviewPlaying(generation.id);
      }
    }, [generation.status, generation.id, isPlayingPreview, player]);

    // Track when this component first saw this generation (for visual animation)
    // We use component mount time, NOT backend startedAt, so users always see
    // the progress climb from low values when they look at the card
    useEffect(() => {
      if (isTrackGenerationActive(generation.status)) {
        // Always start fresh when component mounts with an active generation
        if (!generationStartTime.current) {
          generationStartTime.current = Date.now();
          setInterpolatedProgress(2); // Start at 2%
        }

        // Start progress interpolation timer
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            if (!generationStartTime.current) return;

            const elapsedMs = Date.now() - generationStartTime.current;
            const elapsedSec = elapsedMs / 1000;

            // Calculate raw progress (0 to 1) based on elapsed time
            const rawProgress = Math.min(elapsedSec / EXPECTED_GENERATION_TIME_SEC, 1);

            // Apply easing curve for smooth deceleration (feels more natural)
            const easedProgress = easeOutQuad(rawProgress);

            // Map to 2%-95% range (leave room for final completion)
            const displayProgress = Math.round(2 + easedProgress * 93);

            setInterpolatedProgress(displayProgress);
          }, 300); // Update every 300ms for smooth animation
        }
      } else {
        // Generation finished - clear timer
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        generationStartTime.current = null;
      }

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [generation.status]);

    // Use interpolated progress only (ignore backend discrete jumps for smoother UX)
    // Backend progress only used to detect completion
    const displayPercent = useMemo(() => {
      if (generation.status === 'completed') {
        return 100;
      }
      // Use pure interpolated progress for smooth visual animation
      return Math.min(interpolatedProgress, 99);
    }, [generation.status, interpolatedProgress]);

    // Horizontal scroll animation for phase text
    const scrollAnim = useRef(new Animated.Value(0)).current;

    // Determine current phase based on progress
    const currentPhase = useMemo(() => {
      let phaseLabel = GENERATION_PHASES[0].label;
      for (const phase of GENERATION_PHASES) {
        if (displayPercent >= phase.threshold) {
          phaseLabel = phase.label;
        }
      }
      return phaseLabel;
    }, [displayPercent]);

    // Horizontal marquee scroll animation
    useEffect(() => {
      if (!isTrackGenerationActive(generation.status)) return;

      // Reset and start scroll animation
      scrollAnim.setValue(1); // Start from right (1 = 100% off-screen right)

      const scrollAnimation = Animated.loop(
        Animated.sequence([
          // Scroll from right to left
          Animated.timing(scrollAnim, {
            toValue: -1, // End at left (-1 = 100% off-screen left)
            duration: 4000, // 4 seconds per scroll
            useNativeDriver: true,
          }),
          // Brief pause, then reset
          Animated.delay(500),
          Animated.timing(scrollAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

      scrollAnimation.start();

      return () => scrollAnimation.stop();
    }, [generation.status, currentPhase, scrollAnim]);

    // Calculate blur radius for picture-to-song mode (decreases as progress increases)
    // Max blur at 0% progress, no blur at 100% progress
    const blurRadius = useMemo(() => {
      if (!generation.artworkUrl) return 0;
      const progress = Math.max(0, Math.min(100, displayPercent));
      return Math.round(10 * (1 - progress / 100));
    }, [generation.artworkUrl, displayPercent]);

    const hasPictureMode = !!generation.artworkUrl;

    const handlePress = () => {
      if (onPress) {
        onPress();
      } else if (generation.trackId) {
        router.push({
          pathname: '/private-track-detail',
          params: { trackId: generation.trackId },
        });
      }
    };

    // Animated transform for marquee scroll (translate based on container width)
    const scrollTransform = scrollAnim.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: [-80, 0, 80], // Scroll across ~160px container
    });

    // Pixelation grid size based on progress (continues until the end)
    const gridSize = getGridSize(displayPercent);

    // Card size for pixel grid (160px container)
    const CARD_SIZE = 160;

    return (
      <TouchableOpacity
        style={styles.container}
        onPress={handlePress}
        activeOpacity={0.7}
        testID={testID || `draft-track-${generation.id}`}
      >
        {hasPictureMode ? (
          // Picture-to-song mode: Show source image with blur-to-sharp animation
          <View style={styles.square}>
            <Image
              source={{ uri: generation.artworkUrl as string }}
              style={styles.pictureImage}
              blurRadius={blurRadius}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <View style={styles.pictureOverlay}>
              {hasStreamingUrl ? (
                // Early playback available - show play button
                <TouchableOpacity onPress={handlePlayPreview} style={styles.playButton} activeOpacity={0.7}>
                  <Ionicons name={isPlayingPreview ? 'pause' : 'play'} size={32} color={colors.absolute.white} />
                </TouchableOpacity>
              ) : (
                <Text style={styles.percentageText}>{displayPercent}%</Text>
              )}
              <View style={styles.phaseContainer}>
                <Animated.Text
                  style={[styles.phaseText, { transform: [{ translateX: scrollTransform }] }]}
                  numberOfLines={1}
                >
                  {hasStreamingUrl ? 'preview ready!' : currentPhase}
                </Animated.Text>
              </View>
            </View>
          </View>
        ) : (
          // Regular mode: Icon reveal pixel animation
          <View style={[styles.square, { backgroundColor: colors.brand.purple[900] }]}>
            <IconRevealPixelGrid gridSize={gridSize} size={CARD_SIZE} progress={displayPercent} />

            {/* Overlay with percentage and phase */}
            <View style={styles.contentOverlay}>
              {hasStreamingUrl ? (
                // Early playback available - show play button
                <TouchableOpacity onPress={handlePlayPreview} style={styles.playButton} activeOpacity={0.7}>
                  <Ionicons name={isPlayingPreview ? 'pause' : 'play'} size={32} color={colors.absolute.white} />
                </TouchableOpacity>
              ) : (
                <Text style={styles.percentageText}>{displayPercent}%</Text>
              )}
              <View style={styles.phaseContainer}>
                <Animated.Text
                  style={[styles.phaseText, { transform: [{ translateX: scrollTransform }] }]}
                  numberOfLines={1}
                >
                  {hasStreamingUrl ? 'preview ready!' : currentPhase}
                </Animated.Text>
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    const prevGen = prevProps.generation;
    const nextGen = nextProps.generation;
    return (
      prevGen.id === nextGen.id &&
      prevGen.status === nextGen.status &&
      prevGen.percentComplete === nextGen.percentComplete &&
      prevGen.artworkUrl === nextGen.artworkUrl &&
      prevGen.streamingUrl === nextGen.streamingUrl &&
      prevGen.trackTitle === nextGen.trackTitle &&
      prevGen.errorMessage === nextGen.errorMessage &&
      prevGen.trackId === nextGen.trackId &&
      prevProps.onPress === nextProps.onPress &&
      prevProps.testID === nextProps.testID
    );
  }
);

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      width: 160,
      marginRight: 12,
    },
    square: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: BORDER_RADIUS.md,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      paddingVertical: 12,
      paddingHorizontal: 6,
    },
    percentageText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.absolute.white,
      opacity: 0.85,
      textShadowColor: colors.overlay.black[40],
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      marginBottom: 6,
    },
    phaseContainer: {
      width: '100%',
      height: 18,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    phaseText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.absolute.white,
      textAlign: 'center',
      opacity: 0.9,
      textShadowColor: colors.overlay.black[40],
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    pictureImage: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      borderRadius: BORDER_RADIUS.md,
    },
    contentOverlay: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 6,
      zIndex: Z_INDEX.dropdown,
    },
    pictureOverlay: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.overlay.black[30],
      borderRadius: BORDER_RADIUS.md,
    },
    playButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.overlay.brand[15],
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      shadowColor: colors.absolute.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
    },
  });

export function useDraftTrack() {
  const activeGenerations = useTrackGenerationStore(selectTrackActiveGenerations);
  const checkActiveGenerations = useTrackGenerationStore(selectTrackCheckActiveGenerations);
  const isPolling = useTrackGenerationStore(selectTrackIsPolling);
  const isPendingGeneration = useTrackGenerationStore(selectTrackIsPendingGeneration);

  useEffect(() => {
    checkActiveGenerations();
  }, [checkActiveGenerations]);

  const draftTracks = useMemo(() => {
    const allGenerations = Object.values(activeGenerations);
    const filtered = allGenerations.filter(gen => gen.status === 'queued' || gen.status === 'processing');
    return filtered;
  }, [activeGenerations]);

  const hasDraftTrack = draftTracks.length > 0;
  const draftTrack = draftTracks[0] || null;

  // If pending generation or polling is active, we have a draft track
  // (even if not yet in activeGenerations due to API latency)
  // This handles race condition where navigation happens before store update
  const hasDraftTrackOrPending = hasDraftTrack || isPolling || isPendingGeneration;

  return {
    draftTrack,
    draftTracks,
    hasDraftTrack: hasDraftTrackOrPending,
    isPendingGeneration,
  };
}
