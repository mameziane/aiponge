/**
 * react-native.config.js
 *
 * @siteed/expo-audio-studio is excluded from iOS native linking because
 * its enableDeviceDetection:true starts AVAudioSession monitoring at launch,
 * activating CoreMedia queues. On iOS 26 this throws NSException → SIGABRT.
 * Metro redirects JS imports to a stub (see metro.config.js). Android unaffected.
 */
module.exports = {
  dependencies: {
    '@siteed/expo-audio-studio': {
      platforms: {
        ios: null,
      },
    },
  },
};
