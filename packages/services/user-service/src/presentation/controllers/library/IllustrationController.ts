import { Request, Response } from 'express';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import {
  LibIllustrationCreateSchema as illustrationCreateSchema,
} from '@aiponge/shared-contracts';
import type { LibraryControllerDeps } from './library-helpers';
import {
  formatZodErrors,
  buildContext,
  handleUseCaseResult,
} from './library-helpers';

export class IllustrationController {
  constructor(private readonly deps: LibraryControllerDeps) {}

  async createIllustration(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);

    const parsed = illustrationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid illustration data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    const result = await this.deps.addIllustrationUseCase.execute(parsed.data, context);
    handleUseCaseResult(res, result, 201, req);
  }

  async deleteIllustration(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const illustrationId = req.params.id as string;

    const result = await this.deps.removeIllustrationUseCase.execute(illustrationId, context);

    if (result.success) {
      sendSuccess(res, { message: 'Illustration deleted' });
    } else {
      handleUseCaseResult(res, result, 200, req);
    }
  }

  async reorderIllustrations(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const entryId = req.params.entryId as string;
    const { illustrationIds } = req.body;

    if (!Array.isArray(illustrationIds)) {
      ServiceErrors.badRequest(res, 'illustrationIds must be an array', req);
      return;
    }

    const result = await this.deps.reorderIllustrationsUseCase.execute(entryId, illustrationIds, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async generateBookCover(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const bookId = req.params.bookId as string;

    if (!bookId) {
      ServiceErrors.badRequest(res, 'Book ID required', req);
      return;
    }

    const book = await this.deps.bookRepo.getById(bookId);
    if (!book) {
      ServiceErrors.notFound(res, 'Book', req);
      return;
    }

    const result = await this.deps.generateBookCoverUseCase.execute(
      {
        bookId,
        title: book.title,
        description: book.description || undefined,
        style: 'artistic',
        bookType: book.typeId || undefined,
      },
      context
    );

    handleUseCaseResult(res, result, 201, req);
  }
}
