/**
 * Library Repository Interface
 * Books, Chapters, Entries, Illustrations
 */

import { Book, InsertBook, Chapter, InsertChapter, Entry, InsertEntry, Illustration } from '@domains/library/types';

export interface EntryFilter {
  dateFrom?: Date | string;
  dateTo?: Date | string;
  entryType?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface ILibraryRepository {
  // Books
  createBook(book: InsertBook): Promise<Book>;
  findBookById(id: string): Promise<Book | null>;
  findBooksByUserId(userId: string): Promise<Book[]>;
  updateBook(id: string, data: Partial<Book>): Promise<Book>;
  deleteBook(id: string): Promise<void>;

  // Chapters
  createChapter(chapter: InsertChapter): Promise<Chapter>;
  findChapterById(id: string): Promise<Chapter | null>;
  findChaptersByBookId(bookId: string): Promise<Chapter[]>;
  updateChapter(id: string, data: Partial<Chapter>): Promise<Chapter>;
  deleteChapter(id: string): Promise<void>;

  // Entries
  createEntry(entry: InsertEntry): Promise<Entry>;
  findEntryById(id: string): Promise<Entry | null>;
  findEntriesByIds(ids: string[], userId?: string): Promise<Entry[]>;
  findEntriesByUserId(userId: string, limit?: number, offset?: number, bookId?: string): Promise<Entry[]>;
  countEntriesByUserId(userId: string, bookId?: string): Promise<number>;
  updateEntry(id: string, data: Partial<Entry>): Promise<Entry>;
  updateEntriesBatch(ids: string[], data: Partial<Entry>): Promise<number>;
  deleteEntry(id: string): Promise<void>;
  getEntriesByUser(userId: string, filter?: EntryFilter): Promise<Entry[]>;
  getMaxChapterSortOrder(chapterId: string): Promise<number>;

  // Illustrations
  addEntryIllustration(entryId: string, url: string): Promise<Illustration>;
  findEntryIllustrations(entryId: string): Promise<Illustration[]>;
  findEntryIllustrationsByEntryIds(entryIds: string[]): Promise<Map<string, Illustration[]>>;
  removeEntryIllustration(illustrationId: string): Promise<void>;
  reorderEntryIllustrations(entryId: string, illustrationIds: string[]): Promise<Illustration[]>;
}
