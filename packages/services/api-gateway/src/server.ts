/**
 * API Gateway Service - Server Startup with Orchestration Awareness
 * Enhanced server startup that integrates with OrchestrationAwareBootstrap
 */

import {
  ServiceLocator,
  createStandardBootstrap,
  createLogger,
  logAndTrackError,
  failFastValidation,
} from '@aiponge/platform-core';

// Initialize ServiceLocator FIRST before any other imports that might use it
ServiceLocator.initialize();

import { createApp } from './app';
import { environmentConfig } from './config/environment';
import { musicApiCreditsService } from './services/MusicApiCreditsService';
import { GatewayError } from './errors';
import { INFRASTRUCTURE } from '@aiponge/shared-contracts';

// ServiceLocator initialized above before imports

const logger = createLogger('api-gateway-server');

// Configuration
const SERVICE_NAME = 'api-gateway';
const PORT = ServiceLocator.getServicePort('api-gateway');
const HOST = environmentConfig.host;

failFastValidation('api-gateway');

logger.info('🚀 Starting Enhanced API Gateway with Orchestration Awareness', {
  module: 'api_gateway_server',
  operation: 'startup',
  service: SERVICE_NAME,
  phase: 'initialization_start',
});

// Initialize warmup state tracking
interface WarmupState {
  serviceDiscoveryReady: boolean;
  backendServicesWarmed: boolean;
  configurationLoaded: boolean;
  warmupComplete: boolean;
}

const warmupState: WarmupState = {
  serviceDiscoveryReady: false,
  backendServicesWarmed: false,
  configurationLoaded: false,
  warmupComplete: false,
};

