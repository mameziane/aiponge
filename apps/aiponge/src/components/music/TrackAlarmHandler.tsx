/**
 * Track Alarm Handler Component
 * Listens for track alarm notifications and triggers playback
 * Must be placed inside AudioPlayerProvider
 */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { getApiGatewayUrl, normalizeMediaUrl } from '../../lib/apiConfig';
import { logger } from '../../lib/logger';

interface TrackAlarmData {
  type: 'track_alarm';
  trackId: string;
  trackTitle: string;
  trackArtworkUrl?: string;
  trackFileUrl: string;
  scheduleId: string;
  action: 'play_track';
}

export function TrackAlarmHandler() {
  console.log('[TRACE-ALARM] TrackAlarmHandler render start');
  const player = useGlobalAudioPlayer();
  const isHandlingRef = useRef(false);

  useEffect(() => {
    console.log('[TRACE-ALARM] TrackAlarmHandler mounted - subscribing to notifications');
    const handleTrackAlarm = async (data: TrackAlarmData) => {
      if (isHandlingRef.current) {
        logger.debug('[TrackAlarmHandler] Already handling an alarm, skipping');
        return;
      }

      isHandlingRef.current = true;

      try {
        logger.info('[TrackAlarmHandler] Playing track from alarm', {
          trackId: data.trackId,
          trackTitle: data.trackTitle,
        });

        const audioUrl = normalizeMediaUrl(data.trackFileUrl);

        if (!audioUrl) {
          logger.error('[TrackAlarmHandler] No audio URL provided');
          return;
        }

        const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `${getApiGatewayUrl()}${audioUrl}`;

        await player.replace({ uri: fullAudioUrl });
        player.play();

        logger.info('[TrackAlarmHandler] Track playback started', {
          trackId: data.trackId,
          audioUrl: fullAudioUrl,
        });
      } catch (error) {
        logger.error('[TrackAlarmHandler] Failed to play track', {
          error: error instanceof Error ? error.message : String(error),
          trackId: data.trackId,
        });
      } finally {
        isHandlingRef.current = false;
      }
    };

    const notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
      // as unknown: expo-notifications content.data is typed as Record<string,unknown>
      const data = notification.request.content.data as unknown as TrackAlarmData | undefined;

      if (data?.type === 'track_alarm' && data?.action === 'play_track') {
        logger.info('[TrackAlarmHandler] Track alarm notification received', {
          trackId: data.trackId,
          trackTitle: data.trackTitle,
        });
        handleTrackAlarm(data);
      }
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      // as unknown: expo-notifications content.data is typed as Record<string,unknown>
      const data = response.notification.request.content.data as unknown as TrackAlarmData | undefined;

      if (data?.type === 'track_alarm' && data?.action === 'play_track') {
        logger.info('[TrackAlarmHandler] Track alarm notification tapped', {
          trackId: data.trackId,
          trackTitle: data.trackTitle,
        });
        handleTrackAlarm(data);
      }
    });

    return () => {
      notificationSubscription.remove();
      responseSubscription.remove();
    };
  }, [player]);

  return null;
}
