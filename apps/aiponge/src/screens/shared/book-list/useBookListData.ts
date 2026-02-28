import { useState, useMemo, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CONTENT_VISIBILITY, BOOK_LIFECYCLE } from '@aiponge/shared-contracts';
import { i18n } from '../../../i18n';
import { useAuthStore, selectToken, selectUser } from '../../../auth/store';
import { apiRequest } from '../../../lib/axiosApiClient';
import { queryKeys } from '../../../lib/queryKeys';
import { useBooks, useMyLibrary, useBookTypes } from '../../../hooks/book';
import type { BookCardData } from '../../../components/book/BookCard';
import type { LibBook, LibChapter } from '../../../types/profile.types';
import type { BookTypeId } from '../../../constants/bookTypes';

const OWN_BOOKS_PAGE_SIZE = 100;

export interface BookListDataOptions {
  userDisplayName: string;
  t: (key: string, params?: Record<string, string>) => string;
}

export function useBookListData({ userDisplayName, t }: BookListDataOptions) {
  const token = useAuthStore(selectToken);
  const user = useAuthStore(selectUser);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    const locale = i18n.language || 'en';
    return locale.split('-')[0];
  });

  const {
    data: browseBooks,
    isLoading: browseLoading,
    refetch: refetchBrowseBooks,
    fetchNextPage: fetchNextBrowsePage,
    hasNextPage: hasNextBrowsePage,
    isFetchingNextPage: isFetchingNextBrowsePage,
  } = useBooks({
    typeId: selectedTypeId as BookTypeId | undefined,
    language: selectedLanguage || undefined,
  });

  const { data: libraryData, refetch: refetchLibrary } = useMyLibrary();
  const { data: bookTypesData } = useBookTypes();

  const {
    data: manageBooksPages,
    isLoading: manageLoading,
    refetch: refetchManageBooks,
    fetchNextPage: fetchNextManagePage,
    hasNextPage: hasNextManagePage,
    isFetchingNextPage: isFetchingNextManagePage,
  } = useInfiniteQuery({
    queryKey: [...queryKeys.library.manageBooks()],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.append('limit', String(OWN_BOOKS_PAGE_SIZE));
      if (pageParam) params.append('cursor', pageParam as string);
      const response = (await apiRequest(`/api/v1/app/library/books?${params.toString()}`)) as {
        success?: boolean;
        data?: { items?: BookCardData[]; nextCursor?: string | null; hasMore?: boolean } | BookCardData[];
        nextCursor?: string | null;
        hasMore?: boolean;
      };
      const responseData = response?.data;
      const items = Array.isArray(responseData)
        ? responseData
        : (responseData as { items?: BookCardData[] })?.items || [];
      const nextCursor = Array.isArray(responseData)
        ? response?.nextCursor
        : ((responseData as { nextCursor?: string | null })?.nextCursor ?? response?.nextCursor);
      const hasMore = Array.isArray(responseData)
        ? response?.hasMore
        : ((responseData as { hasMore?: boolean })?.hasMore ?? response?.hasMore);
      return {
        books: items,
        nextCursor: nextCursor ?? null,
        hasMore: hasMore ?? false,
      };
    },
    getNextPageParam: lastPage => {
      if (!lastPage.hasMore || !lastPage.nextCursor) return undefined;
      return lastPage.nextCursor;
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!token,
    staleTime: 0,
  });

  const ownBooksRaw = useMemo(() => {
    return manageBooksPages?.pages.flatMap(page => page.books) ?? [];
  }, [manageBooksPages]);

  const coverPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverPollCountRef = useRef(0);
  const MAX_COVER_POLLS = 6;
  const COVER_POLL_INTERVAL = 5000;

  useEffect(() => {
    if (coverPollRef.current) {
      clearTimeout(coverPollRef.current);
      coverPollRef.current = null;
    }

    const hasBooksWithoutCovers = ownBooksRaw.some(book => !book.coverIllustrationUrl);

    if (hasBooksWithoutCovers && coverPollCountRef.current < MAX_COVER_POLLS) {
      coverPollRef.current = setTimeout(() => {
        coverPollCountRef.current += 1;
        refetchManageBooks();
      }, COVER_POLL_INTERVAL);
    } else if (!hasBooksWithoutCovers) {
      coverPollCountRef.current = 0;
    }

    return () => {
      if (coverPollRef.current) {
        clearTimeout(coverPollRef.current);
        coverPollRef.current = null;
      }
    };
  }, [ownBooksRaw, refetchManageBooks]);

  const browsableBookTypes = useMemo(() => {
    if (!bookTypesData) return [];
    return [...bookTypesData].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [bookTypesData]);

  const ownBookIds = useMemo(() => new Set(ownBooksRaw.map(b => b.id)), [ownBooksRaw]);

  const ownBooksData = useMemo((): BookCardData[] => {
    return ownBooksRaw
      .filter(book => {
        if (selectedTypeId && book.typeId !== selectedTypeId) return false;
        return true;
      })
      .map(
        (book): BookCardData => ({
          id: book.id,
          title: book.title,
          subtitle: book.subtitle || undefined,
          description: book.description || undefined,
          coverIllustrationUrl: book.coverIllustrationUrl || undefined,
          author: userDisplayName || book.author || undefined,
          category: book.category || 'general',
          language: book.language || undefined,
          visibility: book.visibility || CONTENT_VISIBILITY.SHARED,
          status: book.status || BOOK_LIFECYCLE.DRAFT,
          chapterCount: book.chapterCount ?? 0,
          entryCount: book.entryCount ?? 0,
          createdAt: book.createdAt || undefined,
          publishedAt: book.publishedAt || undefined,
          userId: book.userId || user?.id || undefined,
          typeId: book.typeId || undefined,
          tags: (book as unknown as { tags?: string[] }).tags || [],
          themes: (book as unknown as { themes?: string[] }).themes || [],
        })
      );
  }, [ownBooksRaw, selectedTypeId, userDisplayName, user?.id]);

  const mapBookToCard = (
    book: LibBook & { coverIllustrationUrl?: string; chapters?: LibChapter[]; userId?: string }
  ): BookCardData => ({
    id: book.id,
    title: book.title,
    subtitle: book.subtitle || undefined,
    coverIllustrationUrl: book.coverIllustrationUrl || undefined,
    author: book.author || undefined,
    category: book.category || book.tags?.[0] || book.themes?.[0] || 'general',
    chapterCount: book.chapterCount ?? book.chapters?.length ?? 0,
    entryCount: book.entryCount ?? 0,
    language: book.language || undefined,
    visibility: book.visibility || undefined,
    typeId: book.typeId || undefined,
    tags: book.tags || [],
    themes: book.themes || [],
    userId: book.userId || undefined,
  });

  const activeLang = selectedLanguage || (i18n.language || 'en').split('-')[0];

  const publicBooksData = useMemo((): BookCardData[] => {
    if (!browseBooks) return [];
    return browseBooks
      .filter(book => {
        if (ownBookIds.has((book as LibBook).id)) return false;
        if (selectedLanguage) {
          const bookLang = (book as LibBook).language;
          if (bookLang && !bookLang.toLowerCase().startsWith(activeLang.toLowerCase())) return false;
        }
        return true;
      })
      .map(book =>
        mapBookToCard(book as LibBook & { coverIllustrationUrl?: string; chapters?: LibChapter[]; userId?: string })
      );
  }, [browseBooks, ownBookIds, selectedLanguage, activeLang]);

  const unifiedBooks = useMemo((): BookCardData[] => {
    return [...ownBooksData, ...publicBooksData];
  }, [ownBooksData, publicBooksData]);

  const savedBookIds = useMemo(() => {
    return new Set(libraryData?.map(item => item.bookId) || []);
  }, [libraryData]);

  const isLoading = browseLoading || manageLoading;

  return {
    selectedTypeId,
    setSelectedTypeId,
    selectedLanguage,
    setSelectedLanguage,
    browsableBookTypes,
    unifiedBooks,
    ownBookIds,
    savedBookIds,
    isLoading,
    refetchBrowseBooks,
    refetchLibrary,
    refetchManageBooks,
    fetchNextBrowsePage,
    hasNextBrowsePage,
    isFetchingNextBrowsePage,
    fetchNextManagePage,
    hasNextManagePage,
    isFetchingNextManagePage,
  };
}
