/**
 * useConfigurableOptions Hook
 *
 * Provides configurable music generation options from the backend librarian defaults,
 * with fallbacks to hardcoded constants for offline/loading states.
 */

import { useMemo } from 'react';
import { useLibrarianDefaults } from './useLibrarianDefaults';
import { LANGUAGE_KEYS, GENRE_KEYS, MOOD_KEYS, INSTRUMENT_KEYS, DEFAULT_MOOD } from '../../constants/musicPreferences';

const LANGUAGE_NATIVE_NAMES: Record<string, string> = {
  auto: 'Auto-detect',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  ar: 'العربية',
  ja: '日本語',
  zh: '中文',
  it: 'Italiano',
  ko: '한국어',
  ru: 'Русский',
};

const FALLBACK_LANGUAGES = LANGUAGE_KEYS.map(code => ({
  code,
  label: LANGUAGE_NATIVE_NAMES[code] ?? code.toUpperCase(),
  nativeLabel: LANGUAGE_NATIVE_NAMES[code] ?? code.toUpperCase(),
  enabled: true,
}));

const FALLBACK_GENRES = GENRE_KEYS.map(key => ({
  key,
  labelKey: `music.genres.${key}`,
  enabled: true,
}));

const FALLBACK_MOODS = MOOD_KEYS.map(key => ({
  key,
  labelKey: `music.moods.${key}`,
  enabled: true,
}));

const FALLBACK_INSTRUMENTS = INSTRUMENT_KEYS.map(key => ({
  key,
  labelKey: `music.instruments.${key}`,
  enabled: true,
}));

const FALLBACK_DURATIONS = [
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 240, label: '4 min' },
  { value: 300, label: '5 min' },
];

const FALLBACK_VOCAL_GENDERS = [
  { value: 'f' as const, labelKey: 'music.vocalGender.female' },
  { value: 'm' as const, labelKey: 'music.vocalGender.male' },
];

const FALLBACK_CULTURAL_STYLES = [
  { key: 'western_contemporary', labelKey: 'music.culturalStyles.western_contemporary' },
  { key: 'eastern_traditional', labelKey: 'music.culturalStyles.eastern_traditional' },
  { key: 'latin_rhythmic', labelKey: 'music.culturalStyles.latin_rhythmic' },
  { key: 'african_world', labelKey: 'music.culturalStyles.african_world' },
  { key: 'electronic_ambient', labelKey: 'music.culturalStyles.electronic_ambient' },
  { key: 'classical_orchestral', labelKey: 'music.culturalStyles.classical_orchestral' },
];

export function useConfigurableOptions() {
  const { defaults, isLoading, isError } = useLibrarianDefaults();

  const languages = useMemo(() => {
    if (defaults?.availableOptions?.targetLanguages?.length) {
      return defaults.availableOptions.targetLanguages.filter(l => l.enabled !== false);
    }
    return FALLBACK_LANGUAGES;
  }, [defaults?.availableOptions?.targetLanguages]);

  // Use GENRE_KEYS as single source of truth, merge with backend enabled states
  const genres = useMemo(() => {
    const backendGenres = defaults?.availableOptions?.genres || [];
    const backendGenreMap = new Map(backendGenres.map(g => [g.key, g]));

    // Build from GENRE_KEYS (source of truth), apply backend enabled states
    return GENRE_KEYS.map(key => {
      const backendGenre = backendGenreMap.get(key);
      return {
        key,
        labelKey: `create.genres.${key}`,
        enabled: backendGenre?.enabled !== false, // Default to enabled
      };
    }).filter(g => g.enabled !== false);
  }, [defaults?.availableOptions?.genres]);

  const moods = useMemo(() => {
    if (defaults?.availableOptions?.moods?.length) {
      return defaults.availableOptions.moods.filter(m => m.enabled !== false);
    }
    return FALLBACK_MOODS;
  }, [defaults?.availableOptions?.moods]);

  const instruments = useMemo(() => {
    if (defaults?.availableOptions?.instruments?.length) {
      return defaults.availableOptions.instruments.filter(i => i.enabled !== false);
    }
    return FALLBACK_INSTRUMENTS;
  }, [defaults?.availableOptions?.instruments]);

  const durations = useMemo(() => {
    if (defaults?.availableOptions?.durations?.length) {
      return defaults.availableOptions.durations;
    }
    return FALLBACK_DURATIONS;
  }, [defaults?.availableOptions?.durations]);

  const vocalGenders = useMemo(() => {
    if (defaults?.availableOptions?.vocalGenders?.length) {
      return defaults.availableOptions.vocalGenders.filter(v => v.enabled !== false);
    }
    return FALLBACK_VOCAL_GENDERS;
  }, [defaults?.availableOptions?.vocalGenders]);

  const culturalStyles = useMemo(() => {
    if (defaults?.availableOptions?.culturalStyles?.length) {
      return defaults.availableOptions.culturalStyles.filter(c => c.enabled !== false);
    }
    return FALLBACK_CULTURAL_STYLES;
  }, [defaults?.availableOptions?.culturalStyles]);

  const languageKeys = useMemo(() => languages.map(l => l.code), [languages]);

  const genreKeys = useMemo(() => genres.map(g => g.key), [genres]);

  const moodKeys = useMemo(() => moods.map(m => m.key), [moods]);

  const instrumentKeys = useMemo(() => instruments.map(i => i.key), [instruments]);

  return {
    isLoading,
    isError,
    languages,
    genres,
    moods,
    instruments,
    durations,
    vocalGenders,
    culturalStyles,
    languageKeys,
    genreKeys,
    moodKeys,
    instrumentKeys,
  };
}

export function useContentLimitsWithDefaults() {
  const { defaults, isLoading } = useLibrarianDefaults();

  const limits = useMemo(
    () => ({
      maxEntryLength: defaults?.contentLimits?.maxEntryLength ?? 2000,
      maxLanguageSelections: defaults?.contentLimits?.maxLanguageSelections ?? 3,
      maxInstrumentSelections: defaults?.contentLimits?.maxInstrumentSelections ?? 4,
      maxStyleDescriptionLength: defaults?.contentLimits?.maxStyleDescriptionLength ?? 200,
      maxNegativeTagsLength: defaults?.contentLimits?.maxNegativeTagsLength ?? 100,
    }),
    [defaults?.contentLimits]
  );

  return { limits, isLoading };
}

export function useMusicDefaultValues() {
  const { defaults, isLoading } = useLibrarianDefaults();

  const musicDefaults = useMemo(
    () => ({
      defaultLanguage: defaults?.musicDefaults?.defaultLanguage ?? 'auto',
      defaultDuration: defaults?.musicDefaults?.defaultDuration ?? 180,
      defaultInstrumental: defaults?.musicDefaults?.defaultInstrumental ?? false,
      defaultCulturalStyle: defaults?.musicDefaults?.defaultCulturalStyle ?? 'western_contemporary',
      defaultGenre: defaults?.musicDefaults?.defaultGenre ?? '',
      defaultMood: defaults?.musicDefaults?.defaultMood ?? DEFAULT_MOOD,
    }),
    [defaults?.musicDefaults]
  );

  return { musicDefaults, isLoading };
}
