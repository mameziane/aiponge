import type { Application } from 'express';
import {
  contractVersionCheckMiddleware,
  contractVersionStampMiddleware,
} from '../presentation/middleware/ContractVersionMiddleware';
import type { GatewayAppContext } from './context';

export function setupContractVersioning(app: Application, ctx: GatewayAppContext): void {
  app.use('/api', contractVersionCheckMiddleware);
  app.use('/api', contractVersionStampMiddleware);

  ctx.logger.debug('Contract versioning middleware configured');
}
