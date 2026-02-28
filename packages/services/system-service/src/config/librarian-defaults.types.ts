/**
 * Librarian Defaults Types
 *
 * Platform-wide configurable defaults that librarians can modify
 * without requiring app recompilation or redeployment.
 */

export interface MusicGenerationDefaults {
  defaultLanguage: string;
  defaultDuration: number;
  defaultCulturalStyle: string;
  defaultInstrumental: boolean;
  defaultMood: string;
  defaultGenre: string;
}

export interface BookDefaults {
  defaultLanguage: string;
  defaultChapterCount: number;
  defaultEntriesPerChapter: number;
}

export interface LocalizationDefaults {
  preferredLocales: string[];
  autoTranslate: boolean;
  defaultUiLanguage: string;
}

export interface AvailableOptions {
  targetLanguages: Array<{ code: string; label: string; nativeLabel: string; enabled?: boolean }>;
  genres: Array<{ key: string; labelKey: string; enabled?: boolean }>;
  moods: Array<{ key: string; labelKey: string; enabled?: boolean }>;
  instruments: Array<{ key: string; labelKey: string; enabled?: boolean }>;
  culturalStyles: Array<{ key: string; labelKey: string; enabled?: boolean }>;
  durations: Array<{ value: number; label: string; labelKey?: string }>;
  vocalGenders: Array<{ value: string | null; labelKey: string; enabled?: boolean }>;
}

export interface ContentLimits {
  maxEntryLength: number;
  maxMusicPreferencesLength: number;
  maxLanguageSelections: number;
  maxInstrumentSelections: number;
  maxStyleDescriptionLength: number;
  maxNegativeTagsLength: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  defaultCreditsPerReferral: number;
}

export interface UiConfiguration {
  showGenreSelector: boolean;
  showMoodSelector: boolean;
  showInstrumentSelector: boolean;
  showVocalGenderSelector: boolean;
  showLanguageSelector: boolean;
  showDurationSelector: boolean;
  enableExperimentalFeatures: boolean;
}

export interface LibrarianDefaults {
  musicDefaults: MusicGenerationDefaults;
  bookDefaults: BookDefaults;
  localizationDefaults: LocalizationDefaults;
  availableOptions: AvailableOptions;
  contentLimits: ContentLimits;
  uiConfiguration: UiConfiguration;
  updatedAt: string;
  updatedBy?: string;
}

