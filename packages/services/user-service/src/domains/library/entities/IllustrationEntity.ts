import { Illustration, ILLUSTRATION_TYPES, ILLUSTRATION_SOURCES } from '@domains/library/types';
import { contextIsAdmin } from '@aiponge/shared-contracts';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { BookEntity } from './BookEntity';
import { ChapterEntity } from './ChapterEntity';
import { EntryEntity } from './EntryEntity';

export class IllustrationEntity {
  constructor(
    private readonly data: Illustration,
    private readonly parentBook?: BookEntity,
    private readonly parentChapter?: ChapterEntity,
    private readonly parentEntry?: EntryEntity
  ) {}

  get id(): string {
    return this.data.id;
  }

  get bookId(): string | null {
    return this.data.bookId;
  }

  get chapterId(): string | null {
    return this.data.chapterId;
  }

  get entryId(): string | null {
    return this.data.entryId;
  }

  get url(): string {
    return this.data.url;
  }

  get illustrationType(): string {
    return this.data.illustrationType;
  }

  get source(): string | null {
    return this.data.source;
  }

  get sortOrder(): number {
    return this.data.sortOrder;
  }

  get raw(): Illustration {
    return this.data;
  }

  get isCover(): boolean {
    return this.data.illustrationType === ILLUSTRATION_TYPES.COVER;
  }

  get isChapterIllustration(): boolean {
    return this.data.illustrationType === ILLUSTRATION_TYPES.CHAPTER;
  }

  get isEntryIllustration(): boolean {
    return this.data.illustrationType === ILLUSTRATION_TYPES.ENTRY;
  }

  get isInline(): boolean {
    return this.data.illustrationType === ILLUSTRATION_TYPES.INLINE;
  }

  get isUploaded(): boolean {
    return this.data.source === ILLUSTRATION_SOURCES.UPLOADED;
  }

  get isAiGenerated(): boolean {
    return this.data.source === ILLUSTRATION_SOURCES.AI_GENERATED;
  }

  get isStock(): boolean {
    return this.data.source === ILLUSTRATION_SOURCES.STOCK;
  }

  getParentId(): string | null {
    return this.data.bookId || this.data.chapterId || this.data.entryId;
  }

  canBeViewedBy(context: ContentAccessContext): boolean {
    if (contextIsAdmin(context)) return true;
    if (this.parentEntry) return this.parentEntry.canBeViewedBy(context);
    if (this.parentChapter) return this.parentChapter.canBeViewedBy(context);
    if (this.parentBook) return this.parentBook.canBeViewedBy(context);
    return false;
  }

  canBeDeletedBy(context: ContentAccessContext): boolean {
    if (contextIsAdmin(context)) return true;
    if (this.parentEntry) return this.parentEntry.canBeEditedBy(context);
    if (this.parentChapter) return this.parentChapter.canBeEditedBy(context);
    if (this.parentBook) return this.parentBook.canBeEditedBy(context);
    return false;
  }

  canBeReorderedBy(context: ContentAccessContext): boolean {
    return this.canBeDeletedBy(context);
  }
}
