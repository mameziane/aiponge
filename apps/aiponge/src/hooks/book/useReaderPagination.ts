import { useMemo, useState, useCallback } from 'react';
import type { BookDisplay, BookDisplayChapter, BookDisplayEntry } from './types';

export type ReaderEntry = BookDisplayEntry;
export type ReaderChapter = BookDisplayChapter;
export type ReaderBook = BookDisplay;

export type FontSize = 'xs' | 's' | 'm' | 'l' | 'xl';

export interface ReaderPage {
  type: 'title' | 'toc' | 'chapter-start' | 'content';
  chapterId?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  entryIds?: string[];
  entries?: ReaderEntry[];
}

const FONT_SIZES: Record<FontSize, number> = {
  xs: 14,
  s: 16,
  m: 18,
  l: 20,
  xl: 24,
};

const LINE_HEIGHTS: Record<FontSize, number> = {
  xs: 22,
  s: 24,
  m: 28,
  l: 32,
  xl: 38,
};

const CHARS_PER_PAGE: Record<FontSize, number> = {
  xs: 2000,
  s: 1600,
  m: 1200,
  l: 900,
  xl: 600,
};

export function useReaderPagination(book: ReaderBook | undefined, fontSize: FontSize = 'm') {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const pages = useMemo<ReaderPage[]>(() => {
    if (!book) return [];

    const result: ReaderPage[] = [];

    result.push({ type: 'title' });
    result.push({ type: 'toc' });

    const sortedChapters = [...(book.chapters || [])].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const chapter of sortedChapters) {
      result.push({
        type: 'chapter-start',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterNumber: chapter.sortOrder,
      });

      const sortedEntries = [...(chapter.entries || [])].sort((a, b) => a.sortOrder - b.sortOrder);
      const charsPerPage = CHARS_PER_PAGE[fontSize];
      let currentEntries: ReaderEntry[] = [];
      let currentCharCount = 0;

      for (const entry of sortedEntries) {
        const entryLength = entry.text.length + (entry.reference?.length || 0);

        if (currentCharCount + entryLength > charsPerPage && currentEntries.length > 0) {
          result.push({
            type: 'content',
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            entryIds: currentEntries.map(e => e.id),
            entries: currentEntries,
          });
          currentEntries = [];
          currentCharCount = 0;
        }

        currentEntries.push(entry);
        currentCharCount += entryLength;
      }

      if (currentEntries.length > 0) {
        result.push({
          type: 'content',
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          entryIds: currentEntries.map(e => e.id),
          entries: currentEntries,
        });
      }
    }

    return result;
  }, [book, fontSize]);

  const totalPages = pages.length;
  const currentPage = pages[currentPageIndex] || null;

  const goToPage = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalPages) {
        setCurrentPageIndex(index);
      }
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  }, [currentPageIndex, totalPages]);

  const prevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  }, [currentPageIndex]);

  const goToChapter = useCallback(
    (chapterId: string) => {
      const index = pages.findIndex(p => p.type === 'chapter-start' && p.chapterId === chapterId);
      if (index !== -1) {
        setCurrentPageIndex(index);
      }
    },
    [pages]
  );

  const goToBeginning = useCallback(() => {
    setCurrentPageIndex(0);
  }, []);

  const goToToc = useCallback(() => {
    const index = pages.findIndex(p => p.type === 'toc');
    if (index !== -1) {
      setCurrentPageIndex(index);
    }
  }, [pages]);

  const findPageByProgress = useCallback(
    (chapterId: string | null, entryId: string | null, pageIndex: number): number => {
      if (!chapterId) return pageIndex || 0;

      if (entryId) {
        const index = pages.findIndex(p => p.type === 'content' && p.entryIds?.includes(entryId));
        if (index !== -1) return index;
      }

      const chapterIndex = pages.findIndex(p => p.type === 'chapter-start' && p.chapterId === chapterId);
      if (chapterIndex !== -1) return chapterIndex;

      return pageIndex || 0;
    },
    [pages]
  );

  return {
    pages,
    currentPage,
    currentPageIndex,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    goToChapter,
    goToBeginning,
    goToToc,
    setCurrentPageIndex,
    findPageByProgress,
    fontSize: FONT_SIZES[fontSize],
    lineHeight: LINE_HEIGHTS[fontSize],
  };
}
