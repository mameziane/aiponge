/**
 * OfflineIndicator — Small icon showing a track is available offline.
 *
 * Renders a downward-arrow-in-circle icon when the track has been downloaded
 * for offline playback. Shows nothing when not downloaded.
 *
 * Uses a Zustand selector scoped to the specific trackId so that
 * re-renders only fire when THIS track's download status changes,
 * not when any other track's state updates (critical for long lists).
 *
 * @example
 * <OfflineIndicator trackId={track.id} />
 * <OfflineIndicator trackId={track.id} size={14} variant="badge" />
 */

import { memo } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';
import { useDownloadStore, selectIsDownloaded } from '../../offline/store';

interface OfflineIndicatorProps {
  trackId: string;
  /** Icon size in pixels (default: 16) */
  size?: number;
  /** 'inline' renders just the icon; 'badge' adds a dark background circle */
  variant?: 'inline' | 'badge';
  /** Extra style applied to the container */
  style?: ViewStyle;
}

function OfflineIndicatorComponent({ trackId, size = 16, variant = 'inline', style }: OfflineIndicatorProps) {
  const isDownloaded = useDownloadStore(selectIsDownloaded(trackId));
  const colors = useThemeColors();

  if (!isDownloaded) return null;

  if (variant === 'badge') {
    return (
      <View style={[styles.badge, style]} testID={`offline-badge-${trackId}`}>
        <Ionicons name="arrow-down-circle" size={size} color={colors.absolute.white} />
      </View>
    );
  }

  return (
    <View style={[styles.inline, style]} testID={`offline-indicator-${trackId}`}>
      <Ionicons name="arrow-down-circle" size={size} color={colors.semantic.success} />
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    paddingHorizontal: 2,
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 2,
  },
});

export const OfflineIndicator = memo(OfflineIndicatorComponent);
