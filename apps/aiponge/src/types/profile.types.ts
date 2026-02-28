/**
 * Reflect Screen Type Definitions
 * Shared types for member profile data, entries, and insights
 */

import { type BookTypeId, GenerationMode, BOOK_TYPES, BookTypeConfig } from '../constants/bookTypes';
import {
  CONTENT_VISIBILITY,
  BOOK_TYPE_IDS,
  ENTRY_TYPES as _ENTRY_TYPES,
  SENTIMENTS,
  type LibBook as _LibBook,
  type LibChapter as _LibChapter,
  type LibEntry as _LibEntry,
  type LibEntryType as _LibEntryType,
  type LibSentiment as _LibSentiment,
  type LibBookType as _LibBookType,
  type LibBookVisibility as _LibBookVisibility,
  type LibBookStatus as _LibBookStatus,
  type LibIllustration as _LibIllustration,
  type LibIllustrationType as _LibIllustrationType,
  type LibIllustrationSource as _LibIllustrationSource,
  type LibBookWithChapters as _LibBookWithChapters,
  type GetBookDetailResponseData as _GetBookDetailResponseData,
  type ChapterWithEntity as _ChapterWithEntity,
  type EntryWithEntity as _EntryWithEntity,
} from '@aiponge/shared-contracts';

export interface ProfileData {
  id: string;
  userId: string;
  email: string;
  profile: {
    name?: string;
    bio?: string;
    birthdate?: string;
  };
  preferences: {
    notifications?: boolean;
    visibility?: 'private' | 'public';
    theme?: 'auto' | 'light' | 'dark';
    musicPreferences?: string;
    musicGenre?: string;
    languagePreference?: string;
    currentMood?: string;
    musicInstruments?: string[];
    vocalGender?: 'f' | 'm' | null;
  };
  stats: {
    totalInsights: number;
    totalReflections: number;
    totalEntries: number;
  };
}

