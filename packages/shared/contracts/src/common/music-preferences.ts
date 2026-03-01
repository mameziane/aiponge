export const GENRE_KEYS = [
  'pop',
  'rock',
  'jazz',
  'classical',
  'electronic',
  'hiphop',
  'rap',
  'rnb',
  'country',
  'folk',
  'blues',
  'soul',
  'gospel',
  'reggae',
  'latin',
  'flamenco',
  'salsa',
  'bossanova',
  'tango',
  'afrobeat',
  'highlife',
  'kpop',
  'jpop',
  'bollywood',
  'arabic',
  'turkish',
  'celtic',
  'indie',
  'alternative',
  'metal',
  'punk',
  'funk',
  'disco',
  'house',
  'techno',
  'trance',
  'dubstep',
  'ambient',
  'lofi',
  'chillout',
  'newage',
  'world',
  'acoustic',
  'orchestral',
  'cinematic',
  'worship',
  'spiritual',
  'meditation',
  'ska',
] as const;

export type GenreKey = (typeof GENRE_KEYS)[number];

export const MOOD_KEYS = [
  'calm',
  'anxious',
  'sad',
  'tired',
  'stressed',
  'hopeful',
  'joyful',
  'lonely',
  'confident',
] as const;

export type MoodKey = (typeof MOOD_KEYS)[number];

export const INSTRUMENT_KEYS = [
  'piano',
  'guitar',
  'drums',
  'violin',
  'saxophone',
  'flute',
  'bass',
  'synthesizer',
] as const;

export type InstrumentKey = (typeof INSTRUMENT_KEYS)[number];

export const VOCAL_GENDER_VALUES: readonly ['f', 'm', null] = ['f', 'm', null] as const;
export type VocalGenderKey = 'f' | 'm' | null;

export const LANGUAGE_KEYS = ['auto', 'en', 'es', 'fr', 'de', 'pt', 'ar', 'ja'] as const;
export type LanguageKey = (typeof LANGUAGE_KEYS)[number];

export const WELLNESS_INTENTION_KEYS = [
  'stress_relief',
  'self_discovery',
  'motivation',
  'sleep',
  'focus',
  'emotional_healing',
  'creative_expression',
  'mindfulness',
] as const;

export type WellnessIntentionKey = (typeof WELLNESS_INTENTION_KEYS)[number];

export const DEFAULT_MOOD: MoodKey = 'calm';
export const DEFAULT_GENRE: GenreKey = 'pop';

export const ONBOARDING_GENRES: GenreKey[] = [
  'pop',
  'rock',
  'jazz',
  'electronic',
  'hiphop',
  'rnb',
  'country',
  'classical',
];

export const POPULAR_GENRES: GenreKey[] = [...GENRE_KEYS];
