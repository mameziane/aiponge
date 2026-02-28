/**
 * Book Reminder Repository
 * Handles reminders for book activities using the unified usr_reminders table.
 */

import { eq, and, sql, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  IBookReminderRepository,
  BookReminder,
  InsertBookReminder,
  UpdateBookReminder,
} from '../../domains/reminders/repositories/IBookReminderRepository';
import { usrReminders, ReminderType } from '../database/schemas/profile-schema';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('book-reminder-repository');

export class BookReminderRepository implements IBookReminderRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async create(userId: string, data: InsertBookReminder): Promise<BookReminder> {
    const insertPayload: typeof usrReminders.$inferInsert = {
      userId,
      reminderType: ReminderType.BOOK,
      title: data.title as string,
      timeOfDay: data.timeOfDay as string,
      repeatType: 'weekly',
      prompt: (data.prompt as string | undefined) ?? null,
      timezone: (data.timezone as string | undefined) ?? 'UTC',
      daysOfWeek: (data.daysOfWeek as number[] | undefined) ?? [0, 1, 2, 3, 4, 5, 6],
      enabled: (data.enabled as boolean | undefined) ?? true,
      notifyEnabled: true,
      autoPlayEnabled: false,
      trackId: (data.trackId as string | undefined) ?? null,
      trackTitle: (data.trackTitle as string | undefined) ?? null,
    };

    const [reminder] = await this.db.insert(usrReminders).values(insertPayload).returning();

    logger.info('Book reminder created', { userId, reminderId: reminder.id });
    return reminder;
  }

  async findById(id: string): Promise<BookReminder | null> {
    const [reminder] = await this.db
      .select()
      .from(usrReminders)
      .where(
        and(eq(usrReminders.id, id), eq(usrReminders.reminderType, ReminderType.BOOK), isNull(usrReminders.deletedAt))
      );

    return reminder || null;
  }

  async findByUserId(userId: string): Promise<BookReminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.userId, userId),
          eq(usrReminders.reminderType, ReminderType.BOOK),
          isNull(usrReminders.deletedAt)
        )
      )
      .orderBy(usrReminders.createdAt);
  }

  async findEnabledByUserId(userId: string): Promise<BookReminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.userId, userId),
          eq(usrReminders.reminderType, ReminderType.BOOK),
          eq(usrReminders.enabled, true),
          isNull(usrReminders.deletedAt)
        )
      )
      .orderBy(usrReminders.timeOfDay);
  }

  async update(id: string, userId: string, data: UpdateBookReminder): Promise<BookReminder | null> {
    const updatePayload: Partial<typeof usrReminders.$inferInsert> = { updatedAt: new Date() };

    if (data.title !== undefined) updatePayload.title = data.title as string;
    if (data.prompt !== undefined) updatePayload.prompt = (data.prompt as string) ?? null;
    if (data.timeOfDay !== undefined) updatePayload.timeOfDay = data.timeOfDay as string;
    if (data.timezone !== undefined) updatePayload.timezone = data.timezone as string;
    if (data.daysOfWeek !== undefined) updatePayload.daysOfWeek = data.daysOfWeek as number[];
    if (data.enabled !== undefined) updatePayload.enabled = data.enabled as boolean;
    if (data.trackId !== undefined) updatePayload.trackId = (data.trackId as string) ?? null;
    if (data.trackTitle !== undefined) updatePayload.trackTitle = (data.trackTitle as string) ?? null;

    const [reminder] = await this.db
      .update(usrReminders)
      .set(updatePayload)
      .where(
        and(
          eq(usrReminders.id, id),
          eq(usrReminders.userId, userId),
          eq(usrReminders.reminderType, ReminderType.BOOK),
          isNull(usrReminders.deletedAt)
        )
      )
      .returning();

    if (reminder) {
      logger.info('Book reminder updated', { userId, reminderId: id });
    }

    return reminder || null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(usrReminders)
      .where(
        and(eq(usrReminders.id, id), eq(usrReminders.userId, userId), eq(usrReminders.reminderType, ReminderType.BOOK))
      )
      .returning();

    if (result.length > 0) {
      logger.info('Book reminder deleted', { userId, reminderId: id });
      return true;
    }

    return false;
  }

  async updateLastTriggered(id: string): Promise<void> {
    await this.db
      .update(usrReminders)
      .set({ lastTriggeredAt: new Date() })
      .where(
        and(eq(usrReminders.id, id), eq(usrReminders.reminderType, ReminderType.BOOK), isNull(usrReminders.deletedAt))
      );
  }

  async findDueReminders(currentTime: string, dayOfWeek: number): Promise<BookReminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.enabled, true),
          eq(usrReminders.reminderType, ReminderType.BOOK),
          eq(usrReminders.timeOfDay, currentTime),
          sql`${dayOfWeek} = ANY(${usrReminders.daysOfWeek})`,
          isNull(usrReminders.deletedAt)
        )
      );
  }

  async findAllEnabled(): Promise<BookReminder[]> {
    return this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.enabled, true),
          eq(usrReminders.reminderType, ReminderType.BOOK),
          isNull(usrReminders.deletedAt)
        )
      );
  }
}