export interface Book {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  coverIllustrationUrl?: string | null;
  sortOrder: number;
  isDefault: boolean;
  typeId?: BookTypeId | null;
  generationMode?: GenerationMode | null;
  isReadOnly?: boolean;
  author?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get the BookTypeConfig for a book, using typeId if available
 * @param book - The book to get type config for
 * @param defaultTypeId - Default type if typeId is not set
 * @returns BookTypeConfig for the book
 */
export function getBookTypeConfig(book: Book, defaultTypeId: BookTypeId = BOOK_TYPE_IDS.PERSONAL): BookTypeConfig {
  if (book.typeId) {
    return BOOK_TYPES[book.typeId];
  }
  return BOOK_TYPES[defaultTypeId];
}

/**
 * Get the BookTypeId for a book, using typeId if available or falling back to default
 */
export function getBookTypeId(book: Book, defaultTypeId: BookTypeId = BOOK_TYPE_IDS.PERSONAL): BookTypeId {
  if (book.typeId) {
    return book.typeId;
  }
  return defaultTypeId;
}

export interface EntryChapter {
  id: string;
  userId: string;
  bookId?: string | null;
  title: string;
  sortOrder: number;
  isLocked?: boolean;
  unlockTrigger?: string | null;
  unlockedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntryMetadata {
  emotionalTone?: string;
  keyThemes?: string[];
  suggestedReflections?: string[];
  aiAnalysis?: string;
  [key: string]: unknown;
}

export interface EntryImage {
  id: string;
  entryId: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

export interface Source {
  author: string;
  work?: string;
  era?: string;
  tradition?: string;
}

export type DepthLevel = 'brief' | 'standard' | 'deep';

export interface Entry {
  id: string;
  userId: string;
  content: string;
  type: string;
  moodContext?: string;
  sentiment?: string;
  emotionalIntensity?: number;
  emotionalState?: 0 | 1 | 2; // 0=negative, 1=neutral, 2=positive
  emotionalStateLabel?: string;
  clarityLevel?: string;
  tags: string[];
  metadata: EntryMetadata;
  chapterId?: string | null;
  chapterSortOrder?: number | null;
  illustrationUrl?: string | null;
  illustrations?: EntryImage[];
  sources?: Source[] | null; // For book mode: citations
  depthLevel?: DepthLevel | null; // For book entries
  userDate?: string; // User-selected date for the entry
  createdAt: string;
  updatedAt: string;
}

export interface Insight {
  id: string;
  userId: string;
  entryId?: string;
  type: string;
  title: string;
  content: string;
  confidence?: number;
  category?: string;
  themes: string[];
  actionable: boolean;
  priority: number;
  aiProvider?: string;
  aiModel?: string;
  generatedAt: string;
  createdAt: string;
}

export interface Reflection {
  id: string;
  userId: string;
  challengeQuestion: string;
  userResponse?: string;
  isBreakthrough: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReminderType = 'morning' | 'evening' | 'custom';
export type ReminderFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface BookReminder {
  id: string;
  userId: string;
  type: ReminderType;
  title: string;
  prompt?: string;
  time: string;
  daysOfWeek: number[];
  enabled: boolean;
  linkedTrackId?: string;
  linkedTrackTitle?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookReminderInput {
  type: ReminderType;
  title: string;
  prompt?: string;
  time: string;
  daysOfWeek: number[];
  enabled: boolean;
  linkedTrackId?: string;
}

// ============================================
// UNIFIED LIBRARY TYPES (Book model)
// Single Source of Truth: @aiponge/shared-contracts/api/library
// ============================================

export type LibBook = _LibBook;
export type LibChapter = _LibChapter;
export type LibEntry = _LibEntry;
export type LibEntryType = _LibEntryType;
export type LibSentiment = _LibSentiment;
export type LibBookType = _LibBookType;
export type LibBookVisibility = _LibBookVisibility;
export type LibBookStatus = _LibBookStatus;
export type LibIllustration = _LibIllustration;
export type LibIllustrationType = _LibIllustrationType;
export type LibIllustrationSource = _LibIllustrationSource;
export type LibBookWithChapters = _LibBookWithChapters;
export type GetBookDetailResponseData = _GetBookDetailResponseData;
export type ChapterWithEntity = _ChapterWithEntity;
export type EntryWithEntity = _EntryWithEntity;
export const ENTRY_TYPES = _ENTRY_TYPES;

export type LibBookTypeId = BookTypeId;

export interface LibUserLibrary {
  id: string;
  userId: string;
  bookId: string;
  lastChapterId?: string | null;
  lastEntryId?: string | null;
  progressPercent: number;
  isCompleted: boolean;
  addedAt: string;
  lastReadAt: string;
  book?: LibBook;
}

export interface CreateLibBookInput {
  typeId: LibBookTypeId;
  title: string;
  author?: string;
  description?: string;
  language?: string;
  category?: string;
  era?: string;
  tradition?: string;
  visibility?: LibBookVisibility;
  tags?: string[];
  themes?: string[];
}

export interface CreateLibChapterInput {
  bookId: string;
  title: string;
  description?: string;
  sortOrder?: number;
}

export interface CreateLibEntryInput {
  chapterId: string;
  content: string;
  entryType: LibEntryType;
  sortOrder?: number;
  sourceTitle?: string;
  sourceAuthor?: string;
  sourceChapter?: string;
  attribution?: string;
  moodContext?: string;
  sentiment?: LibSentiment;
  emotionalIntensity?: number;
  tags?: string[];
  themes?: string[];
  depthLevel?: DepthLevel;
  userDate?: string;
}

export function libBookToBook(libBook: LibBook): Book {
  const metadata = (libBook.metadata as Record<string, unknown>) || {};
  return {
    id: libBook.id,
    userId: libBook.userId || '',
    title: libBook.title,
    description: libBook.description || null,
    coverIllustrationUrl: null,
    author: libBook.author || null,
    sortOrder: libBook.sortOrder || 0,
    isDefault: metadata.isDefault === true,
    generationMode: (metadata.generationMode as GenerationMode) || 'blueprint',
    isReadOnly: metadata.isReadOnly === true,
    createdAt: libBook.createdAt || new Date().toISOString(),
    updatedAt: libBook.updatedAt || new Date().toISOString(),
  };
}

export function bookToLibBook(
  book: Book,
  typeId: LibBookTypeId = BOOK_TYPE_IDS.PERSONAL
): CreateLibBookInput & { sortOrder?: number; metadata?: Record<string, unknown> } {
  return {
    typeId,
    title: book.title,
    author: book.author || undefined,
    description: book.description || undefined,
    visibility: CONTENT_VISIBILITY.PERSONAL,
    tags: [],
    themes: [],
    sortOrder: book.sortOrder,
    metadata: {
      isDefault: book.isDefault,
      generationMode: book.generationMode || 'blueprint',
      isReadOnly: book.isReadOnly,
    },
  };
}

export function libChapterToEntryChapter(chapter: LibChapter, userId: string): EntryChapter {
  const metadata = (chapter.metadata as Record<string, unknown>) || {};
  return {
    id: chapter.id,
    userId,
    bookId: chapter.bookId || null,
    title: chapter.title,
    sortOrder: chapter.sortOrder || 0,
    isLocked: metadata.isLocked === true,
    unlockTrigger: (metadata.unlockTrigger as string) || null,
    unlockedAt: (metadata.unlockedAt as string) || null,
    createdAt: chapter.createdAt || new Date().toISOString(),
    updatedAt: chapter.updatedAt || new Date().toISOString(),
  };
}

export function entryChapterToLibChapter(
  chapter: EntryChapter
): CreateLibChapterInput & { metadata?: Record<string, unknown> } {
  return {
    bookId: chapter.bookId || '',
    title: chapter.title,
    sortOrder: chapter.sortOrder,
    metadata: {
      isLocked: chapter.isLocked,
      unlockTrigger: chapter.unlockTrigger,
      unlockedAt: chapter.unlockedAt,
    },
  };
}

export function libEntryToEntry(entry: LibEntry, userId: string): Entry {
  const metadata = (entry.metadata as Record<string, unknown>) || {};
  return {
    id: entry.id,
    userId,
    content: entry.content,
    type: entry.entryType || 'note', // Entry.type ← LibEntry.entryType (intentional rename for display layer)
    moodContext: entry.moodContext || undefined,
    sentiment: entry.sentiment || undefined,
    emotionalIntensity: entry.emotionalIntensity ?? undefined,
    clarityLevel: (metadata.clarityLevel as string) || undefined,
    tags: entry.tags || [],
    metadata: {
      emotionalTone: (metadata.emotionalTone as string) || undefined,
      keyThemes: entry.themes || [],
      suggestedReflections: (metadata.suggestedReflections as string[]) || undefined,
      aiAnalysis: (metadata.aiAnalysis as string) || undefined,
      ...metadata,
    },
    chapterId: entry.chapterId || null,
    chapterSortOrder: entry.sortOrder || 0,
    illustrationUrl: (metadata.illustrationUrl as string) || null,
    illustrations: (metadata.illustrations as EntryImage[]) || undefined,
    sources: (metadata.sources as Source[]) || null,
    depthLevel: (entry.depthLevel as DepthLevel) || null,
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

const VALID_ENTRY_TYPES: string[] = Object.values(ENTRY_TYPES);

const VALID_SENTIMENTS: LibSentiment[] = Object.values(SENTIMENTS) as LibSentiment[];

function validateEntryType(type: string): LibEntryType {
  if (VALID_ENTRY_TYPES.includes(type as LibEntryType)) {
    return type as LibEntryType;
  }
  return 'note';
}

function validateSentiment(sentiment: string | undefined): LibSentiment | undefined {
  if (sentiment && VALID_SENTIMENTS.includes(sentiment as LibSentiment)) {
    return sentiment as LibSentiment;
  }
  return undefined;
}

export function entryToLibEntry(
  entry: Entry,
  chapterId: string
): CreateLibEntryInput & { metadata?: Record<string, unknown> } {
  return {
    chapterId,
    content: entry.content,
    entryType: validateEntryType(entry.type), // LibEntry.entryType ← Entry.type (reverse mapping)
    sortOrder: entry.chapterSortOrder ?? undefined,
    moodContext: entry.moodContext,
    sentiment: validateSentiment(entry.sentiment),
    emotionalIntensity: entry.emotionalIntensity,
    tags: entry.tags,
    themes: (entry.metadata?.keyThemes as string[]) || [],
    depthLevel: entry.depthLevel || undefined,
    metadata: {
      clarityLevel: entry.clarityLevel,
      emotionalTone: entry.metadata?.emotionalTone,
      suggestedReflections: entry.metadata?.suggestedReflections,
      aiAnalysis: entry.metadata?.aiAnalysis,
      illustrationUrl: entry.illustrationUrl,
      illustrations: entry.illustrations,
      sources: entry.sources,
      originalType: entry.type,
    },
  };
}
