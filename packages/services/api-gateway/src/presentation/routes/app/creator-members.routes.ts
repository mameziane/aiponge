import { Router } from 'express';
import { ServiceLocator, extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-creator-members.routes');

const router: Router = Router();

router.get(
  '/following',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/creator-members/following`, {
      method: 'GET',
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || '',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

router.delete(
  '/following/:creatorId',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const { creatorId } = req.params;

    const response = await gatewayFetch(`${userServiceUrl}/api/creator-members/following/${creatorId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || '',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

router.post(
  '/invitations',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/creator-members/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || '',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

router.get(
  '/invitations',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/creator-members/invitations`, {
      method: 'GET',
      headers: {
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || '',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

router.post(
  '/invitations/:token/accept',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const token = decodeURIComponent(req.params.token as string).trim();

    const response = await gatewayFetch(
      `${userServiceUrl}/api/creator-members/invitations/${encodeURIComponent(token)}/accept`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-request-id': (req.headers['x-request-id'] as string) || '',
        },
        body: JSON.stringify(req.body),
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

router.get(
  '/invitations/:token',
  wrapAsync(async (req, res) => {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const token = decodeURIComponent(req.params.token as string).trim();

    const response = await gatewayFetch(
      `${userServiceUrl}/api/creator-members/invitations/${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: {
          'x-request-id': (req.headers['x-request-id'] as string) || '',
        },
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  })
);

export default router;
