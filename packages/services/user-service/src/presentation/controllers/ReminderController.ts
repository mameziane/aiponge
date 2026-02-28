/**
 * Generic Reminder Controller
 * Handles all reminder types: book, reading, listening, meditation
 * Supports filtering by type via query parameter
 */

import { Request, Response } from 'express';
import { ReminderRepository, ReminderType, ReminderTypeValue } from '@infrastructure/repositories';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('reminder-controller');

const VALID_REMINDER_TYPES = Object.values(ReminderType) as string[];

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class ReminderController {
  private reminderRepo = createDrizzleRepository(ReminderRepository);

  private isValidReminderType(type: string): type is ReminderTypeValue {
    return VALID_REMINDER_TYPES.includes(type);
  }

  async getReminders(req: Request, res: Response): Promise<void> {
    const userId = extractAuthContext(req).userId || (req.params.userId as string);
    const typeFilter = req.query.type as string | undefined;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'User ID required', req);
      return;
    }

    if (typeFilter && !this.isValidReminderType(typeFilter)) {
      ServiceErrors.badRequest(res, `Invalid reminder type. Valid types: ${VALID_REMINDER_TYPES.join(', ')}`, req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to fetch reminders',
      handler: async () => {
        const reminders = typeFilter
          ? await this.reminderRepo.findByUserIdAndType(userId, typeFilter as ReminderTypeValue)
          : await this.reminderRepo.findByUserId(userId);

        logger.info('Fetched reminders', { userId, type: typeFilter || 'all', count: reminders.length });

        return reminders.map(r => ({
          id: r.id,
          type: r.reminderType,
          title: r.title,
          prompt: r.prompt,
          time: r.timeOfDay,
          timezone: r.timezone,
          daysOfWeek: r.daysOfWeek,
          enabled: r.enabled,
          notifyEnabled: r.notifyEnabled,
          autoPlayEnabled: r.autoPlayEnabled,
          bookId: r.bookId,
          trackId: r.trackId,
          userTrackId: r.userTrackId,
          trackTitle: r.trackTitle,
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

    const {
      type,
      title,
      prompt,
      time,
      timezone,
      daysOfWeek,
      enabled,
      notifyEnabled,
      autoPlayEnabled,
      bookId,
      trackId,
      userTrackId,
      trackTitle,
    } = req.body;

    if (!type || !title || !time || !daysOfWeek || !Array.isArray(daysOfWeek)) {
      ServiceErrors.badRequest(res, 'type, title, time, and daysOfWeek are required', req);
      return;
    }

    if (!this.isValidReminderType(type)) {
      ServiceErrors.badRequest(res, `Invalid reminder type. Valid types: ${VALID_REMINDER_TYPES.join(', ')}`, req);
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
          reminderType: type as ReminderTypeValue,
          title,
          prompt,
          timeOfDay: time,
          timezone: userTimezone,
          daysOfWeek,
          enabled: enabled !== false,
          notifyEnabled: notifyEnabled !== false,
          autoPlayEnabled: autoPlayEnabled === true,
          bookId,
          trackId,
          userTrackId,
          trackTitle,
        });

        logger.info('Created reminder', { userId, reminderId: reminder.id, type: reminder.reminderType });

        return {
          id: reminder.id,
          type: reminder.reminderType,
          title: reminder.title,
          prompt: reminder.prompt,
          time: reminder.timeOfDay,
          timezone: reminder.timezone,
          daysOfWeek: reminder.daysOfWeek,
          enabled: reminder.enabled,
          notifyEnabled: reminder.notifyEnabled,
          autoPlayEnabled: reminder.autoPlayEnabled,
          bookId: reminder.bookId,
          trackId: reminder.trackId,
          userTrackId: reminder.userTrackId,
          trackTitle: reminder.trackTitle,
          createdAt: reminder.createdAt,
          updatedAt: reminder.updatedAt,
        };
      },
    });
  }

  async updateReminder(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const id = req.params.id as string;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const {
        type,
        title,
        prompt,
        time,
        timezone,
        daysOfWeek,
        enabled,
        notifyEnabled,
        autoPlayEnabled,
        bookId,
        trackId,
        userTrackId,
        trackTitle,
      } = req.body;

      if (type !== undefined && !this.isValidReminderType(type)) {
        ServiceErrors.badRequest(res, `Invalid reminder type. Valid types: ${VALID_REMINDER_TYPES.join(', ')}`, req);
        return;
      }

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
      if (type !== undefined) updateData.reminderType = type;
      if (title !== undefined) updateData.title = title;
      if (prompt !== undefined) updateData.prompt = prompt;
      if (time !== undefined) updateData.timeOfDay = time;
      if (timezone !== undefined) updateData.timezone = timezone;
      if (daysOfWeek !== undefined) updateData.daysOfWeek = daysOfWeek;
      if (enabled !== undefined) updateData.enabled = enabled;
      if (notifyEnabled !== undefined) updateData.notifyEnabled = notifyEnabled;
      if (autoPlayEnabled !== undefined) updateData.autoPlayEnabled = autoPlayEnabled;
      if (bookId !== undefined) updateData.bookId = bookId;
      if (trackId !== undefined) updateData.trackId = trackId;
      if (userTrackId !== undefined) updateData.userTrackId = userTrackId;
      if (trackTitle !== undefined) updateData.trackTitle = trackTitle;

      const reminder = await this.reminderRepo.update(id, userId, updateData);

      if (!reminder) {
        ServiceErrors.notFound(res, 'Reminder', req);
        return;
      }

      logger.info('Updated reminder', { userId, reminderId: id, type: reminder.reminderType });

      sendSuccess(res, {
        id: reminder.id,
        type: reminder.reminderType,
        title: reminder.title,
        prompt: reminder.prompt,
        time: reminder.timeOfDay,
        timezone: reminder.timezone,
        daysOfWeek: reminder.daysOfWeek,
        enabled: reminder.enabled,
        notifyEnabled: reminder.notifyEnabled,
        autoPlayEnabled: reminder.autoPlayEnabled,
        bookId: reminder.bookId,
        trackId: reminder.trackId,
        userTrackId: reminder.userTrackId,
        trackTitle: reminder.trackTitle,
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

      logger.info('Deleted reminder', { userId, reminderId: id });

      sendSuccess(res, { message: 'Reminder deleted' });
    } catch (error) {
      logger.error('Failed to delete reminder', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete reminder', req);
      return;
    }
  }

  async getReminderTypes(_req: Request, res: Response): Promise<void> {
    sendSuccess(
      res,
      VALID_REMINDER_TYPES.map(type => ({
        value: type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
      }))
    );
  }
}