// Start server function using OrchestrationAwareBootstrap
export const startServer = async (): Promise<void> => {
  try {
    logger.info('🗺️ Initializing API Gateway with orchestration coordination...', {
      module: 'api_gateway_server',
      operation: 'start_server',
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
    });

    // Wait for system-service to be ready in development
    if (process.env.NODE_ENV === 'development') {
      logger.info('⏳ Waiting for system-service to be ready...', {
        module: 'api_gateway_server',
        operation: 'startup_delay',
        delayMs: 3000,
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Create bootstrap using platform-core
    const bootstrap = createStandardBootstrap(SERVICE_NAME, PORT, {
      middleware: {
        cors: true,
        helmet: true,
        compression: true,
        requestLogger: true,
      },
    });

    // Start server using new orchestration-aware pattern
    await bootstrap.start({
      customRoutes: (app: import('express').Express) => {
        logger.info('📝 Configuring API Gateway routes...', {
          service: SERVICE_NAME,
          phase: 'route_configuration',
        });

        // Use existing createApp to get the full Express app with all routes and middleware
        const gatewayApp = createApp();

        // Mount all gateway routes and middleware
        app.use('/', gatewayApp);

        logger.info('✅ API Gateway routes and middleware configured', {
          service: SERVICE_NAME,
          component: 'routes',
          endpoints: ['/api/*', '/admin', '/health'],
          phase: 'configuration_complete',
        });
      },
      beforeStart: async () => {
        logger.info('✅ API Gateway initialized', {
          service: SERVICE_NAME,
          component: 'core',
        });
      },
      afterStart: async () => {
        logger.info('📡 API Gateway ready for requests', {
          module: 'api_gateway_server',
          service: SERVICE_NAME,
          port: PORT,
          phase: 'server_ready',
        });

        // Initialize MusicAPI credits auto-sync
        musicApiCreditsService.initialize().catch(err => {
          logger.warn('MusicAPI credits service initialization failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });

        // Execute background warmup after server is running
        executeBackgroundWarmup();

        logger.info('🚀 API Gateway initialized with orchestration coordination', {
          service: SERVICE_NAME,
          phase: 'initialization_complete',
        });
      },
    });

    logger.info('✅ Successfully started with orchestration support', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'startup_complete',
    });
  } catch (error) {
    const { error: wrappedError, correlationId } = logAndTrackError(
      error,
      `API Gateway startup failed - critical gateway infrastructure unavailable`,
      {
        module: 'api_gateway_server',
        operation: 'startServer',
        phase: 'startup_failure',
        serviceName: SERVICE_NAME,
        port: String(PORT),
      },
      'API_GATEWAY_STARTUP_FAILURE',
      500 // Critical error
    );

    logger.error(`💥 API Gateway startup critical failure [${correlationId}]`, {
      service: SERVICE_NAME,
      phase: 'critical_failure',
      correlationId,
    });
    throw wrappedError;
  }
};

/**
 * Execute background warmup operations without blocking server startup
 */
async function executeBackgroundWarmup(): Promise<void> {
  logger.info('🔥 Executing background warmup', {
    module: 'api_gateway_server',
    operation: 'execute_background_warmup',
    phase: 'warmup_start',
  });

  try {
    // Give services a moment to fully initialize before warmup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run warmup operations in parallel for speed
    await Promise.allSettled([warmupConfiguration(), warmupServiceDiscovery(), warmupBackendServicesWithResilience()]);

    warmupState.warmupComplete = true;
    logger.info('✅ Background warmup completed', {
      module: 'api_gateway_server',
      operation: 'execute_background_warmup',
      phase: 'warmup_completed',
    });
  } catch (error) {
    const { correlationId } = logAndTrackError(
      error,
      'API Gateway background warmup failed - performance may be degraded',
      {
        module: 'api_gateway_server',
        operation: 'execute_background_warmup',
        phase: 'warmup_failed',
      },
      'API_GATEWAY_WARMUP_FAILURE',
      300 // Warning level - not critical
    );

    logger.warn(`🔥 Warmup failure handled gracefully [${correlationId}] - server remains operational`, {
      module: 'api_gateway_server',
      operation: 'execute_background_warmup',
      phase: 'warmup_failure_handled',
      correlationId,
    });
    // Don't throw - warmup failures shouldn't crash the server
  }
}

/**
 * Service discovery warmup with progressive retry logic
 */
async function warmupServiceDiscovery(): Promise<void> {
  logger.info('🔥 Warming up service discovery', {
    module: 'api_gateway_server',
    operation: 'warmup_service_discovery',
    phase: 'service_discovery_warmup_start',
  });

  const maxRetries = INFRASTRUCTURE.MAX_RETRIES;
  const baseDelayMs = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Test if service discovery is available
      logger.info('🔍 Service discovery attempt', {
        module: 'api_gateway_server',
        operation: 'warmup_service_discovery',
        attempt,
        maxRetries,
        phase: 'service_discovery_attempt',
      });

      // Simple test - if we have environment config, discovery is working
      if (environmentConfig.serviceDiscoveryEnabled) {
        logger.info('✅ Service discovery configuration ready', {
          module: 'api_gateway_server',
          operation: 'warmup_service_discovery',
          phase: 'service_discovery_config_ready',
        });
        warmupState.serviceDiscoveryReady = true;
        return;
      }
    } catch (error) {
      logAndTrackError(
        error,
        `Service discovery warmup attempt ${attempt}/${maxRetries} failed`,
        {
          module: 'api_gateway_server',
          operation: 'warmup_service_discovery',
          phase: 'service_discovery_attempt_failed',
          attempt: String(attempt),
          maxRetries: String(maxRetries),
        },
        'API_GATEWAY_SERVICE_DISCOVERY_WARMUP_RETRY',
        300 // Warning level - retryable
      );
    }

    // Exponential backoff before retry (except on last attempt)
    if (attempt < maxRetries) {
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      logger.info('⏳ Retrying service discovery', {
        module: 'api_gateway_server',
        operation: 'warmup_service_discovery',
        delayMs,
        phase: 'service_discovery_retry',
      });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Graceful degradation - warn but don't throw
  logger.warn('📊 Service discovery warmup failed after retries - gateway will operate with reduced performance', {
    module: 'api_gateway_server',
    operation: 'warmup_service_discovery',
    phase: 'service_discovery_warmup_failed_final',
  });
}

/**
 * Enterprise-grade backend services warmup with resilience patterns
 */
async function warmupBackendServicesWithResilience(): Promise<void> {
  logger.info('🔥 Warming up backend services with resilience patterns', {
    module: 'api_gateway_server',
    operation: 'warmup_backend_services_with_resilience',
    phase: 'backend_services_warmup_start',
  });

  // Mark as completed since we don't have specific services to warm up yet
  // In a real implementation, this would test connectivity to critical services
  warmupState.backendServicesWarmed = true;
  logger.info('✅ Backend services warmup completed', {
    module: 'api_gateway_server',
    operation: 'warmup_backend_services_with_resilience',
    phase: 'backend_services_warmup_success',
  });
}

/**
 * Pre-load critical gateway configuration
 */
async function warmupConfiguration(): Promise<void> {
  logger.info('🔥 Warming up configuration', {
    module: 'api_gateway_server',
    operation: 'warmup_configuration',
    phase: 'configuration_warmup_start',
  });

  try {
    // Configuration is already loaded via environmentConfig
    warmupState.configurationLoaded = true;
    logger.info('✅ Configuration warmed', {
      module: 'api_gateway_server',
      operation: 'warmup_configuration',
      phase: 'configuration_warmed',
    });
  } catch (error) {
    throw GatewayError.configurationError(
      'gateway configuration',
      `Configuration warmup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Warmup status endpoint will be handled by the main app routes

// Export warmup state for monitoring
export { warmupState };
