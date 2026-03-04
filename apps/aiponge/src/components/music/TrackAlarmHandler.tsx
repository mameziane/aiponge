/**
 * Track Alarm Handler Component
 * Listens for track alarm notifications and triggers playback.
 * Handles three scenarios:
 *   1. Notification received while app is in foreground (addNotificationReceivedListener)
 *   2. User taps notification while app is running/backgrounded (addNotificationResponseReceivedListener)
 *   3. User taps notification after app was killed — cold start (getLastNotificationResponseAsync)
 *
 * Must be placed inside AudioPlayerProvider.
 */

import { useEffect, useRef, useCallback } from 'react';
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

function isTrackAlarm(data: unknown): data is TrackAlarmData {
  const d = data as Record<string, unknown> | undefined;
  return d?.type === 'track_alarm' && d?.action === 'play_track';
}

export function TrackAlarmHandler() {
  const player = useGlobalAudioPlayer();
  const isHandlingRef = useRef(false);
  // Track which notification identifiers we've already processed to prevent
  // double-playback when both the response listener and cold-start check fire
  const handledIdsRef = useRef<Set<string>>(new Set());

  const handleTrackAlarm = useCallback(
    async (data: TrackAlarmData) => {
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
    },
    [player]
  );

  // Runtime listeners: foreground receive + background/foreground tap
  useEffect(() => {
    const notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as unknown;
      if (isTrackAlarm(data)) {
        logger.info('[TrackAlarmHandler] Track alarm notification received', {
          trackId: data.trackId,
          trackTitle: data.trackTitle,
        });
        handleTrackAlarm(data);
      }
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const id = response.notification.request.identifier;
      if (handledIdsRef.current.has(id)) return;
      handledIdsRef.current.add(id);

      const data = response.notification.request.content.data as unknown;
      if (isTrackAlarm(data)) {
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
  }, [handleTrackAlarm]);

  // Cold-start: check for the notification that launched the app
  // Runs once on mount with a small delay to ensure the audio system is ready
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!response) return;

        const id = response.notification.request.identifier;
        if (handledIdsRef.current.has(id)) return;
        handledIdsRef.current.add(id);

        const data = response.notification.request.content.data as unknown;
        if (isTrackAlarm(data)) {
          logger.info('[TrackAlarmHandler] Cold-start track alarm', {
            trackId: data.trackId,
            trackTitle: data.trackTitle,
          });
          handleTrackAlarm(data);
        }
      } catch (error) {
        logger.error('[TrackAlarmHandler] Failed to check cold-start notification', { error });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [handleTrackAlarm]);

  return null;
}
