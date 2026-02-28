/**
 * Librarian Defaults Validation Schema
 *
 * Zod schemas for validating librarian defaults updates
 */

import { z } from 'zod';

const MusicGenerationDefaultsSchema = z
  .object({
    defaultLanguage: z.string().min(1).max(10).optional(),
    defaultDuration: z.number().min(60).max(600).optional(),
    defaultCulturalStyle: z.string().min(1).max(50).optional(),
    defaultInstrumental: z.boolean().optional(),
    defaultMood: z.string().max(50).optional(),
    defaultGenre: z.string().max(50).optional(),
  })
  .strict()
  .partial();

const BookDefaultsSchema = z
  .object({
    defaultLanguage: z.string().min(1).max(10).optional(),
    defaultChapterCount: z.number().min(1).max(50).optional(),
    defaultEntriesPerChapter: z.number().min(1).max(100).optional(),
  })
  .strict()
  .partial();

const LocalizationDefaultsSchema = z
  .object({
    preferredLocales: z.array(z.string().min(2).max(10)).max(20).optional(),
    autoTranslate: z.boolean().optional(),
    defaultUiLanguage: z.string().min(2).max(10).optional(),
  })
  .strict()
  .partial();

const LanguageOptionSchema = z.object({
  code: z.string().min(1).max(10),
  label: z.string().min(1).max(50),
  nativeLabel: z.string().min(1).max(50),
  enabled: z.boolean().optional(),
});

const KeyLabelOptionSchema = z.object({
  key: z.string().min(1).max(50),
  labelKey: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
});

const DurationOptionSchema = z.object({
  value: z.number().min(60).max(600),
  label: z.string().min(1).max(50),
});

const VocalGenderOptionSchema = z.object({
  value: z.string().nullable(),
  labelKey: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
});

const AvailableOptionsSchema = z
  .object({
    targetLanguages: z.array(LanguageOptionSchema).max(50).optional(),
    genres: z.array(KeyLabelOptionSchema).max(100).optional(),
    moods: z.array(KeyLabelOptionSchema).max(50).optional(),
    instruments: z.array(KeyLabelOptionSchema).max(50).optional(),
    culturalStyles: z.array(KeyLabelOptionSchema).max(20).optional(),
    durations: z.array(DurationOptionSchema).max(10).optional(),
    vocalGenders: z.array(VocalGenderOptionSchema).max(5).optional(),
  })
  .strict()
  .partial();

const ContentLimitsSchema = z
  .object({
    maxEntryLength: z.number().min(100).max(10000).optional(),
    maxMusicPreferencesLength: z.number().min(50).max(2000).optional(),
    maxLanguageSelections: z.number().min(1).max(10).optional(),
    maxInstrumentSelections: z.number().min(1).max(10).optional(),
    maxStyleDescriptionLength: z.number().min(50).max(1000).optional(),
    maxNegativeTagsLength: z.number().min(20).max(500).optional(),
    minDurationMinutes: z.number().min(1).max(5).optional(),
    maxDurationMinutes: z.number().min(2).max(10).optional(),
    defaultCreditsPerReferral: z.number().min(0).max(1000).optional(),
  })
  .strict()
  .partial();

const UiConfigurationSchema = z
  .object({
    showGenreSelector: z.boolean().optional(),
    showMoodSelector: z.boolean().optional(),
    showInstrumentSelector: z.boolean().optional(),
    showVocalGenderSelector: z.boolean().optional(),
    showLanguageSelector: z.boolean().optional(),
    showDurationSelector: z.boolean().optional(),
    enableExperimentalFeatures: z.boolean().optional(),
  })
  .strict()
  .partial();

export const LibrarianDefaultsUpdateSchema = z
  .object({
    musicDefaults: MusicGenerationDefaultsSchema.optional(),
    bookDefaults: BookDefaultsSchema.optional(),
    localizationDefaults: LocalizationDefaultsSchema.optional(),
    availableOptions: AvailableOptionsSchema.optional(),
    contentLimits: ContentLimitsSchema.optional(),
    uiConfiguration: UiConfigurationSchema.optional(),
  })
  .strict();

export type LibrarianDefaultsUpdate = z.infer<typeof LibrarianDefaultsUpdateSchema>;
