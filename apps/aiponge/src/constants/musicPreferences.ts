export {
  MOOD_KEYS,
  INSTRUMENT_KEYS,
  LANGUAGE_KEYS,
  GENRE_KEYS,
  WELLNESS_INTENTION_KEYS,
  DEFAULT_MOOD,
  DEFAULT_GENRE,
  ONBOARDING_GENRES,
  POPULAR_GENRES,
  type MoodKey,
  type InstrumentKey,
  type VocalGenderKey,
  type LanguageKey,
  type GenreKey,
  type WellnessIntentionKey,
} from '@aiponge/shared-contracts';

export const VOCAL_GENDER_KEYS = [
  { value: 'f' as const, labelKey: 'female', icon: 'woman-outline' as const },
  { value: 'm' as const, labelKey: 'male', icon: 'man-outline' as const },
  { value: null, labelKey: 'any', icon: 'shuffle-outline' as const },
] as const;

export const WELLNESS_INTENTION_ICONS: Record<string, string> = {
  stress_relief: 'leaf-outline',
  self_discovery: 'compass-outline',
  motivation: 'flame-outline',
  sleep: 'moon-outline',
  focus: 'eye-outline',
  emotional_healing: 'heart-outline',
  creative_expression: 'color-palette-outline',
  mindfulness: 'flower-outline',
};
