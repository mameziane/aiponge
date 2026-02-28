import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { logger } from '../../lib/logger';
import { DEFAULT_MOOD } from '../../constants/musicPreferences';

export interface MusicPreferencesState {
  musicStyles: string;
  genre: string;
  culturalLanguages: string[];
  mood: string;
  instruments: string[];
  vocalGender: 'f' | 'm' | null;
  styleWeight: number;
  negativeTags: string;
}

export interface MusicPreferencesLoading {
  initial: boolean;
  musicStyles: boolean;
  genre: boolean;
  culturalLanguages: boolean;
  mood: boolean;
  instruments: boolean;
  vocalGender: boolean;
  styleWeight: boolean;
  negativeTags: boolean;
}

const DEFAULT_STYLE_WEIGHT = 0.5;

const DEFAULT_PREFERENCES: MusicPreferencesState = {
  musicStyles: '',
  genre: '',
  culturalLanguages: [],
  mood: DEFAULT_MOOD,
  instruments: [],
  vocalGender: null,
  styleWeight: DEFAULT_STYLE_WEIGHT,
  negativeTags: '',
};

const ALL_LOADED: MusicPreferencesLoading = {
  initial: false,
  musicStyles: false,
  genre: false,
  culturalLanguages: false,
  mood: false,
  instruments: false,
  vocalGender: false,
  styleWeight: false,
  negativeTags: false,
};

const FIVE_MINUTES = 5 * 60 * 1000;
const PREFERENCE_SAVE_TIMEOUT = 15000;
const MAX_SAVE_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

const PREF_TO_API_KEY: Record<keyof MusicPreferencesState, string> = {
  musicStyles: 'musicPreferences',
  genre: 'musicGenre',
  culturalLanguages: 'languagePreferences',
  mood: 'currentMood',
  instruments: 'musicInstruments',
  vocalGender: 'vocalGender',
  styleWeight: 'styleWeight',
  negativeTags: 'negativeTags',
};

function filterStrings(arr: unknown[]): string[] {
  return arr.filter((x): x is string => typeof x === 'string');
}

function parsePreferencesFromProfile(prefs: Record<string, unknown>): MusicPreferencesState {
  let culturalLanguages: string[] = [];
  const rawLanguages = prefs.languagePreferences;
  if (Array.isArray(rawLanguages)) {
    culturalLanguages = filterStrings(rawLanguages);
  } else if (typeof rawLanguages === 'string' && rawLanguages && rawLanguages !== 'auto') {
    culturalLanguages = [rawLanguages];
  } else if (typeof prefs.languagePreference === 'string' && prefs.languagePreference !== 'auto') {
    culturalLanguages = [prefs.languagePreference];
  }

  return {
    musicStyles: (prefs.musicPreferences as string) || '',
    genre: (prefs.musicGenre as string) || '',
    culturalLanguages,
    mood: (prefs.currentMood as string) || DEFAULT_MOOD,
    instruments:
      prefs.musicInstruments && Array.isArray(prefs.musicInstruments) ? filterStrings(prefs.musicInstruments) : [],
    vocalGender: prefs.vocalGender === 'f' || prefs.vocalGender === 'm' ? prefs.vocalGender : null,
    styleWeight: typeof prefs.styleWeight === 'number' ? prefs.styleWeight : DEFAULT_STYLE_WEIGHT,
    negativeTags: typeof prefs.negativeTags === 'string' ? prefs.negativeTags : '',
  };
}

async function fetchMusicPreferences(): Promise<MusicPreferencesState> {
  const response =
    await apiClient.get<ServiceResponse<{ preferences?: Record<string, unknown> }>>('/api/v1/app/profile');

  if (response.success && response.data?.preferences) {
    return parsePreferencesFromProfile(response.data.preferences as Record<string, unknown>);
  }

  return DEFAULT_PREFERENCES;
}

export interface UseMusicPreferencesReturn {
  preferences: MusicPreferencesState;
  loading: MusicPreferencesLoading;
  updatePreference: <K extends keyof MusicPreferencesState>(key: K, value: MusicPreferencesState[K]) => void;
  handleMusicPreferencesChange: (text: string) => void;
  handleGenreChange: (genre: string) => Promise<void>;
  handleCulturalLanguagesChange: (language: string) => Promise<void>;
  handleMoodChange: (mood: string) => Promise<void>;
  handleInstrumentsChange: (instrument: string) => Promise<void>;
  handleVocalGenderChange: (gender: 'f' | 'm') => Promise<void>;
  handleStyleWeightChange: (weight: number) => Promise<void>;
  handleNegativeTagsChange: (tags: string) => Promise<void>;
  saveAll: (prefsToSave: MusicPreferencesState) => Promise<boolean>;
  reset: () => void;
}

