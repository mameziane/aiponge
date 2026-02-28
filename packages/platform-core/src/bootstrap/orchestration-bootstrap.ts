/**
 * Orchestration-Aware Bootstrap for Platform-Core
 *
 * Enhanced bootstrap that integrates health checks, metrics,
 * and service dependency management.
 */

import { ServiceBootstrap, BootstrapOptions } from './service-bootstrap';
import { HealthManager } from '../health';
import { ServiceRegistrationOptions } from '../orchestration';
import { ServiceLocator } from '../service-locator';
import { BootstrapConfig } from '../types';
import { serializeError } from '../logging/error-serializer.js';
import { PrometheusMetrics } from '../metrics/index.js';
import { DomainError } from '../error-handling/errors.js';

export interface OrchestrationBootstrapConfig extends BootstrapConfig {
  registration?: Partial<ServiceRegistrationOptions>;
  skipAutoMetrics?: boolean;
}

export interface OrchestrationBootstrapOptions extends BootstrapOptions {
  healthManager?: HealthManager;
}

export class OrchestrationAwareBootstrap extends ServiceBootstrap {
  private healthManager?: HealthManager;
  private registrationOptions?: ServiceRegistrationOptions;
  private metricsInstance: PrometheusMetrics;
  private skipAutoMetrics: boolean;

  constructor(config: OrchestrationBootstrapConfig) {
    super(config);

    this.skipAutoMetrics = config.skipAutoMetrics === true;
    this.metricsInstance = new PrometheusMetrics({ serviceName: config.service.name });

    ServiceLocator.initialize();

    this.registrationOptions = {
      serviceName: config.service.name,
      port: config.service.port,
      version: config.service.version || '1.0.0',
      ...config.registration,
    };

    this.logger.debug('Bootstrap initialized', {
      serviceName: config.service.name,
    });
  }

  async start(options: OrchestrationBootstrapOptions = {}): Promise<void> {
    this.healthManager = options.healthManager;

    try {
      await super.start({
        ...options,
        beforeStart: async () => {
          if (this.healthManager) {
            const app = this.getExpressApp();
            if (app) {
              app.use('/health', this.healthManager.createHealthRouter());

              if (!this.skipAutoMetrics) {
                app.use('/metrics', this.metricsInstance.createMetricsRouter());
                app.use(this.metricsInstance.createMetricsMiddleware());
              }
            } else {
              this.logger.warn('Express app not available for health endpoint registration');
            }
          }

          if (options.beforeStart) {
            await options.beforeStart();
          }
        },
        afterStart: async () => {
          this.logger.info('✅ {} ready', {
            data0: this.registrationOptions?.serviceName || 'service',
          });

          if (this.healthManager) {
            this.healthManager.markStartupComplete();
          }

          if (options.afterStart) {
            await options.afterStart();
          }
        },
      });
    } catch (error) {
      this.logger.error('❌ Service startup failed', {
        error: serializeError(error),
        serviceName: this.registrationOptions?.serviceName,
      });

      throw error;
    }
  }

  registerCapabilities(capabilities: string[]): void {
    if (this.registrationOptions) {
      this.registrationOptions.capabilities = [...(this.registrationOptions.capabilities || []), ...capabilities];
    }
  }

  registerEndpoints(endpoints: Record<string, string>): void {
    if (this.registrationOptions) {
      this.registrationOptions.endpoints = {
        ...this.registrationOptions.endpoints,
        ...endpoints,
      };
    }
  }

  addFeatures(features: Record<string, string>): void {
    if (this.registrationOptions) {
      this.registrationOptions.features = {
        ...this.registrationOptions.features,
        ...features,
      };
    }
  }

  async waitForDependencies(serviceNames: string[], timeout = 30000): Promise<void> {
    this.logger.info('⏳ Waiting for service dependencies...', {
      dependencies: serviceNames,
      timeout,
    });

    const waitPromises = serviceNames.map(serviceName => ServiceLocator.waitForService(serviceName, { timeout }));

    const results = await Promise.allSettled(waitPromises);
    const failed = results
      .map((result, index) => ({ result, serviceName: serviceNames[index] }))
      .filter(({ result }) => result.status === 'rejected' || result.value === false)
      .map(({ serviceName }) => serviceName);

    if (failed.length > 0) {
      throw new DomainError(`Failed to connect to dependencies: ${failed.join(', ')}`, 503);
    }

    this.logger.info('✅ All dependencies are ready');
  }

  getHealthManager(): HealthManager | undefined {
    return this.healthManager;
  }

  getMetrics(): PrometheusMetrics {
    return this.metricsInstance;
  }
}

export function createOrchestrationBootstrap(
  serviceName: string,
  port: number,
  config: Partial<OrchestrationBootstrapConfig> = {}
): OrchestrationAwareBootstrap {
  const fullConfig: OrchestrationBootstrapConfig = {
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

  return new OrchestrationAwareBootstrap(fullConfig);
}
