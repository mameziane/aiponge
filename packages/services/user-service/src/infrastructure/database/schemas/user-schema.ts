/**
 * User Management Service - Database Schema
 * Drizzle ORM schema definitions for user domain
 */

import {
  pgTable,
  text,
  varchar,
  jsonb,
  timestamp,
  boolean,
  uuid,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';

// Users Table (renamed from usr_users to usr_accounts for clarity)
export const users = pgTable(
  'usr_accounts',
  {
    id: uuid('id').primaryKey(),
    email: varchar('email').notNull().unique(),
    passwordHash: varchar('password_hash').notNull(),
    role: varchar('role').notNull(), // admin, librarian, user (tier is managed via subscription_tier column)
    status: varchar('status').notNull(), // active, inactive, suspended, pending
    profile: jsonb('profile').notNull(),
    preferences: jsonb('preferences').default({}),
    metadata: jsonb('metadata').default({}),
    emailVerified: boolean('email_verified').default(false),
    isGuest: boolean('is_guest').default(false).notNull(), // True for temporary guest accounts
    isSystemAccount: boolean('is_system_account').default(false).notNull(), // True for system accounts (excluded from GDPR flows)
    organizationId: uuid('organization_id'), // FK to usr_organizations (nullable) — links coaches to their org for shared branding
    // Phone authentication fields
    phoneNumber: varchar('phone_number'), // Raw phone input (optional)
    phoneE164: varchar('phone_e164'), // Normalized E.164 format, unique when set
    phoneVerified: boolean('phone_verified').default(false),
    preferredAuthChannel: varchar('preferred_auth_channel').default('email'), // 'email' or 'phone'
    lastLoginAt: timestamp('last_login_at'),
    failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
    lockedUntil: timestamp('locked_until'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    // Partial unique index: phoneE164 must be unique when not null
    phoneE164Unique: uniqueIndex('usr_accounts_phone_e164_unique')
      .on(table.phoneE164)
      .where(sql`phone_e164 IS NOT NULL`),
    organizationIdx: index('idx_usr_accounts_organization').on(table.organizationId),
    activeIdx: index('idx_usr_accounts_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// Password Reset Tokens Table
export const passwordResetTokens = pgTable(
  'usr_password_reset_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: varchar('email').notNull(),
    code: varchar('code', { length: 6 }).notNull(),
    token: varchar('token').unique(),
    expiresAt: timestamp('expires_at').notNull(),
    verified: boolean('verified').default(false).notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    emailIdx: index('usr_password_reset_tokens_email_idx').on(table.email),
    expiresAtIdx: index('usr_password_reset_tokens_expires_at_idx').on(table.expiresAt),
  })
);

// User Sessions Table
export const userSessions = pgTable(
  'usr_user_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: varchar('refresh_token_hash'),
    refreshTokenFamily: uuid('refresh_token_family'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    revoked: boolean('revoked').default(false).notNull(),
    deviceInfo: jsonb('device_info'),
    ipAddress: varchar('ip_address'),
    userAgent: text('user_agent'),
    lastActivityAt: timestamp('last_activity_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('usr_user_sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('usr_user_sessions_expires_at_idx').on(table.expiresAt),
    lastActivityAtIdx: index('usr_user_sessions_last_activity_at_idx').on(table.lastActivityAt),
    refreshFamilyIdx: index('usr_user_sessions_refresh_family_idx').on(table.refreshTokenFamily),
  })
);

// SMS Verification Codes Table
export const smsVerificationCodes = pgTable(
  'usr_sms_verification_codes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Null for pre-registration verification
    phoneE164: varchar('phone_e164').notNull(), // Phone number being verified
    code: varchar('code', { length: 6 }).notNull(), // 6-digit verification code
    purpose: varchar('purpose', { length: 50 }).notNull(), // 'registration', 'login', 'phone_change'
    expiresAt: timestamp('expires_at').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    verifiedAt: timestamp('verified_at'),
    lastSentAt: timestamp('last_sent_at').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    phoneIdx: index('usr_sms_verification_codes_phone_idx').on(table.phoneE164),
    purposeIdx: index('usr_sms_verification_codes_purpose_idx').on(table.purpose),
    expiresAtIdx: index('usr_sms_verification_codes_expires_at_idx').on(table.expiresAt),
  })
);

// User Credits Table - Tracks credit balance per user
export const userCredits = pgTable('usr_user_credits', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  startingBalance: integer('starting_balance').notNull().default(0),
  currentBalance: integer('current_balance').notNull().default(0),
  totalSpent: integer('total_spent').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// Credit Transactions Table - Immutable audit log of all credit operations
export const creditTransactions = pgTable(
  'usr_credit_transactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(), // Positive for credits added, negative for deductions
    type: varchar('type', { length: 50 }).notNull(), // 'initial', 'deduction', 'refund', 'topup', 'purchase', 'gift_send', 'gift_receive', 'session'
    status: varchar('status', { length: 50 }).notNull().default('completed'), // 'pending', 'completed', 'failed', 'refunded'
    description: text('description').notNull(),
    metadata: jsonb('metadata').default({}), // Store related IDs (musicRequestId, orderId, giftId, etc.)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_credit_transactions_user_id_idx').on(table.userId),
    typeIdx: index('usr_credit_transactions_type_idx').on(table.type),
    statusIdx: index('usr_credit_transactions_status_idx').on(table.status),
    createdAtIdx: index('usr_credit_transactions_created_at_idx').on(table.createdAt),
    activeIdx: index('idx_usr_credit_transactions_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// Credit Orders Table - Tracks credit pack/session purchases via RevenueCat in-app purchases
export const creditOrders = pgTable(
  'usr_credit_orders',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productType: varchar('product_type', { length: 50 }).notNull(), // 'credit_pack', 'deep_resonance', 'gift'
    productId: varchar('product_id').notNull(), // RevenueCat product identifier
    transactionId: varchar('transaction_id'), // RevenueCat transaction ID (null until payment confirmed)
    originalTransactionId: varchar('original_transaction_id'), // RevenueCat original transaction ID (for subscription renewals)
    appUserId: varchar('app_user_id'), // RevenueCat app user ID
    quantity: integer('quantity').notNull().default(1),
    creditsGranted: integer('credits_granted').notNull(), // Number of credits granted
    amountPaid: integer('amount_paid').notNull(), // Amount in cents
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'completed', 'failed', 'refunded'
    giftRecipientEmail: varchar('gift_recipient_email'), // For gift purchases
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_credit_orders_user_id_idx').on(table.userId),
    statusIdx: index('usr_credit_orders_status_idx').on(table.status),
    transactionIdx: index('usr_credit_orders_transaction_idx').on(table.transactionId),
    transactionUnique: uniqueIndex('usr_credit_orders_transaction_unique')
      .on(table.transactionId)
      .where(sql`transaction_id IS NOT NULL`),
    productTypeIdx: index('usr_credit_orders_product_type_idx').on(table.productType),
    createdAtIdx: index('usr_credit_orders_created_at_idx').on(table.createdAt),
    activeIdx: index('idx_usr_credit_orders_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// Credit Gifts Table - Tracks credit gifts between users
export const creditGifts = pgTable(
  'usr_credit_gifts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'set null' }), // Null until claimed
    recipientEmail: varchar('recipient_email').notNull(), // Email to send gift notification
    orderId: uuid('order_id').references(() => creditOrders.id, { onDelete: 'cascade' }), // Link to purchase order
    creditsAmount: integer('credits_amount').notNull(),
    claimToken: varchar('claim_token').notNull().unique(), // Secure token for claiming
    message: text('message'), // Personal message from sender
    status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'claimed', 'expired', 'cancelled'
    expiresAt: timestamp('expires_at').notNull(), // Gift expiration date
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    senderIdIdx: index('usr_credit_gifts_sender_id_idx').on(table.senderId),
    recipientIdIdx: index('usr_credit_gifts_recipient_id_idx').on(table.recipientId),
    recipientEmailIdx: index('usr_credit_gifts_recipient_email_idx').on(table.recipientEmail),
    claimTokenIdx: index('usr_credit_gifts_claim_token_idx').on(table.claimToken),
    statusIdx: index('usr_credit_gifts_status_idx').on(table.status),
    expiresAtIdx: index('usr_credit_gifts_expires_at_idx').on(table.expiresAt),
    activeIdx: index('idx_usr_credit_gifts_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// Token Blacklist Table - Tracks revoked JWT tokens for logout/revocation
export const tokenBlacklist = pgTable(
  'usr_token_blacklist',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tokenJti: varchar('token_jti').notNull().unique(), // JWT ID (jti claim) or hash of token
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: varchar('reason', { length: 50 }).notNull(), // 'logout', 'password_change', 'security_revoke', 'all_sessions'
    expiresAt: timestamp('expires_at').notNull(), // When the original token expires (for cleanup)
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    tokenJtiIdx: index('usr_token_blacklist_token_jti_idx').on(table.tokenJti),
    userIdIdx: index('usr_token_blacklist_user_id_idx').on(table.userId),
    expiresAtIdx: index('usr_token_blacklist_expires_at_idx').on(table.expiresAt),
  })
);

// Zod schemas for validation
export const insertUserSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  passwordHash: z.string(),
  role: z.string(),
  status: z.string(),
  profile: z.record(z.string(), z.unknown()),
  preferences: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  emailVerified: z.boolean().optional(),
  isGuest: z.boolean().optional(),
  organizationId: z.string().uuid().optional().nullable(),
  phoneNumber: z.string().optional(),
  phoneE164: z.string().optional(),
  phoneVerified: z.boolean().optional(),
  preferredAuthChannel: z.enum(['email', 'phone']).optional(),
  lastLoginAt: z.date().optional(),
  failedLoginAttempts: z.number().optional(),
  lockedUntil: z.date().optional(),
});

export const selectUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  passwordHash: z.string(),
  role: z.string(),
  status: z.string(),
  profile: z.record(z.string(), z.unknown()),
  preferences: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  emailVerified: z.boolean(),
  isGuest: z.boolean(),
  organizationId: z.string().uuid().nullable(),
  phoneNumber: z.string().nullable(),
  phoneE164: z.string().nullable(),
  phoneVerified: z.boolean(),
  preferredAuthChannel: z.string(),
  lastLoginAt: z.date().nullable(),
  failedLoginAttempts: z.number(),
  lockedUntil: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// SMS Verification Code schemas
export const insertSmsVerificationCodeSchema = createInsertSchema(smsVerificationCodes).omit({
  id: true,
  createdAt: true,
});

export const selectSmsVerificationCodeSchema = createInsertSchema(smsVerificationCodes);

// TypeScript types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

export type SmsVerificationCode = typeof smsVerificationCodes.$inferSelect;
export type NewSmsVerificationCode = typeof smsVerificationCodes.$inferInsert;
export type InsertSmsVerificationCode = z.infer<typeof insertSmsVerificationCodeSchema>;

// Credit schemas
export const insertUserCreditsSchema = createInsertSchema(userCredits).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertCreditOrderSchema = createInsertSchema(creditOrders).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertCreditGiftSchema = createInsertSchema(creditGifts).omit({
  id: true,
  createdAt: true,
  claimedAt: true,
});

// TypeScript types for credits
export type UserCredits = typeof userCredits.$inferSelect;
export type NewUserCredits = typeof userCredits.$inferInsert;
export type InsertUserCredits = z.infer<typeof insertUserCreditsSchema>;

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;

export type CreditOrder = typeof creditOrders.$inferSelect;
export type NewCreditOrder = typeof creditOrders.$inferInsert;
export type InsertCreditOrder = z.infer<typeof insertCreditOrderSchema>;

export type CreditGift = typeof creditGifts.$inferSelect;
export type NewCreditGift = typeof creditGifts.$inferInsert;
export type InsertCreditGift = z.infer<typeof insertCreditGiftSchema>;

// Credit product types for the store
export type CreditProductType = 'credit_pack' | 'deep_resonance' | 'gift';
export type CreditOrderStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type CreditGiftStatus = 'pending' | 'claimed' | 'expired' | 'cancelled';

// Token blacklist schemas and types
export const insertTokenBlacklistSchema = createInsertSchema(tokenBlacklist).omit({
  id: true,
  createdAt: true,
});

export type TokenBlacklistEntry = typeof tokenBlacklist.$inferSelect;
export type NewTokenBlacklistEntry = typeof tokenBlacklist.$inferInsert;
export type InsertTokenBlacklistEntry = z.infer<typeof insertTokenBlacklistSchema>;
export type TokenRevocationReason = 'logout' | 'password_change' | 'security_revoke' | 'all_sessions';
