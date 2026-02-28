/**
 * Logging Utilities
 *
 * Helper functions for logging operations
 */

import * as winston from 'winston';

/**
 * Performance timer utility
 */
export function createTimer(logger: winston.Logger, label: string): () => void {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    logger.info(`Timer: ${label}`, { duration, label });
  };
}
