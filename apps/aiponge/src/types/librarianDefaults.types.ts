/**
 * Librarian Defaults Types
 *
 * Platform-wide configurable defaults that librarians can modify
 * without requiring app recompilation or redeployment.
 */

import type { ServiceResponse } from '@aiponge/shared-contracts';

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

export type LibrarianDefaultsResponse = ServiceResponse<
  LibrarianDefaults & {
    isDefault?: boolean;
  }
>;
