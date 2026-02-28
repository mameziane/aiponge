/**
 * Health Manager
 *
 * Main health check manager class for Express endpoints
 * Provides Kubernetes-compatible health probes:
 * - /health/live  - Liveness probe (is the process running?)
 * - /health/ready - Readiness probe (can the service handle traffic?)
 * - /health/startup - Startup probe (has the service finished initializing?)
 * - /health - General health check with detailed status
 */

import { Request, Response, Router } from 'express';
import { HealthCheckConfig } from '../types';
import { HealthResponse, ReadinessResponse, ComponentHealth, LivenessResponse, StartupResponse } from './types';
import { DatabaseHealthChecker } from './database-checks';
import { DependencyHealthChecker } from './dependency-checks';
import type { PrometheusMetrics } from '../metrics/index.js';

export class HealthManager {
  private config: HealthCheckConfig;
  private startupTime: number;
  private startupComplete: boolean = false;
  private startupChecks: Map<string, boolean> = new Map();
  private metricsInstance: PrometheusMetrics | null = null;

  constructor(config: HealthCheckConfig) {
    this.config = config;
    this.startupTime = Date.now();
  }

  /**
   * Mark a startup check as complete
   */
  markStartupCheckComplete(checkName: string): void {
    this.startupChecks.set(checkName, true);
  }

  /**
   * Set metrics instance for SLO checking in readiness probe
   */
  setMetricsInstance(metrics: PrometheusMetrics): void {
    this.metricsInstance = metrics;
  }

  /**
   * Mark overall startup as complete
   */
  markStartupComplete(): void {
    this.startupComplete = true;
  }

  /**
   * Check if startup is complete
   */
  isStartupComplete(): boolean {
    return this.startupComplete;
  }

