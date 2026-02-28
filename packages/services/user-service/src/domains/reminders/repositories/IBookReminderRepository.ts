import { Reminder, InsertReminder, UpdateReminder } from '@domains/reminders/types';

export type BookReminder = Reminder;
export type InsertBookReminder = Omit<InsertReminder, 'userId'>;
export type UpdateBookReminder = UpdateReminder;

export interface IBookReminderRepository {
  create(userId: string, data: InsertBookReminder): Promise<BookReminder>;
  findById(id: string): Promise<BookReminder | null>;
  findByUserId(userId: string): Promise<BookReminder[]>;
  findEnabledByUserId(userId: string): Promise<BookReminder[]>;
  update(id: string, userId: string, data: UpdateBookReminder): Promise<BookReminder | null>;
  delete(id: string, userId: string): Promise<boolean>;
  updateLastTriggered(id: string): Promise<void>;
  findDueReminders(currentTime: string, dayOfWeek: number): Promise<BookReminder[]>;
  findAllEnabled(): Promise<BookReminder[]>;
}
