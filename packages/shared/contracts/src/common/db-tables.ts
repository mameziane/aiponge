/**
 * Shared Database Table Definitions
 *
 * These are minimal table definitions used for cross-service FK references.
 * Each service can import these to define foreign key constraints without
 * needing to import the full schema from another service.
 */

import { pgTable, uuid, varchar, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Minimal usr_accounts table definition for FK references
 * Full definition is in user-service/src/infrastructure/database/schemas/user-schema.ts
 */
export const usrAccounts = pgTable('usr_accounts', {
  id: uuid('id').primaryKey(),
  email: varchar('email').notNull().unique(),
  passwordHash: varchar('password_hash').notNull(),
  role: varchar('role').notNull(),
  status: varchar('status').notNull(),
  profile: jsonb('profile').notNull(),
  preferences: jsonb('preferences').default({}),
  metadata: jsonb('metadata').default({}),
  emailVerified: boolean('email_verified').default(false),
  isGuest: boolean('is_guest').default(false).notNull(),
  isSystemAccount: boolean('is_system_account').default(false).notNull(), // True for system accounts (excluded from GDPR flows)
  phoneNumber: varchar('phone_number'),
  phoneE164: varchar('phone_e164'),
  phoneVerified: boolean('phone_verified').default(false),
  preferredAuthChannel: varchar('preferred_auth_channel').default('email'),
  lastLoginAt: timestamp('last_login_at'),
  failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ======================================
// UNIFIED LIBRARY TABLES (lib_* prefix)
// Full definitions in user-service/src/infrastructure/database/schemas/library-schema.ts
// ======================================

/**
 * Minimal lib_books table definition for FK references
 */
export const libBooks = pgTable('lib_books', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  typeId: varchar('type_id', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Minimal lib_chapters table definition for FK references
 */
export const libChapters = pgTable('lib_chapters', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bookId: uuid('book_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Minimal lib_entries table definition for FK references
 */
export const libEntries = pgTable('lib_entries', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chapterId: uuid('chapter_id').notNull(),
  bookId: uuid('book_id').notNull(),
  content: varchar('content').notNull(),
  entryType: varchar('entry_type', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
