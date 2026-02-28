/**
 * Service Bootstrap for Microservices
 *
 * Provides consistent Express server setup and lifecycle management
 * while allowing service-specific customization.
 */

import http from 'http';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { BootstrapConfig } from '../types';
import { requestLogger, getLogger } from '../logging';
import { timeoutHierarchy } from '../config/timeout-hierarchy.js';
import { initializeRedisCircuitBreakers } from '../resilience/index.js';

export interface BootstrapOptions {
  customMiddleware?: (app: Express) => void;
  customRoutes?: (app: Express) => void;
  beforeStart?: () => Promise<void>;
  afterStart?: () => Promise<void>;
}

export class ServiceBootstrap {
  protected config: BootstrapConfig;
  protected app?: Express;
  private server?: http.Server;
  protected logger: ReturnType<typeof getLogger>;

  constructor(config: BootstrapConfig) {
    this.config = config;
    this.logger = getLogger(`bootstrap:${config.service.name}`);

    // FINAL FIX: Prevent EventEmitter memory leak warnings from multiple layers
    process.setMaxListeners(15);
  }

  /**
   * Create Express application with standard middleware
   */
  async createApp(options: BootstrapOptions = {}): Promise<Express> {
    this.app = express();

    // Security middleware
    if (this.config.middleware?.helmet !== false) {
      this.app.use(helmet());
    }

    // CORS middleware
    if (this.config.middleware?.cors !== false) {
      this.app.use(
        cors({
          origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',')
            : process.env.NODE_ENV === 'production'
              ? ['https://aiponge.com']
              : '*',
          credentials: true,
        })
      );
    }

    if (this.config.middleware?.compression !== false) {
      this.app.use(compression() as express.RequestHandler);
    }

    if (this.config.middleware?.bodyParser !== false) {
      this.app.use(express.json({ limit: '10mb' }));
      this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    }

    // Request logging
    if (this.config.middleware?.requestLogger !== false) {
      this.app.use(requestLogger(this.config.service.name));
    }

    // Custom middleware setup
    if (options.customMiddleware) {
      options.customMiddleware(this.app);
    }

    // Custom routes setup
    if (options.customRoutes) {
      options.customRoutes(this.app);
    }

    return this.app;
  }

  /**
   * Start the Express server
   */
  async start(options: BootstrapOptions = {}): Promise<void> {
    if (!this.app) {
      await this.createApp(options);
    } else if (options.customRoutes || options.customMiddleware) {
      // If app already exists but we have custom routes/middleware, apply them now
      if (options.customMiddleware) {
        options.customMiddleware(this.app);
      }
      if (options.customRoutes) {
        options.customRoutes(this.app);
      }
    }

    timeoutHierarchy.validate();

    await initializeRedisCircuitBreakers();

    if (options.beforeStart) {
      await options.beforeStart();
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app!.listen(this.config.service.port, '0.0.0.0', async () => {
          this.logger.info(`Service listening on port ${this.config.service.port}`, {
            service: this.config.service.name,
            port: this.config.service.port,
          });

          // Execute after-start hook
          try {
            if (options.afterStart) {
              await options.afterStart();
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        this.server.on('error', (error: Error) => {
          this.logger.error('Server error', { error, service: this.config.service.name });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping service', { service: this.config.service.name });

    if (this.server) {
      return new Promise(resolve => {
        this.server!.close(() => {
          this.logger.info('Service stopped', { service: this.config.service.name });
          resolve();
        });
      });
    }
  }

  /**
   * Get the Express app instance
   */
  getApp(): Express | undefined {
    return this.app;
  }

  /**
   * Get the Express app instance (protected for subclass access)
   */
  protected getExpressApp(): Express | undefined {
    return this.app;
  }

  /**
   * Get the HTTP server instance
   */
  getServer(): http.Server | undefined {
    return this.server;
  }
}

/**
 * Create a standard bootstrap instance with common defaults
 */
export function createStandardBootstrap(
  serviceName: string,
  port: number,
  config: Partial<BootstrapConfig> = {}
): ServiceBootstrap {
  const fullConfig: BootstrapConfig = {
    service: {
      name: serviceName,
      port,
    },
    middleware: {
      cors: true,
      helmet: true,
      compression: true,
      requestLogger: true,
    },
    ...config,
  };

  return new ServiceBootstrap(fullConfig);
}
