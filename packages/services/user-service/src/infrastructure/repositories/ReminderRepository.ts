/**
 * Unified Reminder Repository
 * Repository for all reminder types: book, reading, listening, meditation
 * TABLE: usr_reminders
 */

import { eq, and, sql, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  usrReminders,
  ReminderType,
  insertReminderSchema,
  updateReminderSchema,
} from '../database/schemas/profile-schema';
import type { Reminder, ReminderTypeValue } from '../database/schemas/profile-schema';
import type { z } from 'zod';
import { getLogger } from '../../config/service-urls';

type InsertReminder = z.infer<typeof insertReminderSchema>;
type UpdateReminder = z.infer<typeof updateReminderSchema>;

const logger = getLogger('reminder-repository');

export interface IReminderRepository {
  create(userId: string, data: Omit<InsertReminder, 'userId'>): Promise<Reminder>;
  findById(id: string): Promise<Reminder | null>;
  findByUserId(userId: string): Promise<Reminder[]>;
  findByUserIdAndType(userId: string, reminderType: ReminderTypeValue): Promise<Reminder[]>;
  findEnabledByUserId(userId: string): Promise<Reminder[]>;
  findEnabledByUserIdAndType(userId: string, reminderType: ReminderTypeValue): Promise<Reminder[]>;
  update(id: string, userId: string, data: UpdateReminder): Promise<Reminder | null>;
  delete(id: string, userId: string): Promise<boolean>;
  updateLastTriggered(id: string): Promise<void>;
  findDueReminders(currentTime: string, dayOfWeek: number): Promise<Reminder[]>;
  findDueRemindersByType(currentTime: string, dayOfWeek: number, reminderType: ReminderTypeValue): Promise<Reminder[]>;
  findAllEnabled(): Promise<Reminder[]>;
  findAllEnabledByType(reminderType: ReminderTypeValue): Promise<Reminder[]>;
  deleteByUserId(userId: string): Promise<number>;
}

