/**
 * List Chapters Use Case
 * Lists chapters for a book with role-based access validation
 */

import { BookRepository, ChapterRepository, IllustrationRepository } from '@infrastructure/repositories';
import { Chapter, Illustration } from '@infrastructure/database/schemas/library-schema';
import { BookEntity, ChapterEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { LibraryResponse, success, notFound, forbidden, operationFailed } from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('list-chapters-use-case');

export interface ChapterWithIllustrations {
  chapter: Chapter;
  entity: ChapterEntity;
  illustrations: Illustration[];
}

export interface ListChaptersResult {
  chapters: ChapterWithIllustrations[];
  total: number;
}

export class ListChaptersUseCase {
  constructor(
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository,
    private illustrationRepo: IllustrationRepository
  ) {}

  async execute(bookId: string, context: ContentAccessContext): Promise<LibraryResponse<ListChaptersResult>> {
    try {
      const book = await this.bookRepo.getById(bookId);
      if (!book) {
        return notFound('Book', bookId);
      }

      const bookEntity = new BookEntity(book);
      if (!bookEntity.canBeViewedBy(context)) {
        return forbidden('view chapters in this book', 'You do not have permission to view this book');
      }

      const chapters = await this.chapterRepo.getByBook(bookId);

      const chaptersWithIllustrations: ChapterWithIllustrations[] = await Promise.all(
        chapters.map(async chapter => {
          const illustrations = await this.illustrationRepo.getByChapter(chapter.id);
          return {
            chapter,
            entity: new ChapterEntity(chapter, bookEntity),
            illustrations,
          };
        })
      );

      return success({
        chapters: chaptersWithIllustrations,
        total: chaptersWithIllustrations.length,
      });
    } catch (error) {
      logger.error('Failed to list chapters', { error, bookId, userId: context.userId });
      return operationFailed('list chapters', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
