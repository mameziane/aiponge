import { eq, and, isNull, sql } from 'drizzle-orm';
import { createLogger } from '@aiponge/platform-core';
import type { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { shareLinks, type ShareLink, type ShareLinkContentType } from '../database/schemas/share-link-schema';
import { randomBytes } from 'crypto';

const logger = createLogger('share-link-repository');

export interface CreateShareLinkOptions {
  expiresAt?: Date;
  maxUses?: number;
}

export interface ResolvedShareLink {
  contentId: string;
  contentType: ShareLinkContentType;
  createdBy: string;
}

export class ShareLinkRepository {
  constructor(private db: DatabaseConnection) {}

  async createLink(
    contentId: string,
    contentType: ShareLinkContentType,
    createdBy: string,
    options: CreateShareLinkOptions = {}
  ): Promise<ShareLink> {
    const token = randomBytes(32).toString('hex');

    const [link] = await this.db
      .insert(shareLinks)
      .values({
        contentId,
        contentType,
        token,
        createdBy,
        expiresAt: options.expiresAt ?? null,
        maxUses: options.maxUses ?? null,
      })
      .returning();

    logger.info('Share link created', { contentId, contentType, createdBy });
    return link;
  }

  async resolveToken(token: string): Promise<ResolvedShareLink | null> {
    const result = await this.db
      .update(shareLinks)
      .set({ useCount: sql`${shareLinks.useCount} + 1` })
      .where(
        and(
          eq(shareLinks.token, token),
          isNull(shareLinks.revokedAt),
          sql`(${shareLinks.expiresAt} IS NULL OR ${shareLinks.expiresAt} > NOW())`,
          sql`(${shareLinks.maxUses} IS NULL OR ${shareLinks.useCount} < ${shareLinks.maxUses})`
        )
      )
      .returning({
        contentId: shareLinks.contentId,
        contentType: shareLinks.contentType,
        createdBy: shareLinks.createdBy,
      });

    if (result.length === 0) return null;

    return {
      contentId: result[0].contentId,
      contentType: result[0].contentType as ShareLinkContentType,
      createdBy: result[0].createdBy,
    };
  }

  async getLinksForContent(contentId: string, createdBy: string): Promise<ShareLink[]> {
    return this.db
      .select()
      .from(shareLinks)
      .where(
        and(eq(shareLinks.contentId, contentId), eq(shareLinks.createdBy, createdBy), isNull(shareLinks.revokedAt))
      );
  }

  async revokeLink(linkId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.id, linkId), eq(shareLinks.createdBy, userId)))
      .returning();

    return result.length > 0;
  }
}
