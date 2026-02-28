import { z } from 'zod';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { ApiResponseSchema, UUIDSchema, DateStringSchema, NullableStringSchema } from './base';

export const AlbumSchema = z.object({
  id: UUIDSchema,
  title: z.string(),
  userId: UUIDSchema.optional(),
  description: NullableStringSchema,
  genres: z.array(z.string()).optional(),
  artworkUrl: NullableStringSchema,
  releaseDate: DateStringSchema.optional().nullable(),
  type: z.string().optional(),
  totalTracks: z.number().optional(),
  totalDuration: z.number().optional(),
  isExplicit: z.boolean().optional(),
  visibility: z.enum(['draft', CONTENT_VISIBILITY.PERSONAL, CONTENT_VISIBILITY.SHARED]).optional(),
  chapterId: UUIDSchema.optional().nullable(),
  status: z.string().optional(),
  playCount: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const TrackSchema = z.object({
  id: UUIDSchema,
  title: z.string(),
  userId: UUIDSchema.optional(),
  albumId: UUIDSchema.optional().nullable(),
  duration: z.number().optional(),
  fileUrl: NullableStringSchema,
  artworkUrl: NullableStringSchema,
  lyricsId: UUIDSchema.optional().nullable(),
  hasSyncedLyrics: z.boolean().optional(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  trackNumber: z.number().optional().nullable(),
  generationNumber: z.number().optional().nullable(),
  status: z.string().optional(),
  quality: z.string().optional(),
  fileSize: z.number().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  isExplicit: z.boolean().optional(),
  playCount: z.number().optional(),
  likeCount: z.number().optional(),
  language: z.string().optional().nullable(),
  variantGroupId: UUIDSchema.optional().nullable(),
  sourceUserTrackId: UUIDSchema.optional().nullable(),
  generatedByUserId: UUIDSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const UserTrackSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  albumId: UUIDSchema.optional().nullable(),
  trackNumber: z.number().optional().nullable(),
  generationNumber: z.number().optional().nullable(),
  title: z.string(),
  fileUrl: NullableStringSchema,
  artworkUrl: NullableStringSchema,
  duration: z.number().optional(),
  fileSize: z.number().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  sourceType: z.string().optional(),
  generationRequestId: UUIDSchema.optional().nullable(),
  lyricsId: UUIDSchema.optional().nullable(),
  hasSyncedLyrics: z.boolean().optional(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  playCount: z.number().optional(),
  playOnDate: DateStringSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const UserAlbumSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  chapterId: UUIDSchema.optional().nullable(),
  title: z.string(),
  description: NullableStringSchema,
  artworkUrl: NullableStringSchema,
  totalTracks: z.number().optional(),
  totalDuration: z.number().optional(),
  type: z.string().optional(),
  releaseDate: DateStringSchema.optional().nullable(),
  isExplicit: z.boolean().optional(),
  playCount: z.number().optional(),
  mood: z.string().optional().nullable(),
  genres: z.array(z.string()).optional(),
  status: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const PlaylistSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  description: NullableStringSchema,
  userId: UUIDSchema.optional().nullable(),
  visibility: z.enum(['draft', CONTENT_VISIBILITY.PERSONAL, CONTENT_VISIBILITY.SHARED]).optional(),
  artworkUrl: NullableStringSchema,
  totalDuration: z.number().optional(),
  playCount: z.number().optional(),
  likeCount: z.number().optional(),
  followerCount: z.number().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional().nullable(),
  mood: z.string().optional().nullable(),
  genre: z.string().optional().nullable(),
  status: z.string().optional(),
  playlistType: z.string().optional(),
  isSystem: z.boolean().optional(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  smartKey: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const LyricsSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema.optional().nullable(), // Creator of the lyrics
  content: z.string(),
  syncedLines: z
    .array(
      z.object({
        startTime: z.number(),
        endTime: z.number(),
        text: z.string(),
        type: z.string().optional(),
      })
    )
    .optional()
    .nullable(),
  timedLyricsJson: z.unknown().optional().nullable(),
  clipId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  style: z.string().optional().nullable(),
  mood: z.string().optional().nullable(),
  language: z.string().optional(),
  themes: z.array(z.string()).optional(),
  hasStructureTags: z.boolean().optional(),
  aiProvider: z.string().optional().nullable(),
  aiModel: z.string().optional().nullable(),
  generationPrompt: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const MusicRequestSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  entryId: UUIDSchema.optional().nullable(),
  lyricsId: UUIDSchema.optional().nullable(),
  musicType: z.string(),
  prompt: z.string(),
  style: z.string().optional().nullable(),
  genre: z.string().optional().nullable(),
  mood: z.string().optional().nullable(),
  narrativeSeeds: z.array(z.string()).optional(),
  tempo: z.number().optional().nullable(),
  key: z.string().optional().nullable(),
  duration: z.number().optional().nullable(),
  culturalStyle: z.string().optional().nullable(),
  instrumentType: z.string().optional().nullable(),
  wellbeingPurpose: z.string().optional().nullable(),
  quality: z.string().optional(),
  priority: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  status: z.string(),
  errorMessage: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
  completedAt: DateStringSchema.optional().nullable(),
});

export const AlbumRequestSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  chapterId: UUIDSchema.optional().nullable(),
  chapterTitle: z.string().optional().nullable(),
  bookId: UUIDSchema.optional().nullable(),
  bookTitle: z.string().optional().nullable(),
  status: z.string(),
  phase: z.string(),
  subPhase: z.string().optional().nullable(),
  totalTracks: z.number(),
  currentTrack: z.number(),
  successfulTracks: z.number().optional(),
  failedTracks: z.number().optional(),
  percentComplete: z.number(),
  languageMode: z.string().optional(),
  targetLanguages: z.array(z.string()).optional(),
  generatedLanguages: z.array(z.string()).optional(),
  failedLanguages: z.array(z.string()).optional(),
  trackResults: z.array(z.record(z.unknown())).optional(),
  errorMessage: z.string().optional().nullable(),
  reservationId: z.string().optional().nullable(),
  creditCost: z.number().optional(),
  albumId: UUIDSchema.optional().nullable(),
  visibility: z.enum(['draft', CONTENT_VISIBILITY.PERSONAL, CONTENT_VISIBILITY.SHARED]).optional(),
  requestPayload: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const ListTracksResponseSchema = ApiResponseSchema(z.array(TrackSchema));
export const ListUserTracksResponseSchema = ApiResponseSchema(z.array(UserTrackSchema));
export const ListAlbumsResponseSchema = ApiResponseSchema(z.array(AlbumSchema));
export const ListUserAlbumsResponseSchema = ApiResponseSchema(z.array(UserAlbumSchema));
export const ListPlaylistsResponseSchema = ApiResponseSchema(z.array(PlaylistSchema));
export const ListAlbumRequestsResponseSchema = ApiResponseSchema(z.array(AlbumRequestSchema));

export const TrackResponseSchema = ApiResponseSchema(TrackSchema);
export const UserTrackResponseSchema = ApiResponseSchema(UserTrackSchema);
export const AlbumResponseSchema = ApiResponseSchema(AlbumSchema);
export const UserAlbumResponseSchema = ApiResponseSchema(UserAlbumSchema);
export const PlaylistResponseSchema = ApiResponseSchema(PlaylistSchema);
export const LyricsResponseSchema = ApiResponseSchema(LyricsSchema);

export const AddTracksToPlaylistResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z
    .object({
      added: z.number().optional(),
    })
    .optional(),
});

export const TrackArtworkResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      artworkUrl: z.string().optional(),
    })
    .optional(),
});

export type Album = z.infer<typeof AlbumSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type UserTrack = z.infer<typeof UserTrackSchema>;
export type UserAlbum = z.infer<typeof UserAlbumSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type Lyrics = z.infer<typeof LyricsSchema>;
export type MusicRequest = z.infer<typeof MusicRequestSchema>;
export type AlbumRequest = z.infer<typeof AlbumRequestSchema>;
