/**
 * System Config API Routes
 *
 * REST API endpoints for librarian defaults and system configuration
 */

import express from 'express';
import { extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { createConfigRepository } from '../../config/config.repository';
import {
  LibrarianDefaults,
  DEFAULT_LIBRARIAN_DEFAULTS,
  LIBRARIAN_DEFAULTS_CONFIG_KEY,
  type AvailableOptions,
} from '../../config/librarian-defaults.types';
import { LibrarianDefaultsUpdateSchema } from '../../config/librarian-defaults.schema';

const logger = getLogger('config-routes');
const router = express.Router();

const configRepo = createConfigRepository();

/**
 * GET /api/config/librarian-defaults
 * Get current librarian defaults (public endpoint for app consumption)
 */
router.get('/librarian-defaults', async (req, res) => {
  try {
    const stored = await configRepo.get<LibrarianDefaults>(LIBRARIAN_DEFAULTS_CONFIG_KEY);

    if (!stored) {
      return sendSuccess(res, { ...DEFAULT_LIBRARIAN_DEFAULTS, isDefault: true });
    }

    const merged: LibrarianDefaults = {
      ...DEFAULT_LIBRARIAN_DEFAULTS,
      ...stored,
      availableOptions: {
        ...DEFAULT_LIBRARIAN_DEFAULTS.availableOptions,
        ...stored.availableOptions,
        targetLanguages:
          stored.availableOptions?.targetLanguages?.length
            ? stored.availableOptions.targetLanguages
            : DEFAULT_LIBRARIAN_DEFAULTS.availableOptions.targetLanguages,
        genres:
          stored.availableOptions?.genres?.length
            ? stored.availableOptions.genres
            : DEFAULT_LIBRARIAN_DEFAULTS.availableOptions.genres,
      },
    };

    return sendSuccess(res, { ...merged, isDefault: false });
  } catch (error) {
    logger.error('Failed to get librarian defaults', { error });
    ServiceErrors.fromException(res, error, 'Failed to get librarian defaults', req);
  }
});

/**
 * PUT /api/config/librarian-defaults
 * Update librarian defaults (requires librarian or admin role)
 */
router.put('/librarian-defaults', async (req, res) => {
  try {
    const { userId: authUserId } = extractAuthContext(req);
    const userId = (req as express.Request & { userId?: string }).userId || authUserId;

    const parseResult = LibrarianDefaultsUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn('Invalid librarian defaults update', {
        errors: parseResult.error.errors,
        userId,
      });
      ServiceErrors.badRequest(res, 'Invalid librarian defaults format', req, {
        errors: parseResult.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    const updates = parseResult.data;

    const current = await configRepo.get<LibrarianDefaults>(LIBRARIAN_DEFAULTS_CONFIG_KEY);
    const base = current || DEFAULT_LIBRARIAN_DEFAULTS;

    const merged: LibrarianDefaults = {
      ...base,
      ...updates,
      musicDefaults: {
        ...base.musicDefaults,
        ...(updates.musicDefaults || {}),
      },
      bookDefaults: {
        ...base.bookDefaults,
        ...(updates.bookDefaults || {}),
      },
      localizationDefaults: {
        ...base.localizationDefaults,
        ...(updates.localizationDefaults || {}),
      },

      availableOptions: {
        ...base.availableOptions,
        ...(updates.availableOptions || {}),
      } as AvailableOptions,
      contentLimits: {
        ...base.contentLimits,
        ...(updates.contentLimits || {}),
      },
      uiConfiguration: {
        ...base.uiConfiguration,
        ...(updates.uiConfiguration || {}),
      },
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };

    await configRepo.set(
      LIBRARIAN_DEFAULTS_CONFIG_KEY,
      merged,
      'Platform-wide librarian defaults for content generation',
      userId
    );

    logger.info('Librarian defaults updated', { userId });

    return sendSuccess(res, { ...merged, message: 'Librarian defaults updated successfully' });
  } catch (error) {
    logger.error('Failed to update librarian defaults', { error });
    ServiceErrors.fromException(res, error, 'Failed to update librarian defaults', req);
  }
});

/**
 * POST /api/config/librarian-defaults/reset
 * Reset librarian defaults to factory defaults
 */
router.post('/librarian-defaults/reset', async (req, res) => {
  try {
    const { userId: authUserId } = extractAuthContext(req);
    const userId = (req as express.Request & { userId?: string }).userId || authUserId;

    const resetDefaults: LibrarianDefaults = {
      ...DEFAULT_LIBRARIAN_DEFAULTS,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };

    await configRepo.set(
      LIBRARIAN_DEFAULTS_CONFIG_KEY,
      resetDefaults,
      'Platform-wide librarian defaults for content generation (reset to factory)',
      userId
    );

    logger.info('Librarian defaults reset', { userId });

    return sendSuccess(res, { ...resetDefaults, message: 'Librarian defaults reset to factory values' });
  } catch (error) {
    logger.error('Failed to reset librarian defaults', { error });
    ServiceErrors.fromException(res, error, 'Failed to reset librarian defaults', req);
  }
});

/**
 * GET /api/config/available-options
 * Get just the available options (for UI dropdowns)
 */
router.get('/available-options', async (req, res) => {
  try {
    const defaults = await configRepo.get<LibrarianDefaults>(LIBRARIAN_DEFAULTS_CONFIG_KEY);
    const options = defaults?.availableOptions || DEFAULT_LIBRARIAN_DEFAULTS.availableOptions;

    return sendSuccess(res, options);
  } catch (error) {
    logger.error('Failed to get available options', { error });
    ServiceErrors.fromException(res, error, 'Failed to get available options', req);
  }
});

/**
 * GET /api/config/content-limits
 * Get content limits configuration
 */
router.get('/content-limits', async (req, res) => {
  try {
    const defaults = await configRepo.get<LibrarianDefaults>(LIBRARIAN_DEFAULTS_CONFIG_KEY);
    const limits = defaults?.contentLimits || DEFAULT_LIBRARIAN_DEFAULTS.contentLimits;

    return sendSuccess(res, limits);
  } catch (error) {
    logger.error('Failed to get content limits', { error });
    ServiceErrors.fromException(res, error, 'Failed to get content limits', req);
  }
});

export default router;
