import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONTENT_VISIBILITY, BOOK_TYPE_IDS, type ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { useAuthStore, selectToken, selectUserId, selectUser } from '../../auth/store';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import {
  libBookToBook,
  libChapterToEntryChapter,
  libEntryToEntry,
  type LibBookType,
  type LibBook,
  type LibChapter,
  type LibEntry,
  type LibIllustration,
  type LibUserLibrary,
  type LibBookTypeId,
  type CreateLibBookInput,
  type CreateLibChapterInput,
  type CreateLibEntryInput,
  type Book,
  type EntryChapter,
  type Entry,
} from '../../types/profile.types';
import type { BookDisplay, BookDisplayChapter, BookDisplayEntry, ManageBookData, ManageChapterData } from './types';

function getErrorMessage(response: ServiceResponse<unknown>, fallback: string = 'An error occurred'): string {
  return response.error?.message || fallback;
}

function assertResponseData<T>(response: ServiceResponse<T>, context: string): T {
  if (response.data === undefined || response.data === null) {
    throw new Error(`${context}: Response succeeded but data is missing`);
  }
  return response.data;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined): boolean => !!id && UUID_REGEX.test(id);

function extractBooksArray(fullResponse: unknown): LibBook[] {
  // Fail fast: validate response structure
  if (!fullResponse || typeof fullResponse !== 'object') {
    throw new Error(`extractBooksArray: Invalid response type - expected object, got ${typeof fullResponse}`);
  }

  if (!('success' in fullResponse)) {
    throw new Error(
      `extractBooksArray: Response missing 'success' field. Keys: ${Object.keys(fullResponse).join(', ')}`
    );
  }

  const resp = fullResponse as ServiceResponse<unknown>;

  if (!resp.success) {
    throw new Error(`extractBooksArray: API returned failure - ${resp.error?.message || 'Unknown error'}`);
  }

  if (resp.data === undefined || resp.data === null) {
    throw new Error('extractBooksArray: Response success=true but data is null/undefined');
  }

  // Primary path: data is a direct array of books
  if (Array.isArray(resp.data)) {
    return resp.data as LibBook[];
  }

  // Secondary path: data is { books: [...] } object
  const dataObj = resp.data as { books?: unknown[] };
  if (dataObj.books && Array.isArray(dataObj.books)) {
    return dataObj.books.map((item: unknown) => {
      if (item && typeof item === 'object' && 'book' in item) {
        const book = (item as { book: LibBook; coverIllustration?: { url: string } }).book;
        const illustration = (item as { coverIllustration?: { url: string } }).coverIllustration;
        if (illustration) {
          (book as LibBook & { coverIllustrationUrl?: string }).coverIllustrationUrl = illustration.url;
        }
        return book;
      }
      return item as LibBook;
    });
  }

  // No valid format matched - fail explicitly
  throw new Error(
    `extractBooksArray: Unexpected data format - expected array or {books: []}, got: ${JSON.stringify(resp.data).slice(0, 200)}`
  );
}

export function useBookTypes() {
  return useQuery({
    queryKey: queryKeys.library.bookTypes(),
    queryFn: async ({ signal }): Promise<LibBookType[]> => {
      const response = await apiClient.get<ServiceResponse<LibBookType[]>>('/api/v1/app/library/book-types', {
        signal,
      });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return response.data || [];
    },
    staleTime: 1000 * 60 * 60,
  });
}

