/**
 * API Input Validation Schemas
 *
 * Centralized Zod schemas for request validation.
 * These schemas are the single source of truth for API input validation.
 * Both frontend and backend should use these for consistent validation.
 */

import { z } from 'zod';
import { ContentVisibilitySchema, ContentVisibilityWithDefaultSchema } from '../common/index.js';

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

export const UuidSchema = z.string().uuid();

// =============================================================================
// ENTRIES SCHEMAS
// =============================================================================

export const CreateEntrySchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID').optional(),
  content: z
    .string()
    .min(1, 'Content cannot be empty')
    .max(5000, 'Content cannot exceed 5000 characters')
    .refine(val => val.trim().length > 0, {
      message: 'Content cannot be only whitespace',
    }),
  type: z.string().optional().default('general'),
  moodContext: z.string().optional(),
  triggerSource: z.string().optional(),
  chapterId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  userDate: z.string().datetime().optional(),
  illustrationUrl: z.string().url().nullable().optional(),
  isPrivate: z.boolean().optional(),
  autoAssignBookmarks: z.boolean().optional(),
});
export type CreateEntryInput = z.infer<typeof CreateEntrySchema>;

export const UpdateEntrySchema = z.object({
  content: z
    .string()
    .min(1, 'Content cannot be empty')
    .max(5000, 'Content cannot exceed 5000 characters')
    .refine(val => val.trim().length > 0, {
      message: 'Content cannot be only whitespace',
    })
    .optional(),
  type: z.string().optional(),
  moodContext: z.string().optional(),
  triggerSource: z.string().optional(),
  chapterId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  userDate: z.string().datetime().optional(),
  illustrationUrl: z.string().url().nullable().optional(),
});
export type UpdateEntryInput = z.infer<typeof UpdateEntrySchema>;

export const BatchAnalyzeSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  entryIds: z.array(z.string().uuid()).min(1, 'At least one entry ID is required').optional(),
  entries: z
    .array(
      z.object({
        content: z.string(),
        userId: z.string().uuid(),
      })
    )
    .optional(),
  analysisTypes: z.array(z.string()).optional(),
  analysisType: z.string().optional(),
  language: z.string().optional(),
});
export type BatchAnalyzeInput = z.infer<typeof BatchAnalyzeSchema>;

export const AddIllustrationSchema = z.object({
  url: z.string().url('Image URL must be a valid URL'),
});
export type AddIllustrationInput = z.infer<typeof AddIllustrationSchema>;

export const ReorderIllustrationsSchema = z.object({
  imageIds: z.array(z.string().uuid('Each image ID must be a valid UUID')).min(1).max(4),
});
export type ReorderIllustrationsInput = z.infer<typeof ReorderIllustrationsSchema>;

export const AddEntryImageSchema = AddIllustrationSchema;
export type AddEntryImageInput = AddIllustrationInput;

export const ReorderEntryImagesSchema = ReorderIllustrationsSchema;
export type ReorderEntryImagesInput = ReorderIllustrationsInput;

// =============================================================================
// ENTRY ANALYSIS SCHEMAS
// =============================================================================

export const EntryAnalysisResultSchema = z.object({
  id: z.string().uuid(),
  riskLevel: z.enum(['low', 'medium', 'high', 'crisis']),
  patterns: z.array(
    z.object({
      type: z.string(),
      confidence: z.number().min(0).max(1),
      evidence: z.array(z.string()),
    })
  ),
  recommendedFramework: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type EntryAnalysisResult = z.infer<typeof EntryAnalysisResultSchema>;

// =============================================================================
// REFLECTIONS SCHEMAS
// =============================================================================

export const CreateReflectionSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID').optional(),
  challengeQuestion: z
    .string()
    .min(1, 'Challenge question cannot be empty')
    .max(1000, 'Challenge question cannot exceed 1000 characters'),
  userResponse: z
    .string()
    .min(1, 'Response cannot be empty')
    .max(5000, 'Response cannot exceed 5000 characters')
    .refine(val => val.trim().length > 0, {
      message: 'Response cannot be only whitespace',
    })
    .optional(),
  followUpQuestions: z.array(z.string()).optional(),
  isBreakthrough: z.boolean().optional(),
  engagementLevel: z.number().int().min(0).max(10).optional(),
  responseTime: z.number().int().min(0).optional(),
});
export type CreateReflectionInput = z.infer<typeof CreateReflectionSchema>;

