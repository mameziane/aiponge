import { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { serializeError, extractAuthContext } from '@aiponge/platform-core';
import type { ShareLinkContentType } from '@infrastructure/database/schemas/share-link-schema';
import type { LibraryControllerDeps } from './library-helpers';
import {
  logger,
  handleRequest,
  formatZodErrors,
} from './library-helpers';

export class ShareLinkController {
  constructor(private readonly deps: LibraryControllerDeps) {}

  async createShareLink(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const schema = z.object({
        contentId: z.string().uuid(),
        contentType: z.enum(['book', 'entry']),
        expiresAt: z.string().datetime().optional(),
        maxUses: z.number().int().positive().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        ServiceErrors.badRequest(res, 'Invalid input', req, formatZodErrors(parsed.error.issues));
        return;
      }

      const { contentId, contentType, expiresAt, maxUses } = parsed.data;

      if (contentType === 'book') {
        const book = await this.deps.bookRepo.getById(contentId);
        if (!book || book.userId !== userId) {
          ServiceErrors.forbidden(res, 'You can only share your own content', req);
          return;
        }
      } else if (contentType === 'entry') {
        const entry = await this.deps.entryRepo.getById(contentId);
        if (!entry) {
          ServiceErrors.notFound(res, 'Entry not found', req);
          return;
        }
        const chapter = await this.deps.chapterRepo.getById(entry.chapterId);
        if (!chapter) {
          ServiceErrors.notFound(res, 'Parent chapter not found', req);
          return;
        }
        const book = await this.deps.bookRepo.getById(chapter.bookId);
        if (!book || book.userId !== userId) {
          ServiceErrors.forbidden(res, 'You can only share your own content', req);
          return;
        }
      } else {
        ServiceErrors.badRequest(res, 'Unsupported content type for sharing', req);
        return;
      }

      const link = await this.deps.shareLinkRepo.createLink(contentId, contentType as ShareLinkContentType, userId, {
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        maxUses,
      });

      sendCreated(res, link);
    } catch (error) {
      logger.error('Failed to create share link', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to create share link', undefined, req);
    }
  }

  async resolveShareLink(req: Request, res: Response): Promise<void> {
    try {
      const token = req.params.token as string;
      if (!token) {
        ServiceErrors.badRequest(res, 'Token required', req);
        return;
      }

      const resolved = await this.deps.shareLinkRepo.resolveToken(token);
      if (!resolved) {
        ServiceErrors.notFound(res, 'Share link not found, expired, or revoked', req);
        return;
      }

      sendSuccess(res, resolved);
    } catch (error) {
      logger.error('Failed to resolve share link', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to resolve share link', undefined, req);
    }
  }

  async getShareLinks(req: Request, res: Response): Promise<void> {
    const { userId } = extractAuthContext(req);
    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const contentId = req.params.contentId as string;
    if (!contentId) {
      ServiceErrors.badRequest(res, 'Content ID required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get share links',
      handler: async () => this.deps.shareLinkRepo.getLinksForContent(contentId, userId),
    });
  }

  async revokeShareLink(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const linkId = req.params.linkId as string;
      if (!linkId) {
        ServiceErrors.badRequest(res, 'Link ID required', req);
        return;
      }

      const revoked = await this.deps.shareLinkRepo.revokeLink(linkId, userId);
      if (!revoked) {
        ServiceErrors.notFound(res, 'Share link not found or already revoked', req);
        return;
      }

      sendSuccess(res, { message: 'Share link revoked' });
    } catch (error) {
      logger.error('Failed to revoke share link', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to revoke share link', undefined, req);
    }
  }
}
