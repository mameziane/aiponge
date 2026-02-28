import { Request, Response } from 'express';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import {
  LibChapterCreateSchema as chapterCreateSchema,
  LibChapterUpdateSchema as chapterUpdateSchema,
} from '@aiponge/shared-contracts';
import type { LibraryControllerDeps } from './library-helpers';
import { formatZodErrors, buildContext, handleUseCaseResult, buildEnrichedContext } from './library-helpers';

export class ChapterController {
  constructor(private readonly deps: LibraryControllerDeps) {}

  async getMyChapters(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);

    const chapters = await this.deps.chapterRepo.getByUser(context.userId);
    const result = { chapters, total: chapters.length };

    sendSuccess(res, result);
  }

  async getChaptersByBook(req: Request, res: Response): Promise<void> {
    const bookId = req.params.bookId as string;
    const context = await buildEnrichedContext(this.deps.db, req);

    const result = await this.deps.listChaptersUseCase.execute(bookId, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async getChapterById(req: Request, res: Response): Promise<void> {
    const chapterId = req.params.id as string;
    const context = await buildEnrichedContext(this.deps.db, req);

    const result = await this.deps.getChapterUseCase.execute(chapterId, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async createChapter(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);

    const parsed = chapterCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid chapter data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    const result = await this.deps.createChapterUseCase.execute(parsed.data, context);
    handleUseCaseResult(res, result, 201, req);
  }

  async updateChapter(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const chapterId = req.params.id as string;

    const parsed = chapterUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid chapter data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    const result = await this.deps.updateChapterUseCase.execute(chapterId, parsed.data, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async deleteChapter(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const chapterId = req.params.id as string;

    const result = await this.deps.deleteChapterUseCase.execute(chapterId, context);

    if (result.success) {
      sendSuccess(res, { message: 'Chapter deleted' });
    } else {
      handleUseCaseResult(res, result, 200, req);
    }
  }
}