export const UpdateReflectionSchema = z.object({
  userResponse: z
    .string()
    .min(1, 'Response cannot be empty')
    .max(5000, 'Response cannot exceed 5000 characters')
    .refine(val => val.trim().length > 0, {
      message: 'Response cannot be only whitespace',
    })
    .optional(),
  followUpQuestions: z.array(z.string()).optional(),
  isBreakthrough: z.boolean().optional(),
  engagementLevel: z.number().int().min(0).max(10).optional(),
  responseTime: z.number().int().min(0).optional(),
});
export type UpdateReflectionInput = z.infer<typeof UpdateReflectionSchema>;

// =============================================================================
// CHAPTERS SCHEMAS
// =============================================================================

export const CreateChapterSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID').optional(),
  title: z.string().min(1, 'Title cannot be empty').max(255, 'Title cannot exceed 255 characters'),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateChapterInput = z.infer<typeof CreateChapterSchema>;

export const UpdateChapterSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(255, 'Title cannot exceed 255 characters').optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateChapterInput = z.infer<typeof UpdateChapterSchema>;

// =============================================================================
// MUSIC SCHEMAS
// =============================================================================

export const GenerateSongSchema = z.object({
  entryId: z.string().uuid('entryId must be a valid UUID').optional(),
  lyricsId: z.string().uuid('lyricsId must be a valid UUID').optional(),
  lyrics: z.string().min(1).max(10000).optional(),
  genre: z.string().optional(),
  mood: z.string().optional(),
  style: z.string().optional(),
  language: z.string().optional(),
  title: z.string().max(255).optional(),
});
export type GenerateSongInput = z.infer<typeof GenerateSongSchema>;

export const GenerateLyricsSchema = z.object({
  entryId: z.string().uuid('entryId must be a valid UUID').optional(),
  content: z.string().min(1, 'Content is required').max(10000).optional(),
  genre: z.string().optional(),
  mood: z.string().optional(),
  style: z.string().optional(),
  language: z.string().optional(),
});
export type GenerateLyricsInput = z.infer<typeof GenerateLyricsSchema>;

export const UpdateLyricsSchema = z.object({
  content: z.string().min(1, 'Content is required').max(10000).optional(),
  genre: z.string().optional(),
  mood: z.string().optional(),
  style: z.string().optional(),
  language: z.string().optional(),
});
export type UpdateLyricsInput = z.infer<typeof UpdateLyricsSchema>;

// =============================================================================
// BOOKS SCHEMAS
// =============================================================================

const ChapterEntrySchema = z.object({
  prompt: z.string().optional(),
  type: z.string().optional(),
  content: z.string().optional(),
  sources: z
    .array(
      z.object({
        author: z.string(),
        work: z.string().optional(),
      })
    )
    .optional(),
});

const ChapterSchema = z.object({
  title: z.string().min(1, 'Chapter title is required'),
  description: z.string().optional(),
  order: z.number().optional(),
  entries: z.array(ChapterEntrySchema).optional(),
});

export const CreateBookSchema = z.object({
  title: z.string().max(255, 'Title cannot exceed 255 characters').optional(),
  blueprintId: z.string().uuid('blueprintId must be a valid UUID').optional(),
  description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
  metadata: z.record(z.unknown()).optional(),
  chapters: z.array(ChapterSchema).optional(),
  generationMode: z.enum(['blueprint', 'book']).optional(),
});
export type CreateBookInput = z.infer<typeof CreateBookSchema>;

