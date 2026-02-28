import { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';
import { AnimatedWaveform } from '../music/AnimatedWaveform';
import type { TrackForMenu } from '../music/TrackOptionsMenu';

export function formatPlayCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

interface TrackMenuData {
  id: string;
  title: string;
  displayName?: string;
  artworkUrl?: string;
  audioUrl?: string;
  duration?: number;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
  isUserGenerated?: boolean;
  playOnDate?: string | null;
}

interface UseTrackOptionsMenuReturn {
  showOptionsMenu: boolean;
  openOptionsMenu: () => void;
  closeOptionsMenu: () => void;
  trackForMenu: TrackForMenu;
  handleMorePress: (e: GestureResponderEvent) => void;
}

export function useTrackOptionsMenu(track: TrackMenuData): UseTrackOptionsMenuReturn {
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const openOptionsMenu = useCallback(() => setShowOptionsMenu(true), []);
  const closeOptionsMenu = useCallback(() => setShowOptionsMenu(false), []);

  const handleMorePress = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation();
    setShowOptionsMenu(true);
  }, []);

  const trackForMenu: TrackForMenu = {
    id: track.id,
    title: track.title,
    displayName: track.displayName || undefined,
    artworkUrl: track.artworkUrl,
    audioUrl: track.audioUrl,
    duration: track.duration,
    lyricsId: track.lyricsId,
    hasSyncedLyrics: track.hasSyncedLyrics,
    isUserGenerated: track.isUserGenerated,
    playOnDate: track.playOnDate,
  };

  return {
    showOptionsMenu,
    openOptionsMenu,
    closeOptionsMenu,
    trackForMenu,
    handleMorePress,
  };
}

interface PlayingOverlayProps {
  size?: 'small' | 'medium';
  backgroundColor?: string;
}

export function PlayingOverlay({ size = 'small', backgroundColor = 'rgba(68, 9, 114, 0.75)' }: PlayingOverlayProps) {
  const colors = useThemeColors();
  return (
    <View style={[overlayStyles.container, { backgroundColor }]}>
      <AnimatedWaveform size={size} color={colors.absolute.white} />
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

interface TrackActionButtonProps {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  iconColor?: string;
  testID: string;
  style?: object;
}

export function TrackActionButton({ onPress, icon, iconSize = 18, iconColor, testID, style }: TrackActionButtonProps) {
  const colors = useThemeColors();
  const resolvedIconColor = iconColor ?? colors.text.secondary;

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      e.stopPropagation();
      onPress();
    },
    [onPress]
  );

  return (
    <TouchableOpacity onPress={handlePress} style={[actionStyles.button, style]} testID={testID} activeOpacity={0.7}>
      <Ionicons name={icon} size={iconSize} color={resolvedIconColor} />
    </TouchableOpacity>
  );
}

const actionStyles = StyleSheet.create({
  button: {
    padding: 6,
  },
});

interface LikeButtonProps {
  isLiked: boolean;
  onToggle: () => void;
  testID: string;
  size?: number;
  style?: object;
  likedColor?: string;
  unlikedColor?: string;
}

export function LikeButton({ isLiked, onToggle, testID, size = 20, style, likedColor, unlikedColor }: LikeButtonProps) {
  const colors = useThemeColors();
  const resolvedLikedColor = likedColor ?? colors.social.like;
  const resolvedUnlikedColor = unlikedColor ?? colors.text.secondary;

  return (
    <TrackActionButton
      onPress={onToggle}
      icon={isLiked ? 'heart' : 'heart-outline'}
      iconSize={size}
      iconColor={isLiked ? resolvedLikedColor : resolvedUnlikedColor}
      testID={testID}
      style={style}
    />
  );
}

interface MoreOptionsButtonProps {
  onPress: (e: GestureResponderEvent) => void;
  testID: string;
  size?: number;
  color?: string;
  style?: object;
  disabled?: boolean;
}

export function MoreOptionsButton({
  onPress,
  testID,
  size = 18,
  color,
  style,
  disabled = false,
}: MoreOptionsButtonProps) {
  const colors = useThemeColors();
  const resolvedColor = color ?? colors.text.secondary;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[actionStyles.button, style, disabled && { opacity: 0.3 }]}
      testID={testID}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <Ionicons name="ellipsis-vertical" size={size} color={resolvedColor} />
    </TouchableOpacity>
  );
}
