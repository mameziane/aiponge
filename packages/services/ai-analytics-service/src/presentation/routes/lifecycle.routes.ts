/**
 * Lifecycle Routes — REST API for mobile app lifecycle events
 * POST /api/v1/analytics/lifecycle/event
 * POST /api/v1/analytics/lifecycle/events/batch
 */

import { Router } from 'express';
import { LifecycleController } from '../controllers/LifecycleController';
import { RecordLifecycleEventUseCase } from '../../application/use-cases/lifecycle/RecordLifecycleEventUseCase';
import { BatchRecordLifecycleEventsUseCase } from '../../application/use-cases/lifecycle/BatchRecordLifecycleEventsUseCase';
import { LifecycleRepository } from '../../infrastructure/repositories/LifecycleRepository';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';

export function createLifecycleRoutes(): Router {
  const router = Router();

  const db = getDatabase();
  const repository = new LifecycleRepository(db);
  const recordUseCase = new RecordLifecycleEventUseCase(repository);
  const batchUseCase = new BatchRecordLifecycleEventsUseCase(recordUseCase);
  const controller = new LifecycleController(recordUseCase, batchUseCase);

  router.post('/api/v1/analytics/lifecycle/event', (req, res) => controller.recordEvent(req, res));
  router.post('/api/v1/analytics/lifecycle/events/batch', (req, res) => controller.recordEventsBatch(req, res));

  return router;
}
