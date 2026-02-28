/**
 * Centralized Winston Logger for API Gateway
 * Uses the shared backend logging system for consistent structured logging
 */

import { getLogger, type Logger } from '../config/service-urls';

// Create the main logger instance for API Gateway
const logger = getLogger('api-gateway');

// Request logging helper
export const createRequestLogger = (requestId: string): Logger => {
  return logger.child({ requestId });
};

// Performance logging helper
export const logPerformance = (operation: string, startTime: number, metadata?: Record<string, unknown>): void => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation} completed in ${duration}ms`, {
    operation,
    duration,
    ...metadata,
  });
};

// Structured logging helpers
export const logRequest = (
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  metadata?: Record<string, unknown>
): void => {
  logger.info('HTTP Request', {
    method,
    path,
    statusCode,
    duration,
    type: 'http_request',
    ...(metadata || {}),
  });
};

export const logServiceCall = (
  service: string,
  endpoint: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, unknown>
): void => {
  logger.info('Service Call', {
    service,
    endpoint,
    duration,
    success,
    type: 'service_call',
    ...(metadata || {}),
  });
};

export default logger;
