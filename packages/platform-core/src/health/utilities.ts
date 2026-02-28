/**
 * Health Check Utilities
 *
 * Helper functions for health checking
 */

import { HealthManager } from './health-manager';
import type { PrometheusMetrics } from '../metrics/index.js';

/**
 * Create a standard health manager with common defaults
 */
export function createStandardHealthManager(
  serviceName: string,
  version = '1.0.0',
  options?: { metrics?: PrometheusMetrics }
): HealthManager {
  const manager = new HealthManager({
    serviceName,
    version,
    databaseUrl: process.env.DATABASE_URL,
  });
  if (options?.metrics) {
    manager.setMetricsInstance(options.metrics);
  }
  return manager;
}
