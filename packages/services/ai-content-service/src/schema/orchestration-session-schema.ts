/**
 * Orchestration Session Schema
 * Stores session state for all orchestration flows (wellness, meditation, gift, journal).
 * JSONB fields (plan, outputs, interpretation, metadata) accommodate different flow types
 * without schema changes — adding a new agentic flow requires zero migrations.
 */

import { pgTable, varchar, text, jsonb, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

// =============================================================================
// ORCHESTRATION SESSIONS
// =============================================================================

export const orchestrationSessions = pgTable(
  'aic_orchestration_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    flowType: varchar('flow_type', { length: 50 }).notNull(), // wellness, meditation, gift, journal
    creatorId: uuid('creator_id').notNull(),
    recipientId: uuid('recipient_id').notNull(),
    transcript: text('transcript').notNull(),

    // LLM interpretation output (varies by flowType)
    interpretation: jsonb('interpretation').$type<{
      summary: string;
      detectedRecipientName: string | null;
      emotionalState: string;
      coreNeeds: string[];
    }>(),

    // Full plan output (varies by flowType, validated per-flowType via Zod)
    plan: jsonb('plan').$type<Record<string, unknown>>(),

    // Session lifecycle: planning → reviewing → confirmed | cancelled | failed
    status: varchar('status', { length: 20 }).notNull().default('planning'),

    // Preview track ID (set after generate, before confirm)
    previewTrackId: uuid('preview_track_id'),

    // Completion tracking — per-flowType content pieces with completion flags
    // Wellness: { bookRequestId, albumRequestId, bookId, albumId, bookCompleted, albumCompleted }
    outputs: jsonb('outputs').$type<{
      bookRequestId: string | null;
      albumRequestId: string | null;
      bookId: string | null;
      albumId: string | null;
      bookCompleted: boolean;
      albumCompleted: boolean;
    }>(),

    // Content visibility: personal (self) or shared (member)
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL),

    // Metadata: refinement history, regeneration count, timing, etc.
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_aic_orch_sessions_creator').on(table.creatorId),
    index('idx_aic_orch_sessions_status').on(table.status),
    index('idx_aic_orch_sessions_flow_status').on(table.flowType, table.status),
    index('idx_aic_orch_sessions_created_at').on(table.createdAt),
    index('idx_aic_orch_sessions_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// =============================================================================
// TYPE INFERENCE (native Drizzle types — better JSONB $type<> support than drizzle-zod)
// =============================================================================

export type InsertOrchestrationSession = typeof orchestrationSessions.$inferInsert;
export type SelectOrchestrationSession = typeof orchestrationSessions.$inferSelect;
