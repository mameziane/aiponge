import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useThemeColors, type ColorScheme } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { useTranslation } from '../../i18n';
import { LiquidGlassCard } from '../ui';
import { LyricsErrorBoundary } from './LyricsErrorBoundary';
import type { SyncedLine } from '@aiponge/shared-contracts';
import { isDisplayableLyricsLine, stripBracketedContent, findActiveLineByTime } from '@aiponge/shared-contracts';

interface SyncedLyricsDisplayProps {
  syncedLines: SyncedLine[];
  containerStyle?: ViewStyle;
  variant?: 'modal' | 'fullscreen';
  onActiveLineChange?: (lineIndex: number) => void;
  showTimingBadge?: boolean;
  timingMethod?: 'whisper-audio-analysis' | 'estimated' | 'unknown';
}

/**
 * SyncedLyricsDisplay - Line-level time-synchronized lyrics display.
 *
 * Uses shared binary search and filtering utilities from @aiponge/shared-contracts.
 * Filters and searches directly on the filtered array — no index remapping needed.
 */

export function SyncedLyricsDisplay(props: SyncedLyricsDisplayProps) {
  return (
    <LyricsErrorBoundary lyricsLines={props.syncedLines} containerStyle={props.containerStyle}>
      <SyncedLyricsDisplayInner {...props} />
    </LyricsErrorBoundary>
  );
}

function SyncedLyricsDisplayInner({
  syncedLines,
  containerStyle,
  variant = 'fullscreen',
  onActiveLineChange,
  showTimingBadge = false,
  timingMethod = 'unknown',
}: SyncedLyricsDisplayProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fullscreenLineStyles = useMemo(() => createFullscreenLineStyles(colors), [colors]);
  const modalLineStyles = useMemo(() => createModalLineStyles(colors), [colors]);
  const { t } = useTranslation();
  const player = useGlobalAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  const scrollViewRef = useRef<ScrollView>(null);
  const linePositions = useRef<{ [key: number]: number }>({});
  const lyricsContainerOffset = useRef<number>(0);
  const lastIndexRef = useRef<number>(-1);

  const lineStyles = variant === 'modal' ? modalLineStyles : fullscreenLineStyles;

  // Filter upfront — search and render both use this same array (single index space)
  const filteredLines = useMemo(() => {
    return syncedLines.filter(isDisplayableLyricsLine).map(line => {
      const cleaned = stripBracketedContent(line.text);
      return cleaned !== line.text.trim() ? { ...line, text: cleaned } : line;
    });
  }, [syncedLines]);

  // Binary search directly on filteredLines — no index remapping needed
  const findActiveIndex = useCallback(
    (currentTime: number): number => {
      return findActiveLineByTime(filteredLines, currentTime);
    },
    [filteredLines]
  );

  // Scroll to active line with smooth animation
  const scrollToLine = useCallback(
    (lineIndex: number) => {
      const yPosition = linePositions.current[lineIndex];
      if (lineIndex >= 0 && yPosition !== undefined && scrollViewRef.current) {
        const scrollOffset = variant === 'modal' ? 80 : 120;
        const absoluteY = yPosition + lyricsContainerOffset.current;
        scrollViewRef.current.scrollTo({
          y: Math.max(0, absoluteY - scrollOffset),
          animated: true,
        });
      }
    },
    [variant]
  );

  // Clear cached positions when lyrics change
  useEffect(() => {
    linePositions.current = {};
  }, [syncedLines]);

  // Sync lyrics to current playback position
  useEffect(() => {
    if (!filteredLines || filteredLines.length === 0) return;

    // playerStatus.currentTime is in seconds per expo-audio spec
    const currentTime = playerStatus.currentTime || 0;
    const activeIndex = findActiveIndex(currentTime);

    if (activeIndex !== lastIndexRef.current) {
      lastIndexRef.current = activeIndex;
      setCurrentLineIndex(activeIndex);
      onActiveLineChange?.(activeIndex);
      scrollToLine(activeIndex);
    }
  }, [filteredLines, playerStatus.currentTime, findActiveIndex, scrollToLine, onActiveLineChange]);

  const getLineStyle = (index: number) => {
    if (index === currentLineIndex) {
      return lineStyles.activeLineText;
    }
    if (index < currentLineIndex) {
      return lineStyles.playedLineText;
    }
    return lineStyles.lineText;
  };

  return (
    <View style={containerStyle}>
      <LiquidGlassCard intensity="medium" padding={16} style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <Ionicons name="musical-notes" size={18} color={colors.brand.primary} />
          <Text style={styles.cardTitle}>{t('player.lyrics')}</Text>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {showTimingBadge && timingMethod === 'estimated' && (
            <View style={styles.timingBadge}>
              <Ionicons name="time-outline" size={14} color={colors.text.secondary} />
              <Text style={styles.timingBadgeText}>{t('components.syncedLyrics.estimatedTiming')}</Text>
            </View>
          )}
          <View
            style={styles.lyricsContainer}
            onLayout={e => {
              lyricsContainerOffset.current = e.nativeEvent.layout.y;
            }}
          >
            {filteredLines.map((line, index) => (
              <View
                key={`${line.startMs ?? line.startTime ?? index}-${index}`}
                onLayout={e => {
                  linePositions.current[index] = e.nativeEvent.layout.y;
                }}
                style={[lineStyles.lineContainer, index === currentLineIndex && lineStyles.activeLine]}
              >
                <Text style={getLineStyle(index)}>{line.text.trim()}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </LiquidGlassCard>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    cardContainer: {
      flex: 1,
      marginHorizontal: 0,
      marginTop: 2,
      marginBottom: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    cardTitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      paddingVertical: 4,
    },
    timingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginBottom: 12,
      gap: 6,
    },
    timingBadgeText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    lyricsContainer: {
      paddingVertical: 4,
    },
  });

const createFullscreenLineStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    lineContainer: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginVertical: 2,
    },
    activeLine: {
      transform: [{ scale: 1.02 }],
    },
    lineText: {
      color: colors.text.tertiary,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
    },
    activeLineText: {
      color: colors.absolute.white,
      fontWeight: '700',
      fontSize: 18,
      lineHeight: 30,
      textAlign: 'center',
      fontFamily: fontFamilies.body.bold,
    },
    playedLineText: {
      color: colors.absolute.white,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
    },
  });

const createModalLineStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    lineContainer: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginVertical: 1,
      borderRadius: 8,
      backgroundColor: 'transparent',
    },
    activeLine: {
      backgroundColor: colors.brand.primary + '20',
      borderLeftWidth: 3,
      borderLeftColor: colors.brand.primary,
    },
    lineText: {
      color: colors.text.secondary,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
    },
    activeLineText: {
      color: colors.text.primary,
      fontWeight: '700',
      fontSize: 18,
      lineHeight: 30,
      textAlign: 'center',
      fontFamily: fontFamilies.body.bold,
    },
    playedLineText: {
      color: colors.text.primary,
      fontSize: 16,
      lineHeight: 28,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
    },
  });
