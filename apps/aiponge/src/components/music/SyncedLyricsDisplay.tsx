import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus } from 'expo-audio';
import { useThemeColors, type ColorScheme } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { useTranslation } from '../../i18n';
import { LiquidGlassCard } from '../ui';

interface SyncedLine {
  startTime?: number; // in seconds
  endTime?: number; // in seconds
  startMs?: number; // in milliseconds (alternative format)
  endMs?: number; // in milliseconds (alternative format)
  text: string;
  type?: string;
}

// Helper to normalize time to seconds (handles both formats)
function getStartTimeSeconds(line: SyncedLine): number {
  if (line.startTime !== undefined) return line.startTime;
  if (line.startMs !== undefined) return line.startMs / 1000;
  return 0;
}

function getEndTimeSeconds(line: SyncedLine): number {
  if (line.endTime !== undefined) return line.endTime;
  if (line.endMs !== undefined) return line.endMs / 1000;
  return 0;
}

interface SyncedLyricsDisplayProps {
  syncedLines: SyncedLine[];
  containerStyle?: ViewStyle;
  variant?: 'modal' | 'fullscreen';
  onActiveLineChange?: (lineIndex: number) => void;
  showTimingBadge?: boolean;
  timingMethod?: 'whisper-audio-analysis' | 'estimated' | 'unknown';
}

/**
 * SyncedLyricsDisplay - Shared component for displaying time-synchronized lyrics
 *
 * Uses OpenAI Whisper audio-analyzed timestamps for accurate lyrics-to-vocal sync.
 *
 * **Props:**
 * - `syncedLines`: Array of lyrics with startTime/endTime timestamps from Whisper analysis
 * - `variant`: Display style ('modal' | 'fullscreen') - affects styling and scroll offset
 * - `containerStyle`: Optional custom styles for the container
 * - `onActiveLineChange`: Optional callback when active line changes
 * - `showTimingBadge`: Whether to show timing method badge
 * - `timingMethod`: Source of timestamps ('whisper-audio-analysis' for accurate timing)
 *
 * @example
 * ```tsx
 * <SyncedLyricsDisplay
 *   syncedLines={lyrics.syncedLines}
 *   variant="fullscreen"
 *   timingMethod="whisper-audio-analysis"
 * />
 * ```
 */

export function SyncedLyricsDisplay({
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
  // useAudioPlayerStatus provides reactive updates to currentTime
  const playerStatus = useAudioPlayerStatus(player);

  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  const scrollViewRef = useRef<ScrollView>(null);
  const linePositions = useRef<{ [key: number]: number }>({});
  const lyricsContainerOffset = useRef<number>(0);
  const lastIndexRef = useRef<number>(-1);

  // Binary search to find the active line - O(log n) instead of O(n)
  const findActiveLineIndex = useCallback(
    (adjustedTime: number): number => {
      if (!syncedLines || syncedLines.length === 0) return -1;

      let left = 0;
      let right = syncedLines.length - 1;
      let result = -1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const line = syncedLines[mid];
        const lineStart = getStartTimeSeconds(line);
        const lineEnd = getEndTimeSeconds(line);

        if (adjustedTime >= lineStart && adjustedTime < lineEnd) {
          return mid;
        } else if (adjustedTime < lineStart) {
          right = mid - 1;
        } else {
          result = mid;
          left = mid + 1;
        }
      }

      // Check if we're past the last line but still within its end time
      const resultLine = syncedLines[result];
      if (
        result >= 0 &&
        resultLine &&
        adjustedTime >= getStartTimeSeconds(resultLine) &&
        adjustedTime < getEndTimeSeconds(resultLine)
      ) {
        return result;
      }

      return -1;
    },
    [syncedLines]
  );

  const lineStyles = variant === 'modal' ? modalLineStyles : fullscreenLineStyles;

  // Filter out section headers and instrumental markers, strip inline bracket content
  // Backend marks these with type='section' or type='instrumental', with regex fallback for data without type field
  const filteredLines = useMemo(() => {
    return syncedLines
      .filter(line => {
        if (line.type === 'section' || line.type === 'instrumental') return false;
        const trimmedText = line.text.trim();
        if (/^\[.*\]$/.test(trimmedText)) return false;
        const cleaned = trimmedText.replace(/\[.*?\]/g, '').trim();
        return cleaned.length > 0;
      })
      .map(line => {
        const cleaned = line.text.replace(/\[.*?\]/g, '').trim();
        return cleaned !== line.text.trim() ? { ...line, text: cleaned } : line;
      });
  }, [syncedLines]);

  // Check if a line should be filtered out (must match filteredLines logic exactly)
  const shouldFilterLine = useCallback((line: SyncedLine) => {
    if (line.type === 'section' || line.type === 'instrumental') return true;
    const trimmedText = line.text.trim();
    if (/^\[.*\]$/.test(trimmedText)) return true;
    const cleaned = trimmedText.replace(/\[.*?\]/g, '').trim();
    return cleaned.length === 0;
  }, []);

  // Find the current line index in filtered lines
  const getFilteredIndex = useCallback(
    (originalIndex: number) => {
      if (originalIndex < 0) return -1;
      let filteredIdx = 0;
      for (let i = 0; i < syncedLines.length && i <= originalIndex; i++) {
        if (shouldFilterLine(syncedLines[i])) continue;
        if (i === originalIndex) return filteredIdx;
        filteredIdx++;
      }
      return -1;
    },
    [syncedLines, shouldFilterLine]
  );

  // Scroll to active line with smooth animation (using cached positions from onLayout)
  const scrollToLine = useCallback(
    (filteredIndex: number) => {
      const yPosition = linePositions.current[filteredIndex];
      if (filteredIndex >= 0 && yPosition !== undefined && scrollViewRef.current) {
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

  // Sync lyrics to current playback position using reactive playerStatus
  useEffect(() => {
    if (!syncedLines || syncedLines.length === 0) {
      return;
    }

    // Get currentTime from reactive playerStatus (in seconds)
    // Note: On web platform, expo-audio may return milliseconds instead of seconds (bug)
    let currentTime = playerStatus.currentTime || 0;
    // Auto-detect and convert if in milliseconds (times > 1000 are likely ms, not seconds)
    if (currentTime > 1000) {
      currentTime = currentTime / 1000;
    }

    // Whisper timestamps are audio-accurate, no offset needed
    const activeIndex = findActiveLineIndex(currentTime);

    // Only update state if index changed (prevents unnecessary re-renders)
    if (activeIndex !== lastIndexRef.current) {
      lastIndexRef.current = activeIndex;
      setCurrentLineIndex(activeIndex);
      onActiveLineChange?.(activeIndex);
      // Convert to filtered index for scrolling
      const filteredIdx = getFilteredIndex(activeIndex);
      scrollToLine(filteredIdx);
    }
  }, [syncedLines, playerStatus.currentTime, findActiveLineIndex, scrollToLine, getFilteredIndex, onActiveLineChange]);

  const currentFilteredIndex = getFilteredIndex(currentLineIndex);

  const getLineStyle = (index: number) => {
    if (index === currentFilteredIndex) {
      return lineStyles.activeLineText;
    }
    if (index < currentFilteredIndex) {
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
                style={[lineStyles.lineContainer, index === currentFilteredIndex && lineStyles.activeLine]}
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
