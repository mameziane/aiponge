/**
 * Creator-Member Relationship Schema
 * Unified content access model where visibility is controlled through creator-member relationships
 *
 * Key concepts:
 * - Every user is their own creator (self-relationship)
 * - Users can follow other creators (shared content)
 * - Librarians are creators that all users automatically follow (public library)
 */

import { pgTable, varchar, integer, timestamp, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './user-schema';

// ======================================
// STATUS CONSTANTS
// ======================================

export const CREATOR_MEMBER_STATUS = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
} as const;

export type CreatorMemberStatus = (typeof CREATOR_MEMBER_STATUS)[keyof typeof CREATOR_MEMBER_STATUS];

export const CREATOR_MEMBER_STATUS_VALUES = Object.values(CREATOR_MEMBER_STATUS) as [string, ...string[]];

// ======================================
// CREATOR-MEMBER RELATIONSHIPS
// Core relationship table for content visibility
// ======================================

export const creatorMembers = pgTable(
  'usr_creator_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    creatorMemberUnique: uniqueIndex('usr_creator_members_unique').on(table.creatorId, table.memberId),
    memberIdIdx: index('usr_creator_members_member_id_idx').on(table.memberId),
    creatorIdIdx: index('usr_creator_members_creator_id_idx').on(table.creatorId),
    statusIdx: index('usr_creator_members_status_idx').on(table.status),
    activeIdx: index('idx_usr_creator_members_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// ======================================
// INVITATIONS
// For creators to invite members to follow them
// ======================================

export const invitations = pgTable(
  'usr_invitations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 64 }).notNull().unique(),
    useCount: integer('use_count').notNull().default(0),
    maxUses: integer('max_uses'),
    expiresAt: timestamp('expires_at'),
    email: varchar('email', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    creatorIdIdx: index('usr_invitations_creator_id_idx').on(table.creatorId),
    activeIdx: index('idx_usr_invitations_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// ======================================
// ZOD SCHEMAS & TYPES
// ======================================

export const insertCreatorMemberSchema = createInsertSchema(creatorMembers, {
  status: z.enum(CREATOR_MEMBER_STATUS_VALUES).default(CREATOR_MEMBER_STATUS.ACTIVE),
}).omit({
  id: true,
  createdAt: true,
});

export const selectCreatorMemberSchema = createSelectSchema(creatorMembers, {
  status: z.enum(CREATOR_MEMBER_STATUS_VALUES),
});

export type InsertCreatorMember = z.infer<typeof insertCreatorMemberSchema>;
export type CreatorMember = typeof creatorMembers.$inferSelect;

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  useCount: true,
  createdAt: true,
});

export const selectInvitationSchema = createSelectSchema(invitations);

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;
