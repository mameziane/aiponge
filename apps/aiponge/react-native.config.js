/**
 * react-native.config.js
 *
 * react-native-track-player (RNTP) 4.1.x is excluded from iOS native linking.
 *
 * Root cause: RNTP's RNTrackPlayerAppDelegate hooks into
 * application:didFinishLaunchingWithOptions: and starts a background RunLoop
 * thread unconditionally before any JavaScript runs. On iPhone OS 26 this
 * thread races with the Hermes GC and corrupts heap memory within seconds,
 * producing EXC_BAD_ACCESS and EXC_CRASH (SIGABRT) crashes regardless of
 * whether JS ever calls require('react-native-track-player').
 *
 * TurboModules lazy initialization does not prevent this — it only controls
 * the JS-facing interface, not the AppDelegate hook.
 *
 * Fix: exclude from iOS native binary so the AppDelegate hook never runs.
 * Metro redirects all JS imports to the stub (see metro.config.js).
 * Android is unaffected — RNTP links and runs normally there.
 *
 * Re-enable once RNTP ships an iOS 26-compatible release.
 */
module.exports = {
  dependencies: {
    // RNTP 4.1.x: AppDelegate hook starts background RunLoop thread unconditionally at launch.
    // On iPhone OS 26 this corrupts the Hermes GC heap → EXC_BAD_ACCESS / SIGABRT.
    // Metro redirects JS imports to stub (see metro.config.js). Android unaffected.
    'react-native-track-player': {
      platforms: {
        ios: null,
      },
    },
    // expo-audio-studio with enableDeviceDetection:true starts AVAudioSession monitoring
    // at launch, activating CoreMedia queues. On iOS 26 this throws NSException →
    // SIGABRT via expo.controller.errorRecoveryQueue. Android unaffected.
    '@siteed/expo-audio-studio': {
      platforms: {
        ios: null,
      },
    },
  },
};