interface BooksPageData {
  books: LibBook[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useBooks(options?: {
  typeId?: LibBookTypeId;
  search?: string;
  language?: string;
  enabled?: boolean;
  pageSize?: number;
}) {
  const typeId = options?.typeId;
  const search = options?.search;
  const language = options?.language;
  const enabled = options?.enabled ?? true;
  const pageSize = options?.pageSize ?? 20;

  const infiniteQuery = useInfiniteQuery<BooksPageData>({
    queryKey: [...queryKeys.library.books(), { typeId, search, language }],
    queryFn: async ({ pageParam, signal }): Promise<BooksPageData> => {
      const params = new URLSearchParams();
      if (typeId) params.append('typeId', typeId);
      if (search) params.append('search', search);
      if (language) params.append('language', language);
      params.append('limit', String(pageSize));
      if (pageParam) params.append('cursor', pageParam as string);

      const response = await apiClient.get<
        ServiceResponse<{ items: LibBook[]; nextCursor?: string | null; hasMore?: boolean }>
      >(`/api/v1/app/library/books?${params}`, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      const paginated = response.data;
      return {
        books: paginated?.items || [],
        nextCursor: paginated?.nextCursor ?? null,
        hasMore: paginated?.hasMore ?? false,
      };
    },
    getNextPageParam: lastPage => {
      if (!lastPage.hasMore || !lastPage.nextCursor) return undefined;
      return lastPage.nextCursor;
    },
    initialPageParam: undefined as string | undefined,
    enabled,
  });

  const data = useMemo(() => {
    return infiniteQuery.data?.pages.flatMap(page => page.books) ?? [];
  }, [infiniteQuery.data]);

  return {
    ...infiniteQuery,
    data,
  };
}

export function useMyBooks(typeId?: LibBookTypeId) {
  return useQuery({
    queryKey: queryKeys.library.myBooks(typeId),
    queryFn: async ({ signal }): Promise<LibBook[]> => {
      const params = typeId ? `?typeId=${typeId}` : '';
      const response = await apiClient.get<ServiceResponse<unknown>>(`/api/v1/app/library/user/books${params}`, {
        signal,
      });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return extractBooksArray(response);
    },
  });
}

interface GetBookApiResponse {
  book: LibBook & { chapters?: LibChapter[] };
  entity?: unknown;
  coverIllustration?: { url: string };
}

export function useBook(bookId: string, options?: { silentError?: boolean }) {
  return useQuery({
    queryKey: queryKeys.library.bookDetail(bookId),
    queryFn: async ({ signal }): Promise<LibBook & { chapters: LibChapter[]; coverIllustrationUrl?: string }> => {
      const response = await apiClient.get<ServiceResponse<GetBookApiResponse>>(`/api/v1/app/library/books/${bookId}`, {
        signal,
      });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));

      const data = assertResponseData(response, 'Get book');
      const book = data.book;

      return {
        ...book,
        chapters: book.chapters || [],
        coverIllustrationUrl: data.coverIllustration?.url,
      };
    },
    enabled: isValidUUID(bookId),
    ...(options?.silentError && { meta: { silentError: true } }),
  });
}

export function toBookDisplay(
  rawBook: LibBook & { chapters?: (LibChapter & { entries?: LibEntry[] })[]; coverIllustrationUrl?: string }
): BookDisplay {
  return {
    id: rawBook.id,
    title: rawBook.title,
    subtitle: rawBook.subtitle || undefined,
    coverIllustrationUrl: rawBook.coverIllustrationUrl || undefined,
    author: rawBook.author || undefined,
    category: rawBook.category || rawBook.tags?.[0] || rawBook.themes?.[0] || rawBook.typeId || 'general',
    description: rawBook.description || undefined,
    status: rawBook.status || undefined,
    chapters: (rawBook.chapters || []).map(
      (ch): BookDisplayChapter => ({
        id: ch.id,
        title: ch.title,
        description: ch.description || undefined,
        sortOrder: ch.sortOrder,
        entryCount: ch.entries?.length || 0,
        entries: (ch.entries || []).map(
          (entry): BookDisplayEntry => ({
            id: entry.id,
            text: entry.content,
            reference: entry.attribution || undefined,
            musicHints: (entry.musicHints as Record<string, unknown>) || undefined,
            sortOrder: entry.sortOrder,
          })
        ),
      })
    ),
  };
}

export function useBookDisplay(bookId: string) {
  const bookQuery = useBook(bookId, { silentError: true });
  const book = useMemo((): BookDisplay | null => {
    if (!bookQuery.data) return null;
    return toBookDisplay(bookQuery.data);
  }, [bookQuery.data]);

  return {
    ...bookQuery,
    book,
  };
}

export function useManageBook(bookId: string, enabled: boolean = true) {
  const token = useAuthStore(selectToken);

  const bookQuery = useQuery({
    queryKey: queryKeys.library.manageBookDetail(bookId),
    queryFn: async ({ signal }): Promise<ManageBookData | null> => {
      const response = await apiClient.get<
        ServiceResponse<{
          book?: ManageBookData;
          coverIllustration?: { url: string };
        }>
      >(`/api/v1/app/library/books/${bookId}`, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      const bookData = response.data?.book;
      if (!bookData) return null;
      return {
        ...bookData,
        coverIllustrationUrl: response.data?.coverIllustration?.url || bookData.coverIllustrationUrl,
      };
    },
    enabled: enabled && isValidUUID(bookId) && !!token,
  });

  const chaptersQuery = useQuery({
    queryKey: [...queryKeys.library.manageBookDetail(bookId), 'chapters'],
    queryFn: async ({ signal }): Promise<ManageChapterData[]> => {
      const response = await apiClient.get<
        ServiceResponse<{
          chapters?: Array<{ chapter: ManageChapterData }>;
        }>
      >(`/api/v1/app/library/books/${bookId}/chapters`, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      const chaptersData = response.data?.chapters || [];
      return chaptersData.map(c => c.chapter).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    enabled: enabled && isValidUUID(bookId) && !!token,
  });

  return {
    book: bookQuery.data,
    chapters: chaptersQuery.data || [],
    isLoading: bookQuery.isLoading || chaptersQuery.isLoading,
    isError: bookQuery.isError || chaptersQuery.isError,
    error: bookQuery.error || chaptersQuery.error,
    refetch: async () => {
      await bookQuery.refetch();
      await chaptersQuery.refetch();
    },
    refetchBook: bookQuery.refetch,
    refetchChapters: chaptersQuery.refetch,
  };
}

export function useChapterEntries(chapterId: string, enabled: boolean = false) {
  return useQuery({
    queryKey: queryKeys.library.entries(chapterId),
    queryFn: async ({ signal }): Promise<BookDisplayEntry[]> => {
      const response = await apiClient.get<
        ServiceResponse<{
          entries?: Array<{
            entry: {
              id: string;
              content: string;
              attribution?: string;
              sortOrder: number;
              musicHints?: Record<string, unknown>;
            };
          }>;
        }>
      >(`/api/v1/app/library/chapters/${chapterId}/entries`, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      const rawEntries = response.data?.entries || [];
      return rawEntries.map(
        (item): BookDisplayEntry => ({
          id: item.entry.id,
          text: item.entry.content,
          reference: item.entry.attribution || undefined,
          musicHints: item.entry.musicHints || undefined,
          sortOrder: item.entry.sortOrder,
        })
      );
    },
    enabled: enabled && isValidUUID(chapterId),
  });
}

export function useChapter(chapterId: string) {
  return useQuery({
    queryKey: queryKeys.library.chapterDetail(chapterId),
    queryFn: async ({ signal }): Promise<LibChapter & { entries: LibEntry[]; illustrations: LibIllustration[] }> => {
      const response = await apiClient.get<
        ServiceResponse<LibChapter & { entries: LibEntry[]; illustrations: LibIllustration[] }>
      >(`/api/v1/app/library/chapters/${chapterId}`, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Get chapter');
    },
    enabled: isValidUUID(chapterId),
  });
}

export function useEntry(entryId: string) {
  return useQuery({
    queryKey: queryKeys.library.entryDetail(entryId),
    queryFn: async ({ signal }): Promise<LibEntry & { illustrations: LibIllustration[] }> => {
      const response = await apiClient.get<ServiceResponse<LibEntry & { illustrations: LibIllustration[] }>>(
        `/api/v1/app/library/entries/${entryId}`,
        { signal }
      );
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Get entry');
    },
    enabled: isValidUUID(entryId),
  });
}

export function useMyLibrary() {
  return useQuery({
    queryKey: queryKeys.library.userLibrary(),
    queryFn: async ({ signal }): Promise<LibUserLibrary[]> => {
      const response = await apiClient.get<ServiceResponse<LibUserLibrary[]>>('/api/v1/app/library/user', { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return response.data || [];
    },
  });
}

export function useLibraryMutations() {
  const queryClient = useQueryClient();

  const createBook = useMutation({
    mutationFn: async (input: CreateLibBookInput): Promise<LibBook> => {
      const response = await apiClient.post<ServiceResponse<LibBook>>('/api/v1/app/library/books', input);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to create book'));
      return assertResponseData(response, 'Create book');
    },
    onSuccess: book => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_CREATED' });
      logger.info('Book created', { bookId: book.id });
    },
  });

  const updateBook = useMutation({
    mutationFn: async ({ id, ...data }: Partial<LibBook> & { id: string }): Promise<LibBook> => {
      const response = await apiClient.patch<ServiceResponse<LibBook>>(`/api/v1/app/library/books/${id}`, data);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to update book'));
      return assertResponseData(response, 'Update book');
    },
    onSuccess: book => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_UPDATED', bookId: book.id });
      logger.info('Book updated', { bookId: book.id });
    },
  });

  const deleteBook = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!id || id === 'undefined') {
        throw new Error('Invalid book ID');
      }
      const response = await apiClient.delete<ServiceResponse<void>>(`/api/v1/app/library/books/${id}`);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to delete book'));
    },
    onSuccess: (_, id) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_DELETED', bookId: id });
      queryClient.removeQueries({ queryKey: queryKeys.library.bookDetail(id) });
      logger.info('Book deleted', { bookId: id });
    },
  });

  const createChapter = useMutation({
    mutationFn: async (input: CreateLibChapterInput): Promise<LibChapter> => {
      const response = await apiClient.post<ServiceResponse<LibChapter>>('/api/v1/app/library/chapters', input);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Create chapter');
    },
    onSuccess: chapter => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_CHAPTER_CREATED', bookId: chapter.bookId });
      logger.info('Chapter created', { chapterId: chapter.id });
    },
  });

