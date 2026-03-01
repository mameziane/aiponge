/**
 * Library API Contracts
 *
 * Zod schemas for Library endpoints (Books, Chapters, Entries, Illustrations)
 * Used for runtime validation to catch frontend-backend response mismatches
 */

import { z } from 'zod';
import {
  ServiceResponseSchema,
  ServiceErrorSchema,
  ContentVisibilityWithDefaultSchema,
  ContentVisibilitySchema,
} from '../common/index.js';
import { BookLifecycleSchema, BOOK_LIFECYCLE } from '../common/content-lifecycle.js';

// =============================================================================
// BOOK TYPE CONSTANTS - Single source of truth for all book type IDs
// =============================================================================

export const BOOK_TYPE_IDS = {
  PERSONAL: 'personal',
  WISDOM: 'wisdom',
  QUOTES: 'quotes',
  SCIENTIFIC: 'scientific',
  MEMOIR: 'memoir',
  FICTION: 'fiction',
  POETRY: 'poetry',
  AFFIRMATIONS: 'affirmations',
  MEDITATION: 'meditation',
  GROWTH: 'growth',
  CHILDREN: 'children',
  EDUCATIONAL: 'educational',
  PHILOSOPHY: 'philosophy',
  DREAMS: 'dreams',
  GRATITUDE: 'gratitude',
  // Story Identity
  NARRATIVE_REAUTHORING: 'narrative_reauthoring',
  MEANING_RECONSTRUCTION: 'meaning_reconstruction',
  IDENTITY_DESIGN: 'identity_design',
  LIFE_STORY_TIMELINE: 'life_story_timeline',
  SHADOW_INTEGRATION: 'shadow_integration', // category: personal_reflection
  // Thinking Choice
  COGNITIVE_REFRAMING: 'cognitive_reframing',
  BELIEF_EXCAVATION: 'belief_excavation',
  DECISION_MAKING: 'decision_making',
  ATTENTION_FOCUS: 'attention_focus',
  // Emotion Regulation
  EMOTIONAL_REGULATION: 'emotional_regulation',
  EMOTIONAL_LITERACY: 'emotional_literacy',
  SELF_COMPASSION: 'self_compassion',
  SOMATIC_AWARENESS: 'somatic_awareness',
  // Motivation Action
  VALUES_CLARIFICATION: 'values_clarification',
  MOTIVATION_DIAGNOSTICS: 'motivation_diagnostics',
  HABIT_ARCHITECTURE: 'habit_architecture',
  LIFE_GOALS: 'life_goals',
} as const;

export type BookTypeId = (typeof BOOK_TYPE_IDS)[keyof typeof BOOK_TYPE_IDS];

// =============================================================================
// BOOK TYPE CATEGORIES - Grouping of book types for UI display
// =============================================================================

export const BOOK_TYPE_CATEGORIES = {
  PERSONAL_REFLECTION: 'personal_reflection',
  CREATIVE_WRITING: 'creative_writing',
  KNOWLEDGE_WISDOM: 'knowledge_wisdom',
  WELLNESS_MINDFULNESS: 'wellness_mindfulness',
  STORY_IDENTITY: 'story_identity',
  THINKING_CHOICE: 'thinking_choice',
  EMOTION_REGULATION: 'emotion_regulation',
  MOTIVATION_ACTION: 'motivation_action',
} as const;

export type BookTypeCategory = (typeof BOOK_TYPE_CATEGORIES)[keyof typeof BOOK_TYPE_CATEGORIES];

// =============================================================================
// ENTRY TYPE CONSTANTS - Single source of truth for all entry type IDs
// =============================================================================

export const ENTRY_TYPES = {
  REFLECTION: 'reflection',
  BOOKMARK: 'bookmark',
  QUOTE: 'quote',
  NOTE: 'note',
  INSIGHT: 'insight',
  WISDOM: 'wisdom',
  EXCERPT: 'excerpt',
} as const;

export type EntryTypeId = (typeof ENTRY_TYPES)[keyof typeof ENTRY_TYPES];

