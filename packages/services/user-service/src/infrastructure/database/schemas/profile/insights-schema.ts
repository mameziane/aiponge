import { pgTable, varchar, integer, timestamp, text, uuid, jsonb, boolean, numeric, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../user-schema';

export const usrInsights = pgTable(
  'usr_insights',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id'),
    type: varchar('type', { length: 100 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    confidence: numeric('confidence'),
    category: varchar('category', { length: 100 }),
    themes: text('themes')
      .array()
      .default(sql`'{}'::text[]`),
    actionable: boolean('actionable').default(false),
    priority: integer('priority'),
    aiProvider: varchar('ai_provider', { length: 50 }),
    aiModel: varchar('ai_model', { length: 50 }),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    validatedAt: timestamp('validated_at'),
    validatedBy: uuid('validated_by'),
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_insights_user_id_idx').on(table.userId),
    entryIdIdx: index('usr_insights_entry_id_idx').on(table.entryId),
    typeIdx: index('usr_insights_type_idx').on(table.type),
    categoryIdx: index('usr_insights_category_idx').on(table.category),
    createdAtIdx: index('usr_insights_created_at_idx').on(table.createdAt),
    activeIdx: index('idx_usr_insights_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const usrReflections = pgTable(
  'usr_reflections',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    challengeQuestion: text('challenge_question').notNull(),
    userResponse: text('user_response'),
    followUpQuestions: text('follow_up_questions')
      .array()
      .default(sql`'{}'::text[]`),
    isBreakthrough: boolean('is_breakthrough').default(false),
    engagementLevel: integer('engagement_level').default(0),
    responseTime: integer('response_time').default(0),
    submittedAt: timestamp('submitted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_reflections_user_id_idx').on(table.userId),
    createdAtIdx: index('usr_reflections_created_at_idx').on(table.createdAt),
    activeIdx: index('idx_usr_reflections_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const insertInsightSchema = createInsertSchema(usrInsights).omit({
  id: true,
  generatedAt: true,
  createdAt: true,
});

export const insertReflectionSchema = createInsertSchema(usrReflections).omit({
  id: true,
  createdAt: true,
});

export type Insight = typeof usrInsights.$inferSelect;
export type NewInsight = typeof usrInsights.$inferInsert;
export type InsertInsight = z.infer<typeof insertInsightSchema>;

export type Reflection = typeof usrReflections.$inferSelect;
export type NewReflection = typeof usrReflections.$inferInsert;
export type InsertReflection = z.infer<typeof insertReflectionSchema>;

export { usrReflections as reflections };
