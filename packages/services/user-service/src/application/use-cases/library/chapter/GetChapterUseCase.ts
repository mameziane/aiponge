/**
 * Get Chapter Use Case
 * Retrieves a chapter with illustrations and role-based access validation
 */

import { BookRepository, ChapterRepository, IllustrationRepository } from '@infrastructure/repositories';
import { Chapter, Illustration } from '@infrastructure/database/schemas/library-schema';
import { BookEntity, ChapterEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { LibraryResponse, success, notFound, forbidden, operationFailed } from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('get-chapter-use-case');

export interface GetChapterResult {
  chapter: Chapter;
  entity: ChapterEntity;
  illustrations: Illustration[];
}

export class GetChapterUseCase {
  constructor(
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository,
    private illustrationRepo: IllustrationRepository
  ) {}

  async execute(chapterId: string, context: ContentAccessContext): Promise<LibraryResponse<GetChapterResult>> {
    try {
      const chapter = await this.chapterRepo.getById(chapterId);
      if (!chapter) {
        return notFound('Chapter', chapterId);
      }

      const book = await this.bookRepo.getById(chapter.bookId);
      const bookEntity = book ? new BookEntity(book) : undefined;
      const entity = new ChapterEntity(chapter, bookEntity);

      if (!entity.canBeViewedBy(context)) {
        return forbidden('view this chapter', 'You do not have permission to view this chapter');
      }

      const illustrations = await this.illustrationRepo.getByChapter(chapterId);

      return success({
        chapter,
        entity,
        illustrations,
      });
    } catch (error) {
      logger.error('Failed to get chapter', { error, chapterId, userId: context.userId });
      return operationFailed('retrieve chapter', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
