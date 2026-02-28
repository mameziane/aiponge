import { z } from 'zod';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { ApiResponseSchema, PaginatedResponseSchema, UUIDSchema, DateStringSchema, NullableStringSchema } from './base';

export const LibBookSchema = z.object({
  id: UUIDSchema,
  typeId: z.string(),
  userId: UUIDSchema.optional(),
  title: z.string(),
  subtitle: NullableStringSchema,
  description: NullableStringSchema,
  author: NullableStringSchema,
  language: z.string().optional(),
  visibility: z.enum(['draft', CONTENT_VISIBILITY.PERSONAL, CONTENT_VISIBILITY.SHARED]).optional(),
  status: z.string().optional(),
  isReadOnly: z.boolean().optional(),
  sortOrder: z.number().optional(),
  chapterCount: z.number().optional(),
  entryCount: z.number().optional(),
  tags: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const LibChapterSchema = z.object({
  id: UUIDSchema,
  bookId: UUIDSchema,
  userId: UUIDSchema.optional(),
  title: z.string(),
  description: NullableStringSchema,
  sortOrder: z.number().optional(),
  isLocked: z.boolean().optional(),
  unlockTrigger: NullableStringSchema,
  unlockedAt: DateStringSchema.optional().nullable(),
  entryCount: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const LibEntrySchema = z.object({
  id: UUIDSchema,
  chapterId: UUIDSchema,
  bookId: UUIDSchema.optional(),
  userId: UUIDSchema.optional(),
  content: z.string(),
  entryType: z.string().optional(),
  processingStatus: z.string().optional(),
  illustrationUrl: NullableStringSchema,
  chapterSortOrder: z.number().optional(),
  sortOrder: z.number().optional(),
  sourceTitle: NullableStringSchema,
  sourceAuthor: NullableStringSchema,
  sourceChapter: NullableStringSchema,
  attribution: NullableStringSchema,
  moodContext: NullableStringSchema,
  sentiment: NullableStringSchema,
  emotionalIntensity: z.number().optional().nullable(),
  tags: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  musicHints: z.record(z.unknown()).optional(),
  depthLevel: z.enum(['brief', 'standard', 'deep']).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  userDate: DateStringSchema.optional().nullable(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const LibIllustrationSchema = z.object({
  id: UUIDSchema,
  bookId: UUIDSchema.optional(),
  chapterId: UUIDSchema.optional(),
  entryId: UUIDSchema.optional(),
  url: z.string(),
  artworkUrl: NullableStringSchema,
  altText: NullableStringSchema,
  illustrationType: z.string().optional(),
  source: z.string().optional(),
  sortOrder: z.number().optional(),
  generationPrompt: NullableStringSchema,
  generationMetadata: z.record(z.unknown()).optional(),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  createdAt: DateStringSchema.optional(),
});

export const ListBooksResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(LibBookSchema.passthrough()),
    nextCursor: z.string().nullable().optional(),
    hasMore: z.boolean().optional(),
  }),
  timestamp: z.string().optional(),
});

export const ListChaptersResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    chapters: z.array(
      z
        .object({
          chapter: LibChapterSchema,
          entity: z.record(z.unknown()).optional(),
        })
        .passthrough()
    ),
    total: z.number().optional(),
  }),
  timestamp: z.string().optional(),
});

export const ListEntriesResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    entries: z.array(LibEntrySchema),
    total: z.number().optional(),
  }),
  timestamp: z.string().optional(),
});

export const CreateBookResponseSchema = ApiResponseSchema(LibBookSchema.passthrough());

export const BookWithEntityResponseDataSchema = z
  .object({
    book: LibBookSchema.passthrough(),
    entity: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const BookResponseSchema = ApiResponseSchema(BookWithEntityResponseDataSchema);
export const ChapterResponseSchema = ApiResponseSchema(LibChapterSchema);
export const EntryResponseSchema = ApiResponseSchema(LibEntrySchema);

// Book Blueprint - AI-generated book structure before becoming real entities
export const GeneratedBookBlueprintSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  chapters: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional().nullable(),
        entries: z
          .array(
            z.object({
              prompt: z.string().optional(),
              type: z.string().optional(),
              content: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .optional(),
});

export const BookGenerationAccessResponseSchema = z.object({
  success: z.literal(true),
  hasAccess: z.boolean(),
  message: z.string().optional(),
});

export const BookGenerationCreateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    requestId: z.string(),
    status: z.string(),
  }),
});

export const BookGenerationStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    requestId: z.string(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    blueprint: GeneratedBookBlueprintSchema.optional().nullable(),
    usedSystemPrompt: z.string().optional().nullable(),
    usedUserPrompt: z.string().optional().nullable(),
    error: z.string().optional().nullable(),
  }),
});

export const BookGenerationRegenerateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    requestId: z.string(),
    status: z.string(),
  }),
});

export const BookTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  isSystemType: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export const BookTypesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(BookTypeSchema),
});

export const LibraryExploreResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    books: z.array(LibBookSchema),
    total: z.number().optional(),
    hasMore: z.boolean().optional(),
  }),
});

export const BookmarkSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  bookId: UUIDSchema,
  chapterId: UUIDSchema.optional().nullable(),
  entryId: UUIDSchema.optional().nullable(),
  position: z.number().optional(),
  note: z.string().optional().nullable(),
  createdAt: DateStringSchema.optional(),
});

export const BookmarksResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(BookmarkSchema),
});

export const MyLibraryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    books: z.array(LibBookSchema).optional(),
    personalBooks: z.array(LibBookSchema).optional(),
    libraryBooks: z.array(LibBookSchema).optional(),
  }),
});

export const LibraryPrivateResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(LibBookSchema),
  total: z.number().optional(),
});

export const ShareToPublicResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      shared: z.boolean(),
      bookId: UUIDSchema.optional(),
    })
    .optional(),
  message: z.string().optional(),
});

export const MoveToPublicResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const AssignEntriesResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      assigned: z.number(),
      entryIds: z.array(UUIDSchema).optional(),
    })
    .optional(),
  message: z.string().optional(),
});

export const CreateEntryResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      id: UUIDSchema,
    })
    .or(LibEntrySchema),
});

export const UpdateEntryResponseSchema = z.object({
  success: z.literal(true),
  data: LibEntrySchema.optional(),
});

export const DeleteEntryResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const EntryIllustrationResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      image: LibIllustrationSchema.optional(),
    })
    .optional(),
  image: LibIllustrationSchema.optional(),
});

export const BookTemplatesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      chapters: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
          })
        )
        .optional(),
    })
  ),
});

export type LibBook = z.infer<typeof LibBookSchema>;
export type LibChapter = z.infer<typeof LibChapterSchema>;
export type LibEntry = z.infer<typeof LibEntrySchema>;
export type LibIllustration = z.infer<typeof LibIllustrationSchema>;
export type GeneratedBookBlueprint = z.infer<typeof GeneratedBookBlueprintSchema>;
export type BookType = z.infer<typeof BookTypeSchema>;
export type Bookmark = z.infer<typeof BookmarkSchema>;
