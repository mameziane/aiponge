/**
 * Simple Cache Service
 * Basic in-memory caching for templates and execution results
 * Focused on simplicity - no complex invalidation strategies
 */

import { CacheEntry, CacheStats, Template, ExecuteTemplateResponse } from '../types';
import { createIntervalScheduler, IntervalScheduler } from '@aiponge/platform-core';
import { getLogger } from '@config/service-urls';

const logger = getLogger('ai-config-service-cacheservice');

export class CacheService {
  private templateCache: Map<string, CacheEntry<Template>> = new Map();
  private executionCache: Map<string, CacheEntry<ExecuteTemplateResponse>> = new Map();
  private cleanupScheduler: IntervalScheduler | null = null;
  private stats = {
    hitCount: 0,
    missCount: 0,
    evictions: 0,
  };

  private readonly TEMPLATE_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly EXECUTION_TTL = 5 * 60 * 1000; // 5 minutes

  private readonly MAX_TEMPLATE_CACHE_SIZE = 500;
  private readonly MAX_EXECUTION_CACHE_SIZE = 1000;

  /**
   * LRU eviction: when at capacity, delete the least-recently-accessed entry.
   * Map insertion order tracks recency (get() does delete+re-set to move to end).
   */
  private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>, maxSize: number, cacheName: string): void {
    while (cache.size >= maxSize) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
      this.stats.evictions++;
      logger.info('LRU eviction in {} cache (size was {})', { data0: cacheName, data1: String(maxSize) });
    }
  }

  /**
   * Move an entry to the end of the Map (mark as recently used) for LRU tracking.
   */
  private touchEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, entry: CacheEntry<T>): void {
    cache.delete(key);
    cache.set(key, entry);
  }

  /**
   * Cache a template
   */
  cacheTemplate(template: Template): void {
    const entry: CacheEntry<Template> = {
      data: template,
      expiresAt: Date.now() + this.TEMPLATE_TTL,
      createdAt: Date.now(),
    };

    this.evictIfNeeded(this.templateCache, this.MAX_TEMPLATE_CACHE_SIZE, 'template');
    this.templateCache.set(template.id, entry);
    logger.info('📦 Cached template: {} ({})', { data0: template.name, data1: template.id });
  }

  /**
   * Get template from cache
   */
  getTemplate(templateId: string): Template | null {
    const entry = this.templateCache.get(templateId);

    if (!entry) {
      this.stats.missCount++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.templateCache.delete(templateId);
      this.stats.missCount++;
      logger.info('⏰ Template cache expired: {}', { data0: templateId });
      return null;
    }

    this.stats.hitCount++;
    this.touchEntry(this.templateCache, templateId, entry);
    return entry.data;
  }

  /**
   * Cache execution result
   */
  cacheExecution(key: string, result: ExecuteTemplateResponse): void {
    // Only cache successful executions
    if (!result.success) {
      return;
    }

    const entry: CacheEntry<ExecuteTemplateResponse> = {
      data: result,
      expiresAt: Date.now() + this.EXECUTION_TTL,
      createdAt: Date.now(),
    };

    this.evictIfNeeded(this.executionCache, this.MAX_EXECUTION_CACHE_SIZE, 'execution');
    this.executionCache.set(key, entry);
    logger.info('📦 Cached execution result: {}', { data0: key });
  }

  /**
   * Get execution result from cache
   */
  getExecution(key: string): ExecuteTemplateResponse | null {
    const entry = this.executionCache.get(key);

    if (!entry) {
      this.stats.missCount++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.executionCache.delete(key);
      this.stats.missCount++;
      logger.info('⏰ Execution cache expired: {}', { data0: key });
      return null;
    }

    this.stats.hitCount++;
    this.touchEntry(this.executionCache, key, entry);
    return entry.data;
  }

  /**
   * Generate cache key for execution
   */
  generateExecutionKey(templateId: string, variables: Record<string, unknown>): string {
    // Simple key generation - hash of template ID + variables
    const variablesString = JSON.stringify(variables, Object.keys(variables).sort());
    return `exec_${templateId}_${this.simpleHash(variablesString)}`;
  }

  /**
   * Invalidate template cache
   */
  invalidateTemplate(templateId: string): void {
    const deleted = this.templateCache.delete(templateId);
    if (deleted) {
      logger.info('🗑️  Invalidated template cache: {}', { data0: templateId });
    }

    // Also invalidate related execution cache entries
    this.invalidateExecutionsForTemplate(templateId);
  }

  /**
   * Invalidate execution cache entries for a template
   */
  private invalidateExecutionsForTemplate(templateId: string): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of Array.from(this.executionCache.entries())) {
      if (entry.data.templateUsed.id === templateId) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.executionCache.delete(key);
      logger.info('🗑️  Invalidated execution cache: {}', { data0: key });
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    const templateCount = this.templateCache.size;
    const executionCount = this.executionCache.size;

    this.templateCache.clear();
    this.executionCache.clear();

    logger.info('🗑️  Cleared all caches: {} templates, {} executions', { data0: templateCount, data1: executionCount });
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    // Clean template cache
    for (const [key, entry] of Array.from(this.templateCache.entries())) {
      if (now > entry.expiresAt) {
        this.templateCache.delete(key);
        removedCount++;
      }
    }

    // Clean execution cache
    for (const [key, entry] of Array.from(this.executionCache.entries())) {
      if (now > entry.expiresAt) {
        this.executionCache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info('🧹 Cleaned up {} expired cache entries', { data0: removedCount });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalEntries = this.templateCache.size + this.executionCache.size;
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    const hitRate = totalRequests > 0 ? this.stats.hitCount / totalRequests : 0;

    // Estimate total cache size (simplified)
    const totalSize = this.templateCache.size * 1000 + this.executionCache.size * 500; // rough estimate

    return {
      totalEntries,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      hitRate: Math.round(hitRate * 100) / 100,
      evictions: this.stats.evictions,
      totalSize,
    };
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Start periodic cleanup (call this when initializing the service)
   */
  startPeriodicCleanup(): void {
    // Clean up every 10 minutes
    this.cleanupScheduler = createIntervalScheduler({
      name: 'template-cache-cleanup',
      serviceName: 'ai-config-service',
      intervalMs: 10 * 60 * 1000,
      handler: () => this.cleanup(),
    });
    this.cleanupScheduler.start();

    logger.info('Started periodic cache cleanup (every 10 minutes)');
  }
}
