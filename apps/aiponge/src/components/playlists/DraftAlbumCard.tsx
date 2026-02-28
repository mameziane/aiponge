import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect, useRef, useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CONTENT_VISIBILITY, isContentPubliclyAccessible, isContentPersonal } from '@aiponge/shared-contracts';
import { useTranslation } from '../../i18n';
import {
  useAlbumGenerationStore,
  isGenerationActive,
  selectAlbumActiveGenerations,
  selectAlbumCheckActiveGenerations,
  selectAlbumIsPolling,
  selectAlbumIsPendingGeneration,
  type AlbumGenerationProgress,
} from '../../stores';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { IconRevealPixelGrid, getGridSize } from './IconRevealAnimation';

interface DraftAlbumCardProps {
  generation: AlbumGenerationProgress;
  onPress?: () => void;
  testID?: string;
  flexible?: boolean;
}

const COMPLETION_DISPLAY_MS = 4000;
const INTERPOLATION_INTERVAL_MS = 200;
const INTERPOLATION_SPEED = 0.08;

const PHASE_I18N_KEYS: Record<string, string> = {
  queued: 'albums.phaseQueued',
  initializing: 'albums.phaseInitializing',
  validating: 'albums.phaseValidating',
  creating_album: 'albums.phaseCreatingAlbum',
  preparing_tracks: 'albums.phasePreparingTracks',
  generating_tracks: 'albums.phaseGeneratingTracks',
  generating_track: 'albums.phaseGeneratingTracks',
  generating_artwork: 'albums.phaseGeneratingArtwork',
  linking: 'albums.phaseLinking',
  saving: 'albums.phaseLinking',
  finalizing: 'albums.phaseFinalizing',
};

export function DraftAlbumCard({ generation, onPress, testID, flexible }: DraftAlbumCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const [smoothProgress, setSmoothProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef(0);

  const isCompleted = generation.status === 'completed' || generation.status === 'partial';
  const isFailed = generation.status === 'failed';
  const isFinished = isCompleted || isFailed;

  const serverPercent = generation.percentComplete || 0;

  useEffect(() => {
    targetRef.current = serverPercent;
  }, [serverPercent]);

  useEffect(() => {
    if (isGenerationActive(generation.status)) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setSmoothProgress(prev => {
            const target = targetRef.current;
            if (prev >= target) return prev;
            const diff = target - prev;
            const step = Math.max(0.5, diff * INTERPOLATION_SPEED);
            return Math.min(Math.round(prev + step), target);
          });
        }, INTERPOLATION_INTERVAL_MS);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [generation.status]);

  const displayPercent = useMemo(() => {
    if (isCompleted) return 100;
    if (isFailed) return smoothProgress;
    return Math.max(smoothProgress, 1);
  }, [isCompleted, isFailed, smoothProgress]);

  const currentPhase = useMemo(() => {
    if (isCompleted) return t('albums.generationComplete') || 'Complete!';
    if (isFailed) return t('albums.generationFailed') || 'Generation failed';
    const phase = generation.phase || 'queued';
    const i18nKey = PHASE_I18N_KEYS[phase];
    if (i18nKey) {
      const translated = t(i18nKey);
      if (translated && translated !== i18nKey) return translated;
    }
    const fallback = t('albums.phaseGeneratingTracks');
    return fallback && fallback !== 'albums.phaseGeneratingTracks' ? fallback : 'processing...';
  }, [isCompleted, isFailed, generation.phase, t]);

  const gridSize = useMemo(() => getGridSize(displayPercent), [displayPercent]);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (isContentPubliclyAccessible(generation.visibility || '') && generation.albumId) {
      router.push({
        pathname: '/album-detail',
        params: { albumId: generation.albumId, visibility: CONTENT_VISIBILITY.SHARED },
      });
    } else if (generation.albumId) {
      router.push({
        pathname: '/album-detail',
        params: { albumId: generation.albumId },
      });
    } else {
      router.push('/(user)/create' as Href);
    }
  };

  const title = generation.albumTitle || generation.chapterTitle || t('albums.newAlbum');
  const CARD_SIZE = 160;

  return (
    <TouchableOpacity
      style={flexible ? styles.containerFlexible : styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
      testID={testID || `draft-album-${generation.id}`}
    >
      <View style={[styles.square, isCompleted && styles.squareCompleted, isFailed && styles.squareFailed]}>
        <IconRevealPixelGrid gridSize={gridSize} size={CARD_SIZE} progress={displayPercent} />
        <View style={[styles.overlay, isCompleted && styles.overlayCompleted, isFailed && styles.overlayFailed]}>
          {isCompleted ? (
            <Ionicons name="checkmark-circle" size={48} color={colors.semantic.success} />
          ) : isFailed ? (
            <Ionicons name="close-circle" size={48} color={colors.semantic.error} />
          ) : (
            <Text style={styles.percentageText}>{displayPercent}%</Text>
          )}
          <Text
            style={[styles.phaseText, isCompleted && styles.phaseTextCompleted, isFailed && styles.phaseTextFailed]}
          >
            {currentPhase}
          </Text>
          <Text style={styles.titleText} numberOfLines={2}>
            {title}
          </Text>
          {isFinished && generation.albumId && (
            <Text style={styles.tapToViewText}>{t('albums.tapToView') || 'Tap to view'}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      width: 160,
      marginRight: 12,
    },
    containerFlexible: {
      width: '48%',
      marginBottom: 12,
    },
    square: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: BORDER_RADIUS.md,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      backgroundColor: colors.brand.purple[900],
    },
    squareCompleted: {
      borderWidth: 2,
      borderColor: colors.semantic.success,
    },
    squareFailed: {
      borderWidth: 2,
      borderColor: colors.semantic.error,
    },
    overlay: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    overlayCompleted: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    overlayFailed: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    percentageText: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text.primary,
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    phaseText: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.text.secondary,
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      marginTop: 4,
    },
    phaseTextCompleted: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.semantic.success,
    },
    phaseTextFailed: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.semantic.error,
    },
    titleText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 8,
      paddingHorizontal: 12,
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    tapToViewText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 6,
      opacity: 0.8,
    },
  });