// =============================================================================
// BOOK METADATA CONSTANTS - Categories, eras, traditions for book creation
// =============================================================================

export const BOOK_CATEGORIES = [
  'anxiety',
  'growth',
  'purpose',
  'love',
  'grief',
  'gratitude',
  'mindfulness',
  'resilience',
] as const;

export type BookCategory = (typeof BOOK_CATEGORIES)[number];

// =============================================================================
// REMINDER TYPE CONSTANTS - Single source of truth for reminder types
// =============================================================================

export const REMINDER_TYPES = {
  BOOK: 'book',
  READING: 'reading',
  LISTENING: 'listening',
  MEDITATION: 'meditation',
} as const;

export type ReminderTypeId = (typeof REMINDER_TYPES)[keyof typeof REMINDER_TYPES];

// =============================================================================
// BOOK TYPE CONTRACTS
// =============================================================================

export const LibBookTypeIdSchema = z.enum([
  BOOK_TYPE_IDS.PERSONAL,
  BOOK_TYPE_IDS.WISDOM,
  BOOK_TYPE_IDS.QUOTES,
  BOOK_TYPE_IDS.SCIENTIFIC,
  BOOK_TYPE_IDS.MEMOIR,
  BOOK_TYPE_IDS.FICTION,
  BOOK_TYPE_IDS.POETRY,
  BOOK_TYPE_IDS.AFFIRMATIONS,
  BOOK_TYPE_IDS.MEDITATION,
  BOOK_TYPE_IDS.GROWTH,
  BOOK_TYPE_IDS.CHILDREN,
  BOOK_TYPE_IDS.EDUCATIONAL,
  BOOK_TYPE_IDS.PHILOSOPHY,
  BOOK_TYPE_IDS.DREAMS,
  BOOK_TYPE_IDS.GRATITUDE,
  BOOK_TYPE_IDS.NARRATIVE_REAUTHORING,
  BOOK_TYPE_IDS.MEANING_RECONSTRUCTION,
  BOOK_TYPE_IDS.IDENTITY_DESIGN,
  BOOK_TYPE_IDS.LIFE_STORY_TIMELINE,
  BOOK_TYPE_IDS.SHADOW_INTEGRATION,
  BOOK_TYPE_IDS.COGNITIVE_REFRAMING,
  BOOK_TYPE_IDS.BELIEF_EXCAVATION,
  BOOK_TYPE_IDS.DECISION_MAKING,
  BOOK_TYPE_IDS.ATTENTION_FOCUS,
  BOOK_TYPE_IDS.EMOTIONAL_REGULATION,
  BOOK_TYPE_IDS.EMOTIONAL_LITERACY,
  BOOK_TYPE_IDS.SELF_COMPASSION,
  BOOK_TYPE_IDS.SOMATIC_AWARENESS,
  BOOK_TYPE_IDS.VALUES_CLARIFICATION,
  BOOK_TYPE_IDS.MOTIVATION_DIAGNOSTICS,
  BOOK_TYPE_IDS.HABIT_ARCHITECTURE,
  BOOK_TYPE_IDS.LIFE_GOALS,
]);
export type LibBookTypeId = z.infer<typeof LibBookTypeIdSchema>;