export const UpdateBookSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(255, 'Title cannot exceed 255 characters').optional(),
  description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateBookInput = z.infer<typeof UpdateBookSchema>;

export const CreateBookGenerationSchema = z.object({
  primaryGoal: z.string().min(10, 'Goal description must be at least 10 characters').max(5000),
  language: z.string().max(10).optional(),
  tone: z.enum(['supportive', 'challenging', 'neutral']).optional(),
  generationMode: z.enum(['blueprint', 'book']).optional(),
  depthLevel: z.enum(['brief', 'standard', 'deep']).optional(),
  bookTypeId: z.string().max(50).optional(),
});
export type CreateBookGenerationInput = z.infer<typeof CreateBookGenerationSchema>;

// =============================================================================
// PLAYLISTS SCHEMAS
// =============================================================================

export const CreatePlaylistSchema = z.object({
  name: z.string().min(1, 'Playlist name is required').max(255, 'Name cannot exceed 255 characters'),
  description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
  visibility: ContentVisibilityWithDefaultSchema.optional(),
  artworkUrl: z.string().url('Artwork URL must be valid').optional(),
  category: z.enum(['user', 'featured', 'algorithm']).optional(),
  icon: z.string().max(10).optional(),
  color: z
    .string()
    .max(20)
    .regex(/^#[0-9a-fA-F]{3,8}$/, 'Must be a valid hex color')
    .optional(),
  playlistType: z.enum(['manual', 'smart', 'hybrid']).optional(),
});
export type CreatePlaylistInput = z.infer<typeof CreatePlaylistSchema>;

export const UpdatePlaylistSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(255).optional(),
  description: z.string().max(1000).optional(),
  visibility: ContentVisibilitySchema.optional(),
  artworkUrl: z.string().url('Artwork URL must be valid').nullable().optional(),
  category: z.enum(['user', 'featured', 'algorithm']).nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
  color: z
    .string()
    .max(20)
    .regex(/^#[0-9a-fA-F]{3,8}$/, 'Must be a valid hex color')
    .nullable()
    .optional(),
  playlistType: z.enum(['manual', 'smart', 'hybrid']).nullable().optional(),
});
export type UpdatePlaylistInput = z.infer<typeof UpdatePlaylistSchema>;

export const AddToPlaylistSchema = z.object({
  trackId: z.string().uuid('trackId must be a valid UUID'),
});
export type AddToPlaylistInput = z.infer<typeof AddToPlaylistSchema>;

export const GeneratePlaylistArtworkSchema = z.object({
  style: z.string().max(100).optional(),
  mood: z.string().max(100).optional(),
});
export type GeneratePlaylistArtworkInput = z.infer<typeof GeneratePlaylistArtworkSchema>;

// =============================================================================
// PROFILE SCHEMAS
// =============================================================================

export const UpdateProfileSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100, 'Name cannot exceed 100 characters').optional(),
  displayName: z
    .string()
    .min(1, 'Display name cannot be empty')
    .max(100, 'Display name cannot exceed 100 characters')
    .optional(),
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
  avatar: z.string().url('Avatar URL must be valid').nullable().optional(),
  avatarUrl: z.string().url('Avatar URL must be valid').nullable().optional(),
  birthdate: z.string().max(10, 'Birthdate must be a valid date string').optional(),
  language: z.string().max(10, 'Language code cannot exceed 10 characters').optional(),
  timezone: z.string().max(50, 'Timezone cannot exceed 50 characters').optional(),
  preferences: z.record(z.unknown()).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// Base preferences fields schema
const PreferencesFieldsSchema = z.object({
  currentMood: z.string().optional(),
  languagePreference: z.string().optional(),
  notificationsEnabled: z.boolean().optional(),
  dailyReminderTime: z.string().optional(),
  musicGenre: z.string().optional(),
  musicPreferences: z.string().optional(),
  musicInstruments: z.array(z.string()).optional(),
  vocalGender: z.enum(['f', 'm']).nullable().optional(),
  languagePreferences: z.array(z.string()).optional(),
  styleWeight: z.number().min(0).max(1).optional(),
  negativeTags: z.string().max(500).optional(),
});

