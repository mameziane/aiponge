/**
 * Optimized Startup Manager - Integration Layer
 *
 * Integrates StartupOrchestrator with existing system service infrastructure
 * for production-ready wave-based startup optimization.
 */

import { StartupOrchestrator, type StartupConfiguration, type StartupWave } from './StartupOrchestrator';
import { ServiceDependencyOrchestrator, type ServiceRegistryEntry } from '../domains/discovery/services/ServiceDependencyOrchestrator';
import { SERVICE_DEPENDENCY_MANIFEST, validateDependencyDAG } from '../config/services.dependency.manifest';
import { getLogger } from '../config/service-urls';
import { errorMessage } from '@aiponge/platform-core';

export interface OptimizedStartupResult {
  success: boolean;
  mode: 'optimized' | 'parallel' | 'fallback';
  totalTime: number;
  wavesExecuted: number;
  servicesStarted: string[];
  errors: Array<{ service: string; error: string }>;
  analytics: {
    waveBreakdown: Array<{
      wave: number;
      services: string[];
      executionTime: number;
    }>;
    parallelizationGains: string;
    totalTimeReduction: string;
  };
}

export class OptimizedStartupManager {
  private startupOrchestrator: StartupOrchestrator;
  private serviceRegistry: Map<string, ServiceRegistryEntry>;
  private isInitialized = false;
  private logger = getLogger('optimized-startup-manager');

  constructor(serviceRegistry: Map<string, ServiceRegistryEntry>) {
    this.serviceRegistry = serviceRegistry;

    // Initialize dependency orchestrator with service registry
    const dependencyOrchestrator = new ServiceDependencyOrchestrator(serviceRegistry);

    // Initialize startup orchestrator with optimization enabled
    this.startupOrchestrator = new StartupOrchestrator(dependencyOrchestrator, {
      maxConcurrentServices: 4,
      waveDelayMs: 2000,
      healthCheckTimeoutMs: 15000,
      retryAttempts: 3,
      enableOptimization: true,
    });

    this.logger.debug('✅ Initialized with wave-based startup optimization', {
      module: 'optimized_startup_manager',
      operation: 'constructor',
      optimizationEnabled: true,
      phase: 'initialization_complete',
    });
  }

  /**
   * Initialize the startup manager with dependency validation
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('✅ Initializing startup optimization', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      phase: 'initialization_start',
    });

    // Validate dependency configuration
    const validation = validateDependencyDAG();

    if (!validation.valid) {
      this.logger.error('❌ Dependency configuration validation failed', {
        module: 'optimized_startup_manager',
        operation: 'initialize',
        phase: 'configuration_validation_failure',
      });
      validation.errors.forEach(error =>
        this.logger.error('Configuration error', {
          module: 'optimized_startup_manager',
          operation: 'initialize',
          error,
          phase: 'validation_error_details',
        })
      );

      // Disable optimization if configuration is invalid
      (this.startupOrchestrator as unknown as { config: StartupConfiguration }).config.enableOptimization = false;
      this.logger.warn('⚠️ Optimization disabled due to configuration errors', {
        module: 'optimized_startup_manager',
        operation: 'initialize',
        optimizationEnabled: false,
        phase: 'optimization_disabled',
      });
    }

    // Log startup analytics
    const analytics = this.startupOrchestrator.getStartupAnalytics();
    this.logger.info('📊 Startup Analytics', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      phase: 'analytics_report_start',
    });
    this.logger.info('Optimization status', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      optimizationEnabled: analytics.optimizationEnabled,
      phase: 'analytics_optimization_status',
    });
    this.logger.info('Total services count', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      totalServices: analytics.totalServices,
      phase: 'analytics_service_count',
    });
    this.logger.info('Estimated wave count', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      estimatedWaves: analytics.estimatedWaves,
      phase: 'analytics_wave_count',
    });
    this.logger.info('Maximum parallelization capacity', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      maxParallelization: analytics.maxParallelization,
      phase: 'analytics_parallelization',
    });
    this.logger.info('Estimated time reduction', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      estimatedTimeReduction: analytics.estimatedTimeReduction,
      phase: 'analytics_time_reduction',
    });

    this.isInitialized = true;
    this.logger.info('✅ Initialization completed', {
      module: 'optimized_startup_manager',
      operation: 'initialize',
      phase: 'initialization_completed',
    });
  }

  /**
   * Execute optimized startup process
   */
  async executeOptimizedStartup(): Promise<OptimizedStartupResult> {
    await this.initialize();

    const startTime = Date.now();
    this.logger.info('🚀 Beginning optimized startup execution', {
      module: 'optimized_startup_manager',
      operation: 'startup',
      phase: 'startup_execution_begin',
    });

    try {
      // Get startup waves for analytics
      const waves = this.startupOrchestrator.getOptimizedStartupWaves();

      // Execute the optimized startup
      const result = await this.startupOrchestrator.executeOptimizedStartup();

      const totalTime = Date.now() - startTime;

      // Calculate analytics
      const analytics = this.calculateStartupAnalytics(waves, result, totalTime);

      const optimizedResult: OptimizedStartupResult = {
        success: result.success,
        mode: (this.startupOrchestrator as unknown as { config: StartupConfiguration }).config.enableOptimization ? 'optimized' : 'parallel',
        totalTime,
        wavesExecuted: result.wavesExecuted,
        servicesStarted: result.servicesStarted,
        errors: result.errors,
        analytics,
      };

      this.logStartupSummary(optimizedResult);
      return optimizedResult;
    } catch (error) {
      this.logger.error('❌ Critical startup failure', {
        module: 'optimized_startup_manager',
        operation: 'startup',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        phase: 'critical_startup_failure',
      });

      return {
        success: false,
        mode: 'fallback',
        totalTime: Date.now() - startTime,
        wavesExecuted: 0,
        servicesStarted: [],
        errors: [{ service: 'startup-manager', error: errorMessage(error) }],
        analytics: {
          waveBreakdown: [],
          parallelizationGains: '0%',
          totalTimeReduction: '0%',
        },
      };
    }
  }

