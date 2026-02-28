import { Book, BOOK_TYPE_IDS } from '@domains/library/types';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import {
  canViewContent,
  canEditContent,
  canDeleteContent,
  contextIsPrivileged,
  isContentPubliclyAccessible,
  type ContentAccessContext,
  type ContentResource,
} from '@aiponge/shared-contracts';

export type { UserRole } from '@application/use-cases/library/shared/LibraryContext';

export class BookEntity {
  constructor(private readonly data: Book) {}

  get id(): string {
    return this.data.id;
  }

  get userId(): string {
    return this.data.userId;
  }

  get typeId(): string {
    return this.data.typeId;
  }

  get title(): string {
    return this.data.title;
  }

  get isReadOnly(): boolean {
    return this.data.isReadOnly;
  }

  get visibility(): string | null {
    return this.data.visibility;
  }

  get status(): string | null {
    return this.data.status;
  }

  get raw(): Book {
    return this.data;
  }

  get isPersonal(): boolean {
    return this.data.typeId === BOOK_TYPE_IDS.PERSONAL;
  }

  private toResource(): ContentResource {
    return {
      ownerId: this.data.userId,
      visibility: this.data.visibility ?? CONTENT_VISIBILITY.PERSONAL,
    };
  }

  isOwnedBy(userId: string): boolean {
    return this.data.userId === userId;
  }

  isPubliclyAccessible(): boolean {
    return isContentPubliclyAccessible(this.data.visibility ?? CONTENT_VISIBILITY.PERSONAL);
  }

  canBeViewedBy(context: ContentAccessContext): boolean {
    return canViewContent(this.toResource(), context);
  }

  canBeEditedBy(context: ContentAccessContext): boolean {
    if (!canEditContent(this.toResource(), context)) {
      return false;
    }

    if (contextIsPrivileged(context)) return true;

    if (this.data.isReadOnly) return false;

    return true;
  }

  canBeDeletedBy(context: ContentAccessContext): boolean {
    return canDeleteContent(this.toResource(), context);
  }

  canAddChaptersBy(context: ContentAccessContext): boolean {
    return this.canBeEditedBy(context);
  }

  canAddEntriesBy(context: ContentAccessContext): boolean {
    return this.canBeEditedBy(context);
  }
}