  const updateChapter = useMutation({
    mutationFn: async ({ id, ...data }: Partial<LibChapter> & { id: string }): Promise<LibChapter> => {
      const response = await apiClient.patch<ServiceResponse<LibChapter>>(`/api/v1/app/library/chapters/${id}`, data);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Update chapter');
    },
    onSuccess: chapter => {
      invalidateOnEvent(queryClient, {
        type: 'LIBRARY_CHAPTER_UPDATED',
        chapterId: chapter.id,
        bookId: chapter.bookId,
      });
      logger.info('Chapter updated', { chapterId: chapter.id });
    },
  });

  const deleteChapter = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await apiClient.delete<ServiceResponse<void>>(`/api/v1/app/library/chapters/${id}`);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
    },
    onSuccess: (_, id) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_CHAPTER_DELETED', chapterId: id });
      queryClient.removeQueries({ queryKey: queryKeys.library.chapterDetail(id) });
      logger.info('Chapter deleted', { chapterId: id });
    },
  });

  const createEntry = useMutation({
    mutationFn: async (input: CreateLibEntryInput): Promise<LibEntry> => {
      const response = await apiClient.post<ServiceResponse<LibEntry>>('/api/v1/app/library/entries', input);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Create entry');
    },
    onSuccess: entry => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_ENTRY_CREATED', chapterId: entry.chapterId });
      logger.info('Entry created', { entryId: entry.id });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...data }: Partial<LibEntry> & { id: string }): Promise<LibEntry> => {
      const response = await apiClient.patch<ServiceResponse<LibEntry>>(`/api/v1/app/library/entries/${id}`, data);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Update entry');
    },
    onSuccess: entry => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_ENTRY_UPDATED', entryId: entry.id, chapterId: entry.chapterId });
      logger.info('Entry updated', { entryId: entry.id });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await apiClient.delete<ServiceResponse<void>>(`/api/v1/app/library/entries/${id}`);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
    },
    onSuccess: (_, id) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_ENTRY_DELETED', entryId: id });
      queryClient.removeQueries({ queryKey: queryKeys.library.entryDetail(id) });
      logger.info('Entry deleted', { entryId: id });
    },
  });

  const addBookmark = useMutation({
    mutationFn: async (data: {
      content: string;
      sourceTitle?: string;
      sourceAuthor?: string;
      sourceChapter?: string;
    }): Promise<LibEntry> => {
      const response = await apiClient.post<ServiceResponse<LibEntry>>('/api/v1/app/library/bookmarks', data);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Add bookmark');
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_CREATED' });
      logger.info('Bookmark added');
    },
  });

  const addToLibrary = useMutation({
    mutationFn: async (bookId: string): Promise<LibUserLibrary> => {
      const response = await apiClient.post<ServiceResponse<LibUserLibrary>>(`/api/v1/app/library/${bookId}`, {});
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Add to library');
    },
    onSuccess: (_, bookId) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_SAVED', bookId });
      logger.info('Book added to library');
    },
  });

  const removeFromLibrary = useMutation({
    mutationFn: async (bookId: string): Promise<void> => {
      const response = await apiClient.delete<ServiceResponse<void>>(`/api/v1/app/library/${bookId}`);
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
    },
    onSuccess: (_, bookId) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_REMOVED', bookId });
      logger.info('Book removed from library');
    },
  });

  const updateLibraryProgress = useMutation({
    mutationFn: async ({
      bookId,
      ...data
    }: {
      bookId: string;
      lastChapterId?: string;
      lastEntryId?: string;
      progressPercent?: number;
    }): Promise<LibUserLibrary> => {
      const response = await apiClient.patch<ServiceResponse<LibUserLibrary>>(
        `/api/v1/app/library/${bookId}/progress`,
        data
      );
      if (!response.success) throw new Error(getErrorMessage(response, 'Operation failed'));
      return assertResponseData(response, 'Update library progress');
    },
    onSuccess: (_, variables) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_READING_PROGRESS_UPDATED', bookId: variables.bookId });
    },
  });

  return {
    createBook,
    updateBook,
    deleteBook,
    createChapter,
    updateChapter,
    deleteChapter,
    createEntry,
    updateEntry,
    deleteEntry,
    addBookmark,
    addToLibrary,
    removeFromLibrary,
    updateLibraryProgress,
  };
}

