import { pgTable, varchar, timestamp, text, uuid, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../user-schema';

export const usrConsentRecords = pgTable(
  'usr_consent_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: varchar('purpose', { length: 100 }).notNull(),
    consentGiven: boolean('consent_given').notNull(),
    policyVersion: varchar('policy_version', { length: 50 }).notNull(),
    source: varchar('source', { length: 50 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    consentText: text('consent_text'),
    locale: varchar('locale', { length: 10 }),
    withdrawnAt: timestamp('withdrawn_at'),
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_consent_records_user_id_idx').on(table.userId),
    purposeIdx: index('usr_consent_records_purpose_idx').on(table.purpose),
    createdAtIdx: index('usr_consent_records_created_at_idx').on(table.createdAt),
    userPurposeIdx: index('usr_consent_records_user_purpose_idx').on(table.userId, table.purpose),
    activeIdx: index('idx_usr_consent_records_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const insertConsentRecordSchema = createInsertSchema(usrConsentRecords).omit({
  id: true,
  createdAt: true,
});

export type ConsentRecord = typeof usrConsentRecords.$inferSelect;
export type NewConsentRecord = typeof usrConsentRecords.$inferInsert;
export type InsertConsentRecord = z.infer<typeof insertConsentRecordSchema>;

export const usrImportBackups = pgTable(
  'usr_import_backups',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    backupData: jsonb('backup_data').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_import_backups_user_id_idx').on(table.userId),
    expiresAtIdx: index('usr_import_backups_expires_at_idx').on(table.expiresAt),
    statusIdx: index('usr_import_backups_status_idx').on(table.status),
    activeIdx: index('idx_usr_import_backups_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const insertImportBackupSchema = createInsertSchema(usrImportBackups).omit({
  createdAt: true,
});

export type ImportBackup = typeof usrImportBackups.$inferSelect;
export type NewImportBackup = typeof usrImportBackups.$inferInsert;
export type InsertImportBackup = z.infer<typeof insertImportBackupSchema>;

export const usrRiskFlags = pgTable(
  'usr_risk_flags',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    severity: varchar('severity', { length: 20 }).notNull(),
    type: varchar('type', { length: 100 }).notNull(),
    description: text('description').notNull(),
    sourceContent: text('source_content'),
    sourceType: varchar('source_type', { length: 50 }),
    sourceId: uuid('source_id'),
    resolved: boolean('resolved').default(false).notNull(),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: uuid('resolved_by'),
    resolution: varchar('resolution', { length: 100 }),
    notes: text('notes'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('usr_risk_flags_user_id_idx').on(table.userId),
    severityIdx: index('usr_risk_flags_severity_idx').on(table.severity),
    typeIdx: index('usr_risk_flags_type_idx').on(table.type),
    resolvedIdx: index('usr_risk_flags_resolved_idx').on(table.resolved),
    createdAtIdx: index('usr_risk_flags_created_at_idx').on(table.createdAt),
  })
);

export const insertRiskFlagSchema = createInsertSchema(usrRiskFlags).omit({
  id: true,
  resolvedAt: true,
  createdAt: true,
});

export type RiskFlag = typeof usrRiskFlags.$inferSelect;
export type NewRiskFlag = typeof usrRiskFlags.$inferInsert;
export type InsertRiskFlag = z.infer<typeof insertRiskFlagSchema>;
export type RiskSeverity = 'low' | 'medium' | 'high' | 'crisis';
export type RiskResolution = 'contacted_user' | 'referred_resources' | 'false_positive' | 'escalated' | 'monitored';

export const usrDataRequests = pgTable(
  'usr_data_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    reason: text('reason'),
    requestedAt: timestamp('requested_at').defaultNow().notNull(),
    processedBy: uuid('processed_by'),
    processedAt: timestamp('processed_at'),
    completedAt: timestamp('completed_at'),
    rejectionReason: text('rejection_reason'),
    exportUrl: text('export_url'),
    exportExpiresAt: timestamp('export_expires_at'),
    notes: text('notes'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('usr_data_requests_user_id_idx').on(table.userId),
    typeIdx: index('usr_data_requests_type_idx').on(table.type),
    statusIdx: index('usr_data_requests_status_idx').on(table.status),
    requestedAtIdx: index('usr_data_requests_requested_at_idx').on(table.requestedAt),
  })
);

export const insertDataRequestSchema = createInsertSchema(usrDataRequests).omit({
  id: true,
  processedAt: true,
  completedAt: true,
  createdAt: true,
});

export type DataRequest = typeof usrDataRequests.$inferSelect;
export type NewDataRequest = typeof usrDataRequests.$inferInsert;
export type InsertDataRequest = z.infer<typeof insertDataRequestSchema>;
export type DataRequestType = 'deletion' | 'export';
export type DataRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export {
  usrConsentRecords as consentRecords,
  usrImportBackups as importBackups,
  usrRiskFlags as riskFlags,
  usrDataRequests as dataRequests,
};
