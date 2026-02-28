/**
 * Book Reminder Controller
 * Handles book reminder settings and notifications for personal book entries
 *
 * This controller manages reminders that encourage users to write in their personal books.
 * Book reminders are specific to personal books and don't apply to shared/managed book types.
 */

import { Request, Response } from 'express';
import { BookReminderRepository, ExpoPushTokenRepository } from '@infrastructure/repositories';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('book-reminder-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class BookReminderController {
  private reminderRepo = createDrizzleRepository(BookReminderRepository);
  private pushTokenRepo = createDrizzleRepository(ExpoPushTokenRepository);

  async getReminders(req: Request, res: Response): Promise<void> {
    const userId = extractAuthContext(req).userId || (req.params.userId as string);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'User ID required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to fetch reminders',
      handler: async () => {
        const reminders = await this.reminderRepo.findByUserId(userId);

        logger.info('Fetched book reminders', { userId, count: reminders.length });

        return reminders.map(r => ({
          id: r.id,
          type: r.reminderType,
          title: r.title,
          prompt: r.prompt,
          time: r.timeOfDay,
          timezone: r.timezone,
          daysOfWeek: r.daysOfWeek,
          enabled: r.enabled,
          linkedTrackId: r.trackId,
          linkedTrackTitle: r.trackTitle,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
      },
    });
  }

  async createReminder(req: Request, res: Response): Promise<void> {
    const userId = extractAuthContext(req).userId || req.body.userId;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'User ID required', req);
      return;
    }

    const { type, title, prompt, time, timezone, daysOfWeek, enabled, linkedTrackId, linkedTrackTitle } = req.body;

    if (!type || !title || !time || !daysOfWeek || !Array.isArray(daysOfWeek)) {
      ServiceErrors.badRequest(res, 'type, title, time, and daysOfWeek are required', req);
      return;
    }

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      ServiceErrors.badRequest(res, 'time must be in HH:MM format (e.g., 07:00 or 21:30)', req);
      return;
    }

    if (!daysOfWeek.every((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)) {
      ServiceErrors.badRequest(res, 'daysOfWeek must contain numbers between 0 and 6', req);
      return;
    }

    const userTimezone = timezone || 'UTC';
    try {
      Intl.DateTimeFormat('en-US', { timeZone: userTimezone });
    } catch {
      ServiceErrors.badRequest(res, 'Invalid timezone. Use IANA timezone format (e.g., America/New_York)', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to create reminder',
      successStatus: 201,
      handler: async () => {
        const reminder = await this.reminderRepo.create(userId, {
          reminderType: 'book',
          title,
          prompt,
          timeOfDay: time,
          timezone: userTimezone,
          daysOfWeek,
          enabled: enabled !== false,
          trackId: linkedTrackId,
          trackTitle: linkedTrackTitle,
        });

        logger.info('Created book reminder', { userId, reminderId: reminder.id });

        return {
          id: reminder.id,
          type: reminder.reminderType,
          title: reminder.title,
          prompt: reminder.prompt,
          time: reminder.timeOfDay,
          timezone: reminder.timezone,
          daysOfWeek: reminder.daysOfWeek,
          enabled: reminder.enabled,
          linkedTrackId: reminder.trackId,
          linkedTrackTitle: reminder.trackTitle,
          createdAt: reminder.createdAt,
          updatedAt: reminder.updatedAt,
        };
      },
    });
  }

  async updateReminder(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { id } = req.params;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const { type, title, prompt, time, timezone, daysOfWeek, enabled, linkedTrackId, linkedTrackTitle } = req.body;

      if (time !== undefined) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
          ServiceErrors.badRequest(res, 'time must be in HH:MM format (e.g., 07:00 or 21:30)', req);
          return;
        }
      }

      if (daysOfWeek !== undefined) {
        if (
          !Array.isArray(daysOfWeek) ||
          !daysOfWeek.every((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)
        ) {
          ServiceErrors.badRequest(res, 'daysOfWeek must be an array of numbers between 0 and 6', req);
          return;
        }
      }

      if (timezone !== undefined) {
        try {
          Intl.DateTimeFormat('en-US', { timeZone: timezone });
        } catch {
          ServiceErrors.badRequest(res, 'Invalid timezone. Use IANA timezone format (e.g., America/New_York)', req);
          return;
        }
      }

      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (prompt !== undefined) updateData.prompt = prompt;
      if (time !== undefined) updateData.timeOfDay = time;
      if (timezone !== undefined) updateData.timezone = timezone;
      if (daysOfWeek !== undefined) updateData.daysOfWeek = daysOfWeek;
      if (enabled !== undefined) updateData.enabled = enabled;
      if (linkedTrackId !== undefined) updateData.trackId = linkedTrackId;
      if (linkedTrackTitle !== undefined) updateData.trackTitle = linkedTrackTitle;

      const reminder = await this.reminderRepo.update(id as string, userId, updateData);

      if (!reminder) {
        ServiceErrors.notFound(res, 'Reminder', req);
        return;
      }

      logger.info('Updated book reminder', { userId, reminderId: id });

      sendSuccess(res, {
        id: reminder.id,
        type: reminder.reminderType,
        title: reminder.title,
        prompt: reminder.prompt,
        time: reminder.timeOfDay,
        timezone: reminder.timezone,
        daysOfWeek: reminder.daysOfWeek,
        enabled: reminder.enabled,
        linkedTrackId: reminder.trackId,
        linkedTrackTitle: reminder.trackTitle,
        createdAt: reminder.createdAt,
        updatedAt: reminder.updatedAt,
      });
    } catch (error) {
      logger.error('Failed to update reminder', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update reminder', req);
      return;
    }
  }

  async deleteReminder(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const id = req.params.id as string;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const deleted = await this.reminderRepo.delete(id, userId);

      if (!deleted) {
        ServiceErrors.notFound(res, 'Reminder', req);
        return;
      }

      logger.info('Deleted book reminder', { userId, reminderId: id });

      sendSuccess(res, { message: 'Reminder deleted' });
    } catch (error) {
      logger.error('Failed to delete reminder', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete reminder', req);
      return;
    }
  }

  async registerPushToken(req: Request, res: Response): Promise<void> {
    const userId = extractAuthContext(req).userId || req.body.userId;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'User ID required', req);
      return;
    }

    const { token, deviceId, platform } = req.body;

    if (!token) {
      ServiceErrors.badRequest(res, 'Push token is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to register push token',
      handler: async () => {
        const pushToken = await this.pushTokenRepo.upsert(userId, {
          token,
          deviceId,
          platform,
          isActive: true,
        });

        logger.info('Registered push token', { userId, tokenId: pushToken.id, platform });

        return {
          id: pushToken.id,
          token: pushToken.token,
          platform: pushToken.platform,
          isActive: pushToken.isActive,
        };
      },
    });
  }

  async deactivatePushToken(req: Request, res: Response): Promise<void> {
    const { token } = req.body;

    if (!token) {
      ServiceErrors.badRequest(res, 'Push token is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to deactivate push token',
      handler: async () => {
        await this.pushTokenRepo.deactivate(token);

        logger.info('Deactivated push token', { token: token.substring(0, 20) + '...' });

        return { message: 'Push token deactivated' };
      },
    });
  }

  async getEnabledReminders(req: Request, res: Response): Promise<void> {
    const serviceAuth = req.headers['x-service-auth'] as string;
    if (serviceAuth !== 'system-service') {
      ServiceErrors.forbidden(res, 'Internal service only', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to fetch enabled reminders',
      handler: async () => {
        const reminders = await this.reminderRepo.findAllEnabled();

        logger.debug('Fetched all enabled reminders', { count: reminders.length });

        return reminders.map(r => ({
          id: r.id,
          userId: r.userId,
          type: r.reminderType,
          title: r.title,
          prompt: r.prompt,
          time: r.timeOfDay,
          timezone: r.timezone,
          daysOfWeek: r.daysOfWeek,
          enabled: r.enabled,
          linkedTrackId: r.trackId,
          linkedTrackTitle: r.trackTitle,
        }));
      },
    });
  }

  async getDueReminders(req: Request, res: Response): Promise<void> {
    const serviceAuth = req.headers['x-service-auth'] as string;
    if (serviceAuth !== 'system-service') {
      ServiceErrors.forbidden(res, 'Internal service only', req);
      return;
    }

    const { time, dayOfWeek } = req.query;

    if (!time || dayOfWeek === undefined) {
      ServiceErrors.badRequest(res, 'time and dayOfWeek query parameters are required', req);
      return;
    }

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time as string)) {
      ServiceErrors.badRequest(res, 'time must be in HH:MM format', req);
      return;
    }

    const dayOfWeekNum = parseInt(dayOfWeek as string, 10);
    if (isNaN(dayOfWeekNum) || dayOfWeekNum < 0 || dayOfWeekNum > 6) {
      ServiceErrors.badRequest(res, 'dayOfWeek must be a number between 0 and 6', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to fetch due reminders',
      handler: async () => {
        const reminders = await this.reminderRepo.findDueReminders(time as string, dayOfWeekNum);

        logger.info('Fetched due reminders', { time, dayOfWeek, count: reminders.length });

        return reminders.map(r => ({
          id: r.id,
          userId: r.userId,
          type: r.reminderType,
          title: r.title,
          prompt: r.prompt,
          time: r.timeOfDay,
          timezone: r.timezone,
          daysOfWeek: r.daysOfWeek,
          enabled: r.enabled,
          linkedTrackId: r.trackId,
          linkedTrackTitle: r.trackTitle,
        }));
      },
    });
  }

  async updateReminderTriggered(req: Request, res: Response): Promise<void> {
    const serviceAuth = req.headers['x-service-auth'] as string;
    if (serviceAuth !== 'system-service') {
      ServiceErrors.forbidden(res, 'Internal service only', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update reminder',
      handler: async () => {
        const id = req.params.id as string;

        await this.reminderRepo.updateLastTriggered(id);

        logger.info('Updated reminder lastTriggeredAt', { reminderId: id });

        return { message: 'Reminder triggered timestamp updated' };
      },
    });
  }

  async getPushTokensByUser(req: Request, res: Response): Promise<void> {
    const serviceAuth = req.headers['x-service-auth'] as string;
    if (serviceAuth !== 'system-service') {
      ServiceErrors.forbidden(res, 'Internal service only', req);
      return;
    }

    const userId = req.params.userId as string;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to fetch push tokens',
      handler: async () => {
        const tokens = await this.pushTokenRepo.findByUserId(userId);

        return tokens
          .filter(t => t.isActive)
          .map(t => ({
            id: t.id,
            userId: t.userId,
            token: t.token,
            isActive: t.isActive,
          }));
      },
    });
  }
}
