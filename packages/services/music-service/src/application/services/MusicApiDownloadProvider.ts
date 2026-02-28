/**
 * Music API Download Provider
 * Handles ultra-fast polling for MusicAPI.ai instant downloads
 */

import { withResilience } from '@aiponge/platform-core';
import { getLogger, createServiceHttpClient } from '../../config/service-urls';

const httpClient = createServiceHttpClient('external');

const logger = getLogger('music-api-download-provider');

const MUSICAPI_BASE_URL = process.env.MUSICAPI_BASE_URL || 'https://api.musicapi.ai';

export interface DownloadConfig {
  pollIntervalMs: number;
  maxPollAttempts: number;
}

export interface DownloadResult {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

export class MusicApiDownloadProvider {
  private config: DownloadConfig;

  constructor(config: DownloadConfig) {
    this.config = config;
  }

  async pollForDownload(taskId: string): Promise<DownloadResult> {
    let attempts = 0;
    let lastError: string | undefined;
    let lastStatus: string | undefined;

    // True exponential backoff: 2s, 4s, 8s, 10s (capped), 10s, ...
    const getBackoffDelay = (attempt: number): number => {
      const baseDelay = 2000; // 2 seconds
      const maxDelay = 10000; // 10 seconds
      // True exponential: 2s * 2^0, 2s * 2^1, 2s * 2^2, 2s * 2^3 capped at 10s
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      return delay;
    };

    while (attempts < this.config.maxPollAttempts) {
      try {
        // Poll the MusicAPI.ai endpoint for completion (with circuit breaker protection)
        const data = await withResilience(
          'musicapi-ai',
          () =>
            httpClient.get<{ status: string; audio_url?: string; error?: string }>(
              `${MUSICAPI_BASE_URL}/api/v1/sonic/get?task_id=${taskId}`
            ),
          { circuitBreaker: { timeout: 15000 } }
        );

        lastStatus = data.status;

        // 🚀 EARLY PLAYBACK: Check if audio_url is available (can happen before 'succeeded' state)
        // Audio URLs can become available while task is still 'running' (~20s vs ~60-120s full completion)
        if (data.audio_url) {
          const isEarlyPlayback = data.status === 'running' || data.status === 'pending';
          logger.info('Music generation audio available', {
            taskId,
            status: data.status,
            isEarlyPlayback,
            attempts: attempts + 1,
            totalTimeSeconds: Math.round((attempts * 3000) / 1000), // Approximate
            audioUrl: 'provided',
          });
          return {
            success: true,
            downloadUrl: data.audio_url,
          };
        }

        // Early exit on failed status - don't waste more polling attempts
        if (data.status === 'failed') {
          logger.error('Music generation failed - early exit', {
            taskId,
            attempts: attempts + 1,
            error: data.error || 'Task failed',
          });
          return {
            success: false,
            error: data.error || 'Task failed',
          };
        }

        // Handle unexpected terminal states - early exit
        if (data.status === 'expired' || data.status === 'cancelled') {
          logger.warn('Music generation ended with non-standard status - early exit', {
            taskId,
            status: data.status,
            attempts: attempts + 1,
          });
          return {
            success: false,
            error: `Task ${data.status}`,
          };
        }

        // Task still in progress (pending, processing, etc.)
        const backoffDelay = getBackoffDelay(attempts);
        logger.debug('Polling music generation with exponential backoff', {
          taskId,
          status: data.status,
          attempt: attempts + 1,
          maxAttempts: this.config.maxPollAttempts,
          nextPollInMs: backoffDelay,
        });

        // Wait before next poll with exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        attempts++;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.debug('Download poll attempt failed (will retry)', {
          module: 'music_api_download_provider',
          operation: 'pollForDownload',
          attempt: attempts + 1,
          taskId,
          error: lastError,
          phase: 'poll_attempt_failed',
        });

        // Apply exponential backoff even on errors
        const backoffDelay = getBackoffDelay(attempts);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        attempts++;
      }
    }

    // Provide detailed failure reason
    const failureReason = lastError
      ? `API error: ${lastError}`
      : lastStatus
        ? `Timeout after ${attempts} attempts (last status: ${lastStatus})`
        : `Timeout after ${attempts} attempts`;

    logger.error('Download polling exhausted', {
      taskId,
      attempts,
      lastStatus,
      lastError,
    });

    return {
      success: false,
      error: failureReason,
    };
  }
}
