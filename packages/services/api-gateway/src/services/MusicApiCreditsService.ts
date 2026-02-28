/**
 * MusicAPI Credits Service
 * Manages caching and periodic sync of MusicAPI.ai account credits
 * - Auto-syncs on startup
 * - Periodic refresh every 5 minutes
 * - Manual refresh endpoint support
 */

import { withResilience, errorMessage, createIntervalScheduler, type IntervalScheduler } from '@aiponge/platform-core';
import { getLogger, type Logger } from '../config/service-urls';
import { GatewayError } from '../errors';

export interface MusicApiCreditsCache {
  credits: number;
  extraCredits: number;
  totalCredits: number;
  lastSyncedAt: Date;
  nextSyncAt: Date;
  error?: string;
}

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const API_TIMEOUT_MS = 10000;
const MUSICAPI_BASE_URL = process.env.MUSICAPI_BASE_URL || 'https://api.musicapi.ai';

class MusicApiCreditsService {
  private static instance: MusicApiCreditsService | null = null;
  private cache: MusicApiCreditsCache | null = null;
  private syncScheduler: IntervalScheduler | null = null;
  private logger: Logger;
  private isSyncing: boolean = false;

  private constructor() {
    this.logger = getLogger('MusicApiCreditsService');
  }

  static getInstance(): MusicApiCreditsService {
    if (!MusicApiCreditsService.instance) {
      MusicApiCreditsService.instance = new MusicApiCreditsService();
    }
    return MusicApiCreditsService.instance;
  }

  /**
   * Initialize the service - call on startup
   * Performs initial sync and starts periodic refresh
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing MusicAPI Credits Service');

    // Perform initial sync
    await this.syncCredits();

    // Start periodic sync
    this.startPeriodicSync();

    this.logger.info('MusicAPI Credits Service initialized', {
      credits: this.cache?.totalCredits,
      nextSync: this.cache?.nextSyncAt?.toISOString(),
    });
  }

  /**
   * Shutdown the service - stop periodic sync
   */
  shutdown(): void {
    if (this.syncScheduler) {
      this.syncScheduler.stop();
      this.syncScheduler = null;
      this.logger.info('MusicAPI Credits Service shutdown');
    }
  }

  /**
   * Get cached credits - returns null if no cache available
   */
  getCachedCredits(): MusicApiCreditsCache | null {
    return this.cache;
  }

  /**
   * Force refresh credits from API
   */
  async refreshCredits(): Promise<MusicApiCreditsCache> {
    await this.syncCredits();
    if (!this.cache) {
      throw GatewayError.creditsError('refresh', 'Failed to sync credits');
    }
    return this.cache;
  }

  /**
   * Internal method to sync credits from MusicAPI.ai
   */
  private async syncCredits(): Promise<void> {
    if (this.isSyncing) {
      this.logger.debug('Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      const apiKey = process.env.MUSICAPI_API_KEY;
      if (!apiKey) {
        this.logger.warn('MUSICAPI_API_KEY not configured, skipping sync');
        this.cache = {
          credits: 0,
          extraCredits: 0,
          totalCredits: 0,
          lastSyncedAt: new Date(),
          nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
          error: 'MUSICAPI_API_KEY not configured',
        };
        return;
      }

      const cacheBuster = Date.now();
      const response = await withResilience(
        'musicapi-credits-sync',
        () =>
          fetch(`${MUSICAPI_BASE_URL}/api/v1/get-credits?_t=${cacheBuster}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }),
        { circuitBreaker: { timeout: API_TIMEOUT_MS } }
      );

      if (!response.ok) {
        throw GatewayError.creditsError('sync', `MusicAPI.ai returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { credits?: number; extra_credits?: number };
      const latencyMs = Date.now() - startTime;

      this.cache = {
        credits: data.credits ?? 0,
        extraCredits: data.extra_credits ?? 0,
        totalCredits: (data.credits ?? 0) + (data.extra_credits ?? 0),
        lastSyncedAt: new Date(),
        nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
      };

      this.logger.debug('Credits synced successfully', {
        totalCredits: this.cache.totalCredits,
        latencyMs,
      });
    } catch (error) {
      const errMsg = errorMessage(error);
      this.logger.error('Failed to sync credits', { error: errMsg });

      // Keep old cache data but update timestamps and error
      if (this.cache) {
        this.cache = {
          ...this.cache,
          lastSyncedAt: new Date(),
          nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
          error: errMsg,
        };
      } else {
        this.cache = {
          credits: 0,
          extraCredits: 0,
          totalCredits: 0,
          lastSyncedAt: new Date(),
          nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
          error: errMsg,
        };
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Start periodic sync timer
   */
  private startPeriodicSync(): void {
    if (this.syncScheduler) {
      this.syncScheduler.stop();
    }

    this.syncScheduler = createIntervalScheduler({
      name: 'musicapi-credits-sync',
      serviceName: 'api-gateway',
      intervalMs: SYNC_INTERVAL_MS,
      handler: () => this.syncCredits(),
    });
    this.syncScheduler.start();

    this.logger.debug('Periodic sync started', { intervalMs: SYNC_INTERVAL_MS });
  }
}

export const musicApiCreditsService = MusicApiCreditsService.getInstance();
