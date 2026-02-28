import type React from 'react';
import type { Entry, EntryChapter, Book } from '@/types/profile.types';

export interface ChapterControlsRef {
  expandAll: () => void;
  collapseAll: () => void;
  toggleSortOrder: () => void;
  isChapterView: boolean;
  isReversed: boolean;
}

export interface BookContentTabProps {
  entriesLoading: boolean;
  entriesLoaded: boolean;
  entries: Entry[];
  onEntriesUpdate: () => Promise<void>;
  refreshTrigger?: number;
  totalEntriesCount?: number;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  currentEntry?: Entry | null;
  setCurrentEntry?: (entry: Entry | null) => void;
  generatingInsight?: boolean;
  generatedInsight?: string | null;
  generateInsightFromEntry?: () => Promise<string | null>;
  clearGeneratedInsight?: () => void;
  selectedSearchResultId?: string | null;
  onClearSelectedSearchResult?: () => void;
  entryIdsWithSongs?: Set<string>;
  onChapterControlsReady?: (controls: ChapterControlsRef) => void;
  currentBookId?: string | null;
  books?: Book[];
  booksLoading?: boolean;
  onChapterMoved?: () => Promise<void>;
  headerControls?: React.ReactNode;
  initialExpandChapters?: boolean;
  onImageLongPress?: (imageUri: string) => void;
  canDelete?: boolean;
}

export type ViewMode = 'chapters' | 'entries';
