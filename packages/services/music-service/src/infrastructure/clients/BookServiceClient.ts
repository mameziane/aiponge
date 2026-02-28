/**
 * BookServiceClient - HTTP client for book/library service integration
 * Validates chapter existence for secure shared album creation
 *
 * This client communicates with user-service to validate chapters exist
 * before allowing shared album creation linked to those chapters.
 */

import { createServiceClient, type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import { withServiceResilience } from '@aiponge/platform-core';
import { CACHE } from '@aiponge/shared-contracts';

const logger = getLogger('music-service:book-client');

const SERVICE_NAME = 'user-service';

interface ChapterValidationResult {
  exists: boolean;
  chapterId: string;
  bookId?: string;
  title?: string;
}

const chapterCache = new Map<string, { result: ChapterValidationResult; expiresAt: number }>();
const CACHE_TTL_MS = CACHE.MEDIUM_TTL_MS;
const MAX_CACHE_SIZE = CACHE.MAX_SIZE;

import type { IBookServiceClient } from '../../domains/music-catalog/ports/IBookServiceClient';

export class BookServiceClient implements IBookServiceClient {
  private httpClient: HttpClient;

  constructor() {
    const { httpClient } = createServiceClient('user-service');
    this.httpClient = httpClient;
    logger.debug('Book service client initialized');
  }

  async validateChapterExists(chapterId: string): Promise<ChapterValidationResult> {
    return withServiceResilience(SERVICE_NAME, 'validateChapterExists', async () => {
      if (!chapterId || chapterId.length < 36) {
        return { exists: false, chapterId };
      }

      const now = Date.now();
      const cached = chapterCache.get(chapterId);
      if (cached && cached.expiresAt > now) {
        logger.debug('Chapter validation cache hit', { chapterId });
        return cached.result;
      }

      try {
        const response = await this.httpClient.get<{
          success: boolean;
          data?: { id: string; bookId: string; title: string };
          error?: string;
        }>(getServiceUrl(SERVICE_NAME) + `/api/chapters/${chapterId}`);

        const result: ChapterValidationResult = {
          exists: response?.success === true && !!response.data,
          chapterId,
          bookId: response?.data?.bookId,
          title: response?.data?.title,
        };

        if (chapterCache.size >= MAX_CACHE_SIZE) {
          const oldestKey = chapterCache.keys().next().value;
          if (oldestKey) chapterCache.delete(oldestKey);
        }
        chapterCache.set(chapterId, { result, expiresAt: now + CACHE_TTL_MS });

        logger.debug('Chapter validation completed', { chapterId, exists: result.exists });
        return result;
      } catch (error) {
        logger.error('Chapter validation failed, denying shared album creation', {
          chapterId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { exists: false, chapterId };
      }
    });
  }

  clearCache(): void {
    chapterCache.clear();
    logger.debug('Chapter cache cleared');
  }
}

let sharedInstance: BookServiceClient | null = null;

export function getBookServiceClient(): BookServiceClient {
  if (!sharedInstance) {
    sharedInstance = new BookServiceClient();
  }
  return sharedInstance;
}
