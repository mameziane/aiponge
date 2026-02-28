import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioRoutePickerCompact } from './AudioRoutePicker';
import { LiquidGlassView } from '../ui/LiquidGlassView';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { spacing } from '../../theme/spacing';
import { useTranslation } from '../../i18n';

export type RepeatMode = 'off' | 'one' | 'all';

interface PlaybackControlsProps {
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onPlayPause?: () => void;
  isPlaying?: boolean;
  leftContent?: React.ReactNode;
  trackCount?: number;
  showTrackCount?: boolean;
}

export function PlaybackControls({
  shuffleEnabled,
  repeatMode,
  onToggleShuffle,
  onCycleRepeat,
  onPrevious,
  onNext,
  onPlayPause,
  isPlaying = false,
  leftContent,
  trackCount,
  showTrackCount = false,
}: PlaybackControlsProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const getRepeatIcon = () => {
    return repeatMode === 'off' ? 'repeat-outline' : 'repeat';
  };

  const getRepeatColor = () => {
    return repeatMode === 'off' ? colors.text.secondary : colors.brand.primary;
  };

  const getRepeatLabel = () => {
    if (repeatMode === 'off') return t('components.playbackControls.repeat');
    if (repeatMode === 'one') return t('components.playbackControls.repeatOne');
    return t('components.playbackControls.repeatAll');
  };

  return (
    <LiquidGlassView intensity="medium" style={styles.controlBar}>
      <View style={styles.controlBarInner}>
        {/* Left side: optional content + transport controls */}
        <View style={styles.leftSection}>
          {leftContent}

          {/* Playback Transport Controls */}
          {onPlayPause && (
            <View style={styles.transportControls}>
              {/* Previous Button */}
              <TouchableOpacity
                onPress={onPrevious}
                style={[styles.transportButton, !onPrevious && styles.transportButtonDisabled]}
                testID="button-previous"
                activeOpacity={onPrevious ? 0.7 : 1}
                disabled={!onPrevious}
                accessibilityRole="button"
                accessibilityLabel={t('components.playbackControls.previousTrack')}
              >
                <Ionicons
                  name="play-skip-back"
                  size={22}
                  color={onPrevious ? colors.text.primary : colors.text.tertiary}
                />
              </TouchableOpacity>

              {/* Play/Pause Button */}
              <TouchableOpacity
                onPress={onPlayPause}
                style={styles.playPauseButton}
                testID="button-play-pause"
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                  isPlaying ? t('components.playbackControls.pause') : t('components.playbackControls.play')
                }
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text.primary} />
              </TouchableOpacity>

              {/* Next Button */}
              <TouchableOpacity
                onPress={onNext}
                style={[styles.transportButton, !onNext && styles.transportButtonDisabled]}
                testID="button-next"
                activeOpacity={onNext ? 0.7 : 1}
                disabled={!onNext}
                accessibilityRole="button"
                accessibilityLabel={t('components.playbackControls.nextTrack')}
              >
                <Ionicons
                  name="play-skip-forward"
                  size={22}
                  color={onNext ? colors.text.primary : colors.text.tertiary}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Spacer to push right controls to the right */}
        <View style={styles.spacer} />

        {/* Right side: shuffle, repeat, audio output */}
        <View style={styles.rightSection}>
          {/* Shuffle Button */}
          <TouchableOpacity
            onPress={onToggleShuffle}
            style={[styles.controlButton, shuffleEnabled && styles.controlButtonActive]}
            testID="button-shuffle"
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              shuffleEnabled ? t('components.playbackControls.shuffleOn') : t('components.playbackControls.shuffleOff')
            }
            accessibilityState={{ selected: shuffleEnabled }}
          >
            <Ionicons
              name={shuffleEnabled ? 'shuffle' : 'shuffle-outline'}
              size={22}
              color={shuffleEnabled ? colors.brand.primary : colors.text.secondary}
            />
          </TouchableOpacity>

          {/* Repeat Button */}
          <TouchableOpacity
            onPress={onCycleRepeat}
            style={[styles.controlButton, repeatMode !== 'off' && styles.controlButtonActive]}
            testID="button-repeat"
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={getRepeatLabel()}
            accessibilityState={{ selected: repeatMode !== 'off' }}
          >
            <View style={styles.repeatIconContainer}>
              <Ionicons name={getRepeatIcon()} size={22} color={getRepeatColor()} />
              {repeatMode === 'one' && (
                <View style={styles.repeatOneBadge}>
                  <Text style={styles.repeatOneText}>1</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Audio Output Indicator */}
          <AudioRoutePickerCompact />
        </View>
      </View>
    </LiquidGlassView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    controlBar: {
      marginHorizontal: spacing.screenHorizontal / 2,
      marginVertical: spacing.componentGap / 2,
      paddingHorizontal: 12,
      paddingVertical: spacing.componentGap,
      borderRadius: BORDER_RADIUS.lg,
    },
    controlBarInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    leftSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    spacer: {
      flex: 1,
    },
    rightSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    controlButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    controlButtonActive: {
      backgroundColor: 'rgba(139, 92, 246, 0.25)',
      borderColor: 'rgba(139, 92, 246, 0.5)',
    },
    repeatIconContainer: {
      position: 'relative',
      width: 22,
      height: 22,
    },
    repeatOneBadge: {
      position: 'absolute',
      top: -2,
      right: -4,
      backgroundColor: colors.brand.primary,
      borderRadius: 6,
      width: 12,
      height: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    repeatOneText: {
      fontSize: 8,
      fontWeight: '700',
      color: colors.text.primary,
    },
    transportControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    transportButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: colors.background.subtle,
    },
    transportButtonDisabled: {
      opacity: 0.4,
    },
    playPauseButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
  });