  /**
   * Create standardized /health endpoint handler (liveness probe)
   */
  createHealthEndpoint() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const response = await this.generateHealthResponse();
        const statusCode = response.status === 'healthy' ? 200 : response.status === 'degraded' ? 200 : 503;
        res.status(statusCode).json(response);
      } catch (error) {
        const errorResponse: HealthResponse = {
          service: this.config.serviceName,
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          version: this.config.version,
          uptime: this.getUptimeSeconds(),
          memory: process.memoryUsage(),
          components: {
            dependencies: {
              'health-check': {
                status: 'unhealthy',
                errorMessage: error instanceof Error ? error.message : 'Health check failed',
              },
            },
          },
        };
        res.status(503).json(errorResponse);
      }
    };
  }

  /**
   * Create standardized /ready endpoint handler (readiness probe)
   */
  createReadinessEndpoint() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const response = await this.generateReadinessResponse();
        const statusCode = response.ready ? 200 : 503;

        if (!response.ready && response.retryAfterSeconds) {
          res.set('Retry-After', response.retryAfterSeconds.toString());
        }

        res.status(statusCode).json(response);
      } catch (error) {
        const errorResponse: ReadinessResponse = {
          ready: false,
          service: this.config.serviceName,
          timestamp: new Date().toISOString(),
          version: this.config.version,
          uptime: this.getUptimeSeconds(),
          components: {
            dependencies: {
              'readiness-check': {
                status: 'unhealthy',
                errorMessage: error instanceof Error ? error.message : 'Readiness check failed',
              },
            },
          },
          message: 'Readiness check failed due to internal error',
          retryAfterSeconds: 10,
        };
        res.set('Retry-After', '10');
        res.status(503).json(errorResponse);
      }
    };
  }

  /**
   * Check database health using DatabaseHealthChecker
   */
  async checkDatabaseHealth(): Promise<ComponentHealth> {
    return DatabaseHealthChecker.checkDatabaseHealth(this.config.databaseUrl);
  }

  /**
   * Check dependency health using DependencyHealthChecker
   */
  async checkDependencyHealth(url: string, timeout = 5000): Promise<ComponentHealth> {
    return DependencyHealthChecker.checkDependencyHealth(url, timeout);
  }

  private async generateHealthResponse(): Promise<HealthResponse> {
    const response: HealthResponse = {
      service: this.config.serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: this.config.version,
      uptime: this.getUptimeSeconds(),
      memory: process.memoryUsage(),
    };

    if (this.config.capabilities) {
      response.capabilities = this.config.capabilities;
    }

    if (this.config.features) {
      response.features = this.config.features;
    }

    if (this.config.endpoints) {
      response.endpoints = this.config.endpoints;
    }

    return response;
  }

  private async generateReadinessResponse(): Promise<ReadinessResponse> {
    const components: ReadinessResponse['components'] = {};
    let allComponentsHealthy = true;
    let hasUnhealthyComponents = false;

    // Check database if configured
    const dbHealth = await this.checkDatabaseHealth();
    components.database = dbHealth;

    if (dbHealth.status === 'unhealthy') {
      allComponentsHealthy = false;
      hasUnhealthyComponents = true;
    } else if (dbHealth.status === 'degraded') {
      allComponentsHealthy = false;
    }

    // Check configured dependencies
    if (this.config.dependencies && this.config.dependencies.length > 0) {
      components.dependencies = {};

      for (const dep of this.config.dependencies) {
        const depHealth = await this.checkDependencyHealth(dep.url, dep.timeout);
        components.dependencies[dep.name] = depHealth;

        if (depHealth.status === 'unhealthy') {
          allComponentsHealthy = false;
          hasUnhealthyComponents = true;
        } else if (depHealth.status === 'degraded') {
          allComponentsHealthy = false;
        }
      }
    }

    if (this.metricsInstance) {
      try {
        const { checkSloViolations } = await import('../metrics/slo.js');
        const sloResult = checkSloViolations(this.metricsInstance);
        if (sloResult.violations.length > 0) {
          const hasCritical = sloResult.violations.some(v => v.severity === 'critical');
          components.slo = {
            status: hasCritical ? 'unhealthy' : 'degraded',
            metadata: {
              violations: sloResult.violations,
              checkedAt: sloResult.checkedAt,
            },
          };
          if (hasCritical) {
            hasUnhealthyComponents = true;
          }
          allComponentsHealthy = false;
        } else {
          components.slo = { status: 'healthy' };
        }
      } catch {
        // SLO check is best-effort, don't fail readiness
      }
    }

    const ready = allComponentsHealthy;
    let message: string | undefined;
    let retryAfterSeconds: number | undefined;

    if (!ready) {
      if (hasUnhealthyComponents) {
        message = 'Service not ready - critical dependencies unavailable';
        retryAfterSeconds = 30;
      } else {
        message = 'Service not ready - some dependencies degraded';
        retryAfterSeconds = 10;
      }
    }

    return {
      ready,
      service: this.config.serviceName,
      timestamp: new Date().toISOString(),
      version: this.config.version,
      uptime: this.getUptimeSeconds(),
      components,
      message,
      retryAfterSeconds,
    };
  }

  private getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startupTime) / 1000);
  }

  /**
   * Create liveness probe endpoint handler
   * Kubernetes uses this to determine if the container should be restarted
   * Should be a simple check that the process is responsive
   */
  createLivenessEndpoint() {
    return (req: Request, res: Response): void => {
      const response: LivenessResponse = {
        alive: true,
        service: this.config.serviceName,
        timestamp: new Date().toISOString(),
        uptime: this.getUptimeSeconds(),
      };
      res.status(200).json(response);
    };
  }

  /**
   * Create startup probe endpoint handler
   * Kubernetes uses this to know when the application has started
   * Prevents traffic being sent before initialization is complete
   */
  createStartupEndpoint() {
    return (req: Request, res: Response): void => {
      const checks: Record<string, boolean> = {};
      this.startupChecks.forEach((value, key) => {
        checks[key] = value;
      });

      const response: StartupResponse = {
        started: this.startupComplete,
        service: this.config.serviceName,
        timestamp: new Date().toISOString(),
        uptime: this.getUptimeSeconds(),
        checks: Object.keys(checks).length > 0 ? checks : undefined,
        message: this.startupComplete ? undefined : 'Service is still initializing',
      };

      res.status(this.startupComplete ? 200 : 503).json(response);
    };
  }

  /**
   * Create an Express router with all Kubernetes-compatible health endpoints
   * Mounts at /health with the following sub-routes:
   * - GET /health - Detailed health check
   * - GET /health/live - Liveness probe
   * - GET /health/ready - Readiness probe
   * - GET /health/startup - Startup probe
   */
  createHealthRouter(): Router {
    const router = Router();

    router.get('/', this.createHealthEndpoint());
    router.get('/live', this.createLivenessEndpoint());
    router.get('/ready', this.createReadinessEndpoint());
    router.get('/startup', this.createStartupEndpoint());

    return router;
  }
}
