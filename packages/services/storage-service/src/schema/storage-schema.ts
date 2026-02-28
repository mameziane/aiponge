/**
 * File Service Database Schema
 * Drizzle ORM schema for file management system
 */

import { pgTable, text, timestamp, boolean, integer, jsonb, uuid, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Files Table
 * Comprehensive file storage metadata and management
 */
export const files = pgTable(
  'stg_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalName: text('original_name').notNull(),

    // Storage location details
    storageProvider: text('storage_provider').notNull(), // local, aws-s3, gcp, cloudinary, etc.
    storagePath: text('storage_path').notNull(),
    publicUrl: text('public_url'),
    bucket: text('bucket'),
    storageMetadata: jsonb('storage_metadata').default({}),

    // File metadata
    contentType: text('content_type'),
    fileSize: integer('file_size'),
    checksum: text('checksum'),
    uploadedAt: timestamp('uploaded_at'),
    lastModified: timestamp('last_modified'),
    tags: jsonb('tags'), // array of strings

    // Access control
    isPublic: boolean('is_public').default(false),
    userId: text('user_id'),
    expiresAt: timestamp('expires_at'),

    // Lifecycle management
    status: text('status').default('active').notNull(), // active, orphaned, deleted
    orphanedAt: timestamp('orphaned_at'), // When file was marked as orphaned
    category: text('category'), // avatar, track, track-artwork, playlist-artwork, general

    // System fields
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by'),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_stg_files_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

/**
 * File Processing Jobs Table
 * Track background processing tasks for files
 */
export const fileProcessingJobs = pgTable(
  'stg_processing_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),

    // Job details
    jobType: text('job_type').notNull(), // resize, compress, convert, thumbnail, etc.
    status: text('status').notNull().default('pending'), // pending, processing, completed, failed
    progress: integer('progress').default(0), // 0-100

    // Processing configuration
    inputParams: jsonb('input_params').default({}),
    outputParams: jsonb('output_params').default({}),

    // Timing
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // Error handling
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),

    // System fields
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_stg_processing_jobs_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

/**
 * File Versions Table
 * Track file version history and variants
 */
export const fileVersions = pgTable('stg_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),

  // Version details
  versionNumber: integer('version_number').notNull(),
  versionType: text('version_type').notNull(), // original, thumbnail, compressed, converted

  // Storage details
  storageProvider: text('storage_provider').notNull(),
  storagePath: text('storage_path').notNull(),
  publicUrl: text('public_url'),

  // File metadata
  contentType: text('content_type'),
  fileSize: integer('file_size'),
  checksum: text('checksum'),

  // Processing metadata
  processingParams: jsonb('processing_params').default({}),

  // System fields
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * File Access Logs Table
 * Track file access for analytics and security
 */
export const fileAccessLogs = pgTable('stg_access_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),

  // Access details
  userId: text('user_id'), // null for anonymous access
  action: text('action').notNull(), // view, download, stream
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  // Response details
  responseCode: integer('response_code'),
  bytesTransferred: integer('bytes_transferred'),
  durationMs: integer('duration_ms'), // milliseconds
  metadata: jsonb('metadata'),

  // System fields
  accessedAt: timestamp('accessed_at').defaultNow().notNull(),
});

// Zod schemas for validation
export const insertFileSchema = createInsertSchema(files);
export const selectFileSchema = createSelectSchema(files);
export const updateFileSchema = insertFileSchema.partial();

export const insertFileProcessingJobSchema = createInsertSchema(fileProcessingJobs);
export const selectFileProcessingJobSchema = createSelectSchema(fileProcessingJobs);

export const insertFileVersionSchema = createInsertSchema(fileVersions);
export const selectFileVersionSchema = createSelectSchema(fileVersions);

export const insertFileAccessLogSchema = createInsertSchema(fileAccessLogs);
export const selectFileAccessLogSchema = createSelectSchema(fileAccessLogs);

// TypeScript types
export type File = z.infer<typeof selectFileSchema>;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type UpdateFile = z.infer<typeof updateFileSchema>;

export type FileProcessingJob = z.infer<typeof selectFileProcessingJobSchema>;
export type InsertFileProcessingJob = z.infer<typeof insertFileProcessingJobSchema>;

export type FileVersion = z.infer<typeof selectFileVersionSchema>;
export type InsertFileVersion = z.infer<typeof insertFileVersionSchema>;

export type FileAccessLog = z.infer<typeof selectFileAccessLogSchema>;
export type InsertFileAccessLog = z.infer<typeof insertFileAccessLogSchema>;
