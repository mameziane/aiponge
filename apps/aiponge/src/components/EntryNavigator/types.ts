import type { ReactNode, RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { EmotionalState } from '../book/EmotionSlider';
import type { RiskLevel } from '@/safety/riskAssessment';
import type { Entry, EntryImage, EntryChapter } from '@/types/profile.types';

export type Chapter = EntryChapter;

export interface EntryNavigatorProps {
  entries: Entry[];
  onEntriesUpdate?: () => Promise<void>;
  isLoading?: boolean;
  totalEntriesCount?: number;
  selectionMode?: boolean;
  selectedEntryId?: string;
  onEntrySelect?: (_entry: Entry) => void;
  onCurrentEntryChange?: (_entry: Entry | null) => void;
  onContentChange?: (_content: string) => void;
  newEntryTrigger?: number;
  replaceContentTrigger?: { content: string; timestamp: number } | null;
  onEntryCreated?: () => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  showDateChapterRow?: boolean;
  showEmotionSlider?: boolean;
  middleActionContent?: ReactNode;
  navigateToEntryId?: string | null;
  onNavigatedToEntry?: () => void;
  currentBookId?: string | null;
  /** When true, disables new entry trigger and creation to prevent conflicts with external editing */
  disableNewEntryCreation?: boolean;
  /** Callback when user long-presses an image (for picture-to-song flow) */
  onImageLongPress?: (imageUri: string) => void;
  /** Whether the user can delete entries. Defaults to true. */
  canDelete?: boolean;
}

export interface UseEntryNavigatorReturn {
  currentIndex: number;
  isNewEntryMode: boolean;
  editedContent: string;
  isSaving: boolean;
  isDeleting: boolean;
  emotionalState: EmotionalState;
  selectedDate: Date;
  showDatePicker: boolean;
  chapters: Chapter[];
  selectedChapterId: string | null;
  showChapterPicker: boolean;
  isCreatingChapter: boolean;
  newChapterTitle: string;
  isKeyboardVisible: boolean;
  keyboardHeight: number;
  currentEntry: Entry | null;
  totalEntries: number;
  isCurrentEntrySelected: boolean;
  hasUnsavedChanges: boolean;
  isListening: boolean;
  interimTranscript: string;
  speechSupported: boolean;
  textInputRef: RefObject<TextInput | null>;
  pendingImageUris: string[];
  totalImageCount: number;
  isUploadingImage: boolean;
  localImages: EntryImage[];
  setShowDatePicker: (show: boolean) => void;
  setShowChapterPicker: (show: boolean) => void;
  setNewChapterTitle: (title: string) => void;
  navigateToFirst: () => Promise<void>;
  navigateToPrev: () => Promise<void>;
  navigateToNext: () => Promise<void>;
  navigateToLast: () => Promise<void>;
  handleContentChange: (content: string) => void;
  handleDateChange: (event: unknown, date?: Date) => void;
  handleChapterSelect: (chapterId: string | null) => Promise<void>;
  handleCreateNewChapter: () => Promise<void>;
  handleEmotionalStateChange: (value: EmotionalState) => void;
  handleVoiceInput: () => Promise<void>;
  handleCreateEntry: () => Promise<void>;
  handleDeleteEntry: () => void;
  handleNewEntryMode: () => void;
  handlePickImage: () => Promise<void>;
  handleRemoveImage: (imageId?: string, pendingIndex?: number) => void;
  savePendingChanges: () => Promise<void>;
  dismissKeyboard: () => void;
  formatDisplayDate: (date: Date) => string;
  getChapterDisplayName: (chapterId: string | null) => string;
  detectedRiskLevel: RiskLevel;
  showSafetyRedirect: boolean;
  dismissSafetyRedirect: () => void;
}
