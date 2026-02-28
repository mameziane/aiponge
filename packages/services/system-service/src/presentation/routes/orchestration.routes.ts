/**
 * Orchestration API Routes
 *
 * REST API endpoints for dependency orchestration management and monitoring
 */

import express from 'express';
import { ManifestDrivenOrchestrator } from '../../orchestration/ManifestDrivenOrchestrator';
import { getLogger } from '../../config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('orchestration-routes');
const router: express.Router = express.Router();

// Global orchestrator instance (singleton)
let globalOrchestrator: ManifestDrivenOrchestrator | null = null;

/**
 * Get or create orchestrator instance
 */
function getOrchestrator(): ManifestDrivenOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new ManifestDrivenOrchestrator();
  }
  return globalOrchestrator;
}

/**
 * GET /api/orchestration/status
 * Get current orchestration status
 */
router.get('/status', (req, res) => {
  try {
    const orchestrator = getOrchestrator();
    const status = orchestrator.getOrchestrationStatus();

    sendSuccess(res, {
      orchestration: {
        active: orchestrator.isOrchestrationActive(),
        ...status,
      },
    });
  } catch (error) {
    logger.error('Failed to get orchestration status', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to get orchestration status', req);
    return;
  }
});

/**
 * POST /api/orchestration/start
 * Start manifest-driven orchestration
 */
router.post('/start', async (req, res) => {
  try {
    const orchestrator = getOrchestrator();

    if (orchestrator.isOrchestrationActive()) {
      ServiceErrors.conflict(res, 'Orchestration already active', req);
      return;
    }

    logger.info('🚀 Starting orchestration via API', {
      operation: 'api_start_orchestration',
    });

    const result = await orchestrator.startOrchestration();

    sendSuccess(res, {
      orchestration: result,
    });
  } catch (error) {
    logger.error('Failed to start orchestration', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to start orchestration', req);
    return;
  }
});

/**
 * POST /api/orchestration/service/:serviceName/request-clearance
 * Request startup clearance for a service
 */
router.post('/service/:serviceName/request-clearance', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const orchestrator = getOrchestrator();

    const clearance = await orchestrator.handleServiceStartupRequest(serviceName);

    sendSuccess(res, {
      serviceName,
      clearanceGranted: clearance,
    });
  } catch (error) {
    logger.error('Failed to process clearance request', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to process clearance request', req);
    return;
  }
});

/**
 * POST /api/orchestration/service/:serviceName/register
 * Register a service with the orchestrator
 */
router.post('/service/:serviceName/register', (req, res) => {
  try {
    const { serviceName } = req.params;
    const registration = req.body;

    // Log the registration (orchestrator integration TBD)
    logger.info('Service registration received', {
      serviceName,
      port: registration.port,
      capabilities: registration.capabilities?.length || 0,
      operation: 'register_service',
    });

    // Return success - actual orchestration logic to be implemented
    sendSuccess(res, {
      serviceName,
      status: 'registered',
    });
  } catch (error) {
    logger.error('Failed to register service', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to register service', req);
    return;
  }
});

/**
 * POST /api/orchestration/service/:serviceName/report-ready
 * Report service as ready
 */
router.post('/service/:serviceName/report-ready', (req, res) => {
  try {
    const { serviceName } = req.params;
    const orchestrator = getOrchestrator();

    orchestrator.reportServiceReady(serviceName);

    sendSuccess(res, {
      serviceName,
      status: 'ready',
    });
  } catch (error) {
    logger.error('Failed to report service ready', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to report service ready', req);
    return;
  }
});

/**
 * POST /api/orchestration/service/:serviceName/report-failure
 * Report service failure
 */
router.post('/service/:serviceName/report-failure', (req, res) => {
  try {
    const { serviceName } = req.params;
    const { error = 'Unknown error' } = req.body;
    const orchestrator = getOrchestrator();

    orchestrator.reportServiceFailure(serviceName, error);

    sendSuccess(res, {
      serviceName,
      status: 'failed',
      error,
    });
  } catch (error) {
    logger.error('Failed to report service failure', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to report service failure', req);
    return;
  }
});

/**
 * GET /api/orchestration/service/:serviceName/wait
 * Wait for service to become ready
 */
router.get('/service/:serviceName/wait', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const { timeout = 30000 } = req.query;
    const orchestrator = getOrchestrator();

    const ready = await orchestrator.waitForService(serviceName, Number(timeout));

    sendSuccess(res, {
      serviceName,
      ready,
      timeout: Number(timeout),
    });
  } catch (error) {
    logger.error('Failed to wait for service', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to wait for service', req);
    return;
  }
});

export default router;
