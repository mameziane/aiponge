import { Request, Response } from 'express';
import { resilience, getSharedEventBusClient, createLogger } from '@aiponge/platform-core';
import { sendSuccess, ServiceErrors } from '../utils/response-helpers';

const logger = createLogger('debug-status');

export function debugStatusHandler(req: Request, res: Response): void {
  try {
    const circuitBreakers = resilience.getAllStats().map(cb => ({
      name: cb.name,
      state: cb.state,
      failures: cb.failures,
      successes: cb.successes,
      rejects: cb.rejects,
      timeouts: cb.timeouts,
      fires: cb.fires,
      latencyMean: Math.round(cb.latencyMean),
    }));

    const openCircuitBreakers = circuitBreakers.filter(cb => cb.state === 'open').length;

    const bulkheads = resilience.getAllBulkheadStats();

    let eventBus: Record<string, unknown> = { connected: false, provider: 'memory', metrics: {} };
    let eventBusStatus: 'redis' | 'kafka' | 'memory' | 'disconnected' = 'disconnected';
    try {
      const client = getSharedEventBusClient('api-gateway');
      const connected = client.getConnectionStatus();
      const providerType = client.getProviderType();
      eventBusStatus = !connected ? 'disconnected' : providerType;

      let metrics: unknown = {};
      try {
        const metricsObj = client.getMetrics();
        if (metricsObj && typeof metricsObj.getStats === 'function') {
          metrics = metricsObj.getStats();
        }
      } catch (metricsError) {
        logger.debug('Event bus metrics not available', {
          error: metricsError instanceof Error ? metricsError.message : String(metricsError),
        });
      }

      let healthDetail: unknown = null;
      if (client.getHealthDetail) {
        healthDetail = client.getHealthDetail();
      }

      eventBus = {
        connected,
        provider: providerType,
        metrics,
        ...(healthDetail ? { health: healthDetail } : {}),
      };
    } catch (eventBusError) {
      logger.debug('Event bus client not available', {
        error: eventBusError instanceof Error ? eventBusError.message : String(eventBusError),
      });
      eventBus = { connected: false, provider: 'memory', metrics: {} };
    }

    const healthy = openCircuitBreakers === 0;

    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

    sendSuccess(res, {
      timestamp: new Date().toISOString(),
      healthy,
      summary: {
        openCircuitBreakers,
        eventBusStatus,
      },
      environment: process.env.NODE_ENV || 'development',
      uptime: {
        seconds: uptimeSeconds,
        formatted: uptimeFormatted,
      },
      circuitBreakers,
      bulkheads,
      eventBus,
      process: {
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        pid: process.pid,
      },
    });
  } catch (error) {
    logger.error('Debug status endpoint failed', { error: error instanceof Error ? error.message : String(error) });
    ServiceErrors.internal(res, 'Failed to collect debug status', undefined, req);
  }
}
