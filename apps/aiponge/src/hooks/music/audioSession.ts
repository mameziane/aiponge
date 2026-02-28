import { setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';
import { logger } from '../../lib/logger';

let sessionConfigured = false;

// iOS 26 guard — same class of AVFoundation background-thread crash as RNTP.
// setAudioModeAsync activates the AVAudioSession with interruptionMode: 'doNotMix',
// which on iOS 26 starts an AVAudioSession notification observer on a background
// dispatch queue. That observer races with the Hermes GC during startup, producing
// the same EXC_BAD_ACCESS heap-corruption signatures seen with RNTP.
// Skip the entire AVAudioSession activation on iOS 26; audio plays with default
// system settings (works fine, just no silent-mode or interruption customisation).
const iosVersionMajor = Platform.OS === 'ios'
  ? parseInt(String(Platform.Version).split('.')[0], 10)
  : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

/**
 * Configure audio session to interrupt other apps' audio playback.
 * The OS audio mode never changes, so we only call setAudioModeAsync once.
 * Every subsequent call is a no-op, eliminating 100-300ms of native latency
 * before each track play/resume.
 */
export async function configureAudioSession(): Promise<void> {
  if (sessionConfigured) return;

  if (isIOS26OrLater) {
    logger.warn(
      '[AudioSession] iPhone OS 26+ detected — skipping AVAudioSession activation ' +
      '(setAudioModeAsync background observer crashes Hermes GC on iOS 26). ' +
      'Audio plays with default system session settings.'
    );
    sessionConfigured = true;
    return;
  }

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      interruptionModeAndroid: 'doNotMix',
      shouldPlayInBackground: false,
    });
    sessionConfigured = true;
  } catch (error) {
    logger.error('Failed to configure audio session', error);
  }
}

/** Reset for hot-reload / test scenarios */
export function resetAudioSession(): void {
  sessionConfigured = false;
}
