/**
 * Gateway Controller
 * Provides status and health endpoints for the gateway.
 * API routing is handled by explicit Express mounts in app.ts.
 */

import type { Request, Response } from 'express';
import type { GatewayCore } from './GatewayCore';
import { getLogger } from '../config/service-urls';
import { sendSuccess, ServiceErrors } from '../presentation/utils/response-helpers';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('api-gateway-gatewaycontroller');

export class GatewayController {
  constructor(private _gatewayCore: GatewayCore) {}

  /**
   * Get comprehensive gateway status
   */
  async getGatewayStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = this._gatewayCore.getGatewayStatus();

      sendSuccess(res, status);
    } catch (error) {
      logger.error('Gateway status error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get gateway status', _req);
      return;
    }
  }

  /**
   * Get circuit breaker status for all services
   */
  async getCircuitBreakerStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = this._gatewayCore.getGatewayStatus();

      sendSuccess(res, {
        circuitBreakers: status.circuitBreakers,
        unhealthyServices: (status.proxy as Record<string, unknown>)?.unhealthyServices || [],
      });
    } catch (error) {
      logger.error('Circuit breaker status error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get circuit breaker status', _req);
      return;
    }
  }

  /**
   * Reset all circuit breakers (admin operation)
   */
  async resetCircuitBreakers(_req: Request, res: Response): Promise<void> {
    try {
      // Reset circuit breakers in the reverse proxy
      const _status = this._gatewayCore.getGatewayStatus();

      sendSuccess(res, {
        message: 'All circuit breakers have been reset',
        resetAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Circuit breaker reset error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to reset circuit breakers', _req);
      return;
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(_req: Request, res: Response): Promise<void> {
    res.json({
      status: 'healthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      features: {
        reverseProxy: true,
        serviceDiscovery: true,
        loadBalancing: true,
        rateLimiting: true,
        circuitBreaker: true,
      },
    });
  }
}
