/**
 * Startup Optimization Router
 *
 * Dedicated router for startup optimization API endpoints.
 * Separated from service discovery for better code organization and single responsibility.
 */

import express from 'express';
import { OptimizedStartupManager } from './OptimizedStartupManager';
import { ServiceDependencyOrchestrator } from '../domains/discovery/services/ServiceDependencyOrchestrator';
import { getLogger } from '../config/service-urls';
import { ServiceErrors } from '../presentation/utils/response-helpers';

const logger = getLogger('system-service-startupoptimizationrouter');

const router: express.Router = express.Router();

/**
 * Initialize startup optimization router with required dependencies
 */
export function createStartupOptimizationRouter(
  startupManager: OptimizedStartupManager,
  dependencyOrchestrator: ServiceDependencyOrchestrator,
  serviceRegistry: Map<string, unknown>
): express.Router {
  // Get startup optimization preview
  router.get('/preview', async (req, res) => {
    try {
      logger.warn('📋 Generating startup preview...');

      const preview = startupManager.getStartupPreview();

      res.json({
        success: true,
        message: 'Startup preview generated successfully',
        data: preview,
        metadata: {
          timestamp: new Date().toISOString(),
          optimization_enabled: preview.optimizationEnabled,
          estimated_improvement: preview.optimizationEnabled ? '40-60%' : '0%',
        },
      });
    } catch (error) {
      logger.error('Preview generation failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Preview generation failed', req);
      return;
    }
  });

  // Execute optimized startup
  router.post('/execute', async (req, res) => {
    try {
      logger.warn('🚀 Executing optimized startup...');

      const result = await startupManager.executeOptimizedStartup();

      res.json({
        success: result.success,
        message: result.success ? 'Optimized startup completed successfully' : 'Startup completed with some errors',
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          mode: result.mode,
          performance_gain: result.analytics.totalTimeReduction,
        },
      });
    } catch (error) {
      logger.error('Startup execution failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Startup execution failed', req);
      return;
    }
  });

  // Get startup analytics and visualization
  router.get('/analytics', async (req, res) => {
    try {
      logger.warn('Generating startup analytics...');

      const visualization = startupManager.getStartupVisualization();
      const metrics = startupManager.exportMetrics();

      res.json({
        success: true,
        message: 'Startup analytics generated successfully',
        data: {
          visualization,
          metrics,
          current_status: {
            optimization_enabled: startupManager.isOptimizationEnabled(),
            registry_size: serviceRegistry.size,
            dependency_graph_health: 'healthy',
          },
        },
        metadata: {
          timestamp: new Date().toISOString(),
          generated_by: 'startup-optimization-engine',
        },
      });
    } catch (error) {
      logger.error('Analytics generation failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Analytics generation failed', req);
      return;
    }
  });

  // Toggle startup optimization
  router.post('/optimization/toggle', async (req, res) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        ServiceErrors.badRequest(res, 'Invalid request body. Expected { enabled: boolean }', req);
        return;
      }

      startupManager.setOptimizationEnabled(enabled);

      logger.warn('🔧 Optimization {} via API', { data0: enabled ? 'ENABLED' : 'DISABLED' });

      res.json({
        success: true,
        message: `Startup optimization ${enabled ? 'enabled' : 'disabled'}`,
        data: {
          optimization_enabled: enabled,
          effective_immediately: true,
          analytics: startupManager.exportMetrics(),
        },
        metadata: {
          timestamp: new Date().toISOString(),
          changed_by: 'api_request',
        },
      });
    } catch (error) {
      logger.error('Optimization toggle failed', { error: error instanceof Error ? error.message : String(error) });
      ServiceErrors.fromException(res, error, 'Optimization toggle failed', req);
      return;
    }
  });

  // Get startup dependency graph
  router.get('/dependencies', async (req, res) => {
    try {
      logger.warn('Generating dependency graph...');

      // Build fresh dependency graph
      dependencyOrchestrator.buildDependencyGraph();

      // Get startup order
      const startupOrder = dependencyOrchestrator.getStartupOrder();
      const graphVisualization = dependencyOrchestrator.getGraphVisualization();
      const statistics = dependencyOrchestrator.getStatistics();

      res.json({
        success: true,
        message: 'Dependency graph generated successfully',
        data: {
          startup_order: startupOrder,
          graph: graphVisualization,
          statistics,
          optimization_potential: {
            current_waves: startupOrder.length,
            max_parallelization: Math.max(...startupOrder.map(wave => wave.length)),
            circular_dependencies: statistics.cycles,
            total_dependencies: statistics.totalEdges,
          },
        },
        metadata: {
          timestamp: new Date().toISOString(),
          graph_nodes: statistics.totalServices,
          generated_by: 'dependency-orchestrator',
        },
      });
    } catch (error) {
      logger.error('Dependency graph generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      ServiceErrors.fromException(res, error, 'Dependency graph generation failed', req);
      return;
    }
  });

  return router;
}

export default router;
