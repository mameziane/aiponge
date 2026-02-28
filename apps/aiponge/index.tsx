// IMPORTANT: Import crypto polyfill FIRST (before any other imports)
// This enables nanoid and other crypto-dependent packages in React Native
import 'react-native-get-random-values';

// Suppress noisy warnings from react-native-screens BEFORE any other imports
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const message = args.join(' ');

  // Filter out specific noisy warnings
  if (message.includes("Codegen didn't run for RNS") || message.includes('SafeAreaView has been deprecated')) {
    return;
  }

  // Pass through all other warnings
  originalWarn(...args);
};

// Trigger i18n initialization early (synchronously starts the promise)
// The RootLayout will wait for i18nReady before rendering content
import './src/i18n';

// Mobile-only entry point - must be synchronous for Expo to register the app
import 'expo-router/entry';
