/**
 * Speech Recognition Hook
 * Converts spoken voice to text input
 *
 * Environment Detection:
 * - Expo Go: Uses stub implementations (native modules blocked by Metro)
 * - Development Build: Uses expo-speech-recognition for real speech-to-text
 *
 * NOTE: Metro config blocks native modules and redirects to stubs automatically.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeEventEmitter, NativeModules, NativeModule, Platform } from 'react-native';
import { logger } from '../../lib/logger';
import Constants from 'expo-constants';

export interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isAvailable: boolean;
  isSupported: boolean;
}

interface SpeechRecognitionOptions {
  lang?: string;
  interimResults?: boolean;
  maxAlternatives?: number;
  continuous?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

interface SpeechResult {
  results: Array<{
    transcript: string;
    confidence: number;
    isFinal?: boolean;
  }>;
  isFinal?: boolean;
}

interface SpeechError {
  error: string;
  message?: string;
}

const isExpoGo = Constants.appOwnership === 'expo';

// Stub module interface matching expo-speech-recognition
interface ExpoSpeechRecognitionModuleInterface {
  start: (options: {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    continuous: boolean;
    requiresOnDeviceRecognition: boolean;
  }) => void;
  stop: () => void;
  abort: () => void;
  getStateAsync: () => Promise<string>;
  getSupportedLocales: () => Promise<{ locales: string[] }>;
  isRecognitionAvailable: () => Promise<boolean>;
  requestPermissionsAsync: () => Promise<{ granted: boolean; status: string }>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
}

// Stub implementation for Expo Go (native modules not available)
const speechRecognitionStub: ExpoSpeechRecognitionModuleInterface = {
  start: () => {},
  stop: () => {},
  abort: () => {},
  getStateAsync: async () => 'inactive',
  getSupportedLocales: async () => ({ locales: [] }),
  isRecognitionAvailable: async () => false,
  requestPermissionsAsync: async () => ({ granted: false, status: 'undetermined' }),
};

// Dynamic module loading with Expo Go protection
let ExpoSpeechRecognitionModule: ExpoSpeechRecognitionModuleInterface = speechRecognitionStub;
let speechEventEmitter: NativeEventEmitter | null = null;

if (!isExpoGo) {
  try {
    const speechModule = require('expo-speech-recognition');
    ExpoSpeechRecognitionModule = speechModule.ExpoSpeechRecognitionModule || speechRecognitionStub;

    // Create event emitter if the module supports it
    if (ExpoSpeechRecognitionModule && ExpoSpeechRecognitionModule.addListener) {
      speechEventEmitter = new NativeEventEmitter(ExpoSpeechRecognitionModule as NativeModule);
    }

    logger.info('[useSpeechRecognition] Loaded expo-speech-recognition module');
  } catch (error) {
    logger.warn('[useSpeechRecognition] Failed to load expo-speech-recognition, using stub', { error });
  }
} else {
  logger.info('[useSpeechRecognition] Running in Expo Go - voice input requires development build');
}

// Map language codes to speech recognition locales
const LANGUAGE_MAP: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  pt: 'pt-BR',
  zh: 'zh-CN',
  ar: 'ar-SA',
};

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}) {
  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    isAvailable: false,
    isSupported: !isExpoGo,
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const isListeningRef = useRef(false);

  // Check availability on mount
  useEffect(() => {
    if (isExpoGo) {
      setState(prev => ({
        ...prev,
        isAvailable: false,
        isSupported: false,
      }));
      return;
    }

    async function checkAvailability() {
      try {
        const available = await ExpoSpeechRecognitionModule.isRecognitionAvailable();
        setState(prev => ({ ...prev, isAvailable: available, isSupported: true }));
      } catch (error) {
        logger.warn('[useSpeechRecognition] Error checking availability', { error });
        setState(prev => ({ ...prev, isAvailable: false }));
      }
    }

    checkAvailability();
  }, []);

  // Set up event listeners for speech recognition
  useEffect(() => {
    if (isExpoGo || !speechEventEmitter) return;

    // Handle speech results
    const resultSubscription = speechEventEmitter.addListener('result', (event: SpeechResult) => {
      if (!isListeningRef.current) return;

      const result = event.results?.[0];
      if (result) {
        const transcript = result.transcript || '';
        const isFinal = result.isFinal ?? event.isFinal ?? false;

        if (isFinal) {
          setState(prev => ({
            ...prev,
            transcript: transcript,
            interimTranscript: '',
          }));
          optionsRef.current.onResult?.(transcript, true);
        } else {
          setState(prev => ({
            ...prev,
            interimTranscript: transcript,
          }));
          optionsRef.current.onResult?.(transcript, false);
        }
      }
    });

    // Handle errors
    const errorSubscription = speechEventEmitter.addListener('error', (event: SpeechError) => {
      const errorMessage = event.message || event.error || 'Speech recognition error';
      logger.error('[useSpeechRecognition] Recognition error', { event });
      setState(prev => ({
        ...prev,
        isListening: false,
        error: errorMessage,
      }));
      isListeningRef.current = false;
      optionsRef.current.onError?.(errorMessage);
    });

    // Handle end of speech
    const endSubscription = speechEventEmitter.addListener('end', () => {
      setState(prev => ({ ...prev, isListening: false }));
      isListeningRef.current = false;
      optionsRef.current.onEnd?.();
    });

    // Handle start
    const startSubscription = speechEventEmitter.addListener('start', () => {
      setState(prev => ({ ...prev, isListening: true, error: null }));
      isListeningRef.current = true;
    });

    return () => {
      resultSubscription?.remove();
      errorSubscription?.remove();
      endSubscription?.remove();
      startSubscription?.remove();
    };
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (isExpoGo) {
      return false;
    }

    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return result.granted;
    } catch (error) {
      logger.error('[useSpeechRecognition] Error requesting permissions', { error });
      return false;
    }
  }, []);

  const startListening = useCallback(
    async (lang?: string) => {
      if (isExpoGo) {
        setState(prev => ({
          ...prev,
          error: 'Voice input requires a development build. Please install the development build on your device.',
        }));
        return false;
      }

      // Request permissions first
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setState(prev => ({
          ...prev,
          error: 'Microphone permission denied. Please enable microphone access in settings.',
        }));
        return false;
      }

      try {
        const recognitionLang = lang || optionsRef.current.lang || 'en-US';
        const mappedLang = LANGUAGE_MAP[recognitionLang] || recognitionLang;

        setState(prev => ({
          ...prev,
          isListening: true,
          transcript: '',
          interimTranscript: '',
          error: null,
        }));
        isListeningRef.current = true;

        ExpoSpeechRecognitionModule.start({
          lang: mappedLang,
          interimResults: optionsRef.current.interimResults ?? true,
          maxAlternatives: optionsRef.current.maxAlternatives ?? 1,
          continuous: optionsRef.current.continuous ?? false,
          requiresOnDeviceRecognition: false,
        });

        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to start speech recognition';
        logger.error('[useSpeechRecognition] Error starting recognition', { error });
        setState(prev => ({
          ...prev,
          isListening: false,
          error: errorMessage,
        }));
        isListeningRef.current = false;
        optionsRef.current.onError?.(errorMessage);
        return false;
      }
    },
    [requestPermissions]
  );

  const stopListening = useCallback(() => {
    if (isExpoGo) return;

    try {
      ExpoSpeechRecognitionModule.stop();
      setState(prev => ({ ...prev, isListening: false }));
      isListeningRef.current = false;
    } catch (error) {
      logger.warn('[useSpeechRecognition] Error stopping recognition', { error });
    }
  }, []);

  const cancelListening = useCallback(() => {
    if (isExpoGo) return;

    try {
      ExpoSpeechRecognitionModule.abort();
      setState(prev => ({
        ...prev,
        isListening: false,
        transcript: '',
        interimTranscript: '',
      }));
      isListeningRef.current = false;
    } catch (error) {
      logger.warn('[useSpeechRecognition] Error aborting recognition', { error });
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setState(prev => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
      error: null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    cancelListening,
    clearTranscript,
    clearError,
    requestPermissions,
    isExpoGo,
  };
}
