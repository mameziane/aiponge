/**
 * Add Illustration Use Case
 * Adds an illustration to a book, chapter, or entry with ownership validation
 */

import { z } from 'zod';
import {
  BookRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
} from '@infrastructure/repositories';
import { Illustration } from '@infrastructure/database/schemas/library-schema';
import { BookEntity, ChapterEntity, EntryEntity, IllustrationEntity } from '@domains/library/entities';
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
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('add-illustration-use-case');

export const addIllustrationInputSchema = z.object({
  bookId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  entryId: z.string().uuid().optional(),
  url: z.string().url(),
  artworkUrl: z.string().url().optional(),
  altText: z.string().max(255).optional(),
  illustrationType: z.enum(['cover', 'chapter', 'entry', 'inline']),
  source: z.enum(['uploaded', 'ai_generated', 'stock']),
  sortOrder: z.number().int().min(0).optional(),
  generationPrompt: z.string().optional(),
  generationMetadata: z.record(z.unknown()).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export type AddIllustrationInput = z.infer<typeof addIllustrationInputSchema>;

export interface AddIllustrationResult {
  illustration: Illustration;
  entity: IllustrationEntity;
}

export class AddIllustrationUseCase {
  constructor(
    private illustrationRepo: IllustrationRepository,
    private bookRepo: BookRepository,
    private chapterRepo: ChapterRepository,
    private entryRepo: EntryRepository
  ) {}

  async execute(
    input: AddIllustrationInput,
    context: ContentAccessContext
  ): Promise<LibraryResponse<AddIllustrationResult>> {
    try {
      const parsed = addIllustrationInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid illustration data', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const { bookId, chapterId, entryId } = parsed.data;

      if (!bookId && !chapterId && !entryId) {
        return validationError('One of bookId, chapterId, or entryId is required');
      }

      let bookEntity: BookEntity | undefined;
      let chapterEntity: ChapterEntity | undefined;
      let entryEntity: EntryEntity | undefined;

      if (bookId) {
        const book = await this.bookRepo.getById(bookId);
        if (!book) {
          return notFound('Book', bookId);
        }
        bookEntity = new BookEntity(book);
        if (!bookEntity.isOwnedBy(context.userId) && !bookEntity.canBeEditedBy(context)) {
          return forbidden('add illustrations to this book', 'You do not have permission');
        }
      }

      if (chapterId) {
        const chapter = await this.chapterRepo.getById(chapterId);
        if (!chapter) {
          return notFound('Chapter', chapterId);
        }
        const book = await this.bookRepo.getById(chapter.bookId);
        bookEntity = book ? new BookEntity(book) : undefined;
        chapterEntity = new ChapterEntity(chapter, bookEntity);
        if (!chapterEntity.canBeEditedBy(context)) {
          return forbidden('add illustrations to this chapter', 'You do not have permission');
        }
      }

      if (entryId) {
        const entry = await this.entryRepo.getById(entryId);
        if (!entry) {
          return notFound('Entry', entryId);
        }
        const chapter = await this.chapterRepo.getById(entry.chapterId);
        const book = entry.bookId ? await this.bookRepo.getById(entry.bookId) : null;
        bookEntity = book ? new BookEntity(book) : undefined;
        chapterEntity = chapter ? new ChapterEntity(chapter, bookEntity) : undefined;
        entryEntity = new EntryEntity(entry, chapterEntity, bookEntity);
        if (!entryEntity.canAddIllustrationsBy(context)) {
          return forbidden('add illustrations to this entry', 'You do not have permission');
        }
      }

      const illustration = await this.illustrationRepo.create({
        bookId: parsed.data.bookId,
        chapterId: parsed.data.chapterId,
        entryId: parsed.data.entryId,
        url: parsed.data.url,
        artworkUrl: parsed.data.artworkUrl,
        altText: parsed.data.altText,
        illustrationType: parsed.data.illustrationType,
        source: parsed.data.source,
        sortOrder: parsed.data.sortOrder ?? 0,
        generationPrompt: parsed.data.generationPrompt,
        generationMetadata: parsed.data.generationMetadata,
        width: parsed.data.width,
        height: parsed.data.height,
      });

      const entity = new IllustrationEntity(illustration, bookEntity, chapterEntity, entryEntity);

      logger.info('Illustration added', {
        illustrationId: illustration.id,
        type: parsed.data.illustrationType,
        bookId,
        chapterId,
        entryId,
        userId: context.userId,
      });

      return success({ illustration, entity });
    } catch (error) {
      logger.error('Failed to add illustration', { error, input, userId: context.userId });
      return operationFailed('add illustration', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
