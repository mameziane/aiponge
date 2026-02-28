/**
 * Library Repository - Barrel re-export
 * Individual repositories are in the library/ subdirectory
 */

export { BookTypeRepository, BookRepository } from './library/BookRepository';
export type { CreateBookData, UpdateBookData, BookFilters, BookWithCounts } from './library/BookRepository';

export { ChapterRepository } from './library/ChapterRepository';
export type { CreateChapterData, UpdateChapterData } from './library/ChapterRepository';

export { EntryRepository } from './library/EntryRepository';
export type { CreateEntryData, UpdateEntryData, EntryFilters, EntryUserFilter } from './library/EntryRepository';

export { IllustrationRepository } from './library/IllustrationRepository';
export type { CreateIllustrationData } from './library/IllustrationRepository';

export { UserLibraryRepository } from './library/UserLibraryRepository';
export type { AddToLibraryData, UpdateLibraryProgressData } from './library/UserLibraryRepository';

export { UnifiedEntryRepositoryAdapter } from './library/UnifiedEntryRepositoryAdapter';