  /**
   * Get startup preview without execution
   */
  getStartupPreview(): {
    waves: Array<{
      wave: number;
      services: string[];
      dependencies: string[];
      parallelizable: boolean;
      estimatedTime: number;
    }>;
    totalEstimatedTime: number;
    optimizationEnabled: boolean;
  } {
    const waves = this.startupOrchestrator.getOptimizedStartupWaves();
    const totalEstimatedTime = waves.length * 3000; // 3 seconds per wave average

    return {
      waves: waves.map(wave => ({
        ...wave,
        estimatedTime: 3000, // Estimate 3 seconds per wave
      })),
      totalEstimatedTime,
      optimizationEnabled: (this.startupOrchestrator as unknown as { config: StartupConfiguration }).config.enableOptimization,
    };
  }

  /**
   * Calculate startup analytics
   */
  private calculateStartupAnalytics(
    waves: StartupWave[],
    result: { success: boolean; totalTime: number; wavesExecuted: number; servicesStarted: string[]; errors: Array<{ service: string; error: string }> },
    actualTotalTime: number
  ): OptimizedStartupResult['analytics'] {
    // Calculate wave breakdown
    const waveBreakdown = waves.map((wave, index) => ({
      wave: index + 1,
      services: wave.services,
      executionTime: actualTotalTime / waves.length, // Rough estimate
    }));

    // Calculate parallelization gains
    const totalServices = result.servicesStarted.length;
    const sequentialTime = totalServices * 5000; // 5 seconds per service sequentially
    const parallelizationGains = Math.round(((sequentialTime - actualTotalTime) / sequentialTime) * 100);

    // Calculate total time reduction vs sequential startup
    const sequentialBaselineTime = totalServices * 3000; // 3 seconds per service in sequential mode
    const totalTimeReduction = Math.round(((sequentialBaselineTime - actualTotalTime) / sequentialBaselineTime) * 100);

    return {
      waveBreakdown,
      parallelizationGains: `${Math.max(0, parallelizationGains)}%`,
      totalTimeReduction: `${Math.max(0, totalTimeReduction)}%`,
    };
  }

