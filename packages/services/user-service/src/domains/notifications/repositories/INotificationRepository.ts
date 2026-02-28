/**
 * Notification Repository Interface
 * Push tokens, reminders, and notification preferences
 */

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: Date;
  updatedAt: Date;
}

export interface BookReminder {
  id: string;
  userId: string;
  time: string;
  timezone: string;
  enabled: boolean;
  daysOfWeek: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationRepository {
  // Push Tokens
  savePushToken(userId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<PushToken>;
  getPushTokens(userId: string): Promise<PushToken[]>;
  deletePushToken(userId: string, token: string): Promise<void>;
  deleteAllPushTokens(userId: string): Promise<void>;

  // Book Reminders (for personal book entries)
  getReminder(userId: string): Promise<BookReminder | null>;
  saveReminder(userId: string, reminder: Partial<BookReminder>): Promise<BookReminder>;
  deleteReminder(userId: string): Promise<void>;
  getActiveRemindersForTime(time: string, dayOfWeek: number): Promise<BookReminder[]>;
}
