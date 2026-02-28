/**
 * Base Aggregation Controller
 * Shared orchestration layer for all persona routes (admin, member)
 * Provides consistent patterns for multi-service aggregation, transformation, and error handling
 * Includes circuit breaker protection for resilient service-to-service communication
 */

import { Request, Response } from 'express';
import { getLogger, type Logger } from '../../config/service-urls';
import { getCorrelationId } from '../middleware/correlationMiddleware';
import { resilience } from '../../utils/CircuitBreakerManager';
import type { AxiosRequestConfig } from 'axios';
import { serializeError, extractAuthContext } from '@aiponge/platform-core';
import { sendSuccess, ServiceErrors } from '../utils/response-helpers';

export interface ServiceCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AggregationOptions {
  timeout?: number;
  retries?: number;
  requiresAuth?: boolean;
}

export interface AggregatedResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
  meta?: Record<string, unknown>;
}

/**
 * Base class for persona aggregation controllers
 * Provides common utilities for all personas (admin, member)
 */
export abstract class BaseAggregationController {
  protected logger: Logger;

  constructor(loggerName: string) {
    this.logger = getLogger(loggerName);
  }

  /**
   * Execute multiple async operations in parallel with error isolation
   * Failed operations don't crash the entire request - partial success is supported
   */
  protected async fanOut<T>(operations: Array<() => Promise<T>>): Promise<Array<PromiseSettledResult<T>>> {
    return Promise.allSettled(operations.map(op => op()));
  }

  /**
   * Extract data from PromiseSettledResult with success validation
   * Returns data if fulfilled and successful, otherwise returns default value
   */
  protected extractData<T>(result: PromiseSettledResult<ServiceCallResult<T>>, defaultValue: T): T {
    if (result.status === 'fulfilled' && result.value.success && result.value.data !== undefined) {
      return result.value.data;
    }
    return defaultValue;
  }

  /**
   * Log warnings for failed service calls
   */
  protected logFailedCalls(
    results: Array<PromiseSettledResult<ServiceCallResult>>,
    serviceNames: string[],
    context: Record<string, unknown> = {}
  ): void {
    results.forEach((result, index) => {
      const serviceName = serviceNames[index];
      if (result.status === 'rejected') {
        this.logger.warn(`${serviceName} call failed`, {
          ...context,
          error: result.reason,
          serviceName,
        });
      } else if (result.status === 'fulfilled' && !result.value.success) {
        this.logger.warn(`${serviceName} returned unsuccessful response`, {
          ...context,
          error: result.value.error,
          serviceName,
        });
      }
    });
  }

  /**
   * Standard response envelope for all aggregated endpoints
   */
  protected createResponse<T>(
    success: boolean,
    data?: T,
    error?: string,
    meta?: Record<string, unknown>
  ): AggregatedResponse<T> {
    const response: AggregatedResponse<T> = {
      success,
      timestamp: new Date().toISOString(),
    };

    if (data !== undefined) {
      response.data = data;
    }

    if (error) {
      response.error = error;
    }

    if (meta) {
      response.meta = meta;
    }

    return response;
  }

  /**
   * Standard success response handler
   */
  protected sendSuccessResponse<T>(res: Response, data: T, _meta?: Record<string, unknown>): void {
    sendSuccess(res, data);
  }

  /**
   * Extract user ID from authenticated request
   * Override this method in subclasses for persona-specific auth
   */
  protected getUserId(req: Request): string {
    return extractAuthContext(req).userId || (req.headers['user-id'] as string) || 'default-user';
  }

  /**
   * Create HTTP request config with correlation ID header for distributed tracing
   * Ensures all downstream service calls propagate the request's correlation ID
   */
  protected createRequestConfig(req: Request, additionalConfig?: AxiosRequestConfig): AxiosRequestConfig {
    const correlationId = getCorrelationId(req);

    return {
      ...additionalConfig,
      headers: {
        ...additionalConfig?.headers,
        'x-correlation-id': correlationId,
      },
    };
  }

  /**
   * Execute a service call with circuit breaker protection
   * Provides automatic failure detection, recovery, and prevents cascading failures
   *
   * @param serviceName Name of the service (for circuit breaker identification)
   * @param fn Function to execute (service call)
   * @returns Result of the service call
   *
   * @example
   * const result = await this.withCircuitBreaker(
   *   'user-service',
   *   () => userServiceClient.getProfile(userId)
   * );
   */
  protected async withCircuitBreaker<T>(serviceName: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await resilience.execute(serviceName, fn);
    } catch (error) {
      this.logger.warn(`Circuit breaker execution failed for ${serviceName}`, {
        service: serviceName,
        error: serializeError(error),
        isOpen: resilience.isOpen(serviceName),
      });
      throw error;
    }
  }

  /**
   * Get all circuit breaker statistics
   * Useful for monitoring and debugging
   */
  protected getCircuitBreakerStats() {
    return resilience.getAllStats();
  }

  /**
   * Async route handler wrapper
   * Ensures proper error handling for all async operations
   */
  protected asyncHandler(
    handler: (req: Request, res: Response) => Promise<void>
  ): (req: Request, res: Response) => void {
    return (req: Request, res: Response): void => {
      void (async (): Promise<void> => {
        try {
          await handler(req, res);
        } catch (error) {
          this.logger.error('Request handler failed', { error: serializeError(error) });
          ServiceErrors.internal(res, 'Request handler failed', error, req);
        }
      })();
    };
  }
}
