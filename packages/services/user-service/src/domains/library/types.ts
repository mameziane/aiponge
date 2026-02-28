export interface Book {
  id: string;
  typeId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  author: string | null;
  userId: string;
  isReadOnly: boolean;
  category: string | null;
  language: string | null;
  visibility: string | null;
  status: string | null;
  systemType: string | null;
  chapterCount: number;
  entryCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface InsertBook {
  typeId: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  author?: string | null;
  userId: string;
  isReadOnly?: boolean;
  category?: string | null;
  language?: string | null;
  visibility?: string | null;
  status?: string | null;
  systemType?: string | null;
}

export interface Chapter {
  id: string;
  bookId: string;
  userId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isLocked: boolean;
  unlockTrigger: string | null;
  unlockedAt: Date | null;
  entryCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface InsertChapter {
  bookId: string;
  userId: string;
  title: string;
  description?: string | null;
  sortOrder?: number;
  isLocked?: boolean;
  unlockTrigger?: string | null;
}

export interface Entry {
  id: string;
  chapterId: string;
  bookId: string;
  userId: string;
  content: string;
  entryType: string;
  processingStatus: string | null;
  illustrationUrl: string | null;
  chapterSortOrder: number | null;
  sortOrder: number;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceChapter: string | null;
  attribution: string | null;
  moodContext: string | null;
  sentiment: string | null;
  emotionalIntensity: number | null;
  tags: string[] | null;
  themes: string[] | null;
  musicHints: unknown;
  depthLevel: string | null;
  metadata: unknown;
  userDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface InsertEntry {
  chapterId: string;
  bookId: string;
  userId: string;
  content: string;
  entryType: string;
  processingStatus?: string | null;
  illustrationUrl?: string | null;
  chapterSortOrder?: number | null;
  sortOrder?: number;
  sourceTitle?: string | null;
  sourceAuthor?: string | null;
  sourceChapter?: string | null;
  attribution?: string | null;
  moodContext?: string | null;
  sentiment?: string | null;
  emotionalIntensity?: number | null;
  tags?: string[] | null;
  themes?: string[] | null;
  musicHints?: unknown;
  depthLevel?: string | null;
  metadata?: unknown;
  userDate?: Date | null;
}

export interface Illustration {
  id: string;
  bookId: string | null;
  chapterId: string | null;
  entryId: string | null;
  url: string;
  artworkUrl: string | null;
  altText: string | null;
  illustrationType: string;
  source: string;
  sortOrder: number;
  generationPrompt: string | null;
  generationMetadata: unknown;
  width: number | null;
  height: number | null;
  createdAt: Date;
  deletedAt: Date | null;
}

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

export { ENTRY_TYPES, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
