import {
  pgTable,
  varchar,
  integer,
  timestamp,
  text,
  uuid,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../user-schema';
import { REMINDER_TYPES, type ReminderTypeId } from '@aiponge/shared-contracts';

export const usrReminders = pgTable(
  'usr_reminders',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderType: varchar('reminder_type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    timezone: varchar('timezone', { length: 100 }).default('UTC').notNull(),
    timeOfDay: varchar('time_of_day', { length: 10 }).notNull(),
    repeatType: varchar('repeat_type', { length: 20 }).default('weekly').notNull(),
    daysOfWeek: integer('days_of_week')
      .array()
      .$type<number[]>()
      .default(sql`'{0,1,2,3,4,5,6}'::integer[]`),
    dayOfMonth: integer('day_of_month'),
    baseDate: timestamp('base_date'),
    notifyEnabled: boolean('notify_enabled').default(true).notNull(),
    autoPlayEnabled: boolean('auto_play_enabled').default(false).notNull(),
    prompt: text('prompt'),
    bookId: uuid('book_id'),
    trackId: uuid('track_id'),
    userTrackId: uuid('user_track_id'),
    trackTitle: varchar('track_title', { length: 255 }),
    lastTriggeredAt: timestamp('last_triggered_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_reminders_user_id_idx').on(table.userId),
    reminderTypeIdx: index('usr_reminders_type_idx').on(table.reminderType),
    enabledIdx: index('usr_reminders_enabled_idx').on(table.enabled),
    bookIdIdx: index('usr_reminders_book_id_idx').on(table.bookId),
    trackIdIdx: index('usr_reminders_track_id_idx').on(table.trackId),
    activeIdx: index('idx_usr_reminders_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const insertReminderSchema = createInsertSchema(usrReminders).omit({
  id: true,
  lastTriggeredAt: true,
  createdAt: true,
  updatedAt: true,
});

export const updateReminderSchema = createInsertSchema(usrReminders)
  .omit({
    id: true,
    userId: true,
    lastTriggeredAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type Reminder = typeof usrReminders.$inferSelect;
export type NewReminder = typeof usrReminders.$inferInsert;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type UpdateReminder = z.infer<typeof updateReminderSchema>;

export const ReminderType = REMINDER_TYPES;
export type ReminderTypeValue = ReminderTypeId;

export const usrExpoPushTokens = pgTable(
  'usr_expo_push_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull(),
    deviceId: varchar('device_id', { length: 255 }),
    platform: varchar('platform', { length: 20 }),
    isActive: boolean('is_active').default(true).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_expo_push_tokens_user_id_idx').on(table.userId),
    tokenIdx: uniqueIndex('usr_expo_push_tokens_token_idx').on(table.token),
    isActiveIdx: index('usr_expo_push_tokens_is_active_idx').on(table.isActive),
    activeIdx: index('idx_usr_expo_push_tokens_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const insertExpoPushTokenSchema = createInsertSchema(usrExpoPushTokens).omit({
  id: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type ExpoPushToken = typeof usrExpoPushTokens.$inferSelect;
export type NewExpoPushToken = typeof usrExpoPushTokens.$inferInsert;
export type InsertExpoPushToken = z.infer<typeof insertExpoPushTokenSchema>;

export {
  usrReminders as reminders,
  usrExpoPushTokens as expoPushTokens,
};
