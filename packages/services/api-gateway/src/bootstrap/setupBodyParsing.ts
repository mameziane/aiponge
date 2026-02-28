import express from 'express';
import type { Application } from 'express';
import { paginationMiddleware } from '../presentation/middleware/PaginationMiddleware';
import type { GatewayAppContext } from './context';

export function setupBodyParsing(app: Application, _ctx: GatewayAppContext): void {
  app.use(express.json({ limit: process.env.BODY_SIZE_LIMIT || '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: process.env.BODY_SIZE_LIMIT || '1mb' }));

  app.use('/api/v1/admin', paginationMiddleware(500));
  app.use('/api/v1', paginationMiddleware(100, { excludePaths: ['/admin'] }));
}