// Accept preferences either at root level OR nested under 'preferences' key
export const UpdatePreferencesSchema = z.union([
  // Nested format: { preferences: { ... } }
  z.object({
    preferences: PreferencesFieldsSchema,
  }),
  // Flat format: { currentMood: "...", ... }
  PreferencesFieldsSchema,
]);
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesSchema>;

export const UpdatePuzzleProgressSchema = z.object({
  puzzleId: z.string(),
  completed: z.boolean().optional(),
  progress: z.number().min(0).max(100).optional(),
  currentStep: z.number().optional(),
  answers: z.record(z.unknown()).optional(),
});
export type UpdatePuzzleProgressInput = z.infer<typeof UpdatePuzzleProgressSchema>;

// =============================================================================
// REMINDERS SCHEMAS
// =============================================================================

export const CreateReminderSchema = z.object({
  type: z.enum(['daily_reflection', 'journal_prompt', 'custom']),
  title: z.string().min(1, 'Title is required').max(255, 'Title cannot exceed 255 characters'),
  message: z.string().max(500, 'Message cannot exceed 500 characters').optional(),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'At least one day is required').optional(),
  isEnabled: z.boolean().optional().default(true),
});
export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;

export const UpdateReminderSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(255).optional(),
  message: z.string().max(500).optional(),
  scheduledTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format')
    .optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateReminderInput = z.infer<typeof UpdateReminderSchema>;

// =============================================================================
// MUSIC GENERATION EXTENDED SCHEMAS
// =============================================================================

export const MusicGenerateSchema = z
  .object({
    entryId: z.string().uuid('entryId must be a valid UUID').optional(),
    lyricsId: z.string().uuid('lyricsId must be a valid UUID').optional(),
    entryContent: z.string().max(10000, 'Entry snapshot cannot exceed 10000 characters').optional(),
    sourceArtworkUrl: z.string().url('Artwork URL must be valid').optional(),
    pictureContext: z.string().max(2000, 'Picture context cannot exceed 2000 characters').optional(),
    sourceEntryId: z.string().optional(),
    sourceText: z.string().max(10000).optional(),
    sourceReference: z.string().max(500).optional(),
    sourceBookTitle: z.string().max(500).optional(),
    genre: z.string().max(100).optional(),
    mood: z.string().max(100).optional(),
    style: z.string().max(100).optional(),
    culturalStyle: z.string().max(100).optional(),
    instrumentType: z.string().max(500).optional(),
    vocalGender: z.enum(['f', 'm']).optional(),
    language: z.string().max(10).optional(),
    targetLanguages: z.array(z.string().max(10)).optional(),
    isBilingual: z.boolean().optional(),
    negativeTags: z.string().max(500).optional(),
    styleWeight: z.number().min(0).max(1).optional(),
    quality: z.string().max(50).optional(),
    priority: z.string().max(50).optional(),
    musicType: z.string().max(50).optional(),
    artworkUrl: z.string().max(2000).optional(),
    chapterId: z.string().optional(),
    title: z.string().max(255).optional(),
    customInstructions: z.string().max(1000).optional(),
    useCredits: z.boolean().optional(),
    idempotencyKey: z.string().uuid().optional(),
  })
  .passthrough();
export type MusicGenerateInput = z.infer<typeof MusicGenerateSchema>;

// =============================================================================
// AUTH INPUT SCHEMAS
// =============================================================================

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  sessionId: z.string().uuid('Session ID must be a valid UUID'),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

// =============================================================================
// LYRICS CREATE INPUT SCHEMA (service-level create request)
// =============================================================================

