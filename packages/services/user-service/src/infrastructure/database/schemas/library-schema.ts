/**
 * Unified Library Schema
 * Consolidates books, chapters, entries, illustrations, and book types
 * All tables use the lib_ prefix
 */

import {
  pgTable,
  varchar,
  integer,
  timestamp,
  text,
  uuid,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './user-schema';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

// ======================================
// BOOK TYPES - Template definitions for book generation
// ======================================

export const libBookTypes = pgTable('lib_book_types', {
  id: varchar('id', { length: 50 }).primaryKey(), // e.g. 'personal', 'wisdom', 'quotes', 'scientific', 'memoir', etc.
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }), // UI grouping: personal_reflection, creative_writing, story_identity, etc.
  promptTemplateId: varchar('prompt_template_id', { length: 100 }), // References aic_prompt_templates.id
  defaultSettings: jsonb('default_settings').default('{}'), // Default chapter structure, etc.
  iconName: varchar('icon_name', { length: 50 }), // UI icon identifier
  isUserCreatable: boolean('is_user_creatable').default(true).notNull(), // Can users create this type?
  isEditable: boolean('is_editable').default(true).notNull(), // Can content be edited after creation?
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ======================================
// BOOKS - Unified container for all content types
// ======================================

export const libBooks = pgTable(
  'lib_books',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    typeId: varchar('type_id', { length: 50 })
      .notNull()
      .references(() => libBookTypes.id),
    title: varchar('title', { length: 255 }).notNull(),
    subtitle: varchar('subtitle', { length: 500 }),
    description: text('description'),
    author: varchar('author', { length: 255 }), // Original author for shared books, user name for personal books
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isReadOnly: boolean('is_read_only').default(false).notNull(), // Prevents editing

    // Metadata
    category: varchar('category', { length: 100 }), // anxiety, growth, purpose, etc.
    language: varchar('language', { length: 10 }).default('en'),

    // Visibility and status (creator-member content model)
    // Visibility: personal (private to creator/members), shared (visible to all followers), public (visible to everyone)
    // Status: draft (work-in-progress), active, published, archived
    visibility: varchar('visibility', { length: 20 }).default(CONTENT_VISIBILITY.PERSONAL),
    status: varchar('status', { length: 20 }).default('active'), // draft, active, published, archived

    // System book type (for auto-provisioned books like Bookmarks)
    systemType: varchar('system_type', { length: 50 }),

    // Counters
    chapterCount: integer('chapter_count').default(0).notNull(),
    entryCount: integer('entry_count').default(0).notNull(),

    // Timestamps
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    typeIdIdx: index('lib_books_type_id_idx').on(table.typeId),
    userIdIdx: index('lib_books_user_id_idx').on(table.userId),
    categoryIdx: index('lib_books_category_idx').on(table.category),
    visibilityIdx: index('lib_books_visibility_idx').on(table.visibility),
    statusIdx: index('lib_books_status_idx').on(table.status),
    systemTypeIdx: index('lib_books_system_type_idx').on(table.userId, table.systemType),
    userTitleUnique: uniqueIndex('lib_books_user_title_unique').on(table.userId, table.title),
    userSystemTypeUnique: uniqueIndex('lib_books_user_system_type_unique')
      .on(table.userId, table.systemType)
      .where(sql`system_type IS NOT NULL`),
    activeIdx: index('idx_lib_books_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
    cursorPaginationIdx: index('idx_lib_books_cursor_pagination')
      .on(table.createdAt, table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// ======================================
// CHAPTERS - Sections within books
// ======================================

export const libChapters = pgTable(
  'lib_chapters',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    bookId: uuid('book_id')
      .notNull()
      .references(() => libBooks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),

    // Progressive unlock (for gamification)
    isLocked: boolean('is_locked').default(false).notNull(),
    unlockTrigger: varchar('unlock_trigger', { length: 100 }), // Event that unlocks
    unlockedAt: timestamp('unlocked_at'),

    // Counters
    entryCount: integer('entry_count').default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    bookIdIdx: index('lib_chapters_book_id_idx').on(table.bookId),
    userIdIdx: index('lib_chapters_user_id_idx').on(table.userId),
    sortOrderIdx: index('lib_chapters_sort_order_idx').on(table.bookId, table.sortOrder),
    bookTitleUnique: uniqueIndex('lib_chapters_book_title_unique').on(table.bookId, table.title),
    activeIdx: index('idx_lib_chapters_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// ======================================
// ENTRIES - Content within chapters (reflections, quotes, notes, etc.)
// ======================================

export const libEntries = pgTable(
  'lib_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => libChapters.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => libBooks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Content
    content: text('content').notNull(),
    entryType: varchar('entry_type', { length: 50 }).notNull(), // reflection, bookmark, quote, note, insight

    // Processing status for AI analysis
    processingStatus: varchar('processing_status', { length: 50 }).default('pending'), // pending, processing, completed, failed

    // Primary illustration URL (additional illustrations in lib_illustrations table)
    illustrationUrl: varchar('illustration_url', { length: 512 }),

    // Chapter sort order (for cross-chapter reordering)
    chapterSortOrder: integer('chapter_sort_order').default(0),

    // Ordering
    sortOrder: integer('sort_order').notNull().default(0),

    // Source attribution (for bookmarks/quotes)
    sourceTitle: varchar('source_title', { length: 255 }), // Original book title
    sourceAuthor: varchar('source_author', { length: 255 }), // Original author
    sourceChapter: varchar('source_chapter', { length: 255 }), // Original chapter
    attribution: varchar('attribution', { length: 500 }), // Full attribution string

    // Emotional/contextual metadata
    moodContext: varchar('mood_context', { length: 100 }),
    sentiment: varchar('sentiment', { length: 50 }), // positive, negative, neutral, mixed
    emotionalIntensity: integer('emotional_intensity'),

    // Tags and themes
    tags: text('tags')
      .array()
      .default(sql`'{}'::text[]`),
    themes: text('themes')
      .array()
      .default(sql`'{}'::text[]`),

    // AI/music generation hints
    musicHints: jsonb('music_hints').default('{}'),
    depthLevel: varchar('depth_level', { length: 20 }), // 'brief' | 'standard' | 'deep'

    // Flexible metadata
    metadata: jsonb('metadata').default('{}'),

    // User-selectable date (different from createdAt)
    userDate: timestamp('user_date'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    chapterIdIdx: index('lib_entries_chapter_id_idx').on(table.chapterId),
    bookIdIdx: index('lib_entries_book_id_idx').on(table.bookId),
    userIdIdx: index('lib_entries_user_id_idx').on(table.userId),
    entryTypeIdx: index('lib_entries_entry_type_idx').on(table.entryType),
    sortOrderIdx: index('lib_entries_sort_order_idx').on(table.chapterId, table.sortOrder),
    createdAtIdx: index('lib_entries_created_at_idx').on(table.createdAt),
    processingStatusIdx: index('lib_entries_processing_status_idx').on(table.processingStatus),
    chapterSortUnique: uniqueIndex('lib_entries_chapter_sort_unique').on(table.chapterId, table.sortOrder),
    userCreatedAtIdx: index('lib_entries_user_created_at_idx').on(table.userId, table.createdAt),
    // NOTE: JSONB expression index for efficient duplicate detection when promoting entries
    // Run manually: CREATE INDEX IF NOT EXISTS lib_entries_source_entry_id_idx ON lib_entries ((metadata->>'sourceEntryId')) WHERE metadata->>'sourceEntryId' IS NOT NULL;
    activeIdx: index('idx_lib_entries_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// ======================================
// ILLUSTRATIONS - Images at any level
// ======================================

export const libIllustrations = pgTable(
  'lib_illustrations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Polymorphic attachment - only one should be set
    bookId: uuid('book_id').references(() => libBooks.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id').references(() => libChapters.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id').references(() => libEntries.id, { onDelete: 'cascade' }),

    // Image data
    url: varchar('url', { length: 512 }).notNull(),
    artworkUrl: varchar('thumbnail_url', { length: 512 }),
    altText: varchar('alt_text', { length: 255 }),

    // Type and source
    illustrationType: varchar('illustration_type', { length: 50 }).notNull(), // 'cover', 'chapter', 'entry', 'inline'
    source: varchar('source', { length: 50 }).notNull(), // 'uploaded', 'ai_generated', 'stock'

    // Ordering for multiple images
    sortOrder: integer('sort_order').default(0).notNull(),

    // AI generation metadata
    generationPrompt: text('generation_prompt'),
    generationMetadata: jsonb('generation_metadata').default('{}'),

    // Dimensions
    width: integer('width'),
    height: integer('height'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    bookIdIdx: index('lib_illustrations_book_id_idx').on(table.bookId),
    chapterIdIdx: index('lib_illustrations_chapter_id_idx').on(table.chapterId),
    entryIdIdx: index('lib_illustrations_entry_id_idx').on(table.entryId),
    typeIdx: index('lib_illustrations_type_idx').on(table.illustrationType),
    oneParentCheck: sql`CHECK (
      (CASE WHEN book_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN chapter_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN entry_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )`,
    activeIdx: index('idx_lib_illustrations_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// ======================================
// USER LIBRARY - User's saved books and reading progress
// ======================================

export const libUserLibrary = pgTable(
  'lib_user_library',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => libBooks.id, { onDelete: 'cascade' }),

    // Reading progress
    lastChapterId: uuid('last_chapter_id'),
    lastEntryId: uuid('last_entry_id'),
    currentPageIndex: integer('current_page_index').default(0),
    readingProgress: integer('reading_progress').default(0), // Percentage 0-100

    // User preferences
    fontSize: varchar('font_size', { length: 10 }).default('m'),

    // Timestamps
    addedAt: timestamp('added_at').defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('lib_user_library_user_id_idx').on(table.userId),
    bookIdIdx: index('lib_user_library_book_id_idx').on(table.bookId),
    userBookUnique: uniqueIndex('lib_user_library_user_book_unique').on(table.userId, table.bookId),
    activeIdx: index('idx_lib_user_library_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// ======================================
// ZOD SCHEMAS & TYPES
// ======================================

// BookType schemas
export const insertBookTypeSchema = createInsertSchema(libBookTypes).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBookType = z.infer<typeof insertBookTypeSchema>;
export type BookType = typeof libBookTypes.$inferSelect;

// Book schemas
export const insertBookSchema = createInsertSchema(libBooks).omit({
  id: true,
  chapterCount: true,
  entryCount: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof libBooks.$inferSelect;

// Chapter schemas
export const insertChapterSchema = createInsertSchema(libChapters).omit({
  id: true,
  entryCount: true,
  unlockedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertChapter = z.infer<typeof insertChapterSchema>;
export type Chapter = typeof libChapters.$inferSelect;

// Entry schemas
export const insertEntrySchema = createInsertSchema(libEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type Entry = typeof libEntries.$inferSelect;

// Illustration schemas
export const insertIllustrationSchema = createInsertSchema(libIllustrations).omit({
  id: true,
  createdAt: true,
});
export type InsertIllustration = z.infer<typeof insertIllustrationSchema>;
export type Illustration = typeof libIllustrations.$inferSelect;

// User Library schemas
export const insertUserLibrarySchema = createInsertSchema(libUserLibrary).omit({
  id: true,
  addedAt: true,
});
export type InsertUserLibrary = z.infer<typeof insertUserLibrarySchema>;
export type UserLibrary = typeof libUserLibrary.$inferSelect;

// ======================================
// CONSTANTS
// Values must match shared contracts (packages/shared/contracts/src/api/library.ts)
// ======================================

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
} as const;

export type BookTypeId = (typeof BOOK_TYPE_IDS)[keyof typeof BOOK_TYPE_IDS];

export { ENTRY_TYPES } from '@aiponge/shared-contracts';

export const ILLUSTRATION_TYPES = {
  COVER: 'cover',
  CHAPTER: 'chapter',
  ENTRY: 'entry',
  INLINE: 'inline',
} as const;

export const ILLUSTRATION_SOURCES = {
  UPLOADED: 'uploaded',
  AI_GENERATED: 'ai_generated',
  STOCK: 'stock',
} as const;

export { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

export { BOOK_LIFECYCLE as BOOK_STATUS } from '@aiponge/shared-contracts';
