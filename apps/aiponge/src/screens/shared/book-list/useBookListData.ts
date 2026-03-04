import { useState, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCoverPolling } from '../../../hooks/book/useCoverPolling';
import { CONTENT_VISIBILITY, BOOK_LIFECYCLE } from '@aiponge/shared-contracts';
import { useAuthStore, selectToken, selectUser } from '../../../auth/store';
import { apiRequest } from '../../../lib/axiosApiClient';
import { queryKeys } from '../../../lib/queryKeys';
import { useBooks, useMyLibrary, useBookTypes } from '../../../hooks/book';
import type { BookCardData } from '../../../components/book/BookCard';
import type { LibBook, LibChapter } from '../../../types/profile.types';
import { getBookTypesForCategory, type BookTypeCategory } from '../../../constants/bookTypes';

const OWN_BOOKS_PAGE_SIZE = 100;

export interface BookListDataOptions {
  userDisplayName: string;
  t: (key: string, params?: Record<string, string>) => string;
  followedCreatorIds?: Set<string>;
}

export function useBookListData({ userDisplayName, t, followedCreatorIds }: BookListDataOptions) {
  const token = useAuthStore(selectToken);
  const user = useAuthStore(selectUser);
  const [selectedCategory, setSelectedCategory] = useState<BookTypeCategory | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  const {
    data: browseBooks,
    isLoading: browseLoading,
    refetch: refetchBrowseBooks,
    fetchNextPage: fetchNextBrowsePage,
    hasNextPage: hasNextBrowsePage,
    isFetchingNextPage: isFetchingNextBrowsePage,
  } = useBooks({
    typeId: undefined,
    language: selectedLanguage || undefined,
  });

  const selectedCategoryTypeIds = useMemo(() => {
    if (!selectedCategory) return null;
    return new Set<string>(getBookTypesForCategory(selectedCategory).map(bt => bt.id));
  }, [selectedCategory]);

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

  // Poll for async cover generation until all covers are loaded (max 6 polls, 5s interval)
  useCoverPolling({ books: ownBooksRaw, refetch: refetchManageBooks });

  const browsableBookTypes = useMemo(() => {
    if (!bookTypesData) return [];
    return [...bookTypesData].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [bookTypesData]);

  const ownBookIds = useMemo(() => new Set(ownBooksRaw.map(b => b.id)), [ownBooksRaw]);

  // IDs of the user's personal (private) books — only these go into "My Books"
  const personalBookIds = useMemo(
    () =>
      new Set(ownBooksRaw.filter(b => !b.visibility || b.visibility === CONTENT_VISIBILITY.PERSONAL).map(b => b.id)),
    [ownBooksRaw]
  );

  // When selectedLanguage is empty ("All Languages"), filtering is skipped entirely.
  // activeLang is only used inside `if (selectedLanguage)` guards.
  const activeLang = selectedLanguage;

  const ownBooksData = useMemo((): BookCardData[] => {
    return ownBooksRaw
      .filter(book => {
        if (selectedCategoryTypeIds && (!book.typeId || !selectedCategoryTypeIds.has(book.typeId))) return false;
        // Only PERSONAL visibility books belong in "My Books"
        // SHARED/PUBLIC books by the user appear in the public sections instead
        if (book.visibility && book.visibility !== CONTENT_VISIBILITY.PERSONAL) return false;
        return true;
      })
      .map(
        (book): BookCardData => ({
          id: book.id,
          title: book.title,
          subtitle: book.subtitle || undefined,
          description: book.description || undefined,
          coverIllustrationUrl: book.coverIllustrationUrl || undefined,
          author: book.displayAuthor || book.author || undefined,
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
  }, [ownBooksRaw, selectedCategoryTypeIds, selectedLanguage, activeLang, userDisplayName, user?.id]);

  const mapBookToCard = (
    book: LibBook & { coverIllustrationUrl?: string; chapters?: LibChapter[]; userId?: string }
  ): BookCardData => ({
    id: book.id,
    title: book.title,
    subtitle: book.subtitle || undefined,
    coverIllustrationUrl: book.coverIllustrationUrl || undefined,
    author: book.displayAuthor || book.author || undefined,
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

  const publicBooksData = useMemo((): BookCardData[] => {
    if (!browseBooks) return [];
    return browseBooks
      .filter(book => {
        // Exclude only personal (private) books — the user's shared/public books belong here
        if (personalBookIds.has((book as LibBook).id)) return false;
        const typeId = (book as LibBook & { typeId?: string }).typeId;
        if (selectedCategoryTypeIds && (!typeId || !selectedCategoryTypeIds.has(typeId))) return false;
        if (selectedLanguage) {
          const bookLang = (book as LibBook).language;
          if (bookLang && !bookLang.toLowerCase().startsWith(activeLang.toLowerCase())) return false;
        }
        return true;
      })
      .map(book =>
        mapBookToCard(book as LibBook & { coverIllustrationUrl?: string; chapters?: LibChapter[]; userId?: string })
      );
  }, [browseBooks, personalBookIds, selectedCategoryTypeIds, selectedLanguage, activeLang]);

  // Split public books into followed-creator books vs shared/public books
  const { followedCreatorBooks, sharedBooks } = useMemo(() => {
    if (!followedCreatorIds || followedCreatorIds.size === 0) {
      return { followedCreatorBooks: [] as BookCardData[], sharedBooks: publicBooksData };
    }
    const followed: BookCardData[] = [];
    const shared: BookCardData[] = [];
    for (const book of publicBooksData) {
      if (book.userId && followedCreatorIds.has(book.userId)) {
        followed.push(book);
      } else {
        shared.push(book);
      }
    }
    return { followedCreatorBooks: followed, sharedBooks: shared };
  }, [publicBooksData, followedCreatorIds]);

  // Backward compatibility: merged list for search filtering
  const unifiedBooks = useMemo((): BookCardData[] => {
    return [...ownBooksData, ...followedCreatorBooks, ...sharedBooks];
  }, [ownBooksData, followedCreatorBooks, sharedBooks]);

  const savedBookIds = useMemo(() => {
    return new Set(libraryData?.map(item => item.bookId) || []);
  }, [libraryData]);

  const isLoading = browseLoading || manageLoading;

  return {
    selectedCategory,
    setSelectedCategory,
    selectedLanguage,
    setSelectedLanguage,
    browsableBookTypes,
    unifiedBooks,
    ownBooksData,
    followedCreatorBooks,
    sharedBooks,
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
