import type { Request, Response } from 'express';
import type express from 'express';
import { adminAuthMiddleware, librarianAuthMiddleware } from '../presentation/middleware/adminAuthMiddleware';
import { csrfProtectionMiddleware } from '../presentation/middleware/CsrfProtectionMiddleware';
import { adminRoutes } from '../presentation/routes/admin.routes';
import { librarianContentRoutes } from '../presentation/routes/librarian-content.routes';
import { appRoutes } from '../presentation/routes/app.routes';
import { getLogger } from '../config/service-urls';
import { ServiceErrors } from '../presentation/utils/response-helpers';
import type { GatewayAppContext } from './context';

interface ServiceRegistrationRequest {
  name: string;
  host: string;
  port: string | number;
  healthEndpoint?: string;
  metadata?: Record<string, unknown>;
}

/**
 * API Gateway Routing Architecture — Single Pattern
 * ──────────────────────────────────────────────────
 * ALL public endpoints use /api/v1/ prefix. No unversioned paths.
 * Two routing mechanisms, both versioned:
 *
 * 1. STREAMING PROXY (main.ts customMiddleware)
 *    For: file uploads/downloads needing raw HTTP stream piping
 *    Paths: /api/v1/storage/*, /uploads/*
 *    Implementation: http-proxy-middleware → storage-service
 *    Path rewrite: /api/v1/storage/* → /api/storage/* (microservice internal)
 *
 * 2. UNIFIED VERSIONED ROUTING (this file)
 *    a) DynamicRouter — JSON API proxy to microservices via HttpClient
 *       Paths: /api/v1/<domain>/* (direct match, no fallback)
 *       Path rewrite: /api/v1/* → /api/* (microservices don't use versioning internally)
 *       Services: ai-config, ai-content, music, user, system
 *    b) Express route groups — gateway-local business logic
 *       Paths: /api/v1/auth/*, /api/v1/app/*, /api/v1/admin/*, /api/v1/librarian/*
 *
 * URL Convention: /api/v1/<domain>/<resource>
 * Frontend constant: API_VERSION_PREFIX = '/api/v1' (apiConfig.ts)
 * Contracts: All keys in API_CONTRACTS use /api/v1/ prefix
 */
export function setupRouting(app: express.Application, ctx: GatewayAppContext): void {
  // Service registration routes — specific paths, must be before dynamic router
  app.post('/api/v1/gateway/register', adminAuthMiddleware, (req, res) => {
    try {
      const { name, host, port, healthEndpoint, metadata } = req.body as ServiceRegistrationRequest;

      const serviceConfig = {
        name: name as string,
        host: host as string,
        port: parseInt(port.toString()),
        healthEndpoint: healthEndpoint || '/health',
        metadata: metadata || {},
        url: `http://${host}:${port}`,
        version: '1.0.0',
        timeout: 30000,
        retries: 3,
        enabled: true,
      };

      ctx.gatewayCore.registerService(serviceConfig);

      res.status(200).json({
        success: true,
        message: 'Service registered successfully',
        serviceId: serviceConfig.name,
      });
    } catch (error) {
      const logger = getLogger('APIGateway');
      logger.error('Service registration failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Service registration failed', req);
      return;
    }
  });

  app.delete('/api/v1/gateway/deregister/:serviceName', adminAuthMiddleware, (req, res) => {
    try {
      const serviceName = req.params.serviceName as string;
      ctx.gatewayCore.deregisterService(serviceName);

      res.status(200).json({
        success: true,
        message: 'Service deregistered successfully',
      });
    } catch (error) {
      const logger = getLogger('APIGateway');
      logger.error('Service deregistration failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Service deregistration failed', req);
      return;
    }
  });

  app.get('/api/v1/gateway/services/:serviceName/health', (req, res) => {
    void (async (): Promise<void> => {
      try {
        const serviceName = req.params.serviceName;
        const healthStatus: unknown = await ctx.gatewayCore.checkServiceHealth(serviceName);

        res.status(200).json(healthStatus);
      } catch (error) {
        const logger = getLogger('APIGateway');
        logger.error('Health check failed', { error: error instanceof Error ? error.message : String(error) });
        ServiceErrors.fromException(res, error, 'Health check failed', req);
        return;
      }
    })();
  });

  // Health routes — MUST be before dynamic router
  app.use('/', ctx.healthRoutes.getRouter());

  // Dynamic routing middleware — for AI microservices
  app.use(ctx.dynamicRouter.routeRequest());

  // Dynamic routes management endpoints
  app.use('/api/v1/', ctx.dynamicRoutesHandler.getRouter());

  // Persona routes — MUST be before gateway catch-all
  app.use('/api/v1/admin', adminAuthMiddleware, csrfProtectionMiddleware, adminRoutes);

  app.use('/api/v1/librarian', librarianAuthMiddleware, csrfProtectionMiddleware, librarianContentRoutes);

  app.use('/api/v1/app', appRoutes);

  app.use('/api/', ctx.gatewayRoutes.getRouter());

  app.use('/api/:path(*)', (req: Request, res: Response) => {
    ServiceErrors.notFound(res, 'API endpoint', req);
  });
}
