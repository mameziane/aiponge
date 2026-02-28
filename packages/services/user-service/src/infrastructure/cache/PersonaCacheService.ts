/**
 * Persona Cache Service
 * Redis-backed caching layer for user personas to enable horizontal scalability
 *
 * Cache Strategy:
 * - TTL: 30 minutes (personas change infrequently but need to stay fresh)
 * - Key pattern: persona:{userId}:latest
 * - Invalidation: On persona upsert/delete operations
 */

import { createRedisCache, type ICache, serializeError } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import type { PersistedPersona, IPersonaRepository, UpsertPersonaInput } from '../repositories/PersonaRepository';

const logger = getLogger('persona-cache-service');

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes
const CACHE_KEY_PREFIX = 'aiponge:user:persona:';

export interface ICachedPersonaRepository extends IPersonaRepository {
  invalidateCache(userId: string): Promise<void>;
}

export class CachedPersonaRepository implements ICachedPersonaRepository {
  private cache: ICache | null = null;
  private cacheInitialized = false;

  constructor(
    private readonly repository: IPersonaRepository,
    private readonly enableCache = true
  ) {
    if (enableCache) {
      this.initializeCache();
    }
  }

  private initializeCache(): void {
    try {
      this.cache = createRedisCache({
        serviceName: 'user-service',
        keyPrefix: CACHE_KEY_PREFIX,
        lazyConnect: true,
      });
      this.cacheInitialized = true;
      logger.debug('Persona cache initialized successfully');
    } catch (error) {
      logger.warn('Failed to initialize Redis cache, operating without cache', {
        error: serializeError(error),
      });
      this.cache = null;
      this.cacheInitialized = false;
    }
  }

  private getCacheKey(userId: string): string {
    return `latest:${userId}`;
  }

  async getLatestPersona(userId: string): Promise<PersistedPersona | null> {
    if (this.cache && this.cacheInitialized) {
      try {
        const cached = await this.cache.get(this.getCacheKey(userId));
        if (cached) {
          logger.debug('Persona cache HIT', { userId });
          const parsed = JSON.parse(cached) as PersistedPersona;
          // Restore Date objects from JSON serialization
          return {
            ...parsed,
            generatedAt: new Date(parsed.generatedAt),
            updatedAt: new Date(parsed.updatedAt),
            sourceTimeframeStart: parsed.sourceTimeframeStart ? new Date(parsed.sourceTimeframeStart) : null,
            sourceTimeframeEnd: parsed.sourceTimeframeEnd ? new Date(parsed.sourceTimeframeEnd) : null,
          };
        }
        logger.debug('Persona cache MISS', { userId });
      } catch (error) {
        logger.warn('Cache read error, falling back to database', {
          error: serializeError(error),
          userId,
        });
      }
    }

    const persona = await this.repository.getLatestPersona(userId);

    if (persona && this.cache && this.cacheInitialized) {
      try {
        await this.cache.set(this.getCacheKey(userId), JSON.stringify(persona), CACHE_TTL_SECONDS);
        logger.debug('Persona cached', { userId, ttl: CACHE_TTL_SECONDS });
      } catch (error) {
        logger.warn('Cache write error', {
          error: serializeError(error),
          userId,
        });
      }
    }

    return persona;
  }

  async upsertLatestPersona(input: UpsertPersonaInput): Promise<PersistedPersona> {
    const persona = await this.repository.upsertLatestPersona(input);

    // Invalidate and update cache with new persona
    if (this.cache && this.cacheInitialized) {
      try {
        await this.cache.set(this.getCacheKey(input.userId), JSON.stringify(persona), CACHE_TTL_SECONDS);
        logger.debug('Persona cache updated after upsert', { userId: input.userId });
      } catch (error) {
        logger.warn('Cache update error after upsert', {
          error: serializeError(error),
          userId: input.userId,
        });
      }
    }

    return persona;
  }

  async getPersonaHistory(userId: string, limit?: number): Promise<PersistedPersona[]> {
    // History is not cached as it changes less frequently and is used rarely
    return this.repository.getPersonaHistory(userId, limit);
  }

  async deletePersona(userId: string): Promise<void> {
    await this.repository.deletePersona(userId);
    await this.invalidateCache(userId);
  }

  async deactivateAllPersonas(userId: string): Promise<void> {
    await this.repository.deactivateAllPersonas(userId);
    await this.invalidateCache(userId);
  }

  async invalidateCache(userId: string): Promise<void> {
    if (this.cache && this.cacheInitialized) {
      try {
        await this.cache.del(this.getCacheKey(userId));
        logger.debug('Persona cache invalidated', { userId });
      } catch (error) {
        logger.warn('Cache invalidation error', {
          error: serializeError(error),
          userId,
        });
      }
    }
  }
}

export function createCachedPersonaRepository(
  repository: IPersonaRepository,
  enableCache = true
): ICachedPersonaRepository {
  return new CachedPersonaRepository(repository, enableCache);
}
