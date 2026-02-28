import { Chapter } from '@domains/library/types';
import { contextIsAdmin } from '@aiponge/shared-contracts';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { BookEntity } from './BookEntity';

export class ChapterEntity {
  constructor(
    private readonly data: Chapter,
    private readonly parentBook?: BookEntity
  ) {}

  get id(): string {
    return this.data.id;
  }

  get bookId(): string {
    return this.data.bookId;
  }

  get userId(): string {
    return this.data.userId;
  }

  get title(): string {
    return this.data.title;
  }

  get sortOrder(): number {
    return this.data.sortOrder;
  }

  get isLocked(): boolean {
    return this.data.isLocked;
  }

  get raw(): Chapter {
    return this.data;
  }

  get book(): BookEntity | undefined {
    return this.parentBook;
  }

  isOwnedBy(userId: string): boolean {
    return this.data.userId === userId;
  }

  canBeViewedBy(context: ContentAccessContext): boolean {
    if (this.parentBook) {
      return this.parentBook.canBeViewedBy(context);
    }
    return false;
  }

  canBeEditedBy(context: ContentAccessContext): boolean {
    if (this.data.isLocked && !contextIsAdmin(context)) {
      return false;
    }
    if (this.parentBook) {
      return this.parentBook.canBeEditedBy(context);
    }
    return false;
  }

  canBeDeletedBy(context: ContentAccessContext): boolean {
    if (this.parentBook) {
      return this.parentBook.canBeDeletedBy(context);
    }
    return false;
  }

  canAddEntriesBy(context: ContentAccessContext): boolean {
    return this.canBeEditedBy(context);
  }
}