function useCompletionAutoClean(
  activeGenerations: Record<string, AlbumGenerationProgress>,
  clearGeneration: (id: string) => void,
  visibilityFilter: (gen: AlbumGenerationProgress) => boolean
) {
  const scheduledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const completedIds = Object.entries(activeGenerations)
      .filter(
        ([id, gen]) =>
          visibilityFilter(gen) &&
          (gen.status === 'completed' || gen.status === 'partial' || gen.status === 'failed') &&
          !scheduledRef.current.has(id)
      )
      .map(([id]) => id);

    if (completedIds.length === 0) return;

    completedIds.forEach(id => scheduledRef.current.add(id));

    const timer = setTimeout(() => {
      completedIds.forEach(id => {
        clearGeneration(id);
        scheduledRef.current.delete(id);
      });
    }, COMPLETION_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [activeGenerations, clearGeneration, visibilityFilter]);
}

export function useDraftAlbum() {
  const activeGenerations = useAlbumGenerationStore(selectAlbumActiveGenerations);
  const checkActiveGenerations = useAlbumGenerationStore(selectAlbumCheckActiveGenerations);
  const isPolling = useAlbumGenerationStore(selectAlbumIsPolling);
  const isPendingGeneration = useAlbumGenerationStore(selectAlbumIsPendingGeneration);
  const clearGeneration = useAlbumGenerationStore(state => state.clearGeneration);
  const visibilityFilter = useMemo(() => (gen: AlbumGenerationProgress) => isContentPersonal(gen.visibility || ''), []);

  useEffect(() => {
    checkActiveGenerations();
  }, [checkActiveGenerations]);

  useCompletionAutoClean(activeGenerations, clearGeneration, visibilityFilter);

  const draftAlbums = useMemo(() => {
    return Object.values(activeGenerations).filter(visibilityFilter);
  }, [activeGenerations, visibilityFilter]);

  const hasDraftAlbum = draftAlbums.length > 0 || isPolling || isPendingGeneration;
  const draftAlbum = draftAlbums[0] || null;

  return {
    draftAlbum,
    draftAlbums,
    hasDraftAlbum,
    isPendingGeneration,
  };
}

export function useDraftAlbumShared() {
  const activeGenerations = useAlbumGenerationStore(selectAlbumActiveGenerations);
  const checkActiveGenerations = useAlbumGenerationStore(selectAlbumCheckActiveGenerations);
  const isPolling = useAlbumGenerationStore(selectAlbumIsPolling);
  const isPendingGeneration = useAlbumGenerationStore(selectAlbumIsPendingGeneration);
  const clearGeneration = useAlbumGenerationStore(state => state.clearGeneration);
  const visibilityFilter = useMemo(
    () => (gen: AlbumGenerationProgress) => isContentPubliclyAccessible(gen.visibility || ''),
    []
  );

  useEffect(() => {
    checkActiveGenerations();
  }, [checkActiveGenerations]);

  useCompletionAutoClean(activeGenerations, clearGeneration, visibilityFilter);

  const draftAlbums = useMemo(() => {
    return Object.values(activeGenerations).filter(visibilityFilter);
  }, [activeGenerations, visibilityFilter]);

  const hasDraftAlbum = draftAlbums.length > 0 || isPolling || isPendingGeneration;
  const draftAlbum = draftAlbums[0] || null;

  return {
    draftAlbum,
    draftAlbums,
    hasDraftAlbum,
    isPendingGeneration,
  };
}
