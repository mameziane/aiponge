import { pgTable, varchar, jsonb, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const usrAuditLogs = pgTable(
  'usr_audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id'),
    targetType: varchar('target_type', { length: 50 }).notNull(),
    targetId: uuid('target_id'),
    action: varchar('action', { length: 30 }).notNull(),
    changes: jsonb('changes'),
    metadata: jsonb('metadata').default({}),
    serviceName: varchar('service_name', { length: 50 }).notNull(),
    correlationId: varchar('correlation_id', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('idx_audit_user_id').on(table.userId),
    targetIdx: index('idx_audit_target').on(table.targetType, table.targetId),
    actionIdx: index('idx_audit_action').on(table.action),
    createdAtIdx: index('idx_audit_created_at').on(table.createdAt),
  })
);