export class ReminderRepository implements IReminderRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async create(userId: string, data: Omit<InsertReminder, 'userId'>): Promise<Reminder> {
    const insertPayload: typeof usrReminders.$inferInsert = {
      userId,
      reminderType: data.reminderType as string,
      title: data.title as string,
      timeOfDay: data.timeOfDay as string,
      repeatType: (data.repeatType ?? 'weekly') as string,
      prompt: (data.prompt ?? null) as string | null,
      timezone: (data.timezone ?? 'UTC') as string,
      daysOfWeek: (data.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]) as number[],
      dayOfMonth: (data.dayOfMonth ?? null) as number | null,
      baseDate: (data.baseDate ?? null) as Date | null,
      enabled: (data.enabled ?? true) as boolean,
      notifyEnabled: (data.notifyEnabled ?? true) as boolean,
      autoPlayEnabled: (data.autoPlayEnabled ?? false) as boolean,
      bookId: (data.bookId ?? null) as string | null,
      trackId: (data.trackId ?? null) as string | null,
      userTrackId: (data.userTrackId ?? null) as string | null,
      trackTitle: (data.trackTitle ?? null) as string | null,
    };

    const [reminder] = await this.db.insert(usrReminders).values(insertPayload).returning();

    logger.info('Reminder created', { userId, reminderId: reminder.id, type: reminder.reminderType });
    return reminder;
  }

  async findById(id: string): Promise<Reminder | null> {
    const [reminder] = await this.db
      .select()
      .from(usrReminders)
      .where(and(eq(usrReminders.id, id), isNull(usrReminders.deletedAt)));
    return reminder || null;
  }

  async findByUserId(userId: string): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(and(eq(usrReminders.userId, userId), isNull(usrReminders.deletedAt)))
      .orderBy(usrReminders.createdAt);
  }

  async findByUserIdAndType(userId: string, reminderType: ReminderTypeValue): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.userId, userId),
          eq(usrReminders.reminderType, reminderType),
          isNull(usrReminders.deletedAt)
        )
      )
      .orderBy(usrReminders.createdAt);
  }

  async findEnabledByUserId(userId: string): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(and(eq(usrReminders.userId, userId), eq(usrReminders.enabled, true), isNull(usrReminders.deletedAt)))
      .orderBy(usrReminders.timeOfDay);
  }

  async findEnabledByUserIdAndType(userId: string, reminderType: ReminderTypeValue): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.userId, userId),
          eq(usrReminders.reminderType, reminderType),
          eq(usrReminders.enabled, true),
          isNull(usrReminders.deletedAt)
        )
      )
      .orderBy(usrReminders.timeOfDay);
  }

  async update(id: string, userId: string, data: UpdateReminder): Promise<Reminder | null> {
    const updatePayload: Partial<typeof usrReminders.$inferInsert> = { updatedAt: new Date() };

    if (data.reminderType !== undefined) updatePayload.reminderType = data.reminderType as string;
    if (data.title !== undefined) updatePayload.title = data.title as string;
    if (data.prompt !== undefined) updatePayload.prompt = (data.prompt ?? null) as string | null;
    if (data.timeOfDay !== undefined) updatePayload.timeOfDay = data.timeOfDay as string;
    if (data.repeatType !== undefined) updatePayload.repeatType = data.repeatType as string;
    if (data.timezone !== undefined) updatePayload.timezone = data.timezone as string;
    if (data.daysOfWeek !== undefined) updatePayload.daysOfWeek = data.daysOfWeek as number[];
    if (data.dayOfMonth !== undefined) updatePayload.dayOfMonth = data.dayOfMonth as number | null;
    if (data.baseDate !== undefined) updatePayload.baseDate = data.baseDate as Date | null;
    if (data.enabled !== undefined) updatePayload.enabled = data.enabled as boolean;
    if (data.notifyEnabled !== undefined) updatePayload.notifyEnabled = data.notifyEnabled as boolean;
    if (data.autoPlayEnabled !== undefined) updatePayload.autoPlayEnabled = data.autoPlayEnabled as boolean;
    if (data.bookId !== undefined) updatePayload.bookId = data.bookId as string | null;
    if (data.trackId !== undefined) updatePayload.trackId = data.trackId as string | null;
    if (data.userTrackId !== undefined) updatePayload.userTrackId = data.userTrackId as string | null;
    if (data.trackTitle !== undefined) updatePayload.trackTitle = data.trackTitle as string | null;

    const [reminder] = await this.db
      .update(usrReminders)
      .set(updatePayload)
      .where(and(eq(usrReminders.id, id), eq(usrReminders.userId, userId), isNull(usrReminders.deletedAt)))
      .returning();

    if (reminder) {
      logger.info('Reminder updated', { userId, reminderId: id, type: reminder.reminderType });
    }

    return reminder || null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(usrReminders)
      .where(and(eq(usrReminders.id, id), eq(usrReminders.userId, userId)))
      .returning();

    if (result.length > 0) {
      logger.info('Reminder deleted', { userId, reminderId: id });
      return true;
    }

    return false;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.db.delete(usrReminders).where(eq(usrReminders.userId, userId)).returning();

    logger.info('All reminders deleted for user', { userId, count: result.length });
    return result.length;
  }

  async updateLastTriggered(id: string): Promise<void> {
    await this.db
      .update(usrReminders)
      .set({ lastTriggeredAt: new Date() })
      .where(and(eq(usrReminders.id, id), isNull(usrReminders.deletedAt)));
  }

  async findDueReminders(currentTime: string, dayOfWeek: number): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.enabled, true),
          eq(usrReminders.timeOfDay, currentTime),
          sql`${dayOfWeek} = ANY(${usrReminders.daysOfWeek})`,
          isNull(usrReminders.deletedAt)
        )
      );
  }

  async findDueRemindersByType(
    currentTime: string,
    dayOfWeek: number,
    reminderType: ReminderTypeValue
  ): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.enabled, true),
          eq(usrReminders.reminderType, reminderType),
          eq(usrReminders.timeOfDay, currentTime),
          sql`${dayOfWeek} = ANY(${usrReminders.daysOfWeek})`,
          isNull(usrReminders.deletedAt)
        )
      );
  }

  async findAllEnabled(): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(and(eq(usrReminders.enabled, true), isNull(usrReminders.deletedAt)));
  }

  async findAllEnabledByType(reminderType: ReminderTypeValue): Promise<Reminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(eq(usrReminders.enabled, true), eq(usrReminders.reminderType, reminderType), isNull(usrReminders.deletedAt))
      );
  }
}

// Re-export types for convenience
export type { Reminder, InsertReminder, UpdateReminder, ReminderTypeValue };
export { ReminderType };