export function useUnifiedLibrary(typeId?: LibBookTypeId) {
  const bookTypes = useBookTypes();
  const myBooks = useMyBooks(typeId);
  const publicBooks = useBooks({ typeId });
  const myLibrary = useMyLibrary();
  const mutations = useLibraryMutations();

  const getPersonalBooks = useCallback(() => {
    return myBooks.data?.filter(b => b.typeId === BOOK_TYPE_IDS.PERSONAL) || [];
  }, [myBooks.data]);

  const getBooksByType = useCallback(
    (filterTypeId: string) => {
      return myBooks.data?.filter(b => b.typeId === filterTypeId) || [];
    },
    [myBooks.data]
  );

  return {
    bookTypes: bookTypes.data || [],
    myBooks: myBooks.data || [],
    publicBooks: publicBooks.data || [],
    savedBooks: myLibrary.data || [],

    getPersonalBooks,
    getBooksByType,

    isLoading: bookTypes.isLoading || myBooks.isLoading,
    isError: bookTypes.isError || myBooks.isError,
    error: bookTypes.error || myBooks.error,

    refetch: () => {
      myBooks.refetch();
      publicBooks.refetch();
      myLibrary.refetch();
    },

    ...mutations,
  };
}

const LAST_ACTIVE_BOOK_KEY = 'lastActiveBookId';

export interface BookTemplate {
  key: string;
  label: string;
  description: string;
  chapterCount: number;
}

export interface TemplateSummary {
  chaptersCreated: number;
  entriesCreated: number;
  chapterNames: string[];
}

export interface CreateBookChapter {
  title: string;
  description?: string;
  order: number;
  entries: Array<{
    prompt: string;
    type: string;
    content?: string;
    sources?: Array<{
      author: string;
      work?: string;
    }>;
    tags?: string[];
    themes?: string[];
  }>;
}