  /**
   * Log startup summary
   */
  private logStartupSummary(result: OptimizedStartupResult): void {
    // Summary report separator
    this.logger.info('📊 Startup Summary Report', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      phase: 'summary_report_start',
    });
    this.logger.info('🎯 Startup mode', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      mode: result.mode.toUpperCase(),
      phase: 'summary_mode',
    });
    this.logger.info(`${result.success ? '✅' : '❌'} Startup result`, {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      success: result.success,
      phase: 'summary_success_status',
    });
    this.logger.info('⏱️ Total execution time', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      totalTime: result.totalTime,
      phase: 'summary_total_time',
    });
    this.logger.info('🌊 Waves executed', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      wavesExecuted: result.wavesExecuted,
      phase: 'summary_waves_executed',
    });
    this.logger.info('🚀 Services started', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      servicesStartedCount: result.servicesStarted.length,
      servicesStarted: result.servicesStarted,
      phase: 'summary_services_started',
    });

    if (result.errors.length > 0) {
      this.logger.warn('❌ Startup errors detected', {
        module: 'optimized_startup_manager',
        operation: 'log_startup_summary',
        errorCount: result.errors.length,
        phase: 'summary_errors_detected',
      });
      result.errors.forEach(error =>
        this.logger.warn('Service startup error', {
          module: 'optimized_startup_manager',
          operation: 'log_startup_summary',
          service: error.service,
          error: error.error,
          phase: 'summary_error_details',
        })
      );
    }

    this.logger.info('📈 Parallelization gains', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      parallelizationGains: result.analytics.parallelizationGains,
      phase: 'summary_parallelization_gains',
    });
    this.logger.info('⚡ Time reduction achieved', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      totalTimeReduction: result.analytics.totalTimeReduction,
      phase: 'summary_time_reduction',
    });

    this.logger.info('🌊 Wave breakdown analysis', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      waveCount: result.analytics.waveBreakdown.length,
      phase: 'summary_wave_breakdown_start',
    });
    result.analytics.waveBreakdown.forEach(wave =>
      this.logger.info('Wave execution details', {
        module: 'optimized_startup_manager',
        operation: 'log_startup_summary',
        wave: wave.wave,
        services: wave.services,
        executionTime: wave.executionTime,
        phase: 'summary_wave_details',
      })
    );

    this.logger.info('Startup summary completed', {
      module: 'optimized_startup_manager',
      operation: 'log_startup_summary',
      phase: 'summary_report_end',
    });
    // Summary report separator
  }

  /**
   * Enable/disable optimization at runtime
   */
  setOptimizationEnabled(enabled: boolean): void {
    (this.startupOrchestrator as unknown as { config: StartupConfiguration }).config.enableOptimization = enabled;
    this.logger.info(`🔧 Optimization ${enabled ? 'ENABLED' : 'DISABLED'}`, {
      module: 'optimized_startup_manager',
      operation: 'set_optimization_enabled',
      optimizationEnabled: enabled,
      phase: 'optimization_setting_changed',
    });
  }

  /**
   * Get current optimization status
   */
  isOptimizationEnabled(): boolean {
    return (this.startupOrchestrator as unknown as { config: StartupConfiguration }).config.enableOptimization;
  }

  /**
   * Get detailed startup graph visualization
   */
  getStartupVisualization(): {
    graph: ReturnType<StartupOrchestrator['generateStartupGraphVisualization']>;
    analytics: ReturnType<StartupOrchestrator['getStartupAnalytics']>;
    configuration: typeof SERVICE_DEPENDENCY_MANIFEST;
  } {
    return {
      graph: this.startupOrchestrator.generateStartupGraphVisualization(),
      analytics: this.startupOrchestrator.getStartupAnalytics(),
      configuration: SERVICE_DEPENDENCY_MANIFEST,
    };
  }

  /**
   * Export startup metrics for monitoring
   */
  exportMetrics(): {
    timestamp: string;
    optimization_enabled: boolean;
    total_services: number;
    estimated_waves: number;
    max_parallelization: number;
    estimated_time_reduction: string;
    dependency_validation: {
      is_valid: boolean;
      error_count: number;
      warning_count: number;
    };
  } {
    const analytics = this.startupOrchestrator.getStartupAnalytics();
    const validation = validateDependencyDAG();

    return {
      timestamp: new Date().toISOString(),
      optimization_enabled: analytics.optimizationEnabled,
      total_services: analytics.totalServices,
      estimated_waves: analytics.estimatedWaves,
      max_parallelization: analytics.maxParallelization,
      estimated_time_reduction: analytics.estimatedTimeReduction,
      dependency_validation: {
        is_valid: validation.valid,
        error_count: validation.errors.length,
        warning_count: 0,
      },
    };
  }
}
