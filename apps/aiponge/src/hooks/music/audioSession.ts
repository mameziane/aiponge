import { setAudioModeAsync } from 'expo-audio';
import { logger } from '../../lib/logger';

let sessionConfigured = false;

/**
 * Configure audio session to interrupt other apps' audio playback.
 * The OS audio mode never changes, so we only call setAudioModeAsync once.
 * Every subsequent call is a no-op, eliminating 100-300ms of native latency
 * before each track play/resume.
 *
 * NOTE: playsInSilentMode: true is critical on iOS — without it, audio is silent
 * when the hardware mute switch is engaged (GitHub expo/expo#40121).
 */
export async function configureAudioSession(): Promise<void> {
  if (sessionConfigured) return;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      interruptionModeAndroid: 'doNotMix',
      shouldPlayInBackground: false,
    });
    sessionConfigured = true;
    logger.debug('[AudioSession] Audio session configured successfully');
  } catch (error) {
    // Mark as configured even on failure to avoid retrying on every track play.
    // Audio may still work with default system session settings.
    sessionConfigured = true;
    logger.error('[AudioSession] Failed to configure audio session — audio may not play in silent mode', error);
  }
}

/** Reset for hot-reload / test scenarios */
export function resetAudioSession(): void {
  sessionConfigured = false;
}
