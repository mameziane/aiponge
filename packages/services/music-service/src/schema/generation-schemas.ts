import { z } from 'zod';

export const userGenerateSchema = z.object({
  prompt: z.string().nullish(),
  existingLyrics: z.string().nullish(),
  artworkPrompt: z.string().nullish(),
  style: z.string().nullish(),
  mood: z.string().nullish(),
  genres: z.array(z.string()).nullish(),
  albumId: z.string().uuid().nullish(),
  customInstrumental: z.boolean().nullish(),
  language: z.string().nullish(),
  playOnDate: z.string().datetime().nullish(),
  entryId: z.string().nullish(),
  entryContent: z
    .union([
      z.string(),
      z.object({
        content: z.string(),
        chapterId: z.string().nullable().optional(),
      }),
    ])
    .nullish(),
  lyricsId: z.string().nullish(),
  pictureContext: z.string().nullish(),
  sourceEntryId: z.string().nullish(),
  sourceText: z.string().nullish(),
  sourceReference: z.string().nullish(),
  sourceBookTitle: z.string().nullish(),
  userId: z.string().nullish(),
  musicType: z.string().nullish(),
  priority: z.string().nullish(),
  negativeTags: z.string().nullish(),
  styleWeight: z.number().nullish(),
  genre: z.string().nullish(),
  culturalStyle: z.string().nullish(),
  instrumentType: z.string().nullish(),
  vocalGender: z.enum(['f', 'm']).nullish(),
  artworkUrl: z.string().nullish(),
  culturalLanguages: z.array(z.string()).nullish(),
  isBilingual: z.boolean().nullish(),
  displayName: z.string().nullish(),
});

export type UserGenerateInput = z.infer<typeof userGenerateSchema>;

export interface UserGenerationRequest extends Omit<UserGenerateInput, 'playOnDate'> {
  userId: string;
  playOnDate?: Date;
  sessionId?: string;
}

export interface UserGenerationResult {
  success: boolean;
  trackId?: string;
  title?: string;
  fileUrl?: string;
  artworkUrl?: string;
  albumId?: string;
  lyricsId?: string | null;
  duration?: number;
  error?: string;
}

export const libraryGenerateSchema = z.object({
  prompt: z.string().nullish(),
  existingLyrics: z.string().nullish(),
  artworkPrompt: z.string().nullish(),
  style: z.string().nullish(),
  mood: z.string().nullish(),
  genres: z.array(z.string()).nullish(),
  albumId: z.string().uuid().nullish(),
  chapterId: z.string().nullish(),
  customInstrumental: z.boolean().nullish(),
  language: z.string().nullish(),
  entryId: z.string().nullish(),
  entryContent: z
    .union([
      z.string(),
      z.object({
        content: z.string(),
        chapterId: z.string().nullable().optional(),
      }),
    ])
    .nullish(),
  lyricsId: z.string().nullish(),
  pictureContext: z.string().nullish(),
  sourceEntryId: z.string().nullish(),
  sourceText: z.string().nullish(),
  sourceReference: z.string().nullish(),
  sourceBookTitle: z.string().nullish(),
  librarianUserId: z.string().nullish(),
  userId: z.string().nullish(),
  musicType: z.string().nullish(),
  priority: z.string().nullish(),
  negativeTags: z.string().nullish(),
  styleWeight: z.number().nullish(),
  genre: z.string().nullish(),
  culturalStyle: z.string().nullish(),
  instrumentType: z.string().nullish(),
  vocalGender: z.enum(['f', 'm']).nullish(),
  artworkUrl: z.string().nullish(),
  culturalLanguages: z.array(z.string()).nullish(),
  isBilingual: z.boolean().nullish(),
  displayName: z.string().nullish(),
});

export type LibraryGenerateInput = z.infer<typeof libraryGenerateSchema>;

export interface LibraryGenerationRequest extends LibraryGenerateInput {
  librarianUserId: string;
  sessionId?: string;
}

export interface LibraryGenerationResult {
  success: boolean;
  trackId?: string;
  title?: string;
  fileUrl?: string;
  artworkUrl?: string;
  albumId?: string;
  lyricsId?: string | null;
  duration?: number;
  error?: string;
}

export const MAX_ENTRIES_PER_ALBUM = 20;
export const MAX_TRACKS_PER_ALBUM = 20;
export const MAX_TOTAL_TRACKS_PER_USER_ALBUM = 140;

export const userAlbumGenerateSchema = z.object({
  chapterId: z.string().nullish(),
  chapterTitle: z.string().nullish(),
  bookId: z.string(),
  bookTitle: z.string(),
  bookType: z.string().nullish(),
  bookDescription: z.string().nullish(),
  bookCategory: z.string().nullish(),
  bookTags: z.array(z.string()).nullish(),
  bookThemes: z.array(z.string()).nullish(),
  entries: z
    .array(
      z.object({
        entryId: z.string(),
        content: z.string(),
        order: z.number(),
      })
    )
    .max(MAX_ENTRIES_PER_ALBUM, `Maximum ${MAX_ENTRIES_PER_ALBUM} entries per album`),
  style: z.string().nullish(),
  genre: z.string().nullish(),
  mood: z.string().nullish(),
  language: z.string().nullish(),
  culturalLanguages: z.array(z.string()).nullish(),
  languageMode: z.enum(['single', 'all']).nullish(),
  targetLanguages: z.array(z.string()).nullish(),
  culturalStyle: z.string().nullish(),
  instrumentType: z.string().nullish(),
  negativeTags: z.string().nullish(),
  vocalGender: z.enum(['f', 'm']).nullish(),
  preCreatedAlbumId: z.string().uuid().nullish(),
  userId: z.string().nullish(),
  reservationId: z.string().nullish(),
  creditCost: z.number().nullish(),
  styleWeight: z.number().nullish(),
  displayName: z.string().nullish(),
});

export type UserAlbumGenerateInput = z.infer<typeof userAlbumGenerateSchema>;

export const libraryAlbumGenerateSchema = z.object({
  chapterId: z.string().nullish(),
  chapterTitle: z.string().nullish(),
  bookId: z.string(),
  bookTitle: z.string(),
  bookType: z.string().nullish(),
  bookDescription: z.string().nullish(),
  bookCategory: z.string().nullish(),
  bookTags: z.array(z.string()).nullish(),
  bookThemes: z.array(z.string()).nullish(),
  entries: z
    .array(
      z.object({
        entryId: z.string(),
        content: z.string(),
        order: z.number(),
      })
    )
    .max(MAX_ENTRIES_PER_ALBUM, `Maximum ${MAX_ENTRIES_PER_ALBUM} entries per album`),
  style: z.string().nullish(),
  genre: z.string().nullish(),
  mood: z.string().nullish(),
  language: z.string().nullish(),
  culturalLanguages: z.array(z.string()).nullish(),
  languageMode: z.enum(['single', 'all']).nullish(),
  targetLanguages: z.array(z.string()).nullish(),
  culturalStyle: z.string().nullish(),
  instrumentType: z.string().nullish(),
  negativeTags: z.string().nullish(),
  vocalGender: z.enum(['f', 'm']).nullish(),
  preCreatedAlbumId: z.string().uuid().nullish(),
  userId: z.string().nullish(),
  reservationId: z.string().nullish(),
  creditCost: z.number().nullish(),
  styleWeight: z.number().nullish(),
  displayName: z.string().nullish(),
});

export type LibraryAlbumGenerateInput = z.infer<typeof libraryAlbumGenerateSchema>;