export const CreateLyricsServiceSchema = z.object({
  userId: z.string().uuid().optional(),
  content: z.string().min(1),
  title: z.string().optional(),
  style: z.string().optional(),
  mood: z.string().optional(),
  language: z.string().optional(),
  themes: z.array(z.string()).optional(),
  hasStructureTags: z.boolean().optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  generationPrompt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  entryId: z.string().uuid().optional(),
  sourceType: z.string().optional(),
  visibility: ContentVisibilitySchema.optional(),
});
export type CreateLyricsServiceInput = z.infer<typeof CreateLyricsServiceSchema>;

// =============================================================================
// RISK ASSESSMENT REQUEST SCHEMA (API Gateway safety endpoint)
// =============================================================================

export const RiskAssessmentRequestSchema = z.object({
  text: z.string().min(1).max(10000),
  sourceType: z.enum(['entry', 'book', 'reflection', 'chat']).optional().default('entry'),
  sourceId: z.string().uuid().optional(),
  localAssessment: z
    .object({
      level: z.enum(['none', 'low', 'medium', 'high', 'critical']),
      score: z.number(),
      indicators: z.array(z.unknown()).optional(),
    })
    .optional(),
  context: z
    .object({
      previousAssessments: z.array(z.unknown()).optional(),
      recentMoodTrend: z.enum(['improving', 'stable', 'declining']).optional(),
    })
    .optional(),
});
export type RiskAssessmentRequestInput = z.infer<typeof RiskAssessmentRequestSchema>;

// =============================================================================
// DISCOVERY INPUT SCHEMAS (service registration & heartbeat)
// =============================================================================

export const ServiceDependencySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['hard', 'soft']).default('soft'),
  timeout: z.number().optional(),
  healthCheck: z.string().optional(),
  isRequired: z.boolean().optional(),
});
export type ServiceDependencyInput = z.infer<typeof ServiceDependencySchema>;

export const RegisterServiceSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  healthEndpoint: z.string().optional().default('/health'),
  metadata: z.record(z.unknown()).optional(),
  dependencies: z.array(ServiceDependencySchema).optional(),
});
export type RegisterServiceInput = z.infer<typeof RegisterServiceSchema>;

export const HeartbeatSchema = z.object({
  serviceId: z.string(),
});
export type HeartbeatInput = z.infer<typeof HeartbeatSchema>;

export const BatchedHeartbeatSchema = z.object({
  services: z.array(
    z.object({
      serviceId: z.string(),
      timestamp: z.number().optional(),
    })
  ),
  batchTimestamp: z.number().optional(),
});
export type BatchedHeartbeatInput = z.infer<typeof BatchedHeartbeatSchema>;

// =============================================================================
// LIBRARY CONTROLLER INPUT SCHEMAS (Books, Chapters, Entries, Illustrations)
// =============================================================================

export const LibSourceSchema = z.object({
  author: z.string(),
  work: z.string().optional(),
});
export type LibSourceInput = z.infer<typeof LibSourceSchema>;

export const LibTemplateEntrySchema = z.object({
  prompt: z.string().optional(),
  type: z.string().optional(),
  content: z.string().optional(),
  sources: z.array(LibSourceSchema).optional(),
  tags: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
});
export type LibTemplateEntryInput = z.infer<typeof LibTemplateEntrySchema>;

export const LibTemplateChapterSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  order: z.number().int().min(0).optional(),
  entries: z.array(LibTemplateEntrySchema).optional(),
});
export type LibTemplateChapterInput = z.infer<typeof LibTemplateChapterSchema>;

export const LibBookCreateSchema = z.object({
  typeId: z.string().min(1),
  title: z.string().min(1).max(255),
  subtitle: z.string().max(500).optional(),
  description: z.string().optional(),
  author: z.string().max(255).optional(),
  isReadOnly: z.boolean().optional(),
  category: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  visibility: ContentVisibilitySchema.optional(),
  chapters: z.array(LibTemplateChapterSchema).optional(),
});
export type LibBookCreateInput = z.infer<typeof LibBookCreateSchema>;

