/**
 * Correlation Context
 *
 * Async correlation ID management across requests
 */

import { AsyncLocalStorage } from 'async_hooks';
import { LogContext } from './types';

// AsyncLocalStorage for correlation context
export const correlationStorage = new AsyncLocalStorage<LogContext>();

/**
 * Get correlation context
 */
export function getCorrelationContext(): LogContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Run function with correlation context
 */
export function runWithContext<T>(context: LogContext, fn: () => T): T {
  return correlationStorage.run(context, fn);
}

/**
 * Generate correlation ID
 */
export function generateCorrelationId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
