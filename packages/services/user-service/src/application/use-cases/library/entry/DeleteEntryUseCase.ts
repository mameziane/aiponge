/**
 * Delete Entry Use Case
 * Deletes an entry with cascading, file cleanup, and role-based authorization
 */

import {
  BookRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
} from '@infrastructure/repositories';
import { IIntelligenceRepository } from '@domains/intelligence';
import { BookEntity, ChapterEntity, EntryEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { LibraryResponse, success, notFound, forbidden, operationFailed } from '../shared/LibraryErrors';
import { getLogger, getServiceUrl, createServiceHttpClient } from '@config/service-urls';
import { signUserIdHeader, serializeError, generateCorrelationId } from '@aiponge/platform-core';
import { UserEventPublisher } from '../../../../infrastructure/events/UserEventPublisher';

const logger = getLogger('delete-entry-use-case');
const httpClient = createServiceHttpClient('internal');

export interface DeleteEntryDependencies {
  intelligenceRepo?: IIntelligenceRepository;
}

export interface DeleteEntryResult {
  deleted: boolean;
  entryId: string;
  deletedInsights: number;
  deletedImages: number;
}

export class DeleteEntryUseCase {
  private intelligenceRepo?: IIntelligenceRepository;

  constructor(
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository,
    private illustrationRepo: IllustrationRepository,
    deps?: DeleteEntryDependencies
  ) {
    this.intelligenceRepo = deps?.intelligenceRepo;
  }

  async execute(entryId: string, context: ContentAccessContext): Promise<LibraryResponse<DeleteEntryResult>> {
    try {
      const entry = await this.entryRepo.getById(entryId);
      if (!entry) {
        return notFound('Entry', entryId);
      }

      const chapter = await this.chapterRepo.getById(entry.chapterId);
      const book = entry.bookId ? await this.bookRepo.getById(entry.bookId) : null;

      const bookEntity = book ? new BookEntity(book) : undefined;
      const chapterEntity = chapter ? new ChapterEntity(chapter, bookEntity) : undefined;
      const entity = new EntryEntity(entry, chapterEntity, bookEntity);

      if (!entity.canBeDeletedBy(context)) {
        return forbidden('delete this entry', 'You do not have permission to delete this entry');
      }

      const { chapterId, bookId } = entry;

      let deletedInsights = 0;
      if (this.intelligenceRepo) {
        const insights = await this.intelligenceRepo.findInsightsByEntryId(entryId);
        deletedInsights = insights.length;
      }

      const illustrations = await this.illustrationRepo.getByEntry(entryId);
      let deletedImages = 0;
      for (const illustration of illustrations) {
        await this.deleteAssociatedFile(illustration.url, context.userId);
        deletedImages++;
      }

      if (entry.illustrationUrl) {
        await this.deleteAssociatedFile(entry.illustrationUrl, context.userId);
        deletedImages++;
      }

      await this.entryRepo.delete(entryId);

      await this.chapterRepo.updateEntryCount(chapterId);
      if (bookId) {
        await this.bookRepo.updateEntryCount(bookId);
      }

      // Handle orphaned promoted copies: clear sourceEntryId reference
      // This prevents promoted copies from pointing to deleted original entries
      try {
        const orphanedCount = await this.entryRepo.clearSourceEntryIdReferences(entryId);
        if (orphanedCount > 0) {
          logger.info('Cleared sourceEntryId references from promoted copies', {
            originalEntryId: entryId,
            orphanedCopiesUpdated: orphanedCount,
          });
        }
      } catch (error) {
        logger.warn('Failed to clear sourceEntryId references', {
          entryId,
          error: serializeError(error),
        });
      }

      logger.info('Entry deleted', {
        entryId,
        userId: context.userId,
        deletedInsights,
        deletedImages,
      });

      UserEventPublisher.libraryEntryDeleted(entryId, context.userId, generateCorrelationId(), chapterId, bookId);

      return success({ deleted: true, entryId, deletedInsights, deletedImages });
    } catch (error) {
      logger.error('Failed to delete entry', { error, entryId, userId: context.userId });
      return operationFailed('delete entry', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async deleteAssociatedFile(fileUrl: string, userId: string): Promise<void> {
    try {
      const filename = fileUrl.split('/').pop();
      if (!filename) return;

      const fileId = filename.replace(/\.(webp|jpg|jpeg|png|gif)$/i, '');

      const storageServiceUrl = getServiceUrl('storage-service');
      const authHeaders = signUserIdHeader(userId);

      const response = await httpClient.deleteWithResponse(`${storageServiceUrl}/api/storage/files/${fileId}`, {
        headers: { ...authHeaders },
        timeout: 30000,
      });

      if (response.ok || response.status === 404) {
        logger.info('Associated file deleted', { fileId, userId });

        const thumbFileId = `${fileId}_thumb`;
        await httpClient.deleteWithResponse(`${storageServiceUrl}/api/storage/files/${thumbFileId}`, {
          headers: { ...authHeaders },
          timeout: 30000,
        });
      } else {
        logger.warn('Failed to delete associated file', { fileId, status: response.status });
      }
    } catch (error) {
      logger.warn('Error deleting associated file', {
        fileUrl,
        error: serializeError(error),
      });
    }
  }
}
