import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { getLogger } from '@config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { BookRepository, ChapterRepository } from '@infrastructure/repositories';
import { createContentAccessContext } from '@application/use-cases/library';
import { normalizeRole } from '@aiponge/shared-contracts';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('intelligence-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceEntryController {
  async createEntry(req: Request, res: Response): Promise<void> {
    try {
      const useCase = ServiceFactory.createEntryUseCase();
      const entryData = { ...req.body };
      const { userId: authUserId, role } = extractAuthContext(req);
      const userId = authUserId || entryData.userId;
      const userRole = normalizeRole(role);

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID required', req);
        return;
      }

      if (entryData.autoAssignBookmarks) {
        const db = getDatabase();
        const bookRepo = new BookRepository(db);
        const chapterRepo = new ChapterRepository(db);
        const bookmarksBook = await bookRepo.getOrCreateBookmarksBook(userId);
        const defaultChapter = await chapterRepo.getOrCreateDefaultChapter(bookmarksBook.id, userId, 'Saved');
        entryData.chapterId = defaultChapter.id;
        delete entryData.autoAssignBookmarks;
        logger.info('Auto-assigned entry to Bookmarks book', { userId, chapterId: defaultChapter.id });
      }

      if (entryData.userDate && typeof entryData.userDate === 'string') {
        entryData.userDate = new Date(entryData.userDate);
      }

      const context = createContentAccessContext(userId, userRole);
      const result = await useCase.execute(entryData, context);

      if (result.success === true) {
        sendCreated(res, result.data.entry);
        return;
      }

      const { code, message } = result.error;
      switch (code) {
        case 'NOT_FOUND':
          ServiceErrors.notFound(res, message, req);
          break;
        case 'FORBIDDEN':
          ServiceErrors.forbidden(res, message, req);
          break;
        case 'VALIDATION_ERROR':
          ServiceErrors.badRequest(res, message, req);
          break;
        default:
          ServiceErrors.internal(res, message, req);
      }
    } catch (error) {
      logger.error('Create entry error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to create entry', req);
    }
  }

  async getEntries(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;
      const userRole = normalizeRole(extractAuthContext(req).role);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const bookId = req.query.bookId as string | undefined;

      const useCase = ServiceFactory.createListEntriesUseCase();
      const context = createContentAccessContext(userId, userRole);

      const result = bookId
        ? await useCase.executeByBook(bookId, context, { limit, offset })
        : await useCase.executeByUser(context, { limit, offset });

      if (result.success === true) {
        sendSuccess(res, {
          entries: result.data.entries.map(e => ({ ...e.entry, images: e.illustrations })),
          pagination: result.data.pagination || { total: result.data.total, limit, offset, hasMore: false },
          analytics: result.data.analytics || {
            totalEntries: result.data.total,
            analyzedEntries: 0,
            archivedEntries: 0,
          },
        });
        return;
      }

      const { code, message } = result.error;
      switch (code) {
        case 'NOT_FOUND':
          ServiceErrors.notFound(res, message, req);
          break;
        case 'FORBIDDEN':
          ServiceErrors.forbidden(res, message, req);
          break;
        default:
          ServiceErrors.internal(res, message, req);
      }
    } catch (error) {
      logger.error('Get entries error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get entries', req);
    }
  }

  async getEntryById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);

      const useCase = ServiceFactory.createGetEntryUseCase();
      const context = createContentAccessContext(userId, userRole);
      const result = await useCase.execute(id, context);

      if (result.success === true) {
        sendSuccess(res, {
          ...result.data.entry,
          images: result.data.illustrations,
        });
        return;
      }

      const { code, message } = result.error;
      switch (code) {
        case 'NOT_FOUND':
          ServiceErrors.notFound(res, message, req);
          break;
        case 'FORBIDDEN':
          ServiceErrors.forbidden(res, message, req);
          break;
        default:
          ServiceErrors.internal(res, message, req);
      }
    } catch (error) {
      logger.error('Get entry by id error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get entry', req);
    }
  }

  async updateEntry(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);

      const useCase = ServiceFactory.createUpdateEntryUseCase();
      const context = createContentAccessContext(userId, userRole);
      const result = await useCase.execute(id, req.body, context);

      if (result.success === true) {
        sendSuccess(res, {
          entry: result.data.entry,
          changes: result.data.changes,
          impact: result.data.impact,
        });
        return;
      }

      const { code, message } = result.error;
      switch (code) {
        case 'NOT_FOUND':
          ServiceErrors.notFound(res, message, req);
          break;
        case 'FORBIDDEN':
          ServiceErrors.forbidden(res, message, req);
          break;
        case 'VALIDATION_ERROR':
          ServiceErrors.badRequest(res, message, req);
          break;
        default:
          ServiceErrors.internal(res, message, req);
      }
    } catch (error) {
      logger.error('Update entry error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update entry', req);
    }
  }

  async deleteEntry(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);

      const useCase = ServiceFactory.createDeleteEntryUseCase();
      const context = createContentAccessContext(userId, userRole);
      const result = await useCase.execute(id, context);

      if (result.success === true) {
        sendSuccess(res, {
          success: true,
          deletedEntryId: result.data.entryId,
          deletedInsights: result.data.deletedInsights,
          deletedImages: result.data.deletedImages,
          message: 'Entry deleted successfully',
        });
        return;
      }

      const { code, message } = result.error;
      switch (code) {
        case 'NOT_FOUND':
          ServiceErrors.notFound(res, message, req);
          break;
        case 'FORBIDDEN':
          ServiceErrors.forbidden(res, message, req);
          break;
        default:
          ServiceErrors.internal(res, message, req);
      }
    } catch (error) {
      logger.error('Delete entry error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete entry', req);
    }
  }

  async batchUpdateEntries(req: Request, res: Response): Promise<void> {
    try {
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);
      const { updates } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const context = createContentAccessContext(userId, userRole);
      const useCase = ServiceFactory.createUpdateEntryUseCase();

      let updated = 0;
      let failed = 0;
      const errors: { id: string; error: string }[] = [];

      const db = getDatabase();
      await db.transaction(async () => {
        for (const item of updates) {
          if (!item.id || typeof item.id !== 'string') {
            failed++;
            errors.push({ id: item.id || 'unknown', error: 'Missing or invalid id' });
            continue;
          }

          try {
            const updateData: Record<string, unknown> = {};
            if (item.content !== undefined) updateData.content = item.content;
            if (item.sortOrder !== undefined) updateData.sortOrder = item.sortOrder;

            if (Object.keys(updateData).length === 0) {
              failed++;
              errors.push({ id: item.id, error: 'No valid fields to update' });
              continue;
            }

            const result = await useCase.execute(item.id, updateData, context);
            if (result.success) {
              updated++;
            } else {
              failed++;
              errors.push({ id: item.id, error: 'error' in result ? result.error?.message : 'Update failed' });
            }
          } catch (err) {
            failed++;
            errors.push({ id: item.id, error: err instanceof Error ? err.message : 'Update failed' });
          }
        }
      });

      logger.info('Batch entry update completed', { updated, failed, userId });
      sendSuccess(res, { updated, failed, errors });
    } catch (error) {
      logger.error('Batch update entries error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to batch update entries', req);
    }
  }

  async batchDeleteEntries(req: Request, res: Response): Promise<void> {
    try {
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);
      const { ids } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const context = createContentAccessContext(userId, userRole);
      const useCase = ServiceFactory.createDeleteEntryUseCase();

      let deleted = 0;
      let failed = 0;
      const errors: { id: string; error: string }[] = [];

      const db = getDatabase();
      await db.transaction(async () => {
        for (const id of ids) {
          if (!id || typeof id !== 'string') {
            failed++;
            errors.push({ id: id || 'unknown', error: 'Invalid id' });
            continue;
          }

          try {
            const result = await useCase.execute(id, context);
            if (result.success) {
              deleted++;
            } else {
              failed++;
              errors.push({ id, error: 'error' in result ? result.error?.message : 'Delete failed' });
            }
          } catch (err) {
            failed++;
            errors.push({ id, error: err instanceof Error ? err.message : 'Delete failed' });
          }
        }
      });

      logger.info('Batch entry delete completed', { deleted, failed, userId });
      sendSuccess(res, { deleted, failed, errors });
    } catch (error) {
      logger.error('Batch delete entries error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to batch delete entries', req);
    }
  }

  async archiveEntry(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to archive entry',
      handler: async () => {
        const id = req.params.id as string;
        const { userId, archive = true } = req.body;
        const useCase = ServiceFactory.createArchiveEntryUseCase();
        return useCase.execute({ entryId: id, userId, archive });
      },
    });
  }
}
