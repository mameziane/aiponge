import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../config/service-urls';
import { CURRENT_CONTRACT_VERSION, isCompatible } from '@aiponge/shared-contracts';

const logger = getLogger('api-gateway:contract-version');

const CONTRACT_VERSION_HEADER = 'x-contract-version';
const CONTRACT_RESPONSE_HEADER = 'x-server-contract-version';

export function contractVersionCheckMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientVersion = req.headers[CONTRACT_VERSION_HEADER] as string | undefined;

  if (!clientVersion) {
    next();
    return;
  }

  const compatible = isCompatible(clientVersion, CURRENT_CONTRACT_VERSION);

  if (!compatible) {
    logger.warn('Incompatible contract version', {
      clientVersion,
      serverVersion: CURRENT_CONTRACT_VERSION,
      path: req.path,
      method: req.method,
    });

    res.status(400).json({
      success: false,
      error: {
        type: 'CONTRACT_VERSION_ERROR',
        code: 'INCOMPATIBLE_CONTRACT_VERSION',
        message: `Client contract version "${clientVersion}" is incompatible with server version "${CURRENT_CONTRACT_VERSION}".`,
        details: {
          clientVersion,
          serverVersion: CURRENT_CONTRACT_VERSION,
          hint: 'Update your client to a compatible version.',
        },
      },
    });
    return;
  }

  next();
}

export function contractVersionStampMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader(CONTRACT_RESPONSE_HEADER, CURRENT_CONTRACT_VERSION);

  const originalJson = res.json.bind(res);
  res.json = function (body: Record<string, unknown>) {
    if (body && typeof body === 'object' && !Array.isArray(body) && body.success !== undefined) {
      body._contract = {
        version: CURRENT_CONTRACT_VERSION,
      };
    }
    return originalJson(body);
  };

  next();
}