export function useMusicPreferences(userId: string | undefined): UseMusicPreferencesReturn {
  const queryClient = useQueryClient();
  const [localOverrides, setLocalOverrides] = React.useState<Partial<MusicPreferencesState> | null>(null);
  const [fieldLoading, setFieldLoading] = React.useState<MusicPreferencesLoading>(ALL_LOADED);
  const musicPreferencesSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const negativeTagsSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMusicStylesRef = React.useRef<string | null>(null);
  const pendingNegativeTagsRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(true);

  const { data: serverPreferences, isLoading: initialLoading } = useQuery({
    queryKey: queryKeys.profile.musicPreferences(userId),
    queryFn: fetchMusicPreferences,
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
    gcTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });

  const preferences: MusicPreferencesState = React.useMemo(() => {
    const base = serverPreferences ?? DEFAULT_PREFERENCES;
    if (!localOverrides) return base;
    return { ...base, ...localOverrides };
  }, [serverPreferences, localOverrides]);

  const loading: MusicPreferencesLoading = React.useMemo(
    () => ({ ...fieldLoading, initial: initialLoading }),
    [fieldLoading, initialLoading]
  );

  React.useEffect(() => {
    if (serverPreferences) {
      setLocalOverrides(null);
    }
  }, [serverPreferences]);

  const updatePreference = React.useCallback(
    <K extends keyof MusicPreferencesState>(key: K, value: MusicPreferencesState[K]) => {
      setLocalOverrides(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const setFieldLoadingState = React.useCallback((key: keyof MusicPreferencesLoading, value: boolean) => {
    setFieldLoading(prev => ({ ...prev, [key]: value }));
  }, []);

  const savePreferenceField = React.useCallback(
    async <K extends keyof MusicPreferencesState>(
      prefKey: K,
      newValue: MusicPreferencesState[K],
      previousValue: MusicPreferencesState[K]
    ): Promise<boolean> => {
      if (!userId) return false;

      const apiKey = PREF_TO_API_KEY[prefKey];
      let lastError: unknown;
      for (let attempt = 0; attempt <= MAX_SAVE_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            logger.debug(`${apiKey} preference save retry`, { attempt });
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
          }

          const response = await apiClient.patch<ServiceResponse<{ success: boolean }>>(
            '/api/v1/app/profile/preferences',
            {
              preferences: { [apiKey]: newValue },
            },
            { timeout: PREFERENCE_SAVE_TIMEOUT }
          );

          if (response?.success !== true) {
            logger.error(`${apiKey} preference save failed`, { response });
            if (mountedRef.current) updatePreference(prefKey, previousValue);
            return false;
          }

          invalidateOnEvent(queryClient, { type: 'PROFILE_UPDATED' });
          invalidateOnEvent(queryClient, { type: 'MUSIC_PREFERENCES_UPDATED' });
          return true;
        } catch (error) {
          lastError = error;
          const isTimeout =
            error instanceof Error && (error.message.includes('timeout') || error.message.includes('ECONNABORTED'));
          const isNetwork =
            error instanceof Error && (error.message.includes('Network') || error.message.includes('ECONNREFUSED'));
          if (!isTimeout && !isNetwork) {
            break;
          }
        }
      }

      logger.error(`${apiKey} preference save failed after retries`, lastError);
      if (mountedRef.current) updatePreference(prefKey, previousValue);
      return false;
    },
    [userId, queryClient, updatePreference]
  );

  const saveAll = React.useCallback(
    async (prefsToSave: MusicPreferencesState): Promise<boolean> => {
      if (!userId) return false;

      const apiPayload: Record<string, unknown> = {};
      for (const [prefKey, apiKey] of Object.entries(PREF_TO_API_KEY)) {
        apiPayload[apiKey] = prefsToSave[prefKey as keyof MusicPreferencesState];
      }

      try {
        const response = await apiClient.patch<ServiceResponse<{ success: boolean }>>(
          '/api/v1/app/profile/preferences',
          {
            preferences: apiPayload,
          },
          { timeout: PREFERENCE_SAVE_TIMEOUT }
        );

        if (response?.success !== true) {
          logger.error('Bulk preference save failed', { response });
          return false;
        }

        invalidateOnEvent(queryClient, { type: 'PROFILE_UPDATED' });
        invalidateOnEvent(queryClient, { type: 'MUSIC_PREFERENCES_UPDATED' });
        return true;
      } catch (error) {
        logger.error('Bulk preference save error', error);
        return false;
      }
    },
    [userId, queryClient]
  );

  const lastCommittedMusicStylesRef = React.useRef(preferences.musicStyles);
  React.useEffect(() => {
    if (serverPreferences) {
      lastCommittedMusicStylesRef.current = serverPreferences.musicStyles;
    }
  }, [serverPreferences]);

  const handleMusicPreferencesChange = React.useCallback(
    (text: string) => {
      updatePreference('musicStyles', text);
      pendingMusicStylesRef.current = text;

      if (musicPreferencesSaveTimerRef.current) {
        clearTimeout(musicPreferencesSaveTimerRef.current);
      }

      musicPreferencesSaveTimerRef.current = setTimeout(async () => {
        const current = pendingMusicStylesRef.current;
        if (current === null) return;
        pendingMusicStylesRef.current = null;
        if (!userId) return;
        const revertValue = lastCommittedMusicStylesRef.current;

        setFieldLoadingState('musicStyles', true);
        try {
          const saved = await savePreferenceField('musicStyles', current, revertValue);
          if (saved) {
            lastCommittedMusicStylesRef.current = current;
          }
        } finally {
          if (mountedRef.current) setFieldLoadingState('musicStyles', false);
        }
      }, 1000);
    },
    [userId, updatePreference, setFieldLoadingState, savePreferenceField]
  );

  const handleGenreChange = React.useCallback(
    async (genre: string) => {
      if (fieldLoading.genre) return;
      const previousGenre = preferences.genre;
      const newGenre = preferences.genre === genre ? '' : genre;
      updatePreference('genre', newGenre);
      setFieldLoadingState('genre', true);
      try {
        await savePreferenceField('genre', newGenre, previousGenre);
      } finally {
        setFieldLoadingState('genre', false);
      }
    },
    [fieldLoading.genre, preferences.genre, updatePreference, savePreferenceField, setFieldLoadingState]
  );

  const handleCulturalLanguagesChange = React.useCallback(
    async (language: string) => {
      if (fieldLoading.culturalLanguages) return;
      const previousLanguages = [...preferences.culturalLanguages];
      const isSelected = preferences.culturalLanguages.includes(language);
      let updatedLanguages: string[];

      if (isSelected) {
        updatedLanguages = preferences.culturalLanguages.filter(l => l !== language);
      } else {
        if (preferences.culturalLanguages.length >= 2) {
          return;
        }
        updatedLanguages = [...preferences.culturalLanguages, language];
      }

      updatePreference('culturalLanguages', updatedLanguages);
      setFieldLoadingState('culturalLanguages', true);
      try {
        await savePreferenceField('culturalLanguages', updatedLanguages, previousLanguages);
      } finally {
        setFieldLoadingState('culturalLanguages', false);
      }
    },
    [
      fieldLoading.culturalLanguages,
      preferences.culturalLanguages,
      updatePreference,
      savePreferenceField,
      setFieldLoadingState,
    ]
  );

  const handleMoodChange = React.useCallback(
    async (mood: string) => {
      if (fieldLoading.mood) return;
      const previousMood = preferences.mood || DEFAULT_MOOD;
      updatePreference('mood', mood);
      setFieldLoadingState('mood', true);
      try {
        await savePreferenceField('mood', mood, previousMood);
      } finally {
        setFieldLoadingState('mood', false);
      }
    },
    [fieldLoading.mood, preferences.mood, updatePreference, savePreferenceField, setFieldLoadingState]
  );

  const handleInstrumentsChange = React.useCallback(
    async (instrument: string) => {
      if (fieldLoading.instruments) return;
      const previousInstruments = [...preferences.instruments];
      const isSelected = preferences.instruments.includes(instrument);
      const updatedInstruments = isSelected
        ? preferences.instruments.filter(i => i !== instrument)
        : [...preferences.instruments, instrument];
      updatePreference('instruments', updatedInstruments);
      setFieldLoadingState('instruments', true);
      try {
        await savePreferenceField('instruments', updatedInstruments, previousInstruments);
      } finally {
        setFieldLoadingState('instruments', false);
      }
    },
    [fieldLoading.instruments, preferences.instruments, updatePreference, savePreferenceField, setFieldLoadingState]
  );

  const handleVocalGenderChange = React.useCallback(
    async (gender: 'f' | 'm') => {
      if (fieldLoading.vocalGender) return;
      const previousGender = preferences.vocalGender;
      const newGender = preferences.vocalGender === gender ? null : gender;
      updatePreference('vocalGender', newGender);
      setFieldLoadingState('vocalGender', true);
      try {
        await savePreferenceField('vocalGender', newGender, previousGender);
      } finally {
        setFieldLoadingState('vocalGender', false);
      }
    },
    [fieldLoading.vocalGender, preferences.vocalGender, updatePreference, savePreferenceField, setFieldLoadingState]
  );

  const handleStyleWeightChange = React.useCallback(
    async (weight: number) => {
      if (fieldLoading.styleWeight) return;
      const previousWeight = preferences.styleWeight;
      updatePreference('styleWeight', weight);
      setFieldLoadingState('styleWeight', true);
      try {
        await savePreferenceField('styleWeight', weight, previousWeight);
      } finally {
        setFieldLoadingState('styleWeight', false);
      }
    },
    [fieldLoading.styleWeight, preferences.styleWeight, updatePreference, savePreferenceField, setFieldLoadingState]
  );

  const lastCommittedNegativeTagsRef = React.useRef(preferences.negativeTags);
  React.useEffect(() => {
    if (serverPreferences) {
      lastCommittedNegativeTagsRef.current = serverPreferences.negativeTags;
    }
  }, [serverPreferences]);

  const handleNegativeTagsChange = React.useCallback(
    async (tags: string) => {
      updatePreference('negativeTags', tags);
      pendingNegativeTagsRef.current = tags;

      if (negativeTagsSaveTimerRef.current) {
        clearTimeout(negativeTagsSaveTimerRef.current);
      }

      negativeTagsSaveTimerRef.current = setTimeout(async () => {
        const current = pendingNegativeTagsRef.current;
        if (current === null) return;
        pendingNegativeTagsRef.current = null;
        if (!userId) return;
        const revertValue = lastCommittedNegativeTagsRef.current;

        setFieldLoadingState('negativeTags', true);
        try {
          const saved = await savePreferenceField('negativeTags', current, revertValue);
          if (saved) {
            lastCommittedNegativeTagsRef.current = current;
          }
        } finally {
          if (mountedRef.current) setFieldLoadingState('negativeTags', false);
        }
      }, 1000);
    },
    [userId, updatePreference, setFieldLoadingState, savePreferenceField]
  );

  const reset = React.useCallback(() => {
    setLocalOverrides(null);
    setFieldLoading(ALL_LOADED);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      if (musicPreferencesSaveTimerRef.current) {
        clearTimeout(musicPreferencesSaveTimerRef.current);
        musicPreferencesSaveTimerRef.current = null;
      }
      if (negativeTagsSaveTimerRef.current) {
        clearTimeout(negativeTagsSaveTimerRef.current);
        negativeTagsSaveTimerRef.current = null;
      }

      const pendingStyles = pendingMusicStylesRef.current;
      const pendingTags = pendingNegativeTagsRef.current;

      if (userId) {
        if (pendingStyles !== null) {
          apiClient
            .patch(
              '/api/v1/app/profile/preferences',
              {
                preferences: { musicPreferences: pendingStyles },
              },
              { timeout: PREFERENCE_SAVE_TIMEOUT }
            )
            .catch(err => logger.warn('Failed to save music style preferences on unmount', { err }));
        }
        if (pendingTags !== null) {
          apiClient
            .patch(
              '/api/v1/app/profile/preferences',
              {
                preferences: { negativeTags: pendingTags },
              },
              { timeout: PREFERENCE_SAVE_TIMEOUT }
            )
            .catch(err => logger.warn('Failed to save negative tags on unmount', { err }));
        }
      }
    };
  }, [userId]);

  return {
    preferences,
    loading,
    updatePreference,
    handleMusicPreferencesChange,
    handleGenreChange,
    handleCulturalLanguagesChange,
    handleMoodChange,
    handleInstrumentsChange,
    handleVocalGenderChange,
    handleStyleWeightChange,
    handleNegativeTagsChange,
    saveAll,
    reset,
  };
}
