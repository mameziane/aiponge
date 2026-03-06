/**
 * Speech Recognition Hook
 * Converts spoken voice to text input using expo-speech-recognition.
 *
 * Uses the library's useSpeechRecognitionEvent hook (Expo event system)
 * instead of React Native's NativeEventEmitter which is incompatible
 * with Expo modules.
 */

import { useState, useCallback, useRef } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { logger } from '../../lib/logger';

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
    isAvailable: true, // Expo module is always loadable; actual check at permission time
    isSupported: true,
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const isListeningRef = useRef(false);

  // ── Expo event listeners (replace old NativeEventEmitter approach) ──

  useSpeechRecognitionEvent('start', () => {
    setState(prev => ({ ...prev, isListening: true, error: null }));
    isListeningRef.current = true;
  });

  useSpeechRecognitionEvent('result', event => {
    if (!isListeningRef.current) return;

    const result = event.results?.[0];
    if (result) {
      const transcript = result.transcript || '';
      const isFinal = event.isFinal ?? false;

      if (isFinal) {
        setState(prev => ({
          ...prev,
          transcript: prev.transcript ? `${prev.transcript} ${transcript}` : transcript,
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

  useSpeechRecognitionEvent('error', event => {
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

  useSpeechRecognitionEvent('end', () => {
    setState(prev => ({ ...prev, isListening: false }));
    isListeningRef.current = false;
    optionsRef.current.onEnd?.();
  });

  // ── Actions ──

  const requestPermissions = useCallback(async (): Promise<boolean> => {
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
    try {
      ExpoSpeechRecognitionModule.stop();
      setState(prev => ({ ...prev, isListening: false }));
      isListeningRef.current = false;
    } catch (error) {
      logger.warn('[useSpeechRecognition] Error stopping recognition', { error });
    }
  }, []);

  const cancelListening = useCallback(() => {
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
  };
}
