import { eq, and, arrayContains, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import {
  usrExpoPushTokens,
  usrReminders,
  ExpoPushToken,
  Reminder as DbReminder,
} from '@infrastructure/database/schemas/profile-schema';
import {
  INotificationRepository,
  PushToken,
  BookReminder,
} from '@domains/notifications/repositories/INotificationRepository';

export class NotificationRepositoryImpl implements INotificationRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private mapExpoPushToken(token: ExpoPushToken): PushToken {
    return {
      id: token.id,
      userId: token.userId,
      token: token.token,
      platform: (token.platform as 'ios' | 'android' | 'web') || 'web',
      createdAt: token.createdAt,
      updatedAt: token.updatedAt,
    };
  }

  private mapBookReminder(reminder: DbReminder): BookReminder {
    return {
      id: reminder.id,
      userId: reminder.userId,
      time: reminder.timeOfDay,
      timezone: reminder.timezone,
      enabled: reminder.enabled,
      daysOfWeek: reminder.daysOfWeek,
      createdAt: reminder.createdAt,
      updatedAt: reminder.updatedAt,
    };
  }

  async savePushToken(userId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<PushToken> {
    const existing = await this.db
      .select()
      .from(usrExpoPushTokens)
      .where(and(eq(usrExpoPushTokens.token, token), isNull(usrExpoPushTokens.deletedAt)))
      .limit(1);

    if (existing[0]) {
      const updated = await this.db
        .update(usrExpoPushTokens)
        .set({ platform, updatedAt: new Date(), isActive: true })
        .where(and(eq(usrExpoPushTokens.token, token), isNull(usrExpoPushTokens.deletedAt)))
        .returning();
      return this.mapExpoPushToken(updated[0]);
    }

    const result = await this.db.insert(usrExpoPushTokens).values({ userId, token, platform }).returning();
    return this.mapExpoPushToken(result[0]);
  }

  async getPushTokens(userId: string): Promise<PushToken[]> {
    const tokens = await this.db
      .select()
      .from(usrExpoPushTokens)
      .where(
        and(
          eq(usrExpoPushTokens.userId, userId),
          eq(usrExpoPushTokens.isActive, true),
          isNull(usrExpoPushTokens.deletedAt)
        )
      );
    return tokens.map(t => this.mapExpoPushToken(t));
  }

  async deletePushToken(userId: string, token: string): Promise<void> {
    await this.db
      .delete(usrExpoPushTokens)
      .where(and(eq(usrExpoPushTokens.userId, userId), eq(usrExpoPushTokens.token, token)));
  }

  async deleteAllPushTokens(userId: string): Promise<void> {
    await this.db.delete(usrExpoPushTokens).where(eq(usrExpoPushTokens.userId, userId));
  }

  async getReminder(userId: string): Promise<BookReminder | null> {
    const result = await this.db
      .select()
      .from(usrReminders)
      .where(and(eq(usrReminders.userId, userId), isNull(usrReminders.deletedAt)))
      .limit(1);
    return result[0] ? this.mapBookReminder(result[0]) : null;
  }

  async saveReminder(userId: string, reminder: Partial<BookReminder>): Promise<BookReminder> {
    const existing = await this.getReminder(userId);

    if (existing) {
      const updated = await this.db
        .update(usrReminders)
        .set({
          timeOfDay: reminder.time,
          timezone: reminder.timezone,
          enabled: reminder.enabled,
          daysOfWeek: reminder.daysOfWeek,
          updatedAt: new Date(),
        })
        .where(and(eq(usrReminders.userId, userId), isNull(usrReminders.deletedAt)))
        .returning();
      return this.mapBookReminder(updated[0]);
    }

    const result = await this.db
      .insert(usrReminders)
      .values({
        userId,
        reminderType: 'book',
        title: 'Book Reminder',
        timeOfDay: reminder.time || '09:00',
        timezone: reminder.timezone || 'UTC',
        enabled: reminder.enabled ?? true,
        daysOfWeek: reminder.daysOfWeek || [1, 2, 3, 4, 5],
      })
      .returning();
    return this.mapBookReminder(result[0]);
  }

  async deleteReminder(userId: string): Promise<void> {
    await this.db.delete(usrReminders).where(eq(usrReminders.userId, userId));
  }

  async getActiveRemindersForTime(time: string, dayOfWeek: number): Promise<BookReminder[]> {
    const result = await this.db
      .select()
      .from(usrReminders)
      .where(
        and(
          eq(usrReminders.enabled, true),
          eq(usrReminders.timeOfDay, time),
          arrayContains(usrReminders.daysOfWeek, [dayOfWeek]),
          isNull(usrReminders.deletedAt)
        )
      );
    return result.map(r => this.mapBookReminder(r));
  }
}
