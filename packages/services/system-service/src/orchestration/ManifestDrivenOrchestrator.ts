/**
 * Manifest-Driven Orchestrator Integration
 *
 * Integrates the new dependency manifest system into the System Service
 * without disrupting the existing orchestration infrastructure.
 */

import { ServiceDependencyOrchestrator } from '../domains/discovery/services/ServiceDependencyOrchestrator';

export type ServiceStatus = 'pending' | 'starting' | 'ready' | 'failed';
export type ServiceState = 'idle' | 'initializing' | 'running' | 'error' | 'stopped';
export type OrchestrationEvent = {
  type: string;
  timestamp: Date;
  serviceName: string;
  data?: Record<string, unknown>;
};
import {
  SERVICE_DEPENDENCY_MANIFEST,
  ServiceDependency,
  validateDependencyDAG,
  getServicesByTier,
  getAllTiers,
} from '../config/services.dependency.manifest';
import { ServiceLocator } from '@aiponge/platform-core';
import { getLogger } from '../config/service-urls';
import { SystemError } from '../application/errors';

export interface ManifestOrchestrationResult {
  success: boolean;
  totalDuration: number;
  tiersCompleted: number;
  servicesStarted: string[];
  failed: Array<{ service: string; error: string; tier: number }>;
  orchestrationEvents: OrchestrationEvent[];
}

/**
 * Integration layer for manifest-driven service orchestration
 */
export class ManifestDrivenOrchestrator {
  private logger = getLogger('manifest-driven-orchestrator');
  private dependencyOrchestrator: ServiceDependencyOrchestrator;
  private orchestrationEvents: OrchestrationEvent[] = [];
  private isActive = false;

  constructor() {
    this.dependencyOrchestrator = new ServiceDependencyOrchestrator(new Map());

    this.logger.info('🎯 Manifest-driven orchestrator initialized', {
      totalServices: SERVICE_DEPENDENCY_MANIFEST.length,
      tiers: getAllTiers().length,
      operation: 'initialize',
    });
  }

  /**
   * Start manifest-driven orchestration
   */
  public async startOrchestration(): Promise<ManifestOrchestrationResult> {
    const startTime = Date.now();
    this.isActive = true;
    this.orchestrationEvents = [];

    this.logger.info('🚀 Starting manifest-driven orchestration', {
      totalServices: SERVICE_DEPENDENCY_MANIFEST.length,
      operation: 'start_orchestration',
    });

    try {
      // Validate manifest
      const validation = validateDependencyDAG();
      if (!validation.valid) {
        throw SystemError.validationError('manifest', `Manifest validation failed: ${validation.errors.join(', ')}`);
      }

      // Initialize ServiceLocator
      ServiceLocator.initialize();

      // Monitor orchestration progress
      const result = await this.monitorOrchestrationProgress();

      const totalDuration = Date.now() - startTime;

      return {
        success: result.success,
        totalDuration,
        tiersCompleted: result.tiersCompleted,
        servicesStarted: result.servicesStarted,
        failed: result.failed,
        orchestrationEvents: this.orchestrationEvents,
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      this.logger.error('❌ Orchestration startup failed', {
        error: error instanceof Error ? error.message : String(error),
        duration: totalDuration,
        operation: 'start_failed',
      });

      return {
        success: false,
        totalDuration,
        tiersCompleted: 0,
        servicesStarted: [],
        failed: [{ service: 'orchestrator', error: String(error), tier: -1 }],
        orchestrationEvents: this.orchestrationEvents,
      };
    }
  }

  /**
   * Monitor orchestration progress until completion or failure
   */
  private async monitorOrchestrationProgress(): Promise<{
    success: boolean;
    tiersCompleted: number;
    servicesStarted: string[];
    failed: Array<{ service: string; error: string; tier: number }>;
  }> {
    return new Promise(resolve => {
      const checkProgress = () => {
        if (!this.isActive) {
          const status = this.dependencyOrchestrator.getOrchestrationStatus();
          const failed = status.services
            .filter(s => s.status === 'failed')
            .map(s => ({
              service: s.serviceName,
              error: s.error || 'Unknown error',
              tier: s.tier,
            }));

          const servicesStarted = status.services.filter(s => s.status === 'ready').map(s => s.serviceName);

          const tiersCompleted = status.tierStatus.filter(t => t.complete).length;

          resolve({
            success: status.orchestrationComplete && failed.length === 0,
            tiersCompleted,
            servicesStarted,
            failed,
          });
          return;
        }
        setTimeout(checkProgress, 1000);
      };

      checkProgress();
    });
  }

  /**
   * Handle service startup request
   */
  public async handleServiceStartupRequest(serviceName: string): Promise<boolean> {
    this.logger.info(`🔍 Service requesting startup clearance: ${serviceName}`, {
      serviceName,
      operation: 'startup_request',
    });

    const clearance = await this.dependencyOrchestrator.requestStartupClearance(serviceName);

    if (clearance) {
      this.logger.info(`✅ Startup clearance granted: ${serviceName}`, {
        serviceName,
        operation: 'clearance_granted',
      });
    } else {
      this.logger.info(`⏳ Startup clearance denied - waiting for dependencies: ${serviceName}`, {
        serviceName,
        operation: 'clearance_denied',
      });
    }

    return clearance;
  }

  /**
   * Report service as ready
   */
  public reportServiceReady(serviceName: string): void {
    this.logger.info(`📍 Service reporting ready: ${serviceName}`, {
      serviceName,
      operation: 'service_ready',
    });

    this.dependencyOrchestrator.reportServiceReady(serviceName);
  }

  /**
   * Report service failure
   */
  public reportServiceFailure(serviceName: string, error: string): void {
    this.logger.error(`💥 Service reporting failure: ${serviceName}`, {
      serviceName,
      error,
      operation: 'service_failure',
    });

    this.dependencyOrchestrator.reportServiceFailure(serviceName, error);
  }

  /**
   * Get current orchestration status
   */
  public getOrchestrationStatus() {
    return this.dependencyOrchestrator.getOrchestrationStatus();
  }

  /**
   * Wait for specific service to become ready
   */
  public async waitForService(serviceName: string, timeoutMs: number = 30000): Promise<boolean> {
    return this.dependencyOrchestrator.waitForService(serviceName, timeoutMs);
  }

  /**
   * Check if orchestration is active
   */
  public isOrchestrationActive(): boolean {
    return this.isActive;
  }
}
