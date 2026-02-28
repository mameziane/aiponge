/**
 * Reminders Routes
 * Proxies CRUD endpoints for all reminder types to user-service
 *
 * Unified API for book, reading, listening, and meditation reminders.
 * Also includes legacy book-specific routes and push token management.
 */

import { Router } from 'express';
import { getValidation } from '@aiponge/platform-core';
import { createPolicyRoute } from '../helpers/routeHelpers';
const { validateBody } = getValidation();
import { CreateReminderSchema, UpdateReminderSchema } from '@aiponge/shared-contracts/api/input-schemas';

const router: Router = Router();

/**
 * GET /api/app/reminders
 * Get all reminders for the authenticated user (supports ?type= filter)
 */
router.get(
  '/',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => {
      const typeFilter = req.query.type;
      return typeFilter ? `/api/reminders?type=${typeFilter}` : '/api/reminders';
    },
    logPrefix: '[GET ALL REMINDERS]',
    errorMessage: 'Failed to fetch reminders',
  })
);

/**
 * POST /api/app/reminders
 * Create a new reminder (any type)
 */
router.post(
  '/',
  ...createPolicyRoute({
    service: 'user-service',
    path: '/api/reminders',
    logPrefix: '[CREATE REMINDER]',
    errorMessage: 'Failed to create reminder',
    successStatus: 201,
    middleware: [validateBody(CreateReminderSchema)],
  })
);

/**
 * PATCH /api/app/reminders/:id
 * Update a reminder by ID
 */
router.patch(
  '/:id',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/reminders/${req.params.id}`,
    logPrefix: '[UPDATE REMINDER]',
    errorMessage: 'Failed to update reminder',
    middleware: [validateBody(UpdateReminderSchema)],
  })
);

/**
 * DELETE /api/app/reminders/:id
 * Delete a reminder by ID
 */
router.delete(
  '/:id',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/reminders/${req.params.id}`,
    logPrefix: '[DELETE REMINDER]',
    errorMessage: 'Failed to delete reminder',
  })
);

/**
 * GET /api/app/reminders/book
 * Get all book reminders for the authenticated user (legacy)
 */
router.get(
  '/book',
  ...createPolicyRoute({
    service: 'user-service',
    path: '/api/reminders/book',
    logPrefix: '[GET BOOK REMINDERS]',
    errorMessage: 'Failed to fetch reminders',
  })
);

/**
 * POST /api/app/reminders/book
 * Create a new book reminder (legacy)
 */
router.post(
  '/book',
  ...createPolicyRoute({
    service: 'user-service',
    path: '/api/reminders/book',
    logPrefix: '[CREATE BOOK REMINDER]',
    errorMessage: 'Failed to create reminder',
    successStatus: 201,
    middleware: [validateBody(CreateReminderSchema)],
  })
);

/**
 * PATCH /api/app/reminders/book/:id
 * Update a book reminder (legacy)
 */
router.patch(
  '/book/:id',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/reminders/book/${req.params.id}`,
    logPrefix: '[UPDATE BOOK REMINDER]',
    errorMessage: 'Failed to update reminder',
    middleware: [validateBody(UpdateReminderSchema)],
  })
);

/**
 * DELETE /api/app/reminders/book/:id
 * Delete a book reminder (legacy)
 */
router.delete(
  '/book/:id',
  ...createPolicyRoute({
    service: 'user-service',
    path: req => `/api/reminders/book/${req.params.id}`,
    logPrefix: '[DELETE BOOK REMINDER]',
    errorMessage: 'Failed to delete reminder',
  })
);

/**
 * POST /api/app/reminders/push-token
 * Register an Expo push notification token
 */
router.post(
  '/push-token',
  ...createPolicyRoute({
    service: 'user-service',
    path: '/api/push-tokens',
    logPrefix: '[REGISTER PUSH TOKEN]',
    errorMessage: 'Failed to register push token',
    transformBody: (req, userId) => ({ ...req.body, userId }),
  })
);

export default router;
