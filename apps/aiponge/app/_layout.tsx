import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../src/i18n';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';
// SourceSerifPro fonts removed - not used in typography system (saves ~400KB bundle)
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AnimatedSplashScreen } from '../src/components/system/SplashScreen';
import * as SplashScreen from 'expo-splash-screen';
import { UnifiedHeader } from '../src/components/shared/UnifiedHeader';
import { AppProviders } from '../src/providers';
import { useThemeMode } from '../src/theme/ThemeProvider';
import { initAuth } from '../src/auth';
import { initI18n, reloadAppForRTL } from '../src/i18n';
import { i18nReady } from '../src/i18n';
import { ErrorBoundary } from '../src/components/shared/ErrorBoundary';
import { logger } from '../src/lib/logger';

// Reanimated 4.1.x screen-transition worklets crash on iPhone OS 26 with a corrupted
// JSI function pointer (KERN_INVALID_ADDRESS at process_base+2 on the JS thread).
// Disable ALL Stack navigation animations on iOS 26 until Reanimated ships a fix.
const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

// Initialize auth synchronously at module load time
// This ensures the auth token retriever is set before any API calls are made
// Critical: Must run before any React component renders to prevent race conditions
initAuth();

// Global error handlers — capture crashes before they terminate the app silently
// IMPORTANT: error.stack access is wrapped in try/catch to prevent a secondary crash:
// On iPhone OS 26, if the Hermes GC heap is corrupted (e.g. by a TurboModule NSException
// from a native module), accessing error.stack triggers errorStackGetter which calls
// GCScope::_newChunkAndPHV and crashes with EXC_BAD_ACCESS on the corrupted pointer.
if (typeof ErrorUtils !== 'undefined') {
  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    let stack: string | undefined;
    try {
      stack = error?.stack;
    } catch {
      stack = '[error.stack threw — possible Hermes GC corruption]';
    }
    logger.error('[GLOBAL] Unhandled native error', {
      message: error?.message,
      stack,
      isFatal,
    });
    if (previousHandler) {
      previousHandler(error, isFatal);
    }
  });
}

function ThemeAwareStatusBar() {
  const { isDark } = useThemeMode();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const { t } = useTranslation();
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold_Italic,
    // SourceSerifPro removed - not used in typography system
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [showSplash, setShowSplash] = useState<boolean | null>(null); // null = checking storage
  const [languageLoaded, setLanguageLoaded] = useState(false);

  const SPLASH_SHOWN_KEY = 'aiponge_splash_shown';

  useEffect(() => {
    // Check if splash video has been shown before (first launch only)
    AsyncStorage.getItem(SPLASH_SHOWN_KEY)
      .then(value => {
        if (value === 'true') {
          // Splash was already shown, skip it
          logger.debug('[RootLayout] Splash already shown, skipping video');
          setShowSplash(false);
        } else {
          logger.debug('[RootLayout] First launch, showing splash video');
          setShowSplash(true);
        }
      })
      .catch(error => {
        logger.warn('[RootLayout] Error checking splash state, showing splash', { error });
        setShowSplash(true);
      });
  }, []);

  // Mark splash as shown when it finishes
  const handleSplashFinish = async () => {
    try {
      await AsyncStorage.setItem(SPLASH_SHOWN_KEY, 'true');
      logger.debug('[RootLayout] Splash marked as shown');
    } catch (error) {
      logger.warn('[RootLayout] Error saving splash state', { error });
    }
    setShowSplash(false);
  };

  useEffect(() => {
    // Wait for i18n core initialization, then load stored language preferences
    // i18nReady is the promise from i18n.init() - must complete before using i18n APIs
    i18nReady
      .then(() => initI18n())
      .then(result => {
        setLanguageLoaded(true);
        if (result.requiresRTLReload) {
          logger.info('[RootLayout] RTL mismatch detected, triggering reload');
          reloadAppForRTL();
        }
      })
      .catch(error => {
        logger.error('[RootLayout] Failed to load language preferences, using default', { error });
        // Still mark as loaded to prevent splash screen deadlock
        setLanguageLoaded(true);
      });
  }, []);

  // Hide native splash for returning users when everything is ready
  useEffect(() => {
    if (fontsLoaded && languageLoaded && showSplash === false) {
      // Returning user - hide native splash and show app
      logger.debug('[RootLayout] Returning user ready, hiding native splash');
      SplashScreen.hideAsync().catch(e => {
        logger.warn('[RootLayout] Error hiding native splash', { error: e });
      });
    }
  }, [fontsLoaded, languageLoaded, showSplash]);

  const handleRootError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    let stack: string | undefined;
    try {
      stack = error.stack;
    } catch {
      stack = '[error.stack threw — possible Hermes GC corruption]';
    }
    // Wrap componentStack access: on iOS 26, if the Hermes GC heap is corrupted, accessing
    // errorInfo.componentStack triggers GCScope::_newChunkAndPHV → secondary EXC_BAD_ACCESS.
    let componentStack: string | undefined;
    try {
      componentStack = errorInfo?.componentStack ?? undefined;
    } catch {
      componentStack = '[componentStack threw — possible Hermes GC corruption]';
    }
    logger.error('Root ErrorBoundary caught error', {
      error: error.message,
      stack,
      componentStack,
    });
  }, []);

  const renderHeader = useCallback(
    (props: { options: { title?: string }; route: { name: string } }) => (
      <UnifiedHeader title={props.options.title || props.route.name} showBackButton />
    ),
    []
  );

  const rootScreenOptions = useMemo(
    () => ({
      headerShown: true,
      header: renderHeader,
      ...(isIOS26OrLater ? { animation: 'none' as const } : {}),
    }),
    [renderHeader]
  );

  // Loading state: keep native splash visible
  if (!fontsLoaded || !languageLoaded || showSplash === null) {
    return null;
  }

  // First launch - show the video splash
  if (showSplash === true) {
    return <AnimatedSplashScreen onFinish={handleSplashFinish} />;
  }

  return (
    <ErrorBoundary onError={handleRootError}>
      <AppProviders>
        <Stack screenOptions={rootScreenOptions}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(user)" options={{ headerShown: false }} />
          <Stack.Screen name="(shared)" options={{ headerShown: false }} />
          <Stack.Screen name="(settings)" options={{ headerShown: false }} />

          {/* Library Group - Music browsing and playback */}
          <Stack.Screen name="(library)" options={{ headerShown: false }} />

          {/* Commerce Group - Store, subscription, credits */}
          <Stack.Screen name="(commerce)" options={{ headerShown: false }} />

          {/* Admin Group - Admin dashboard and dev tools */}
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />

          {/* Librarian Group - Content creation and management */}
          <Stack.Screen name="(librarian)" options={{ headerShown: false }} />

          {/* Standalone routes */}
          <Stack.Screen
            name="set-reminder"
            options={{
              title: t('reminder.title'),
              headerShown: true,
            }}
          />
        </Stack>
        <ThemeAwareStatusBar />
      </AppProviders>
    </ErrorBoundary>
  );
}