export const LibBookTypeSchema = z.object({
  id: LibBookTypeIdSchema,
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  promptTemplateId: z.string().nullable().optional(),
  defaultSettings: z.record(z.unknown()).default({}),
  iconName: z.string().nullable().optional(),
  isUserCreatable: z.boolean(),
  isEditable: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type LibBookType = z.infer<typeof LibBookTypeSchema>;

// =============================================================================
// BOOK CONTRACTS
// =============================================================================

export const LibBookVisibilitySchema = ContentVisibilitySchema;
export type LibBookVisibility = z.infer<typeof LibBookVisibilitySchema>;

// ContentVisibilitySchema is now exported from common/status-types.ts
// DO NOT re-export here to avoid duplicate export errors

export const LibBookStatusSchema = BookLifecycleSchema;
export type LibBookStatus = z.infer<typeof LibBookStatusSchema>;

export const LibBookSchema = z
  .object({
    id: z.string(),
    typeId: z.string(),
    userId: z.string(),
    title: z.string(),
    subtitle: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    language: z.string().optional().default('en'),
    visibility: ContentVisibilityWithDefaultSchema.optional(),
    status: z.string().optional().default(BOOK_LIFECYCLE.ACTIVE),
    isReadOnly: z.boolean().optional().default(false),
    isSystem: z.boolean().optional(),
    systemType: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    sortOrder: z.number().optional().default(0),
    chapterCount: z.number().optional().default(0),
    entryCount: z.number().optional().default(0),
    tags: z.array(z.string()).optional().default([]),
    themes: z.array(z.string()).optional().default([]),
    metadata: z.record(z.unknown()).optional().default({}),
    publishedAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type LibBook = z.infer<typeof LibBookSchema>;

// =============================================================================
// CHAPTER CONTRACTS
// =============================================================================

export const LibChapterSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    userId: z.string().optional(),
    title: z.string(),
    description: z.string().nullable().optional(),
    sortOrder: z.number().optional().default(0),
    isLocked: z.boolean().optional().default(false),
    unlockTrigger: z.string().nullable().optional(),
    unlockedAt: z.string().nullable().optional(),
    entryCount: z.number().optional().default(0),
    metadata: z.record(z.unknown()).optional().default({}),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type LibChapter = z.infer<typeof LibChapterSchema>;

// =============================================================================
// ENTRY CONTRACTS
// =============================================================================

export const LibEntryTypeSchema = z.enum([
  ENTRY_TYPES.REFLECTION,
  ENTRY_TYPES.BOOKMARK,
  ENTRY_TYPES.QUOTE,
  ENTRY_TYPES.NOTE,
  ENTRY_TYPES.INSIGHT,
  ENTRY_TYPES.WISDOM,
  ENTRY_TYPES.EXCERPT,
]);
export type LibEntryType = z.infer<typeof LibEntryTypeSchema>;

export const SENTIMENTS = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
  MIXED: 'mixed',
} as const;

export type SentimentId = (typeof SENTIMENTS)[keyof typeof SENTIMENTS];

export const LibSentimentSchema = z.enum([
  SENTIMENTS.POSITIVE,
  SENTIMENTS.NEGATIVE,
  SENTIMENTS.NEUTRAL,
  SENTIMENTS.MIXED,
]);
export type LibSentiment = z.infer<typeof LibSentimentSchema>;

export const DepthLevelSchema = z.enum(['brief', 'standard', 'deep']);
export type DepthLevel = z.infer<typeof DepthLevelSchema>;

export const LibEntrySchema = z
  .object({
    id: z.string(),
    chapterId: z.string(),
    bookId: z.string().optional(),
    userId: z.string().optional(),
    content: z.string(),
    entryType: z.string().optional().default('reflection'),
    sortOrder: z.number().optional().default(0),
    sourceTitle: z.string().nullable().optional(),
    sourceAuthor: z.string().nullable().optional(),
    sourceChapter: z.string().nullable().optional(),
    attribution: z.string().nullable().optional(),
    moodContext: z.string().nullable().optional(),
    sentiment: z.string().nullable().optional(),
    emotionalIntensity: z.number().nullable().optional(),
    tags: z.array(z.string()).optional().default([]),
    themes: z.array(z.string()).optional().default([]),
    musicHints: z.record(z.unknown()).optional().default({}),
    depthLevel: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional().default({}),
    processingStatus: z.string().nullable().optional(),
    illustrationUrl: z.string().nullable().optional(),
    chapterSortOrder: z.number().optional(),
    userDate: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type LibEntry = z.infer<typeof LibEntrySchema>;

// =============================================================================
// ILLUSTRATION CONTRACTS
// =============================================================================

export const LibIllustrationTypeSchema = z.enum(['cover', 'chapter', 'entry', 'inline']);
export type LibIllustrationType = z.infer<typeof LibIllustrationTypeSchema>;

export const LibIllustrationSourceSchema = z.enum(['uploaded', 'ai_generated', 'stock']);
export type LibIllustrationSource = z.infer<typeof LibIllustrationSourceSchema>;

export const LibIllustrationSchema = z
  .object({
    id: z.string(),
    bookId: z.string().nullable().optional(),
    chapterId: z.string().nullable().optional(),
    entryId: z.string().nullable().optional(),
    url: z.string(),
    artworkUrl: z.string().nullable().optional(),
    altText: z.string().nullable().optional(),
    illustrationType: z.string(),
    source: z.string(),
    sortOrder: z.number().optional().default(0),
    generationPrompt: z.string().nullable().optional(),
    generationMetadata: z.record(z.unknown()).optional().default({}),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();
export type LibIllustration = z.infer<typeof LibIllustrationSchema>;

// =============================================================================
// BOOK WITH ILLUSTRATIONS - Extended book schema with cover illustration
// =============================================================================

export const LibBookWithIllustrationsSchema = z.object({
  book: LibBookSchema,
  coverIllustration: LibIllustrationSchema.nullable().optional(),
  illustrations: z.array(LibIllustrationSchema).optional().default([]),
});
export type LibBookWithIllustrations = z.infer<typeof LibBookWithIllustrationsSchema>;

// =============================================================================
// ENTRY WITH ILLUSTRATIONS - Extended entry schema with illustrations
// =============================================================================

export const LibEntryWithIllustrationsSchema = z.object({
  entry: LibEntrySchema,
  illustrations: z.array(LibIllustrationSchema).optional().default([]),
});
export type LibEntryWithIllustrations = z.infer<typeof LibEntryWithIllustrationsSchema>;

// =============================================================================
// API RESPONSE CONTRACTS - These are the critical contracts for frontend-backend sync
// =============================================================================

export const ListBooksResponseDataSchema = z.array(LibBookSchema.passthrough());
export type ListBooksResponseData = z.infer<typeof ListBooksResponseDataSchema>;

export const ListBooksResponseSchema = z.object({
  success: z.boolean(),
  data: ListBooksResponseDataSchema,
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean().optional(),
  timestamp: z.string().optional(),
  error: ServiceErrorSchema.optional(),
});
export type ListBooksResponse = z.infer<typeof ListBooksResponseSchema>;

export const ListChaptersResponseDataSchema = z.object({
  chapters: z.array(
    z
      .object({
        chapter: LibChapterSchema,
        entity: z.record(z.unknown()).optional(),
      })
      .passthrough()
  ),
  total: z.number().optional(),
});
export type ListChaptersResponseData = z.infer<typeof ListChaptersResponseDataSchema>;

export const ListChaptersResponseSchema = ServiceResponseSchema(ListChaptersResponseDataSchema);
export type ListChaptersResponse = z.infer<typeof ListChaptersResponseSchema>;

export const ListEntriesResponseDataSchema = z.object({
  entries: z.array(LibEntrySchema),
  total: z.number().optional(),
});
export type ListEntriesResponseData = z.infer<typeof ListEntriesResponseDataSchema>;

export const ListEntriesResponseSchema = ServiceResponseSchema(ListEntriesResponseDataSchema);
export type ListEntriesResponse = z.infer<typeof ListEntriesResponseSchema>;

export const CreateBookResponseSchema = ServiceResponseSchema(LibBookSchema.passthrough());
export type CreateBookResponse = z.infer<typeof CreateBookResponseSchema>;

export const BookWithEntityResponseDataSchema = z
  .object({
    book: LibBookSchema.passthrough(),
    entity: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const BookResponseSchema = ServiceResponseSchema(BookWithEntityResponseDataSchema);
export type BookResponse = z.infer<typeof BookResponseSchema>;

export const ChapterResponseSchema = ServiceResponseSchema(LibChapterSchema);
export type ChapterResponse = z.infer<typeof ChapterResponseSchema>;

export const EntryResponseSchema = ServiceResponseSchema(LibEntrySchema);
export type EntryResponse = z.infer<typeof EntryResponseSchema>;

// =============================================================================
// GET BOOK DETAIL RESPONSE - Single book with chapters, entries, and cover
// Matches the actual shape returned by GetBookUseCase
// =============================================================================

export const LibBookWithChaptersSchema = LibBookSchema.extend({
  chapters: z
    .array(
      LibChapterSchema.extend({
        entries: z.array(LibEntrySchema).optional().default([]),
      })
    )
    .optional()
    .default([]),
});
export type LibBookWithChapters = z.infer<typeof LibBookWithChaptersSchema>;

export const GetBookDetailResponseDataSchema = z.object({
  book: LibBookWithChaptersSchema,
  entity: z.record(z.unknown()).optional(),
  coverIllustration: LibIllustrationSchema.nullable().optional(),
});
export type GetBookDetailResponseData = z.infer<typeof GetBookDetailResponseDataSchema>;

export const GetBookDetailResponseSchema = ServiceResponseSchema(GetBookDetailResponseDataSchema);
export type GetBookDetailResponse = z.infer<typeof GetBookDetailResponseSchema>;

// =============================================================================
// GET CHAPTERS RESPONSE - Chapters with entity and illustrations
// =============================================================================

export const ChapterWithEntitySchema = z.object({
  chapter: LibChapterSchema,
  entity: z.record(z.unknown()).optional(),
  illustrations: z.array(LibIllustrationSchema).optional().default([]),
});
export type ChapterWithEntity = z.infer<typeof ChapterWithEntitySchema>;

export const GetChaptersResponseDataSchema = z.object({
  chapters: z.array(ChapterWithEntitySchema),
  total: z.number().optional(),
});
export type GetChaptersResponseData = z.infer<typeof GetChaptersResponseDataSchema>;

// =============================================================================
// GET ENTRIES RESPONSE - Entries with entity and illustrations
// =============================================================================

export const EntryWithEntitySchema = z.object({
  entry: LibEntrySchema,
  entity: z.record(z.unknown()).optional(),
  illustrations: z.array(LibIllustrationSchema).optional().default([]),
});
export type EntryWithEntity = z.infer<typeof EntryWithEntitySchema>;

export const GetEntriesResponseDataSchema = z.object({
  entries: z.array(EntryWithEntitySchema),
  total: z.number().optional(),
});
export type GetEntriesResponseData = z.infer<typeof GetEntriesResponseDataSchema>;

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

export function validateListBooksResponse(data: unknown): ListBooksResponseData {
  const result = ListBooksResponseSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid ListBooksResponse: ${result.error.message}`);
  }
  if (!result.data.success || !result.data.data) {
    throw new Error('Response indicates failure or missing data');
  }
  return result.data.data;
}

export function validateListChaptersResponse(data: unknown): ListChaptersResponseData {
  const result = ListChaptersResponseSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid ListChaptersResponse: ${result.error.message}`);
  }
  if (!result.data.success || !result.data.data) {
    throw new Error('Response indicates failure or missing data');
  }
  return result.data.data;
}

export function extractBooksFromResponse(responseData: unknown): LibBookWithIllustrations[] {
  if (Array.isArray(responseData)) {
    return responseData as LibBookWithIllustrations[];
  }
  if (responseData && typeof responseData === 'object' && 'books' in responseData) {
    return (responseData as { books?: LibBookWithIllustrations[] }).books || [];
  }
  return [];
}

export function safeExtractBooksFromApiResponse(fullResponse: unknown): LibBookWithIllustrations[] {
  if (!fullResponse || typeof fullResponse !== 'object') return [];

  const response = fullResponse as { success?: boolean; data?: unknown };
  if (!response.success || !response.data) return [];

  return extractBooksFromResponse(response.data);
}
