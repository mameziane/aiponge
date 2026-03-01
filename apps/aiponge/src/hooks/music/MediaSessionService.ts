/**
 * Media Session Service
 * Manages lock screen Now Playing widget and playback controls
 *
 * Uses expo-audio's built-in lock screen API (setActiveForLockScreen).
 * expo-audio natively handles play/pause/seek from lock screen, Bluetooth remotes,
 * AirPods, and car audio — no JS-side event bridging needed.
 *
 * The previous RNTP-based implementation was removed because:
 * - react-native-track-player 4.1.x has confirmed memory corruption on iOS 26
 * - expo-audio 1.1.x provides the same lock screen/remote control capabilities
 * - Consolidating to one package eliminates the dual-init crash risk
 */

import { logger } from '../../lib/logger';
import type { AudioPlayer, AudioMetadata } from 'expo-audio';
import type { TrackIdentity } from '../../types';
import { CONFIG } from '../../constants/appConfig';

export interface MediaSessionTrack extends TrackIdentity {
  displayName?: string;
  duration?: number;
  album?: string;
}

/**
 * Activate lock screen controls and display track metadata.
 * expo-audio natively syncs play/pause state and playback position — no polling needed.
 */
export function updateMediaSessionTrack(player: AudioPlayer, track: MediaSessionTrack): void {
  try {
    const metadata: AudioMetadata = {
      title: track.title || 'Unknown Track',
      artist: track.displayName || CONFIG.app.defaultDisplayName,
      albumTitle: track.album || CONFIG.app.albumName,
      artworkUrl: track.artworkUrl,
    };

    player.setActiveForLockScreen(true, metadata, {
      showSeekForward: true,
      showSeekBackward: true,
    });

    logger.debug('[MediaSession] Lock screen updated', { title: track.title });
  } catch (error) {
    logger.error('[MediaSession] Failed to update lock screen', { error });
  }
}

/**
 * Clear lock screen Now Playing info.
 */
export function clearMediaSession(player: AudioPlayer): void {
  try {
    player.clearLockScreenControls();
    logger.debug('[MediaSession] Lock screen cleared');
  } catch (error) {
    logger.error('[MediaSession] Failed to clear lock screen', { error });
  }
}
