/**
 * Config Module Error Handling Utilities
 * Uses platform-core's generateCorrelationId for consistent tracing
 */

import { getLogger } from '../service-urls';
import { generateCorrelationId } from '@aiponge/platform-core';

const logger = getLogger('system-service-config-error-handling');

export interface ConfigErrorContext {
  module?: string;
  operation?: string;
  phase?: string;
  serviceName?: string;
  [key: string]: string | number | boolean | undefined;
}

export function logConfigError(error: unknown, message: string, context: ConfigErrorContext = {}): string {
  const correlationId = generateCorrelationId();

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.constructor.name : typeof error;

  const logContext = {
    module: context.module || 'config',
    operation: context.operation || 'unknown',
    phase: context.phase || 'error_handling',
    correlationId,
    error: errorMessage,
    errorType,
    ...context,
  };

  if (message.includes('crashed') || message.includes('failed')) {
    logger.error(message, logContext);
  } else {
    logger.warn(message, logContext);
  }

  return `${message}: ${errorMessage} [${correlationId}]`;
}

export async function safeConfigAsync<T>(
  operation: () => Promise<T>,
  context: ConfigErrorContext,
  fallback?: T
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const errorMsg = logConfigError(error, `Config async operation failed: ${context.operation || 'unknown'}`, context);

    if (fallback !== undefined) {
      logger.info(`Using fallback value for ${context.operation}`, {
        ...context,
        fallback: String(fallback),
      });
      return { success: true, data: fallback };
    }

    return { success: false, error: errorMsg };
  }
}

export function shouldRetryConfigError(error: unknown, attempt: number = 1, maxRetries: number = 3): boolean {
  if (attempt >= maxRetries) return false;

  if (error instanceof Error) {
    const retryableErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
    return retryableErrors.some(retryable => error.message.includes(retryable));
  }

  return false;
}
