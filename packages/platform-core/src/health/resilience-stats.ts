import { Request, Response } from 'express';
import { resilience } from '../resilience/index.js';
import { sendErrorResponse } from '../error-handling/errors.js';

export interface ResilienceStatsResponse {
  service: string;
  timestamp: string;
  uptime: number;
  circuitBreakers: Array<{
    name: string;
    state: string;
    failures: number;
    successes: number;
    rejects: number;
    fires: number;
    timeouts: number;
    latencyMean: number;
  }>;
  bulkheads: Array<{
    name: string;
    running: number;
    queued: number;
    maxConcurrent: number;
    maxQueue: number;
    utilizationPercent: number;
    queueUtilizationPercent: number;
  }>;
  alerts: Array<{
    level: 'warning' | 'critical';
    component: 'circuit-breaker' | 'bulkhead';
    name: string;
    message: string;
  }>;
}

const WARNING_THRESHOLD = 0.75;
const CRITICAL_THRESHOLD = 0.9;

export function createResilienceStatsHandler(serviceName: string) {
  return (_req: Request, res: Response): void => {
    try {
      const cbStats = resilience.getAllStats().map(cb => ({
        name: cb.name,
        state: cb.state,
        failures: cb.failures,
        successes: cb.successes,
        rejects: cb.rejects,
        fires: cb.fires,
        timeouts: cb.timeouts,
        latencyMean: Math.round(cb.latencyMean),
      }));

      const bhStats = resilience.getAllBulkheadStats().map(bh => {
        const running = bh.running ?? 0;
        const queued = bh.queued ?? 0;
        const maxConcurrent = bh.maxConcurrent ?? 1;
        const maxQueue = bh.maxQueue ?? 1;
        return {
          name: bh.name ?? 'unknown',
          running,
          queued,
          maxConcurrent,
          maxQueue,
          utilizationPercent: Math.round((running / maxConcurrent) * 100),
          queueUtilizationPercent: maxQueue > 0 ? Math.round((queued / maxQueue) * 100) : 0,
        };
      });

      const alerts: ResilienceStatsResponse['alerts'] = [];

      for (const cb of cbStats) {
        if (cb.state === 'open') {
          alerts.push({
            level: 'critical',
            component: 'circuit-breaker',
            name: cb.name,
            message: `Circuit breaker is OPEN (${cb.failures} failures, ${cb.rejects} rejects)`,
          });
        } else if (cb.state === 'half-open') {
          alerts.push({
            level: 'warning',
            component: 'circuit-breaker',
            name: cb.name,
            message: `Circuit breaker is HALF-OPEN, testing recovery`,
          });
        }
      }

      for (const bh of bhStats) {
        const concurrencyRatio = bh.running / bh.maxConcurrent;
        const queueRatio = bh.maxQueue > 0 ? bh.queued / bh.maxQueue : 0;

        if (queueRatio >= CRITICAL_THRESHOLD) {
          alerts.push({
            level: 'critical',
            component: 'bulkhead',
            name: bh.name,
            message: `Queue at ${bh.queueUtilizationPercent}% capacity (${bh.queued}/${bh.maxQueue})`,
          });
        } else if (queueRatio >= WARNING_THRESHOLD) {
          alerts.push({
            level: 'warning',
            component: 'bulkhead',
            name: bh.name,
            message: `Queue at ${bh.queueUtilizationPercent}% capacity (${bh.queued}/${bh.maxQueue})`,
          });
        }

        if (concurrencyRatio >= CRITICAL_THRESHOLD) {
          alerts.push({
            level: 'critical',
            component: 'bulkhead',
            name: bh.name,
            message: `Concurrency at ${bh.utilizationPercent}% (${bh.running}/${bh.maxConcurrent})`,
          });
        } else if (concurrencyRatio >= WARNING_THRESHOLD) {
          alerts.push({
            level: 'warning',
            component: 'bulkhead',
            name: bh.name,
            message: `Concurrency at ${bh.utilizationPercent}% (${bh.running}/${bh.maxConcurrent})`,
          });
        }
      }

      const response: ResilienceStatsResponse = {
        service: serviceName,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        circuitBreakers: cbStats,
        bulkheads: bhStats,
        alerts,
      };

      res.status(200).json(response);
    } catch (error) {
      sendErrorResponse(res, 500, error instanceof Error ? error.message : 'Failed to collect resilience stats', {
        details: { service: serviceName },
      });
    }
  };
}
