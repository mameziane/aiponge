import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { getLogger } from '@config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { createDrizzleRepository, getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { BookRepository } from '@infrastructure/repositories';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('intelligence-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceChapterController {
  async createChapter(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { title, sortOrder, bookId } = req.body;

      if (!title) {
        ServiceErrors.badRequest(res, 'Chapter title is required', req);
        return;
      }

      const repository = ServiceFactory.createIntelligenceRepository();

      const existingChapter = await repository.findChapterByUserIdAndTitle(userId, title);
      if (existingChapter) {
        ServiceErrors.conflict(res, 'A chapter with this title already exists', req);
        return;
      }

      let targetBookId = bookId;
      if (!targetBookId) {
        const bookRepo = createDrizzleRepository(BookRepository);
        const defaultBook = await bookRepo.getOrCreateDefaultPersonalBook(userId);
        targetBookId = defaultBook.id;
      }

      const chapter = await repository.createChapter({
        userId,
        title,
        sortOrder: sortOrder ?? 0,
        bookId: targetBookId,
      });

      logger.info('Chapter created', { id: chapter.id, userId, title, bookId: targetBookId });
      sendCreated(res, chapter);
    } catch (error) {
      logger.error('Create chapter error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to create chapter', req);
    }
  }

  async getChapters(req: Request, res: Response): Promise<void> {
    const { userId: authenticatedUserId } = extractAuthContext(req);
    const pathUserId = req.params.userId as string;
    const bookId = req.query.bookId as string | undefined;

    const userId = authenticatedUserId || pathUserId;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'User authentication required', req);
      return;
    }

    if (pathUserId && authenticatedUserId && pathUserId !== authenticatedUserId) {
      ServiceErrors.forbidden(res, 'Access denied', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get chapters',
      handler: async () => {
        logger.info('[getChapters] Request received', { userId, bookId, authenticated: !!authenticatedUserId });

        const repository = ServiceFactory.createIntelligenceRepository();
        const chapters = await repository.findChaptersByUserId(userId, bookId);

        logger.info('[getChapters] Chapters found', {
          userId,
          bookId,
          count: chapters.length,
          chapters: chapters.map(c => ({ id: c.id, title: c.title, bookId: c.bookId })),
        });
        return chapters;
      },
    });
  }

  async updateChapter(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { userId } = extractAuthContext(req);
      const { title, sortOrder, bookId } = req.body;

      const repository = ServiceFactory.createIntelligenceRepository();

      const existingChapter = await repository.findChapterById(id);
      if (!existingChapter) {
        ServiceErrors.notFound(res, 'Chapter', req);
        return;
      }
      if (existingChapter.userId !== userId) {
        ServiceErrors.forbidden(res, 'Unauthorized to update this chapter', req);
        return;
      }

      if (title && title !== existingChapter.title) {
        const duplicateChapter = await repository.findChapterByUserIdAndTitle(userId, title);
        if (duplicateChapter) {
          ServiceErrors.conflict(res, 'A chapter with this title already exists', req);
          return;
        }
      }

      if (bookId !== undefined && bookId !== existingChapter.bookId) {
        const bookRepo = createDrizzleRepository(BookRepository);
        const targetBook = await bookRepo.getById(bookId);
        if (!targetBook) {
          ServiceErrors.notFound(res, 'Target book', req);
          return;
        }
        if (targetBook.userId !== userId) {
          ServiceErrors.forbidden(res, 'Unauthorized to move chapter to this book', req);
          return;
        }
      }

      const updated = await repository.updateChapter(id, {
        ...(title && { title }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(bookId !== undefined && { bookId }),
      });

      logger.info('Chapter updated', { id, userId, bookId });
      sendSuccess(res, updated);
    } catch (error) {
      logger.error('Update chapter error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update chapter', req);
    }
  }

  async deleteChapter(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const { userId } = extractAuthContext(req);

      const repository = ServiceFactory.createIntelligenceRepository();

      const existingChapter = await repository.findChapterById(id);
      if (!existingChapter) {
        ServiceErrors.notFound(res, 'Chapter', req);
        return;
      }
      if (existingChapter.userId !== userId) {
        ServiceErrors.forbidden(res, 'Unauthorized to delete this chapter', req);
        return;
      }

      await repository.deleteChapter(id);
      logger.info('Chapter deleted', { id, userId });
      sendSuccess(res, { deleted: true });
    } catch (error) {
      logger.error('Delete chapter error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete chapter', req);
    }
  }

  async assignEntriesToChapter(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { entryIds, chapterId } = req.body;

      if (!Array.isArray(entryIds) || entryIds.length === 0) {
        ServiceErrors.badRequest(res, 'Entry IDs array is required', req);
        return;
      }

      const repository = ServiceFactory.createIntelligenceRepository();

      if (chapterId) {
        const chapter = await repository.findChapterById(chapterId);
        if (!chapter) {
          ServiceErrors.notFound(res, 'Chapter', req);
          return;
        }
        if (chapter.userId !== userId) {
          ServiceErrors.forbidden(res, 'Unauthorized to assign to this chapter', req);
          return;
        }
      }

      await repository.assignEntriesToChapter(entryIds, chapterId || null, userId);
      logger.info('Entries assigned to chapter', { entryCount: entryIds.length, chapterId, userId });
      sendSuccess(res, { assigned: entryIds.length });
    } catch (error) {
      logger.error('Assign entries to chapter error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to assign entries', req);
    }
  }

  async getChapterSnapshot(req: Request, res: Response): Promise<void> {
    try {
      const chapterId = req.params.chapterId as string;
      const userId = (res.locals.userId as string) || extractAuthContext(req).userId;
      const internalService = req.headers['x-internal-service'] as string;

      if (!chapterId) {
        ServiceErrors.badRequest(res, 'Chapter ID is required', req);
        return;
      }

      if (!userId) {
        ServiceErrors.forbidden(res, 'Authentication required', req);
        return;
      }

      const repository = ServiceFactory.createIntelligenceRepository();
      const chapter = await repository.findChapterById(chapterId);

      if (!chapter) {
        ServiceErrors.notFound(res, 'Chapter', req);
        return;
      }

      if (chapter.userId !== userId) {
        ServiceErrors.forbidden(res, 'Unauthorized to access this chapter', req);
        return;
      }

      logger.debug('Chapter snapshot requested', { chapterId, userId, internalService });

      const entries = await repository.findEntriesByChapterId(chapterId);
      const entryCount = entries.length;

      const moodCounts: Record<string, number> = {};
      const sentimentCounts: Record<string, number> = {};
      const allThemes: string[] = [];

      for (const entry of entries) {
        if (entry.moodContext) {
          moodCounts[entry.moodContext] = (moodCounts[entry.moodContext] || 0) + 1;
        }
        if (entry.sentiment) {
          sentimentCounts[entry.sentiment] = (sentimentCounts[entry.sentiment] || 0) + 1;
        }
        if (entry.tags && Array.isArray(entry.tags)) {
          allThemes.push(...entry.tags);
        }
      }

      const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      const themeCounts: Record<string, number> = {};
      for (const theme of allThemes) {
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      }
      const topThemes = Object.entries(themeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme);

      let bookTitle: string | undefined;
      if (chapter.bookId) {
        try {
          const bookRepo = createDrizzleRepository(BookRepository);
          const book = await bookRepo.getById(chapter.bookId);
          bookTitle = book?.title;
        } catch (err) {
          logger.warn('Failed to fetch book title for chapter snapshot', {
            chapterId: chapter.id,
            bookId: chapter.bookId,
            error: serializeError(err),
          });
          bookTitle = undefined;
        }
      }

      const snapshot = {
        id: chapter.id,
        title: chapter.title,
        bookId: chapter.bookId,
        bookTitle,
        entryCount,
        dominantMood,
        dominantSentiment,
        themes: topThemes,
        entries: entries.map(t => ({
          id: t.id,
          content: t.content,
          moodContext: t.moodContext,
          sentiment: t.sentiment,
          tags: t.tags,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      };

      logger.info('Chapter snapshot generated', { chapterId, entryCount });
      sendSuccess(res, snapshot);
    } catch (error) {
      logger.error('Get chapter snapshot error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get chapter snapshot', req);
    }
  }
}
