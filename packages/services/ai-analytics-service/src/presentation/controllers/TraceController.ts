/**
 * Trace Controller
 * Handles request tracing endpoints: get trace, search traces, slow requests, trace stats.
 * Uses dynamic imports for ESM compatibility with trace modules.
 */

import type { Request, Response } from 'express';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { parseTimeRange } from '../utils/helpers';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = getLogger('ai-analytics-service:trace-controller');

const DATABASE_URL = process.env.DATABASE_URL;

// Lazy-loaded trace modules (dynamic imports for ESM compatibility)
const traceModules: {
  TraceRepository: (new (db: unknown) => Record<string, unknown>) | null;
  GetRequestTraceUseCase:
    | (new (repo: unknown) => { execute: (params: unknown) => Promise<Record<string, unknown>> })
    | null;
  SearchTracesUseCase: (new (repo: unknown) => { execute: (params: unknown) => Promise<unknown> }) | null;
  GetSlowRequestsUseCase: (new (repo: unknown) => { execute: (params: unknown) => Promise<unknown> }) | null;
  traceRepository: Record<string, unknown> | null;
} = {
  TraceRepository: null,
  GetRequestTraceUseCase: null,
  SearchTracesUseCase: null,
  GetSlowRequestsUseCase: null,
  traceRepository: null,
};

// Initialize trace modules asynchronously
void (async () => {
  try {
    const traceRepoModule = await import('../../infrastructure/repositories/TraceRepository');
    traceModules.TraceRepository = traceRepoModule.TraceRepository as unknown as typeof traceModules.TraceRepository;
    const useCasesModule = await import('../../application/use-cases/tracing');
    traceModules.GetRequestTraceUseCase =
      useCasesModule.GetRequestTraceUseCase as unknown as typeof traceModules.GetRequestTraceUseCase;
    traceModules.SearchTracesUseCase =
      useCasesModule.SearchTracesUseCase as unknown as typeof traceModules.SearchTracesUseCase;
    traceModules.GetSlowRequestsUseCase =
      useCasesModule.GetSlowRequestsUseCase as unknown as typeof traceModules.GetSlowRequestsUseCase;

    if (DATABASE_URL) {
      const { drizzle } = await import('drizzle-orm/node-postgres');
      const { Pool } = await import('pg');
      const connStr = DATABASE_URL.includes('sslmode=require')
        ? DATABASE_URL.replace('sslmode=require', 'sslmode=verify-full')
        : DATABASE_URL;
      const pool = new Pool({ connectionString: connStr });
      const db = drizzle(pool);
      traceModules.traceRepository = new traceModules.TraceRepository!(db);
    }
    logger.debug('Trace modules loaded successfully');
  } catch (err) {
    logger.warn('TraceRepository initialization skipped', { error: serializeError(err) });
  }
})();

export class TraceController {
  async getTrace(req: Request, res: Response): Promise<void> {
    try {
      if (!traceModules.traceRepository) {
        ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
        return;
      }

      const { correlationId } = req.params;
      const useCase = new traceModules.GetRequestTraceUseCase!(traceModules.traceRepository);
      const result = await useCase.execute({ correlationId });

      if (!result.success) {
        ServiceErrors.notFound(res, `Trace ${correlationId}`, req);
        return;
      }

      sendSuccess(res, result.trace);
    } catch (error) {
      logger.error('Failed to get trace', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve trace', error, req);
    }
  }

  async searchTraces(req: Request, res: Response): Promise<void> {
    try {
      if (!traceModules.traceRepository) {
        ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
        return;
      }

      const useCase = new traceModules.SearchTracesUseCase!(traceModules.traceRepository);
      const result = await useCase.execute({
        userId: req.query.userId as string,
        service: req.query.service as string,
        operation: req.query.operation as string,
        status: req.query.status as string,
        minDuration: req.query.minDuration ? parseInt(req.query.minDuration as string) : undefined,
        maxDuration: req.query.maxDuration ? parseInt(req.query.maxDuration as string) : undefined,
        since: req.query.since as string,
        until: req.query.until as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to search traces', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to search traces', error, req);
    }
  }

  async getSlowRequests(req: Request, res: Response): Promise<void> {
    try {
      if (!traceModules.traceRepository) {
        ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
        return;
      }

      const useCase = new traceModules.GetSlowRequestsUseCase!(traceModules.traceRepository);
      const result = await useCase.execute({
        threshold: req.query.threshold ? parseInt(req.query.threshold as string) : undefined,
        since: req.query.since as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to get slow requests', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve slow requests', error, req);
    }
  }

  async getTraceStats(req: Request, res: Response): Promise<void> {
    try {
      if (!traceModules.traceRepository) {
        ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
        return;
      }

      const since = req.query.since
        ? parseTimeRange(req.query.since as string)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const stats = await (
        traceModules.traceRepository as Record<string, (...args: unknown[]) => Promise<unknown>>
      ).getTraceStats(since);

      sendSuccess(res, stats);
    } catch (error) {
      logger.error('Failed to get trace stats', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve trace statistics', error, req);
    }
  }
}
