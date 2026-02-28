import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, Pressable, Dimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useThemeColors, type ColorScheme } from '../../theme';
import { logger } from '../../lib/logger';

let VideoViewComponent: React.ComponentType<{ player: unknown; style: object; onReadyForDisplay?: () => void }> | null =
  null;
let useVideoPlayerHook:
  | ((source: unknown, setup?: (player: { loop: boolean; play: () => void }) => void) => unknown)
  | null = null;

try {
  const expoVideo = require('expo-video');
  VideoViewComponent = expoVideo.VideoView;
  useVideoPlayerHook = expoVideo.useVideoPlayer;
} catch {
  logger.warn('[SplashScreen] expo-video not available');
}

interface SplashScreenProps {
  onFinish: () => void;
}

SplashScreen.preventAutoHideAsync();

export function AnimatedSplashScreen({ onFinish }: SplashScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const hasFinishedRef = useRef(false);

  const player =
    useVideoPlayerHook?.(require('../../../assets/splash.mp4'), (player: { loop: boolean; play: () => void }) => {
      player.loop = false;
      player.play();
    }) ?? null;

  const handleVideoEnd = async () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;

    logger.debug('SplashScreen finishing - routing to app');
    try {
      await SplashScreen.hideAsync();
    } catch (e) {
      logger.warn('SplashScreen error hiding native splash', { error: e });
    }
    onFinish();
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      logger.debug('SplashScreen timeout (7s) - proceeding to app');
      handleVideoEnd();
    }, 7000);

    const hideNativeSplash = async () => {
      if (videoLoaded) return;
      logger.debug('SplashScreen video loaded - hiding native splash to show video');
      setVideoLoaded(true);
      try {
        await SplashScreen.hideAsync();
        logger.debug('SplashScreen native splash hidden - video should now be visible');
      } catch (e) {
        logger.warn('SplashScreen error hiding native splash', { error: e });
      }
    };

    const typedPlayer = player as {
      addListener: (event: string, cb: (arg: Record<string, unknown>) => void) => { remove: () => void };
      currentTime?: number;
      duration?: number;
    } | null;
    if (!typedPlayer) {
      return () => clearTimeout(timeout);
    }

    const subscription = typedPlayer.addListener('statusChange', (status: Record<string, unknown>) => {
      logger.debug('SplashScreen status change', { status: status.status });

      if (status.status === 'readyToPlay' && !videoLoaded) {
        hideNativeSplash();
      }
      if (status.status === 'idle' && videoLoaded) {
        logger.debug('SplashScreen video reached idle state (finished)');
        handleVideoEnd();
      }
      if (status.error) {
        logger.error('SplashScreen video error', undefined, { error: status.error });
        handleVideoEnd();
      }
    });

    const playbackSubscription = typedPlayer.addListener('playingChange', (isPlaying: Record<string, unknown>) => {
      const currentTime = typedPlayer.currentTime || 0;
      const duration = typedPlayer.duration || 0;

      if (!isPlaying && videoLoaded) {
        if (currentTime > 0 && duration > 0 && currentTime >= duration - 0.5) {
          logger.debug('SplashScreen video finished playing');
          handleVideoEnd();
        } else if (currentTime > 5) {
          logger.debug('SplashScreen video played 5+ seconds, finishing');
          handleVideoEnd();
        }
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.remove();
      playbackSubscription.remove();
    };
  }, [player, videoLoaded]);

  if (!VideoViewComponent || !player) {
    handleVideoEnd();
    return null;
  }

  return (
    <Pressable style={styles.container} onPress={handleVideoEnd}>
      <VideoViewComponent player={player} style={styles.video} />
    </Pressable>
  );
}

const { width, height } = Dimensions.get('screen');

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background.primary,
      zIndex: 9999,
      elevation: 9999,
    },
    video: {
      width,
      height,
      backgroundColor: colors.background.primary,
    },
  });
