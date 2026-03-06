/**
 * Wellness Speech-to-Text Hook
 * Wraps useSpeechRecognition with auto-stop on 30s silence and min-length validation.
 * Falls back to text-only if speech recognition is unavailable.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSpeechRecognition } from '../ui/useSpeechRecognition';

const SILENCE_TIMEOUT_MS = 30_000;
const MIN_TRANSCRIPT_LENGTH = 5;

export interface SpeechToTextResult {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isAvailable: boolean;
  error: string | null;
  isValid: boolean;
  start: () => Promise<boolean>;
  stop: () => void;
  reset: () => void;
  setTranscript: (text: string) => void;
}

export function useSpeechToText(): SpeechToTextResult {
  const [manualTranscript, setManualTranscript] = useState('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speech = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onResult: (_transcript, isFinal) => {
      // Reset silence timer on every result
      resetSilenceTimer();
      if (isFinal) {
        setManualTranscript('');
      }
    },
    onEnd: () => {
      clearSilenceTimer();
    },
  });

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      speech.stopListening();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, speech]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearSilenceTimer();
  }, [clearSilenceTimer]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!speech.isAvailable) return false;
    setManualTranscript('');
    const started = await speech.startListening();
    if (started) resetSilenceTimer();
    return started ?? false;
  }, [speech, resetSilenceTimer]);

  const stop = useCallback(() => {
    clearSilenceTimer();
    speech.stopListening();
  }, [speech, clearSilenceTimer]);

  const reset = useCallback(() => {
    clearSilenceTimer();
    speech.cancelListening();
    speech.clearTranscript();
    setManualTranscript('');
  }, [speech, clearSilenceTimer]);

  const setTranscript = useCallback(
    (text: string) => {
      setManualTranscript(text);
      // If user types manually, clear the speech transcript
      if (text && speech.transcript) {
        speech.clearTranscript();
      }
    },
    [speech]
  );

  // Combine speech + manual transcript (manual overrides speech if set)
  const effectiveTranscript = manualTranscript || speech.transcript;
  const isValid = effectiveTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH;

  return {
    isListening: speech.isListening,
    transcript: effectiveTranscript,
    interimTranscript: speech.interimTranscript,
    isAvailable: speech.isAvailable,
    error: speech.error,
    isValid,
    start,
    stop,
    reset,
    setTranscript,
  };
}
