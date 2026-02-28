import { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { QueryClientProvider } from '@tanstack/react-query';
import { ShareIntentProvider } from 'expo-share-intent';
import { AudioPlayerProvider } from '../contexts/AudioPlayerContext';
import { PlaybackProvider } from '../contexts/PlaybackContext';
import { SubscriptionProvider } from '../contexts/SubscriptionContext';
import { BackendStatusProvider } from '../contexts/BackendStatusContext';
import { ThemeProvider } from '../theme/ThemeProvider';
import { queryClient } from '../lib/reactQueryClient';
import type { ViewStyle } from 'react-native';

const flexStyle: ViewStyle = { flex: 1 };

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <ShareIntentProvider>
        <GestureHandlerRootView style={flexStyle}>
          <KeyboardProvider>
            <QueryClientProvider client={queryClient}>
              <BackendStatusProvider>
                <SubscriptionProvider>
                  <AudioPlayerProvider>
                    <PlaybackProvider>{children}</PlaybackProvider>
                  </AudioPlayerProvider>
                </SubscriptionProvider>
              </BackendStatusProvider>
            </QueryClientProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ShareIntentProvider>
    </ThemeProvider>
  );
}
