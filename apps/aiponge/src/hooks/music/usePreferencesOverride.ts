import { useState, useEffect, useCallback, useRef } from 'react';
import type { MusicPreferencesState, MusicPreferencesLoading } from './useMusicPreferences';
import type { MoodKey, InstrumentKey, LanguageKey } from '../../constants/musicPreferences';

export interface OverridePreferences {
  musicStyles: string;
  genre: string;
  culturalLanguages: string[];
  mood: string;
  instruments: string[];
  vocalGender: 'f' | 'm' | null;
}

export interface OverrideLoadingState {
  initial: boolean;
  musicStyles: boolean;
  genre: boolean;
  culturalLanguages: boolean;
  mood: boolean;
  instruments: boolean;
  vocalGender: boolean;
}

export interface UsePreferencesOverrideReturn {
  preferences: OverridePreferences;
  styleWeight: number;
  negativeTags: string;
  loading: OverrideLoadingState;
  setStyleWeight: (weight: number) => void;
  setNegativeTags: (tags: string) => void;
  handleMusicStylesChange: (text: string) => void;
  handleGenreChange: (genre: string) => void;
  handleCulturalLanguagesChange: (lang: LanguageKey) => void;
  handleMoodChange: (mood: MoodKey) => void;
  handleInstrumentsChange: (instrument: InstrumentKey) => void;
  handleVocalGenderChange: (gender: 'f' | 'm') => void;
  resetToSaved: () => void;
}

function buildLocalPreferences(saved: MusicPreferencesState): OverridePreferences {
  return {
    musicStyles: saved.musicStyles || '',
    genre: saved.genre || '',
    culturalLanguages: saved.culturalLanguages?.length > 0 ? saved.culturalLanguages : ['en'],
    mood: saved.mood || '',
    instruments: saved.instruments || [],
    vocalGender: saved.vocalGender ?? null,
  };
}

function buildLoadingState(savedLoading: MusicPreferencesLoading): OverrideLoadingState {
  return {
    initial: savedLoading.initial,
    musicStyles: savedLoading.musicStyles,
    genre: savedLoading.genre,
    culturalLanguages: savedLoading.culturalLanguages,
    mood: savedLoading.mood,
    instruments: savedLoading.instruments,
    vocalGender: savedLoading.vocalGender,
  };
}

export function usePreferencesOverride(
  savedPreferences: MusicPreferencesState,
  savedLoading: MusicPreferencesLoading,
  visible: boolean
): UsePreferencesOverrideReturn {
  const hasLoadedSavedPrefsRef = useRef(false);

  const [preferences, setPreferences] = useState<OverridePreferences>(() => buildLocalPreferences(savedPreferences));
  const [styleWeight, setStyleWeight] = useState(savedPreferences.styleWeight);
  const [negativeTags, setNegativeTags] = useState(savedPreferences.negativeTags);

  useEffect(() => {
    if (visible) {
      hasLoadedSavedPrefsRef.current = false;
      setStyleWeight(savedPreferences.styleWeight);
      setNegativeTags(savedPreferences.negativeTags);
    }
  }, [visible, savedPreferences.styleWeight, savedPreferences.negativeTags]);

  useEffect(() => {
    if (visible && !savedLoading.initial && !hasLoadedSavedPrefsRef.current) {
      hasLoadedSavedPrefsRef.current = true;
      setPreferences(buildLocalPreferences(savedPreferences));
    }
  }, [visible, savedLoading.initial, savedPreferences]);

  const handleMusicStylesChange = useCallback((text: string) => {
    setPreferences(prev => ({ ...prev, musicStyles: text }));
  }, []);

  const handleGenreChange = useCallback((genre: string) => {
    setPreferences(prev => ({ ...prev, genre: prev.genre === genre ? '' : genre }));
  }, []);

  const handleCulturalLanguagesChange = useCallback((lang: LanguageKey) => {
    setPreferences(prev => {
      const langs = prev.culturalLanguages.includes(lang)
        ? prev.culturalLanguages.filter(l => l !== lang)
        : [...prev.culturalLanguages, lang].slice(0, 2);
      return { ...prev, culturalLanguages: langs };
    });
  }, []);

  const handleMoodChange = useCallback((mood: MoodKey) => {
    setPreferences(prev => ({ ...prev, mood }));
  }, []);

  const handleInstrumentsChange = useCallback((instrument: InstrumentKey) => {
    setPreferences(prev => {
      const instruments = prev.instruments.includes(instrument)
        ? prev.instruments.filter(i => i !== instrument)
        : [...prev.instruments, instrument];
      return { ...prev, instruments };
    });
  }, []);

  const handleVocalGenderChange = useCallback((gender: 'f' | 'm') => {
    setPreferences(prev => ({ ...prev, vocalGender: prev.vocalGender === gender ? null : gender }));
  }, []);

  const resetToSaved = useCallback(() => {
    setPreferences(buildLocalPreferences(savedPreferences));
    setStyleWeight(savedPreferences.styleWeight);
    setNegativeTags(savedPreferences.negativeTags);
  }, [savedPreferences]);

  return {
    preferences,
    styleWeight,
    negativeTags,
    loading: buildLoadingState(savedLoading),
    setStyleWeight,
    setNegativeTags,
    handleMusicStylesChange,
    handleGenreChange,
    handleCulturalLanguagesChange,
    handleMoodChange,
    handleInstrumentsChange,
    handleVocalGenderChange,
    resetToSaved,
  };
}
