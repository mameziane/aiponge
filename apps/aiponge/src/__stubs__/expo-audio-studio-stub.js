/**
 * Stub module for @siteed/expo-audio-studio (iOS)
 *
 * expo-audio-studio with enableDeviceDetection:true starts a background
 * AVAudioSession monitoring thread at app launch via its native init code.
 * On iPhone OS 26 this activates CoreMedia queues and makes AVAudioSession
 * API calls that throw NSException, cascading into a SIGABRT through
 * Expo's error recovery queue (expo.controller.errorRecoveryQueue).
 *
 * The native module is excluded from iOS builds via react-native.config.js.
 * Metro redirects all JS imports to this stub so the JS bundle never
 * references the absent TurboModule. Android is unaffected.
 *
 * Re-enable once expo-audio-studio ships an iOS 26-compatible release.
 */

const noop = () => {};
const noopAsyncNull = () => Promise.resolve(null);
const noopAsyncArray = () => Promise.resolve([]);
const noopAsyncFalse = () => Promise.resolve(false);

const audioDeviceManager = {
  getAvailableDevices: noopAsyncArray,
  getCurrentDevice: noopAsyncNull,
  selectDevice: noopAsyncFalse,
  refreshDevices: noopAsyncArray,
  addDeviceChangeListener: _callback => noop,
};

const useAudioDevices = () => ({
  devices: [],
  currentDevice: null,
  loading: false,
  error: null,
  selectDevice: noopAsyncFalse,
  resetToDefaultDevice: noop,
  refreshDevices: noop,
});

module.exports = { audioDeviceManager, useAudioDevices };
module.exports.default = { audioDeviceManager, useAudioDevices };
module.exports.audioDeviceManager = audioDeviceManager;
module.exports.useAudioDevices = useAudioDevices;
