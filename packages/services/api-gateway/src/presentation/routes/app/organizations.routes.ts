/**
 * Organizations Routes
 * Proxies CRUD endpoints for organizations to user-service
 */

import { Router } from 'express';
import { createPolicyRoute } from '../helpers/routeHelpers';

const router: Router = Router();

/**
 * GET /api/app/organizations/me
 * Get the authenticated user's organization
 */
router.get(
  '/me',
  ...createPolicyRoute({
    service: 'user-service',
    path: '/api/organizations/me',
    logPrefix: '[GET MY ORG]',
    errorMessage: 'Failed to fetch organization',
  })
);

/**
 * POST /api/app/organizations
 * Create a new organization
 */
router.post(
  '/',
  ...createPolicyRoute({
    service: 'user-service',
    path: '/api/organizations',
    logPrefix: '[CREATE ORG]',
    errorMessage: 'Failed to create organization',
    successStatus: 201,
  })
);

/**
 * GET /api/app/organizations/:organizationId
 * Get organization by ID
 */
router.get(
  '/:organizationId',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/organizations/${req.params.organizationId}`,
    logPrefix: '[GET ORG]',
    errorMessage: 'Failed to fetch organization',
  })
);

/**
 * PATCH /api/app/organizations/:organizationId
 * Update an organization
 */
router.patch(
  '/:organizationId',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/organizations/${req.params.organizationId}`,
    logPrefix: '[UPDATE ORG]',
    errorMessage: 'Failed to update organization',
  })
);

/**
 * GET /api/app/organizations/:organizationId/members
 * Get organization members
 */
router.get(
  '/:organizationId/members',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/organizations/${req.params.organizationId}/members`,
    logPrefix: '[GET ORG MEMBERS]',
    errorMessage: 'Failed to fetch organization members',
  })
);

/**
 * POST /api/app/organizations/:organizationId/members
 * Add a member to the organization
 */
router.post(
  '/:organizationId/members',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/organizations/${req.params.organizationId}/members`,
    logPrefix: '[ADD ORG MEMBER]',
    errorMessage: 'Failed to add organization member',
    successStatus: 201,
  })
);

/**
 * DELETE /api/app/organizations/:organizationId/members
 * Remove a member from the organization
 */
router.delete(
  '/:organizationId/members',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/organizations/${req.params.organizationId}/members`,
    logPrefix: '[REMOVE ORG MEMBER]',
    errorMessage: 'Failed to remove organization member',
  })
);

export default router;
