/**
 * Common Contracts
 *
 * Shared types for common patterns across all services:
 * - API response wrappers
 * - Pagination
 * - Error structures
 * - Health checks
 */

import { z } from 'zod';

export const ServiceErrorSchema = z.object({
  type: z.string(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  correlationId: z.string().optional(),
});
export type ServiceError = z.infer<typeof ServiceErrorSchema>;

export const ServiceResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: ServiceErrorSchema.optional(),
    timestamp: z.string().optional(),
  });

export type ServiceResponse<T> = {
  success: boolean;
  data?: T;
  error?: ServiceError;
  timestamp?: string;
};

export const PaginationParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});
export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  });

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export const CursorPaginationParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  direction: z.enum(['forward', 'backward']).default('forward').optional(),
});
export type CursorPaginationParams = z.infer<typeof CursorPaginationParamsSchema>;

export const CursorPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export type CursorPaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor<T = Record<string, unknown>>(cursor: string): T | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const ServiceHealthSchema = z.object({
  status: HealthStatusSchema,
  service: z.string(),
  version: z.string().optional(),
  uptime: z.number().optional(),
  timestamp: z.union([z.string(), z.date()]),
  dependencies: z
    .record(
      z.object({
        status: HealthStatusSchema,
        latencyMs: z.number().optional(),
        error: z.string().optional(),
      })
    )
    .optional(),
});
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

export const SortParamsSchema = z.object({
  sortBy: z.string(),
  sortOrder: SortOrderSchema.default('desc'),
});
export type SortParams = z.infer<typeof SortParamsSchema>;

export const DateRangeSchema = z.object({
  startDate: z.union([z.string(), z.date()]),
  endDate: z.union([z.string(), z.date()]),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const ApiKeyHeaderSchema = z.object({
  'x-api-key': z.string(),
  'x-request-id': z.string().optional(),
  'x-correlation-id': z.string().optional(),
});
export type ApiKeyHeader = z.infer<typeof ApiKeyHeaderSchema>;

// Re-export error factory utilities
export * from './error-factory.js';

// Re-export shared database tables for cross-service FK references
export * from './db-tables.js';

// Re-export user roles - Single Source of Truth
export * from './roles.js';

// Re-export AuthContext and policy utilities - Centralized Authorization
export * from './auth-context.js';

// Re-export subscription tiers - Single Source of Truth for tier handling
export * from './subscription-tiers.js';

// Re-export centralized constants - Single Source of Truth
export * from './constants.js';

// Re-export content access policy - Centralized ABAC
export * from './content-access.js';

// Re-export status types - Single Source of Truth
export * from './status-types.js';

// Re-export content lifecycle state machine - Single Source of Truth for content statuses
export * from './content-lifecycle.js';

// Re-export organization branding contracts - White-label support for Practice/Studio tiers
export * from './branding.js';

// Re-export music preference constants - Single Source of Truth for genres, moods, instruments
export * from './music-preferences.js';

// Re-export AI provider pricing - Single Source of Truth for model costs
export * from './ai-provider-pricing.js';
