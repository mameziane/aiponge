import { setAudioModeAsync } from 'expo-audio';
import { logger } from '../../lib/logger';

let sessionConfigured = false;

/**
 * Configure audio session to interrupt other apps' audio playback and
 * continue playing when the screen locks or the app is backgrounded.
 *
 * The OS audio mode never changes, so we only call setAudioModeAsync once.
 * Every subsequent call is a no-op, eliminating 100-300ms of native latency
 * before each track play/resume.
 *
 * NOTE: playsInSilentMode: true is critical on iOS — without it, audio is silent
 * when the hardware mute switch is engaged (GitHub expo/expo#40121).
 *
 * NOTE: shouldPlayInBackground: true requires UIBackgroundModes: ["audio"]
 * in app.json (iOS) and FOREGROUND_SERVICE_MEDIA_PLAYBACK permission (Android).
 */
export async function configureAudioSession(): Promise<void> {
  if (sessionConfigured) return;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      interruptionModeAndroid: 'doNotMix',
      shouldPlayInBackground: true,
    });
    sessionConfigured = true;
    logger.debug('[AudioSession] Audio session configured successfully');
  } catch (error) {
    // Do NOT mark as configured on failure — allow retry on next track play.
    // Without a properly configured audio session, audio won't play through the
    // iOS mute switch and background playback won't work.
    logger.error('[AudioSession] Failed to configure audio session — will retry on next play', error);
  }
}

/** Reset for hot-reload / test scenarios */
export function resetAudioSession(): void {
  sessionConfigured = false;
}

/**
 * Yield the audio session so speech recognition can take over.
 *
 * expo-audio's `doNotMix` interruption mode tells iOS "no other audio category
 * should be active while mine is." When expo-speech-recognition creates its own
 * AVAudioEngine with playAndRecord, iOS may partially activate the engine (the
 * `audiostart` event fires) but not actually route mic data — resulting in silent
 * buffers and an instant "No speech was detected" error.
 *
 * This function switches to `mixWithOthers` to release the exclusive lock, then
 * resets the configured flag so music playback will re-apply `doNotMix` on next play.
 */
export async function yieldAudioSessionForRecording(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      interruptionModeAndroid: 'mixWithOthers',
      shouldPlayInBackground: false,
    });
    sessionConfigured = false;
    logger.debug('[AudioSession] Yielded audio session for recording');
  } catch (error) {
    logger.error('[AudioSession] Failed to yield audio session', error);
  }
}