export const DEFAULT_LIBRARIAN_DEFAULTS: LibrarianDefaults = {
  musicDefaults: {
    defaultLanguage: 'en',
    defaultDuration: 180,
    defaultCulturalStyle: 'western_contemporary',
    defaultInstrumental: false,
    defaultMood: 'calm',
    defaultGenre: '',
  },
  bookDefaults: {
    defaultLanguage: 'en',
    defaultChapterCount: 5,
    defaultEntriesPerChapter: 10,
  },
  localizationDefaults: {
    preferredLocales: ['en-US', 'es-ES', 'fr-FR'],
    autoTranslate: true,
    defaultUiLanguage: 'en-US',
  },
  availableOptions: {
    targetLanguages: [
      { code: 'en', label: 'English', nativeLabel: 'English' },
      { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
      { code: 'fr', label: 'French', nativeLabel: 'Français' },
      { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
      { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
      { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
      { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
    ],
    genres: [
      { key: 'pop', labelKey: 'create.genres.pop' },
      { key: 'rock', labelKey: 'create.genres.rock' },
      { key: 'jazz', labelKey: 'create.genres.jazz' },
      { key: 'classical', labelKey: 'create.genres.classical' },
      { key: 'electronic', labelKey: 'create.genres.electronic' },
      { key: 'hiphop', labelKey: 'create.genres.hiphop' },
      { key: 'rnb', labelKey: 'create.genres.rnb' },
      { key: 'country', labelKey: 'create.genres.country' },
      { key: 'folk', labelKey: 'create.genres.folk' },
      { key: 'blues', labelKey: 'create.genres.blues' },
      { key: 'soul', labelKey: 'create.genres.soul' },
      { key: 'gospel', labelKey: 'create.genres.gospel' },
      { key: 'reggae', labelKey: 'create.genres.reggae' },
      { key: 'latin', labelKey: 'create.genres.latin' },
      { key: 'afrobeat', labelKey: 'create.genres.afrobeat' },
      { key: 'kpop', labelKey: 'create.genres.kpop' },
      { key: 'jpop', labelKey: 'create.genres.jpop' },
      { key: 'bollywood', labelKey: 'create.genres.bollywood' },
      { key: 'indie', labelKey: 'create.genres.indie' },
      { key: 'metal', labelKey: 'create.genres.metal' },
      { key: 'punk', labelKey: 'create.genres.punk' },
      { key: 'funk', labelKey: 'create.genres.funk' },
      { key: 'disco', labelKey: 'create.genres.disco' },
      { key: 'house', labelKey: 'create.genres.house' },
      { key: 'techno', labelKey: 'create.genres.techno' },
      { key: 'ambient', labelKey: 'create.genres.ambient' },
      { key: 'lofi', labelKey: 'create.genres.lofi' },
      { key: 'acoustic', labelKey: 'create.genres.acoustic' },
      { key: 'orchestral', labelKey: 'create.genres.orchestral' },
      { key: 'cinematic', labelKey: 'create.genres.cinematic' },
      { key: 'meditation', labelKey: 'create.genres.meditation' },
    ],
    moods: [
      { key: 'calm', labelKey: 'create.moods.calm' },
      { key: 'anxious', labelKey: 'create.moods.anxious' },
      { key: 'sad', labelKey: 'create.moods.sad' },
      { key: 'tired', labelKey: 'create.moods.tired' },
      { key: 'stressed', labelKey: 'create.moods.stressed' },
      { key: 'hopeful', labelKey: 'create.moods.hopeful' },
      { key: 'joyful', labelKey: 'create.moods.joyful' },
      { key: 'lonely', labelKey: 'create.moods.lonely' },
      { key: 'confident', labelKey: 'create.moods.confident' },
    ],
    instruments: [
      { key: 'piano', labelKey: 'create.instrumentsList.piano' },
      { key: 'guitar', labelKey: 'create.instrumentsList.guitar' },
      { key: 'drums', labelKey: 'create.instrumentsList.drums' },
      { key: 'violin', labelKey: 'create.instrumentsList.violin' },
      { key: 'saxophone', labelKey: 'create.instrumentsList.saxophone' },
      { key: 'flute', labelKey: 'create.instrumentsList.flute' },
      { key: 'bass', labelKey: 'create.instrumentsList.bass' },
      { key: 'synthesizer', labelKey: 'create.instrumentsList.synthesizer' },
    ],
    culturalStyles: [
      { key: 'western_contemporary', labelKey: 'create.culturalStyles.western_contemporary' },
      { key: 'eastern_traditional', labelKey: 'create.culturalStyles.eastern_traditional' },
      { key: 'latin', labelKey: 'create.culturalStyles.latin' },
      { key: 'african', labelKey: 'create.culturalStyles.african' },
      { key: 'electronic', labelKey: 'create.culturalStyles.electronic' },
      { key: 'classical', labelKey: 'create.culturalStyles.classical' },
    ],
    durations: [
      { value: 120, label: '2 min', labelKey: 'create.durations.2min' },
      { value: 180, label: '3 min', labelKey: 'create.durations.3min' },
      { value: 240, label: '4 min', labelKey: 'create.durations.4min' },
      { value: 300, label: '5 min', labelKey: 'create.durations.5min' },
    ],
    vocalGenders: [
      { value: 'f', labelKey: 'create.vocalGenders.female' },
      { value: 'm', labelKey: 'create.vocalGenders.male' },
      { value: null, labelKey: 'create.vocalGenders.any' },
    ],
  },
  contentLimits: {
    maxEntryLength: 2000,
    maxMusicPreferencesLength: 500,
    maxLanguageSelections: 3,
    maxInstrumentSelections: 4,
    maxStyleDescriptionLength: 200,
    maxNegativeTagsLength: 100,
    minDurationMinutes: 2,
    maxDurationMinutes: 5,
    defaultCreditsPerReferral: 50,
  },
  uiConfiguration: {
    showGenreSelector: true,
    showMoodSelector: true,
    showInstrumentSelector: true,
    showVocalGenderSelector: true,
    showLanguageSelector: true,
    showDurationSelector: true,
    enableExperimentalFeatures: false,
  },
  updatedAt: new Date().toISOString(),
};

export const LIBRARIAN_DEFAULTS_CONFIG_KEY = 'librarian_defaults';
