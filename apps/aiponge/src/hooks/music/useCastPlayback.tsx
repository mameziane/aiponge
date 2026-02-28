/**
 * Cast Playback Integration Hook
 *
 * Bridges Chromecast functionality with the existing playback system.
 * Handles:
 * - Transferring current track to Cast device
 * - Syncing playback state between local and Cast
 * - Graceful fallback to local playback on disconnect
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePlaybackState, PlaybackTrack } from '../../contexts/PlaybackContext';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { useChromecast } from './useChromecast';
import { useTranslation } from '../../i18n';
import { useToast } from '../ui/use-toast';
import { logger } from '../../lib/logger';
import { normalizeMediaUrl } from '../../lib/apiConfig';

interface UseCastPlaybackReturn {
  isCasting: boolean;
  castDevice: string | null;
  canCast: boolean;
  startCasting: () => Promise<boolean>;
  stopCasting: () => Promise<boolean>;
  transferToCast: (track: PlaybackTrack) => Promise<boolean>;
  castPlay: () => Promise<boolean>;
  castPause: () => Promise<boolean>;
  castSeek: (position: number) => Promise<boolean>;
}

export function useCastPlayback(): UseCastPlaybackReturn {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTrack, playbackPhase, setPlaybackPhase } = usePlaybackState();
  const player = useGlobalAudioPlayer();
  const {
    isConnected,
    isSupported,
    device,
    showCastDialog,
    castMedia,
    play: castPlayControl,
    pause: castPauseControl,
    seek: castSeekControl,
    stop: castStopControl,
    disconnect,
  } = useChromecast();

  const wasCastingRef = useRef(false);
  const lastLocalPositionRef = useRef(0);
  const [pendingCastTransfer, setPendingCastTransfer] = useState(false);

  useEffect(() => {
    if (wasCastingRef.current && !isConnected) {
      logger.info('[useCastPlayback] Cast disconnected, resuming local playback');

      if (currentTrack && lastLocalPositionRef.current > 0) {
        try {
          player.seekTo(lastLocalPositionRef.current);
          player.play();
          setPlaybackPhase('playing');
        } catch (error) {
          logger.error('[useCastPlayback] Failed to resume local playback', { error });
        }
      }

      wasCastingRef.current = false;
      setPendingCastTransfer(false);
    }

    if (isConnected && !wasCastingRef.current) {
      wasCastingRef.current = true;
    }
  }, [isConnected, currentTrack, player, setPlaybackPhase]);

  useEffect(() => {
    if (pendingCastTransfer && isConnected && currentTrack) {
      logger.info('[useCastPlayback] Connection established, transferring playback');

      const doTransfer = async () => {
        try {
          lastLocalPositionRef.current = player.currentTime || 0;
          player.pause();
          setPlaybackPhase('buffering');

          const mediaUrl = normalizeMediaUrl(currentTrack.audioUrl) || currentTrack.audioUrl;

          const castParams: Parameters<typeof castMedia>[0] = {
            mediaUrl,
            title: currentTrack.title || 'Unknown Track',
            subtitle: currentTrack.displayName || '',
            duration: currentTrack.duration,
            contentType: 'audio/mpeg',
          };

          if (currentTrack.artworkUrl) {
            castParams.artworkUrl = normalizeMediaUrl(currentTrack.artworkUrl);
          }

          const success = await castMedia(castParams);

          if (success) {
            logger.info('[useCastPlayback] Track transferred to Cast', { title: currentTrack.title });
            setPlaybackPhase('playing');
          } else {
            logger.error('[useCastPlayback] Failed to transfer track to Cast');
            toast({
              title: t('audioOutput.transferFailed'),
              description: t('audioOutput.playingLocally'),
              variant: 'destructive',
            });
            player.play();
            setPlaybackPhase('playing');
          }
        } catch (error) {
          logger.error('[useCastPlayback] Error transferring to Cast', { error });
          toast({
            title: t('audioOutput.transferFailed'),
            description: t('audioOutput.playingLocally'),
            variant: 'destructive',
          });
          player.play();
          setPlaybackPhase('playing');
        }

        setPendingCastTransfer(false);
      };

      doTransfer();
    }
  }, [pendingCastTransfer, isConnected, currentTrack, player, setPlaybackPhase, castMedia, toast, t]);

  const transferToCast = useCallback(
    async (track: PlaybackTrack): Promise<boolean> => {
      if (!isSupported || !isConnected) {
        logger.warn('[useCastPlayback] Cannot transfer - Cast not supported or connected');
        return false;
      }

      try {
        lastLocalPositionRef.current = player.currentTime || 0;

        player.pause();
        setPlaybackPhase('buffering');

        const mediaUrl = normalizeMediaUrl(track.audioUrl) || track.audioUrl;

        const castParams: Parameters<typeof castMedia>[0] = {
          mediaUrl,
          title: track.title || 'Unknown Track',
          subtitle: track.displayName || '',
          duration: track.duration,
          contentType: 'audio/mpeg',
        };

        if (track.artworkUrl) {
          castParams.artworkUrl = normalizeMediaUrl(track.artworkUrl);
        }

        const success = await castMedia(castParams);

        if (success) {
          logger.info('[useCastPlayback] Track transferred to Cast', { title: track.title });
          setPlaybackPhase('playing');
          return true;
        } else {
          logger.error('[useCastPlayback] Failed to transfer track to Cast');
          toast({
            title: t('audioOutput.transferFailed'),
            description: t('audioOutput.playingLocally'),
            variant: 'destructive',
          });
          player.play();
          setPlaybackPhase('playing');
          return false;
        }
      } catch (error) {
        logger.error('[useCastPlayback] Error transferring to Cast', { error });
        toast({
          title: t('audioOutput.transferFailed'),
          description: t('audioOutput.playingLocally'),
          variant: 'destructive',
        });
        player.play();
        setPlaybackPhase('playing');
        return false;
      }
    },
    [isSupported, isConnected, player, setPlaybackPhase, castMedia, toast, t]
  );

  const startCasting = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      Alert.alert(t('audioOutput.castUnavailable'), t('audioOutput.requiresProductionBuild'));
      return false;
    }

    if (currentTrack) {
      setPendingCastTransfer(true);
      logger.info('[useCastPlayback] Pending Cast transfer set, waiting for connection');
    }

    const dialogShown = await showCastDialog();
    if (!dialogShown) {
      setPendingCastTransfer(false);
      return false;
    }

    if (isConnected && currentTrack) {
      return transferToCast(currentTrack);
    }

    return true;
  }, [isSupported, showCastDialog, currentTrack, isConnected, transferToCast, t]);

  const stopCasting = useCallback(async (): Promise<boolean> => {
    if (!isConnected) {
      return true;
    }

    try {
      await castStopControl();
      await disconnect();

      logger.info('[useCastPlayback] Stopped casting');
      return true;
    } catch (error) {
      logger.error('[useCastPlayback] Error stopping cast', { error });
      return false;
    }
  }, [isConnected, castStopControl, disconnect]);

  const castPlay = useCallback(async (): Promise<boolean> => {
    if (!isConnected) {
      player.play();
      setPlaybackPhase('playing');
      return true;
    }

    const success = await castPlayControl();
    if (success) {
      setPlaybackPhase('playing');
    }
    return success;
  }, [isConnected, castPlayControl, player, setPlaybackPhase]);

  const castPause = useCallback(async (): Promise<boolean> => {
    if (!isConnected) {
      player.pause();
      setPlaybackPhase('paused');
      return true;
    }

    const success = await castPauseControl();
    if (success) {
      setPlaybackPhase('paused');
    }
    return success;
  }, [isConnected, castPauseControl, player, setPlaybackPhase]);

  const castSeek = useCallback(
    async (position: number): Promise<boolean> => {
      if (!isConnected) {
        player.seekTo(position);
        return true;
      }

      return castSeekControl(position);
    },
    [isConnected, castSeekControl, player]
  );

  return {
    isCasting: isConnected,
    castDevice: device?.deviceName || null,
    canCast: isSupported,
    startCasting,
    stopCasting,
    transferToCast,
    castPlay,
    castPause,
    castSeek,
  };
}