export interface CreateBookOptions {
  title: string;
  description?: string;
  language?: string;
  category?: string;
  chapters?: CreateBookChapter[];
}

let cachedTemplates: BookTemplate[] | null = null;

export interface UseBooksUnifiedOptions {
  typeId?: LibBookTypeId;
}

export function useBooksUnified(options?: UseBooksUnifiedOptions) {
  const queryClient = useQueryClient();
  const userId = useAuthStore(selectUserId);
  const user = useAuthStore(selectUser);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [templates, setTemplates] = useState<BookTemplate[]>(cachedTemplates || []);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const templatesLoadingRef = useRef(false);
  const [lastActiveId, setLastActiveId] = useState<string | null>(null);
  const [lastActiveLoaded, setLastActiveLoaded] = useState(false);

  const bookTypeId = options?.typeId;

  const {
    data: booksData,
    isLoading,
    refetch,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.library.myBooks(bookTypeId),
    queryFn: async ({ signal }): Promise<LibBook[]> => {
      const url = bookTypeId ? `/api/v1/app/library/user/books?typeId=${bookTypeId}` : '/api/v1/app/library/user/books';
      const response = await apiClient.get<ServiceResponse<unknown>>(url, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to load books'));
      return extractBooksArray(response);
    },
    enabled: !!userId,
  });

  const {
    data: sharedBooksData,
    isLoading: sharedLoading,
    isError: sharedIsError,
  } = useQuery({
    queryKey: [...queryKeys.library.books(), { shared: true }],
    queryFn: async ({ signal }): Promise<LibBook[]> => {
      const response = await apiClient.get<ServiceResponse<LibBook[]>>('/api/v1/app/library/books', { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to load shared books'));
      return response.data || [];
    },
    enabled: !!userId,
  });

  const myOwnBooks = useMemo(() => {
    return (booksData || []).map(libBookToBook).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [booksData]);

  const allBooks = useMemo(() => {
    const safeShared = Array.isArray(sharedBooksData) ? sharedBooksData : [];
    const shared = safeShared.filter(sb => sb.userId !== userId).map(libBookToBook);
    const ownIds = new Set(myOwnBooks.map(b => b.id));
    const dedupedShared = shared.filter(s => !ownIds.has(s.id));
    return [...myOwnBooks, ...dedupedShared];
  }, [myOwnBooks, sharedBooksData, userId]);

  useEffect(() => {
    AsyncStorage.getItem(LAST_ACTIVE_BOOK_KEY)
      .then(id => setLastActiveId(id))
      .catch(e => logger.warn('[useUnifiedLibrary] Failed to load last active book ID', e))
      .finally(() => setLastActiveLoaded(true));
  }, []);

  useEffect(() => {
    if (!lastActiveLoaded) return;
    if (allBooks.length === 0) return;
    if (currentBook && allBooks.some(b => b.id === currentBook.id)) return;

    const lastActive = lastActiveId ? allBooks.find(b => b.id === lastActiveId) : null;
    const bookToSelect = lastActive || myOwnBooks[0] || allBooks[0];
    if (bookToSelect) {
      setCurrentBook(bookToSelect);
    }
  }, [allBooks, myOwnBooks, currentBook, lastActiveLoaded, lastActiveId]);

  const selectBook = useCallback((book: Book | null) => {
    setCurrentBook(book);
    if (book) {
      AsyncStorage.setItem(LAST_ACTIVE_BOOK_KEY, book.id).catch(error => {
        logger.warn('[useUnifiedLibrary] Failed to save last active book ID', { bookId: book.id, error });
      });
    } else {
      AsyncStorage.removeItem(LAST_ACTIVE_BOOK_KEY).catch(error => {
        logger.warn('[useUnifiedLibrary] Failed to clear last active book ID', { error });
      });
    }
  }, []);

  const createBook = useMutation({
    mutationFn: async (options: CreateBookOptions): Promise<Book> => {
      const effectiveTypeId = bookTypeId ?? BOOK_TYPE_IDS.PERSONAL;
      const defaultVisibility =
        effectiveTypeId !== BOOK_TYPE_IDS.PERSONAL ? CONTENT_VISIBILITY.SHARED : CONTENT_VISIBILITY.PERSONAL;
      const input: CreateLibBookInput & { metadata?: Record<string, unknown>; chapters?: CreateBookChapter[] } = {
        typeId: effectiveTypeId,
        title: options.title,
        description: options.description,
        author: user?.name || undefined,
        language: options.language,
        category: options.category,
        visibility: defaultVisibility,
        metadata: {
          isDefault: false,
          isReadOnly: false,
        },
        ...(options.chapters && { chapters: options.chapters }),
      };

      const response = await apiClient.post<ServiceResponse<LibBook>>('/api/v1/app/library/books', input);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to create book'));
      return libBookToBook(assertResponseData(response, 'Create book'));
    },
    onSuccess: book => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_CREATED', typeId: bookTypeId });
      if (!currentBook) {
        selectBook(book);
      }
      logger.info('Book created', { bookId: book.id });
    },
  });

  const updateBook = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      title?: string;
      description?: string;
      sortOrder?: number;
    }): Promise<Book> => {
      const response = await apiClient.patch<ServiceResponse<LibBook>>(`/api/v1/app/library/books/${id}`, updates);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to update book'));
      return libBookToBook(assertResponseData(response, 'Update book'));
    },
    onSuccess: book => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_UPDATED', bookId: book.id, typeId: bookTypeId });
      if (currentBook?.id === book.id) {
        setCurrentBook(book);
      }
      logger.info('Book updated', { bookId: book.id });
    },
  });

  const deleteBook = useMutation({
    mutationFn: async ({
      id,
      reassignToBookId,
      deleteChapters,
    }: {
      id: string;
      reassignToBookId?: string;
      deleteChapters?: boolean;
    }): Promise<void> => {
      if (!id || id === 'undefined') {
        throw new Error('Invalid book ID');
      }
      const params = new URLSearchParams();
      if (reassignToBookId) params.append('reassignToBookId', reassignToBookId);
      if (deleteChapters) params.append('deleteChapters', 'true');

      const url = `/api/v1/app/library/books/${id}${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.delete<ServiceResponse<void>>(url);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to delete book'));
    },
    onSuccess: (_, { id }) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_DELETED', bookId: id, typeId: bookTypeId });
      if (currentBook?.id === id) {
        const remaining = allBooks.filter((b: Book) => b.id !== id);
        selectBook(remaining[0] || null);
      }
      logger.info('Book deleted', { bookId: id });
    },
  });

  const loadBooks = useCallback(
    async (force = false) => {
      if (force) {
        await refetch();
      }
    },
    [refetch]
  );

  const loadTemplates = useCallback(async () => {
    if (cachedTemplates && cachedTemplates.length > 0) {
      setTemplates(cachedTemplates);
      return;
    }
    if (templatesLoadingRef.current) return;

    templatesLoadingRef.current = true;
    setTemplatesLoading(true);

    try {
      type TemplatesApiResponse = BookTemplate[] | { success?: boolean; data?: BookTemplate[] };
      const response = await apiClient.get<TemplatesApiResponse>('/api/v1/app/books/generate/blueprints');

      let templatesData: BookTemplate[] = [];
      if (Array.isArray(response)) {
        templatesData = response;
      } else if (response?.data) {
        templatesData = response.data;
      }

      cachedTemplates = templatesData;
      setTemplates(templatesData);
    } catch (err) {
      logger.error('Load templates error', err);
    } finally {
      templatesLoadingRef.current = false;
      setTemplatesLoading(false);
    }
  }, []);

  return {
    books: allBooks,
    currentBook,
    templates,
    templatesLoading,
    loading: isLoading || sharedLoading,
    error: isError || sharedIsError ? error?.message || 'Failed to load books' : null,
    loadBooks,
    loadTemplates,
    createBook: async (titleOrOptions: string | CreateBookOptions, description?: string) => {
      const options: CreateBookOptions =
        typeof titleOrOptions === 'string' ? { title: titleOrOptions, description } : titleOrOptions;
      try {
        const book = await createBook.mutateAsync(options);
        return { book };
      } catch (err) {
        return { book: null };
      }
    },
    updateBook: async (id: string, updates: { title?: string; description?: string; sortOrder?: number }) => {
      try {
        await updateBook.mutateAsync({ id, ...updates });
        return true;
      } catch {
        return false;
      }
    },
    deleteBook: async (id: string, options?: { reassignToBookId?: string; deleteChapters?: boolean }) => {
      if (!id || id === 'undefined') {
        logger.error('deleteBook called with invalid id', undefined, { id });
        return false;
      }
      try {
        await deleteBook.mutateAsync({ id, ...options });
        return true;
      } catch {
        return false;
      }
    },
    selectBook,
  };
}

export function useChaptersUnified(bookId?: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore(selectUserId);

  const {
    data: chaptersData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.library.chapters(bookId ?? ''),
    queryFn: async ({ signal }): Promise<LibChapter[]> => {
      // API returns { chapters: [{ chapter, entity, illustrations }, ...], total }
      // We need to extract the chapter object from each wrapper
      const response = await apiClient.get<
        ServiceResponse<{ chapters: Array<{ chapter: LibChapter }>; total: number }>
      >(`/api/v1/app/library/books/${bookId}/chapters`, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to load chapters'));
      const rawChapters = response.data?.chapters || [];
      return rawChapters.map(item => item.chapter);
    },
    enabled: !!userId && !!bookId,
  });

  const chapters = useMemo(() => {
    return (chaptersData || [])
      .map(ch => libChapterToEntryChapter(ch, userId || ''))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [chaptersData, userId]);

  const createChapter = useMutation({
    mutationFn: async ({ title, sortOrder = 0 }: { title: string; sortOrder?: number }): Promise<EntryChapter> => {
      if (!bookId) throw new Error('No book selected');
      const response = await apiClient.post<ServiceResponse<LibChapter>>('/api/v1/app/library/chapters', {
        bookId,
        title,
        sortOrder,
      });
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to create chapter'));
      return libChapterToEntryChapter(assertResponseData(response, 'Create chapter'), userId || '');
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_CHAPTER_CREATED', bookId: bookId! });
    },
  });

  const updateChapter = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      title?: string;
      sortOrder?: number;
    }): Promise<EntryChapter> => {
      const response = await apiClient.patch<ServiceResponse<LibChapter>>(
        `/api/v1/app/library/chapters/${id}`,
        updates
      );
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to update chapter'));
      return libChapterToEntryChapter(assertResponseData(response, 'Update chapter'), userId || '');
    },
    onSuccess: chapter => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_CHAPTER_UPDATED', chapterId: chapter.id, bookId });
    },
  });

  const deleteChapter = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await apiClient.delete<ServiceResponse<void>>(`/api/v1/app/library/chapters/${id}`);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to delete chapter'));
    },
    onSuccess: (_, id) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_CHAPTER_DELETED', chapterId: id, bookId });
    },
  });

  const assignEntries = useCallback(
    async (entryIds: string[], chapterId: string | null): Promise<boolean> => {
      try {
        const response = await apiClient.post<ServiceResponse<void>>('/api/v1/app/library/entries/assign', {
          entryIds,
          chapterId,
        });
        if (!response.success) throw new Error(getErrorMessage(response, 'Failed to assign entries'));
        if (chapterId) {
          invalidateOnEvent(queryClient, { type: 'LIBRARY_CHAPTER_UPDATED', chapterId, bookId });
        } else {
          invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_UPDATED', bookId: bookId! });
        }
        return true;
      } catch {
        return false;
      }
    },
    [bookId, queryClient]
  );

  return {
    chapters,
    loading: isLoading,
    error: null as string | null,
    loadedBookId: bookId,
    loadChapters: async (force = false, _bookId?: string) => {
      if (force) await refetch();
    },
    createChapter: async (title: string, sortOrder?: number, _bookId?: string) => {
      try {
        return await createChapter.mutateAsync({ title, sortOrder });
      } catch {
        return null;
      }
    },
    updateChapter: async (id: string, updates: { title?: string; sortOrder?: number; bookId?: string }) => {
      try {
        await updateChapter.mutateAsync({ id, ...updates });
        return true;
      } catch {
        return false;
      }
    },
    deleteChapter: async (id: string) => {
      try {
        await deleteChapter.mutateAsync(id);
        return true;
      } catch {
        return false;
      }
    },
    assignEntries,
  };
}

interface EntriesPageData {
  entries: LibEntry[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export function useEntriesUnified(pageSize = 20, bookId?: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore(selectUserId);

  const infiniteQuery = useInfiniteQuery<EntriesPageData>({
    queryKey: queryKeys.library.entriesByBook(bookId ?? '', pageSize),
    queryFn: async ({ pageParam, signal }): Promise<EntriesPageData> => {
      const params = new URLSearchParams({
        limit: String(pageSize),
      });
      if (pageParam) params.append('cursor', pageParam as string);
      if (bookId) params.append('bookId', bookId);

      const response = await apiClient.get<
        ServiceResponse<LibEntry[]> & { total?: number; hasMore?: boolean; nextCursor?: string | null }
      >(`/api/v1/app/library/entries?${params}`, { signal });
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to load entries'));
      return {
        entries: Array.isArray(response.data) ? response.data : [],
        total: response.total || 0,
        hasMore: response.hasMore || false,
        nextCursor: response.nextCursor ?? null,
      };
    },
    getNextPageParam: lastPage => {
      if (!lastPage.hasMore || !lastPage.nextCursor) return undefined;
      return lastPage.nextCursor;
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!userId,
  });

  const pages = infiniteQuery.data?.pages ?? [];
  const allEntries = pages.flatMap(page => page.entries);
  const total = pages[0]?.total || 0;
  const lastPage = pages.length > 0 ? pages[pages.length - 1] : null;
  const hasMore = lastPage?.hasMore || false;

  const entries = useMemo(() => {
    return allEntries.map(entry => libEntryToEntry(entry, userId || ''));
  }, [allEntries, userId]);

  const createEntry = useMutation({
    mutationFn: async (input: CreateLibEntryInput): Promise<Entry> => {
      const response = await apiClient.post<ServiceResponse<LibEntry>>('/api/v1/app/library/entries', input);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to create entry'));
      return libEntryToEntry(assertResponseData(response, 'Create entry'), userId || '');
    },
    onSuccess: entry => {
      invalidateOnEvent(queryClient, {
        type: 'LIBRARY_ENTRY_CREATED',
        chapterId: entry.chapterId ?? undefined,
        bookId,
      });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...data }: Partial<LibEntry> & { id: string }): Promise<Entry> => {
      const response = await apiClient.patch<ServiceResponse<LibEntry>>(`/api/v1/app/library/entries/${id}`, data);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to update entry'));
      return libEntryToEntry(assertResponseData(response, 'Update entry'), userId || '');
    },
    onSuccess: entry => {
      invalidateOnEvent(queryClient, {
        type: 'LIBRARY_ENTRY_UPDATED',
        entryId: entry.id,
        chapterId: entry.chapterId ?? undefined,
      });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await apiClient.delete<ServiceResponse<void>>(`/api/v1/app/library/entries/${id}`);
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to delete entry'));
    },
    onSuccess: (_, id) => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_ENTRY_DELETED', entryId: id });
    },
  });

  const refetchEntries = async () => {
    await queryClient.resetQueries({ queryKey: queryKeys.library.entriesByBook(bookId!) });
    return infiniteQuery.refetch();
  };

  return {
    entries,
    total,
    hasMore,
    isLoading: infiniteQuery.isLoading,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    refetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    invalidateEntries: () => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_UPDATED', bookId: bookId! });
    },
  };
}

/**
 * Prefetch books for faster initial load
 */
export async function prefetchBooks(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.library.myBooks(),
    queryFn: async (): Promise<LibBook[]> => {
      const response = await apiClient.get<ServiceResponse<unknown>>('/api/v1/app/library/user/books');
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to prefetch books'));
      return extractBooksArray(response);
    },
  });
}

// ==============================================
// ALL CHAPTERS HOOK (for cross-book access)
// ==============================================

/**
 * Hook to load ALL chapters across all books
 * Used by CreateScreen for locked content filtering
 */
export function useAllChapters({ enabled: callerEnabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const userId = useAuthStore(selectUserId);

  const {
    data: chaptersData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.library.allChapters(),
    queryFn: async ({ signal }): Promise<LibChapter[]> => {
      const booksResponse = await apiClient.get<ServiceResponse<unknown>>('/api/v1/app/library/user/books', { signal });
      if (!booksResponse.success) throw new Error(getErrorMessage(booksResponse, 'Failed to load books'));
      const books = extractBooksArray(booksResponse);

      // Fetch chapters for each book in parallel
      const chapterPromises = books.map(async book => {
        const response = await apiClient.get<
          ServiceResponse<{ chapters: Array<{ chapter: LibChapter }>; total: number }>
        >(`/api/v1/app/library/books/${book.id}/chapters`, { signal });
        if (!response.success) return [];
        const rawChapters = response.data?.chapters || [];
        return rawChapters.map(item => item.chapter);
      });

      const allChaptersArrays = await Promise.all(chapterPromises);
      return allChaptersArrays.flat();
    },
    enabled: callerEnabled && !!userId,
  });

  const chapters = useMemo(() => {
    return (chaptersData || [])
      .map(ch => libChapterToEntryChapter(ch, userId || ''))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [chaptersData, userId]);

  return {
    chapters,
    loading: isLoading,
    loadChapters: async (force = false) => {
      if (force) await refetch();
    },
  };
}

// ==============================================
// SIMPLE ENTRIES HOOK (for selectors/quick access)
// ==============================================

/**
 * Hook for simple entry access without pagination
 * Returns first page of entries - useful for Create screen
 */
export function useEntriesSimple() {
  const userId = useAuthStore(selectUserId);
  const queryClient = useQueryClient();

  // Check if paginated entries are already in cache
  const ENTRIES_QUERY_KEY = ['library', 'entries', undefined];
  interface PageData {
    entries: LibEntry[];
    total: number;
    hasMore: boolean;
  }
  interface PaginatedData {
    pages: Array<{ entries: LibEntry[]; total: number }>;
  }
  const paginatedData = queryClient.getQueryData<PaginatedData>(ENTRIES_QUERY_KEY);
  const hasPaginatedCache = paginatedData && paginatedData.pages && paginatedData.pages.length > 0;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['library', 'entries', 'simple'],
    queryFn: async ({ signal }): Promise<PageData> => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      // Backend returns: { success, data: LibEntry[], total, hasMore }
      // data is the entries array directly, total/hasMore are top-level
      const response = await apiClient.get<ServiceResponse<LibEntry[]> & { total?: number; hasMore?: boolean }>(
        `/api/v1/app/library/entries?${params}`,
        { signal }
      );
      if (!response.success) throw new Error(getErrorMessage(response, 'Failed to load entries'));
      return {
        entries: Array.isArray(response.data) ? response.data : [],
        total: response.total || 0,
        hasMore: response.hasMore || false,
      };
    },
    enabled: !!userId && !hasPaginatedCache,
    staleTime: QUERY_STALE_TIME.short,
  });

  // Prefer paginated cache data if available
  const entries = useMemo(() => {
    if (hasPaginatedCache) {
      return paginatedData.pages.flatMap(page => (page.entries || []).map(e => libEntryToEntry(e, userId || '')));
    }
    return (data?.entries || []).map(e => libEntryToEntry(e, userId || ''));
  }, [hasPaginatedCache, paginatedData, data, userId]);

  const total = hasPaginatedCache ? paginatedData.pages[0]?.total || 0 : data?.total || 0;

  return {
    entries,
    total,
    isLoading: isLoading && !hasPaginatedCache,
    refetch,
    invalidateEntries: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    },
  };
}
