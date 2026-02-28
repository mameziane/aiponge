import { pgTable, varchar, integer, timestamp, text, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../user-schema';
import { usrReflections } from './insights-schema';
import { usrUserPatterns } from './core-profile-schema';

export const usrReflectionTurns = pgTable(
  'usr_reflection_turns',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reflectionId: uuid('reflection_id')
      .notNull()
      .references(() => usrReflections.id, { onDelete: 'cascade' }),
    turnNumber: integer('turn_number').notNull(),
    question: text('question').notNull(),
    response: text('response'),
    microInsight: text('micro_insight'),
    therapeuticFramework: varchar('therapeutic_framework', { length: 100 }),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    reflectionIdIdx: index('usr_reflection_turns_reflection_id_idx').on(table.reflectionId),
    turnNumberIdx: index('usr_reflection_turns_turn_number_idx').on(table.reflectionId, table.turnNumber),
  })
);

export const usrPatternReactions = pgTable(
  'usr_pattern_reactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    patternId: uuid('pattern_id')
      .notNull()
      .references(() => usrUserPatterns.id, { onDelete: 'cascade' }),
    reaction: varchar('reaction', { length: 20 }).notNull(),
    explanation: text('explanation'),
    followUpReflectionId: uuid('follow_up_reflection_id'),
    generatedInsightId: uuid('generated_insight_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('usr_pattern_reactions_user_id_idx').on(table.userId),
    patternIdIdx: index('usr_pattern_reactions_pattern_id_idx').on(table.patternId),
  })
);

export const usrMoodCheckins = pgTable(
  'usr_mood_checkins',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mood: varchar('mood', { length: 50 }).notNull(),
    emotionalIntensity: integer('emotional_intensity').notNull(),
    content: text('content'),
    triggerTag: varchar('trigger_tag', { length: 100 }),
    microQuestion: text('micro_question'),
    microQuestionResponse: text('micro_question_response'),
    patternConnectionId: uuid('pattern_connection_id'),
    linkedReflectionId: uuid('linked_reflection_id'),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('usr_mood_checkins_user_id_idx').on(table.userId),
    createdAtIdx: index('usr_mood_checkins_created_at_idx').on(table.createdAt),
    moodIdx: index('usr_mood_checkins_mood_idx').on(table.mood),
  })
);

export const usrPersonalNarratives = pgTable(
  'usr_personal_narratives',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    narrative: text('narrative').notNull(),
    dataPointsUsed: integer('data_points_used').notNull().default(0),
    breakthroughsReferenced: uuid('breakthroughs_referenced')
      .array()
      .default(sql`'{}'::uuid[]`),
    forwardPrompt: text('forward_prompt'),
    userReflection: text('user_reflection'),
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('usr_personal_narratives_user_id_idx').on(table.userId),
    periodIdx: index('usr_personal_narratives_period_idx').on(table.userId, table.periodEnd),
  })
);

export const insertReflectionTurnSchema = createInsertSchema(usrReflectionTurns).omit({
  id: true,
  createdAt: true,
});

export const insertPatternReactionSchema = createInsertSchema(usrPatternReactions).omit({
  id: true,
  createdAt: true,
});

export const insertMoodCheckinSchema = createInsertSchema(usrMoodCheckins).omit({
  id: true,
  createdAt: true,
});

export const insertPersonalNarrativeSchema = createInsertSchema(usrPersonalNarratives).omit({
  id: true,
  createdAt: true,
});

export type ReflectionTurn = typeof usrReflectionTurns.$inferSelect;
export type NewReflectionTurn = typeof usrReflectionTurns.$inferInsert;
export type InsertReflectionTurn = z.infer<typeof insertReflectionTurnSchema>;

export type PatternReaction = typeof usrPatternReactions.$inferSelect;
export type NewPatternReaction = typeof usrPatternReactions.$inferInsert;
export type InsertPatternReaction = z.infer<typeof insertPatternReactionSchema>;

export type MoodCheckin = typeof usrMoodCheckins.$inferSelect;
export type NewMoodCheckin = typeof usrMoodCheckins.$inferInsert;
export type InsertMoodCheckin = z.infer<typeof insertMoodCheckinSchema>;

export type PersonalNarrative = typeof usrPersonalNarratives.$inferSelect;
export type NewPersonalNarrative = typeof usrPersonalNarratives.$inferInsert;
export type InsertPersonalNarrative = z.infer<typeof insertPersonalNarrativeSchema>;
