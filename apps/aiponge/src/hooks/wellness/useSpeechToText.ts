/**
 * Wellness Speech-to-Text Hook
 * Wraps useSpeechRecognition with auto-stop on 30s silence and min-length validation.
 * Falls back to text-only if speech recognition is unavailable.
 *
 * Uses refs for speech methods to avoid a dependency cascade:
 *   useSpeechRecognition returns a new object on every state change
 *   → all useCallbacks depending on `speech` recreate
 *   → onResult/onEnd closures capture stale or transitioning references.
 *
 * By storing methods in speechRef, our callbacks remain stable.
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

interface SpeechToTextOptions {
  /** BCP 47 language code or short code (e.g. 'fr', 'ja'). Falls back to device default. */
  lang?: string;
}

export function useSpeechToText(options: SpeechToTextOptions = {}): SpeechToTextResult {
  const [manualTranscript, setManualTranscript] = useState('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef(options.lang);
  langRef.current = options.lang;

  // ── Ref to hold speech methods (stable across re-renders) ──
  const speechRef = useRef<ReturnType<typeof useSpeechRecognition> | null>(null);

  // ── Silence timer helpers (must be declared before useSpeechRecognition call) ──
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      speechRef.current?.stopListening();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // ── Core speech recognition ──
  const speech = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onResult: (_transcript, isFinal) => {
      // Reset silence timer on every result (interim or final)
      resetSilenceTimer();
      if (isFinal) {
        setManualTranscript('');
      }
    },
    onEnd: () => {
      clearSilenceTimer();
    },
  });

  // Keep ref in sync — always points to latest speech methods
  speechRef.current = speech;

  // Cleanup on unmount
  useEffect(() => {
    return () => clearSilenceTimer();
  }, [clearSilenceTimer]);

  // ── Stable actions (depend on refs, not the speech object) ──

  const start = useCallback(async (): Promise<boolean> => {
    const s = speechRef.current;
    if (!s?.isAvailable) return false;
    setManualTranscript('');
    const started = await s.startListening(langRef.current);
    if (started) resetSilenceTimer();
    return started ?? false;
  }, [resetSilenceTimer]);

  const stop = useCallback(() => {
    clearSilenceTimer();
    speechRef.current?.stopListening();
  }, [clearSilenceTimer]);

  const reset = useCallback(() => {
    clearSilenceTimer();
    speechRef.current?.cancelListening();
    speechRef.current?.clearTranscript();
    setManualTranscript('');
  }, [clearSilenceTimer]);

  const setTranscript = useCallback((text: string) => {
    setManualTranscript(text);
    // If user types manually, clear the speech transcript
    if (text && speechRef.current?.transcript) {
      speechRef.current.clearTranscript();
    }
  }, []);

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
