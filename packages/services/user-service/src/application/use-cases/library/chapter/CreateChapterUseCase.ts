/**
 * Create Chapter Use Case
 * Creates a chapter within a book with ownership validation
 */

import { z } from 'zod';
import { BookRepository, ChapterRepository } from '@infrastructure/repositories';
import { Chapter } from '@infrastructure/database/schemas/library-schema';
import { BookEntity, ChapterEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import {
  LibraryResponse,
  success,
  notFound,
  forbidden,
  validationError,
  operationFailed,
} from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';

const logger = getLogger('create-chapter-use-case');

export const createChapterInputSchema = z.object({
  bookId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isLocked: z.boolean().optional(),
  unlockTrigger: z.string().max(100).optional(),
});

export type CreateChapterInput = z.infer<typeof createChapterInputSchema>;

export interface CreateChapterResult {
  chapter: Chapter;
  entity: ChapterEntity;
}

export class CreateChapterUseCase {
  constructor(
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository
  ) {}

  async execute(
    input: CreateChapterInput,
    context: ContentAccessContext
  ): Promise<LibraryResponse<CreateChapterResult>> {
    try {
      const parsed = createChapterInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid chapter data', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const book = await this.bookRepo.getById(parsed.data.bookId);
      if (!book) {
        return notFound('Book', parsed.data.bookId);
      }

      const bookEntity = new BookEntity(book);

      if (!bookEntity.canAddChaptersBy(context)) {
        return forbidden('add chapters to this book', 'You do not have permission to add chapters');
      }

      const chapter = await this.chapterRepo.create({
        bookId: parsed.data.bookId,
        userId: context.userId,
        title: parsed.data.title,
        description: parsed.data.description,
        sortOrder: parsed.data.sortOrder ?? 0,
        isLocked: parsed.data.isLocked ?? false,
        unlockTrigger: parsed.data.unlockTrigger,
      });

      await this.bookRepo.updateChapterCount(book.id);

      const entity = new ChapterEntity(chapter, bookEntity);

      logger.info('Chapter created', {
        chapterId: chapter.id,
        bookId: book.id,
        userId: context.userId,
      });

      return success({ chapter, entity });
    } catch (error) {
      logger.error('Failed to create chapter', { error, input, userId: context.userId });
      return operationFailed('create chapter', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
