/**
 * Speech Recognition Hook
 * Converts spoken voice to text input using expo-speech-recognition.
 *
 * Uses the library's useSpeechRecognitionEvent hook (Expo event system)
 * instead of React Native's NativeEventEmitter which is incompatible
 * with Expo modules.
 */

import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { logger } from '../../lib/logger';
import { resetAudioSession, yieldAudioSessionForRecording } from '../music/audioSession';

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

  // Debug log visible on screen (temporary — remove after debugging)
  const [_debugLog, setDebugLog] = useState<string[]>([]);
  const addDebug = useCallback((msg: string) => {
    setDebugLog(prev => [...prev.slice(-14), `${new Date().toISOString().slice(11, 19)} ${msg}`]);
  }, []);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const isListeningRef = useRef(false);

  // ── Expo event listeners (Expo event system via useEventListener) ──

  useSpeechRecognitionEvent('start', () => {
    addDebug('EVT start');
    setState(prev => ({ ...prev, isListening: true, error: null }));
    isListeningRef.current = true;
  });

  // Audio pipeline events — diagnose whether mic actually activates
  useSpeechRecognitionEvent('audiostart', () => {
    addDebug('EVT audiostart (mic ON)');
  });

  useSpeechRecognitionEvent('audioend', () => {
    addDebug('EVT audioend (mic OFF)');
  });

  useSpeechRecognitionEvent('speechstart', () => {
    addDebug('EVT speechstart (voice detected)');
  });

  useSpeechRecognitionEvent('speechend', () => {
    addDebug('EVT speechend (voice stopped)');
  });

  // Volume monitoring — shows actual mic input level in dB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useSpeechRecognitionEvent('volumechange' as any, (event: any) => {
    const vol = typeof event?.value === 'number' ? event.value.toFixed(0) : '?';
    addDebug(`VOL ${vol}dB`);
  });

  useSpeechRecognitionEvent('result', event => {
    const results = event.results;
    const isFinal = event.isFinal;
    const txt = results?.[0]?.transcript?.slice(0, 40) ?? '<empty>';
    addDebug(`EVT result final=${isFinal} "${txt}"`);
    if (!isListeningRef.current) {
      addDebug('SKIP: isListeningRef=false');
      return;
    }

    const result = results?.[0];
    if (result) {
      const transcript = result.transcript || '';

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
    addDebug(`EVT error "${errorMessage}"`);
    setState(prev => ({
      ...prev,
      isListening: false,
      error: errorMessage,
    }));
    isListeningRef.current = false;
    optionsRef.current.onError?.(errorMessage);

    // Reset audio session so music player can reconfigure on next play
    resetAudioSession();
  });

  useSpeechRecognitionEvent('end', () => {
    addDebug('EVT end');
    setState(prev => ({ ...prev, isListening: false }));
    isListeningRef.current = false;
    optionsRef.current.onEnd?.();

    // Speech recognition changed the audio session to playAndRecord.
    // Reset the flag so the music player reconfigures its session (doNotMix +
    // playsInSilentMode) on the next track play/resume.
    resetAudioSession();
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

        // ── Pre-flight diagnostics ──
        const iOSVer = Platform.OS === 'ios' ? String(Platform.Version) : '?';
        addDebug(`iOS ${iOSVer}`);

        try {
          const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
          const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
          const state = await ExpoSpeechRecognitionModule.getStateAsync();
          addDebug(`avail=${available} onDev=${onDevice} state=${state}`);
        } catch (e) {
          addDebug(`diag err: ${e}`);
        }

        // Yield expo-audio's exclusive doNotMix session
        if (Platform.OS === 'ios') {
          await yieldAudioSessionForRecording();
          addDebug('session yielded');
        }

        const startOptions: Record<string, unknown> = {
          lang: mappedLang,
          interimResults: optionsRef.current.interimResults ?? true,
          maxAlternatives: 1,
          continuous: optionsRef.current.continuous ?? false,
          requiresOnDeviceRecognition: false,
          addsPunctuation: true,
          volumeChangeEventOptions: { enabled: true, intervalMillis: 50 },
        };

        if (Platform.OS === 'ios') {
          // Force LOCAL-ONLY audio routing. Without this, iOS routes the
          // playAndRecord session to the HomePod (or other AirPlay/Bluetooth
          // output device), which hijacks the mic input and triggers Siri.
          //
          // - defaultToSpeaker: routes output to iPhone speaker (not HomePod)
          // - NO allowBluetooth: prevents routing to BT devices
          // - NO allowBluetoothA2DP: prevents routing to BT streaming devices
          // - NO allowAirPlay: prevents routing to HomePod/AirPlay
          startOptions.iosCategory = {
            category: 'playAndRecord',
            categoryOptions: ['defaultToSpeaker'],
            mode: 'default',
          };
          startOptions.iosTaskHint = 'dictation';
        }

        addDebug(`start() lang=${mappedLang} LOCAL-ONLY`);

        // Clear state before starting — but do NOT set isListening yet.
        // The 'start' event from the native module will confirm it's actually listening.
        setState(prev => ({
          ...prev,
          transcript: '',
          interimTranscript: '',
          error: null,
        }));

        ExpoSpeechRecognitionModule.start(startOptions);

        // If start() didn't throw, the native module accepted the request.
        // The 'start' event will set isListening = true when recognition begins.
        isListeningRef.current = true;
        setState(prev => ({ ...prev, isListening: true }));

        addDebug('start() returned OK');
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
    _debugLog,
  };
}