import { BookLifecycleSchema } from '../common/index.js';

export const LibBookUpdateSchema = LibBookCreateSchema.partial().extend({
  status: BookLifecycleSchema.optional(),
});
export type LibBookUpdateInput = z.infer<typeof LibBookUpdateSchema>;

export const LibChapterCreateSchema = z.object({
  bookId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isLocked: z.boolean().optional(),
  unlockTrigger: z.string().max(100).optional(),
});
export type LibChapterCreateInput = z.infer<typeof LibChapterCreateSchema>;

export const LibChapterUpdateSchema = LibChapterCreateSchema.partial().omit({ bookId: true });
export type LibChapterUpdateInput = z.infer<typeof LibChapterUpdateSchema>;

export const LibEntryCreateSchema = z.object({
  chapterId: z.string().uuid(),
  content: z.string().min(1),
  entryType: z.string().min(1).max(50),
  sortOrder: z.number().int().min(0).optional(),
  sourceTitle: z.string().max(255).optional(),
  sourceAuthor: z.string().max(255).optional(),
  sourceChapter: z.string().max(255).optional(),
  attribution: z.string().max(500).optional(),
  moodContext: z.string().max(100).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional(),
  emotionalIntensity: z.number().int().min(1).max(10).optional(),
  tags: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  musicHints: z
    .object({
      mood: z.string().optional(),
      tempo: z.string().optional(),
      genre: z.string().optional(),
    })
    .optional(),
  depthLevel: z.enum(['brief', 'standard', 'deep']).optional(),
  metadata: z.record(z.unknown()).optional(),
  userDate: z.string().datetime().optional(),
});
export type LibEntryCreateInput = z.infer<typeof LibEntryCreateSchema>;

export const LibEntryUpdateSchema = LibEntryCreateSchema.partial().omit({ chapterId: true });
export type LibEntryUpdateInput = z.infer<typeof LibEntryUpdateSchema>;

export const LibIllustrationCreateSchema = z.object({
  bookId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  entryId: z.string().uuid().optional(),
  url: z.string().url(),
  artworkUrl: z.string().url().optional(),
  altText: z.string().max(255).optional(),
  illustrationType: z.enum(['cover', 'chapter', 'entry', 'inline']),
  source: z.enum(['uploaded', 'ai_generated', 'stock']),
  sortOrder: z.number().int().min(0).optional(),
  generationPrompt: z.string().optional(),
  generationMetadata: z.record(z.unknown()).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});
export type LibIllustrationCreateInput = z.infer<typeof LibIllustrationCreateSchema>;

export const AutoAssignBookmarkSchema = z.object({
  content: z.string().min(1),
  sourceTitle: z.string().optional(),
  sourceAuthor: z.string().optional(),
  sourceChapter: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type AutoAssignBookmarkInput = z.infer<typeof AutoAssignBookmarkSchema>;

// =============================================================================
// SAFETY SCHEMAS (for internal use)
// =============================================================================

export const SafetyAnalyzeSchema = z.object({
  content: z.string().min(1, 'Content is required').max(50000, 'Content cannot exceed 50000 characters'),
  contentType: z.enum(['entry', 'journal', 'reflection', 'chat']),
  userId: z.string().uuid('userId must be a valid UUID'),
  metadata: z.record(z.unknown()).optional(),
});
export type SafetyAnalyzeInput = z.infer<typeof SafetyAnalyzeSchema>;

export const RiskAssessmentResponseSchema = z.object({
  level: z.enum(['low', 'medium', 'high', 'crisis']),
  indicators: z.array(z.string()).optional(),
  recommendedAction: z.string().optional(),
  requiresEscalation: z.boolean().optional(),
});
export type RiskAssessmentResponse = z.infer<typeof RiskAssessmentResponseSchema>;

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

export function validateInput<T extends z.ZodSchema>(schema: T, data: unknown): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    })),
  };
}
