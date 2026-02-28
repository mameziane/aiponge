import { Entry } from '@domains/library/types';
import { ENTRY_TYPES } from '@aiponge/shared-contracts';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { ChapterEntity } from './ChapterEntity';
import { BookEntity } from './BookEntity';

export class EntryEntity {
  constructor(
    private readonly data: Entry,
    private readonly parentChapter?: ChapterEntity,
    private readonly parentBook?: BookEntity
  ) {}

  get id(): string {
    return this.data.id;
  }

  get chapterId(): string {
    return this.data.chapterId;
  }

  get bookId(): string {
    return this.data.bookId;
  }

  get userId(): string | null {
    return this.data.userId;
  }

  get entryType(): string | null {
    return this.data.entryType;
  }

  get content(): string {
    return this.data.content;
  }

  get sortOrder(): number {
    return this.data.sortOrder;
  }

  get raw(): Entry {
    return this.data;
  }

  get chapter(): ChapterEntity | undefined {
    return this.parentChapter;
  }

  get book(): BookEntity | undefined {
    return this.parentBook;
  }

  get isReflection(): boolean {
    return this.data.entryType === ENTRY_TYPES.REFLECTION;
  }

  get isBookmark(): boolean {
    return this.data.entryType === ENTRY_TYPES.BOOKMARK;
  }

  get isQuote(): boolean {
    return this.data.entryType === ENTRY_TYPES.QUOTE;
  }

  get isNote(): boolean {
    return this.data.entryType === ENTRY_TYPES.NOTE;
  }

  get isInsight(): boolean {
    return this.data.entryType === ENTRY_TYPES.INSIGHT;
  }

  isOwnedBy(userId: string): boolean {
    return this.data.userId === userId;
  }

  canBeViewedBy(context: ContentAccessContext): boolean {
    if (this.parentChapter) {
      return this.parentChapter.canBeViewedBy(context);
    }
    if (this.parentBook) {
      return this.parentBook.canBeViewedBy(context);
    }
    return false;
  }

  canBeEditedBy(context: ContentAccessContext): boolean {
    if (this.parentChapter) {
      return this.parentChapter.canBeEditedBy(context);
    }
    if (this.parentBook) {
      return this.parentBook.canBeEditedBy(context);
    }
    return false;
  }

  canBeDeletedBy(context: ContentAccessContext): boolean {
    if (this.parentChapter) {
      return this.parentChapter.canBeDeletedBy(context);
    }
    if (this.parentBook) {
      return this.parentBook.canBeDeletedBy(context);
    }
    return false;
  }

  canAddIllustrationsBy(context: ContentAccessContext): boolean {
    return this.canBeEditedBy(context);
  }
}
