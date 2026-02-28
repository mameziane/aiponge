import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { GatewayController } from '../../services/GatewayController';
import type { GatewayCore } from '../../services/GatewayCore';

// Extend Request interface to include id property
interface ExtendedRequest extends Request {
  id?: string;
}

export class GatewayRoutes {
  private router: Router;
  private gatewayController: GatewayController;

  constructor(gatewayCore: GatewayCore) {
    this.router = Router();
    this.gatewayController = new GatewayController(gatewayCore);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Add request tracking
    this.router.use((req: Request, res: Response, next: NextFunction) => {
      (req as ExtendedRequest).id = (req.headers['x-request-id'] as string) || randomUUID();
      res.setHeader('x-request-id', (req as ExtendedRequest).id!);
      next();
    });
  }

  private setupRoutes(): void {
    // Health & Status Routes
    this.router.get('/health', this.asyncHandler(this.gatewayController.healthCheck));

    this.router.get('/gateway/status', this.asyncHandler(this.gatewayController.getGatewayStatus));

    // Admin Routes (should have auth middleware)
    this.router.get('/gateway/circuit-breakers', this.asyncHandler(this.gatewayController.getCircuitBreakerStatus));

    this.router.post('/gateway/circuit-breakers/reset', this.asyncHandler(this.gatewayController.resetCircuitBreakers));
  }

  private asyncHandler(fn: (_req: Request, _res: Response, _next: NextFunction) => Promise<void>): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      void Promise.resolve(fn.call(this.gatewayController, req, res, next)).catch((error: unknown) => next(error));
    };
  }

  public getRouter(): Router {
    return this.router;
  }
}
