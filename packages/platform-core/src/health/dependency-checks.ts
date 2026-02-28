/**
 * Dependency Health Checks
 *
 * Service dependency health checking utilities
 */

import { ComponentHealth } from './types';

/**
 * Dependency health checking utilities
 */
export class DependencyHealthChecker {
  /**
   * Make HTTP health request to a service
   */
  static async makeHealthRequest(url: string): Promise<{ ok: boolean; status: number; statusText: string }> {
    try {
      if (typeof globalThis.fetch !== 'undefined') {
        const response = await globalThis.fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'platform-core-health-checker/1.0',
            Accept: 'application/json, text/plain, */*',
            'Cache-Control': 'no-cache',
          },
          signal: AbortSignal.timeout(parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '5000')),
        });
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
        };
      }
    } catch (_fetchError) {
      // Fall back to node-fetch
    }

    const nodeFetch = await import('node-fetch');
    const nodeFetchController = new AbortController();
    const nodeFetchTimeoutId = setTimeout(
      () => nodeFetchController.abort(),
      parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '5000')
    );
    let response: { ok: boolean; status: number; statusText: string };
    try {
      response = await nodeFetch.default(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'platform-core-health-checker/1.0',
          Accept: 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache',
        },
        signal: nodeFetchController.signal as unknown as AbortSignal,
      });
    } finally {
      clearTimeout(nodeFetchTimeoutId);
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  }

  /**
   * Check dependency health with actual HTTP request
   */
  static async checkDependencyHealth(
    url: string,
    timeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '5000')
  ): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Dependency health check timeout')), timeout);
      });

      const fetchPromise = this.makeHealthRequest(url);
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          status: 'healthy',
          responseTimeMs: responseTime,
          metadata: {
            url,
            statusCode: response.status,
            statusText: response.statusText,
          },
        };
      } else if (response.status >= 500) {
        return {
          status: 'unhealthy',
          responseTimeMs: responseTime,
          errorMessage: `HTTP ${response.status}: ${response.statusText}`,
          metadata: {
            url,
            statusCode: response.status,
            statusText: response.statusText,
          },
        };
      } else {
        return {
          status: 'degraded',
          responseTimeMs: responseTime,
          errorMessage: `HTTP ${response.status}: ${response.statusText}`,
          metadata: {
            url,
            statusCode: response.status,
            statusText: response.statusText,
          },
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown dependency error';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT');

      return {
        status: isTimeout ? 'degraded' : 'unhealthy',
        responseTimeMs: responseTime,
        errorMessage,
        metadata: {
          url,
          errorType: isTimeout ? 'timeout' : 'unknown',
        },
      };
    }
  }
}
