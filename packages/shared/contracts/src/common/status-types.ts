/**
 * Centralized Status Types
 *
 * Single Source of Truth for all status enums across services.
 * Import from @aiponge/shared-contracts instead of using string literals.
 */

import { z } from 'zod';

// =============================================================================
// HEALTH STATUS
// =============================================================================

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
  DOWN: 'down',
  WARNING: 'warning',
  UNAVAILABLE: 'unavailable',
} as const;

export type HealthStatusValue = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

export function isValidHealthStatus(status: string): status is HealthStatusValue {
  return Object.values(HEALTH_STATUS).includes(status as HealthStatusValue);
}

export function normalizeHealthStatus(status: string): HealthStatusValue {
  const normalized = status.toLowerCase();
  if (isValidHealthStatus(normalized)) {
    return normalized;
  }
  return HEALTH_STATUS.UNKNOWN;
}

// =============================================================================
// SUBSCRIPTION STATUS
// =============================================================================

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  PAST_DUE: 'past_due',
  TRIALING: 'trialing',
} as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export function isValidSubscriptionStatus(status: string): status is SubscriptionStatus {
  return Object.values(SUBSCRIPTION_STATUS).includes(status as SubscriptionStatus);
}

// =============================================================================
// USER STATUS
// =============================================================================

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export function isValidUserStatus(status: string): status is UserStatus {
  return Object.values(USER_STATUS).includes(status as UserStatus);
}

// =============================================================================
// NOTIFICATION STATUS
// =============================================================================

export const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  READ: 'read',
} as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS];

export function isValidNotificationStatus(status: string): status is NotificationStatus {
  return Object.values(NOTIFICATION_STATUS).includes(status as NotificationStatus);
}

// =============================================================================
// SERVICE STATUS (for service discovery)
// =============================================================================

export const SERVICE_STATUS = {
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
} as const;

export type ServiceStatus = (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

export function isValidServiceStatus(status: string): status is ServiceStatus {
  return Object.values(SERVICE_STATUS).includes(status as ServiceStatus);
}

// =============================================================================
// GENERATION STATUS (for AI content generation)
// =============================================================================

export const GENERATION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type GenerationStatus = (typeof GENERATION_STATUS)[keyof typeof GENERATION_STATUS];

export function isValidGenerationStatus(status: string): status is GenerationStatus {
  return Object.values(GENERATION_STATUS).includes(status as GenerationStatus);
}

// =============================================================================
// CONTENT VISIBILITY (for creator-member content access model)
// =============================================================================

/**
 * Content visibility controls who can access content.
 *
 * PERSONAL: Private content, visible only to the creator
 * SHARED: Content accessible via share links or direct grants to specific users
 * PUBLIC: Content visible to everyone on the platform
 *
 * Note: Lifecycle state (draft, published, archived) is controlled by the separate 'status' column.
 * Note: Creators and librarians can set content to PUBLIC for platform-wide discovery.
 */
export const CONTENT_VISIBILITY = {
  PERSONAL: 'personal',
  SHARED: 'shared',
  PUBLIC: 'public',
} as const;

export type ContentVisibility = (typeof CONTENT_VISIBILITY)[keyof typeof CONTENT_VISIBILITY];

/**
 * Zod schema for content visibility validation.
 * Single source of truth - import this instead of defining inline z.enum().
 */
export const ContentVisibilitySchema = z.enum([
  CONTENT_VISIBILITY.PERSONAL,
  CONTENT_VISIBILITY.SHARED,
  CONTENT_VISIBILITY.PUBLIC,
]);

/**
 * Zod schema with 'personal' as default (privacy-by-default pattern).
 * Use this for optional visibility fields in create/update operations.
 */
export const ContentVisibilityWithDefaultSchema = ContentVisibilitySchema.default(CONTENT_VISIBILITY.PERSONAL);

export function isValidContentVisibility(visibility: string): visibility is ContentVisibility {
  return Object.values(CONTENT_VISIBILITY).includes(visibility as ContentVisibility);
}

/**
 * Normalize any visibility value to the unified format.
 * Use this when reading visibility from database or API responses.
 */
export function normalizeVisibility(visibility: string | null | undefined): ContentVisibility {
  if (!visibility) return CONTENT_VISIBILITY.PERSONAL;
  if (isValidContentVisibility(visibility)) return visibility;
  return CONTENT_VISIBILITY.PERSONAL;
}

/**
 * Check if content is publicly accessible to everyone.
 */
export function isPublicVisibility(visibility: string | null | undefined): boolean {
  return normalizeVisibility(visibility) === CONTENT_VISIBILITY.PUBLIC;
}

/**
 * Check if content is personal (visible to creator and accepted members only).
 */
export function isPersonalVisibility(visibility: string | null | undefined): boolean {
  return normalizeVisibility(visibility) === CONTENT_VISIBILITY.PERSONAL;
}

// =============================================================================
// LIBRARY SOURCE (API query parameter for filtering content origin)
// =============================================================================

export const LIBRARY_SOURCE = {
  SHARED: 'shared',
  PRIVATE: 'private',
  ALL: 'all',
} as const;

export type LibrarySource = (typeof LIBRARY_SOURCE)[keyof typeof LIBRARY_SOURCE];

export const LibrarySourceSchema = z.enum([LIBRARY_SOURCE.SHARED, LIBRARY_SOURCE.PRIVATE, LIBRARY_SOURCE.ALL]);

export function isValidLibrarySource(source: string): source is LibrarySource {
  return Object.values(LIBRARY_SOURCE).includes(source as LibrarySource);
}

// =============================================================================
// STORAGE ACCESS LEVEL (file storage access control)
// =============================================================================

export const STORAGE_ACCESS_LEVEL = {
  PRIVATE: 'private',
  PUBLIC: 'public',
  SHARED: 'shared',
} as const;

export type StorageAccessLevel = (typeof STORAGE_ACCESS_LEVEL)[keyof typeof STORAGE_ACCESS_LEVEL];

export const StorageAccessLevelSchema = z.enum([
  STORAGE_ACCESS_LEVEL.PRIVATE,
  STORAGE_ACCESS_LEVEL.PUBLIC,
  STORAGE_ACCESS_LEVEL.SHARED,
]);

export function isValidStorageAccessLevel(level: string): level is StorageAccessLevel {
  return Object.values(STORAGE_ACCESS_LEVEL).includes(level as StorageAccessLevel);
}

// =============================================================================
// PROFILE VISIBILITY (user profile privacy settings)
// =============================================================================

export const PROFILE_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  FRIENDS: 'friends',
  CONNECTIONS: 'connections',
  CUSTOM: 'custom',
} as const;

export type ProfileVisibility = (typeof PROFILE_VISIBILITY)[keyof typeof PROFILE_VISIBILITY];

export const ProfileVisibilitySchema = z.enum([
  PROFILE_VISIBILITY.PUBLIC,
  PROFILE_VISIBILITY.PRIVATE,
  PROFILE_VISIBILITY.FRIENDS,
  PROFILE_VISIBILITY.CONNECTIONS,
  PROFILE_VISIBILITY.CUSTOM,
]);

export function isValidProfileVisibility(visibility: string): visibility is ProfileVisibility {
  return Object.values(PROFILE_VISIBILITY).includes(visibility as ProfileVisibility);
}

// =============================================================================
// SONG PRIVACY LEVEL (personal song profile privacy)
// =============================================================================

export const SONG_PRIVACY_LEVEL = {
  PRIVATE: 'private',
  FRIENDS: 'friends',
  PUBLIC: 'public',
} as const;

export type SongPrivacyLevel = (typeof SONG_PRIVACY_LEVEL)[keyof typeof SONG_PRIVACY_LEVEL];

export const SongPrivacyLevelSchema = z.enum([
  SONG_PRIVACY_LEVEL.PRIVATE,
  SONG_PRIVACY_LEVEL.FRIENDS,
  SONG_PRIVACY_LEVEL.PUBLIC,
]);

export function isValidSongPrivacyLevel(level: string): level is SongPrivacyLevel {
  return Object.values(SONG_PRIVACY_LEVEL).includes(level as SongPrivacyLevel);
}

// =============================================================================
// VISIBILITY FILTER (repository query filters extending content visibility)
// =============================================================================

export const VISIBILITY_FILTER = {
  ...CONTENT_VISIBILITY,
  USER: 'user',
  ALL: 'all',
  PUBLICLY_ACCESSIBLE: 'publicly_accessible',
} as const;

export type VisibilityFilter = (typeof VISIBILITY_FILTER)[keyof typeof VISIBILITY_FILTER];

export const VisibilityFilterSchema = z.enum([
  VISIBILITY_FILTER.PERSONAL,
  VISIBILITY_FILTER.SHARED,
  VISIBILITY_FILTER.PUBLIC,
  VISIBILITY_FILTER.USER,
  VISIBILITY_FILTER.ALL,
  VISIBILITY_FILTER.PUBLICLY_ACCESSIBLE,
]);

export function isValidVisibilityFilter(filter: string): filter is VisibilityFilter {
  return Object.values(VISIBILITY_FILTER).includes(filter as VisibilityFilter);
}

// =============================================================================
// GOAL STATUS (user goals / insights)
// =============================================================================

export const GOAL_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type GoalStatusValue = (typeof GOAL_STATUS)[keyof typeof GOAL_STATUS];

export function isValidGoalStatus(status: string): status is GoalStatusValue {
  return Object.values(GOAL_STATUS).includes(status as GoalStatusValue);
}

// =============================================================================
// ALERT STATUS (monitoring alerts)
// =============================================================================

export const ALERT_STATUS = {
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated',
} as const;

export type AlertStatusValue = (typeof ALERT_STATUS)[keyof typeof ALERT_STATUS];

export function isValidAlertStatus(status: string): status is AlertStatusValue {
  return Object.values(ALERT_STATUS).includes(status as AlertStatusValue);
}

// =============================================================================
// ALERT SEVERITY
// =============================================================================

export const ALERT_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type AlertSeverityValue = (typeof ALERT_SEVERITY)[keyof typeof ALERT_SEVERITY];

// =============================================================================
// MONITORING JOB STATUS
// =============================================================================

export const MONITORING_JOB_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type MonitoringJobStatusValue = (typeof MONITORING_JOB_STATUS)[keyof typeof MONITORING_JOB_STATUS];

// =============================================================================
// DATA REQUEST STATUS (GDPR / privacy)
// =============================================================================

export const DATA_REQUEST_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
} as const;

export type DataRequestStatusValue = (typeof DATA_REQUEST_STATUS)[keyof typeof DATA_REQUEST_STATUS];

// =============================================================================
// PROCESSING JOB STATUS (background processing)
// =============================================================================

export const PROCESSING_JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUS)[keyof typeof PROCESSING_JOB_STATUS];

// =============================================================================
// DLQ STATUS (dead letter queue)
// =============================================================================

export const DLQ_STATUS = {
  PENDING: 'pending',
  RESOLVED: 'resolved',
} as const;

export type DlqStatus = (typeof DLQ_STATUS)[keyof typeof DLQ_STATUS];

// =============================================================================
// CREATOR MEMBER STATUS
// =============================================================================

export const CREATOR_MEMBER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
} as const;

export type CreatorMemberStatus = (typeof CREATOR_MEMBER_STATUS)[keyof typeof CREATOR_MEMBER_STATUS];

// =============================================================================
// ORGANIZATION STATUS
// =============================================================================

export const ORGANIZATION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
} as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUS)[keyof typeof ORGANIZATION_STATUS];

// =============================================================================
// UPLOAD STATUS (file upload sessions)
// =============================================================================

export const UPLOAD_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type UploadStatus = (typeof UPLOAD_STATUS)[keyof typeof UPLOAD_STATUS];

// =============================================================================
// RESULT TYPE (for distinguishing not-found from errors)
// =============================================================================

/**
 * Error codes for repository operations.
 * Allows callers to distinguish between "not found" and actual errors.
 */
export const REPOSITORY_ERROR_CODE = {
  NOT_FOUND: 'NOT_FOUND',
  DATABASE_ERROR: 'DATABASE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type RepositoryErrorCode = (typeof REPOSITORY_ERROR_CODE)[keyof typeof REPOSITORY_ERROR_CODE];

/**
 * Repository error with code and message.
 * Use this instead of returning null on errors.
 */
export interface RepositoryError {
  code: RepositoryErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Success result with data.
 */
export interface SuccessResult<T> {
  success: true;
  data: T;
}

/**
 * Failure result with error details.
 */
export interface FailureResult {
  success: false;
  error: RepositoryError;
}

/**
 * Result type that distinguishes between success, not-found, and errors.
 * Use this instead of returning null or empty arrays on errors.
 *
 * @example
 * // In repository:
 * async getUser(id: string): Promise<Result<User | null>> {
 *   try {
 *     const user = await this.db.select()...;
 *     return Result.ok(user || null);  // null = not found
 *   } catch (error) {
 *     return Result.fail('DATABASE_ERROR', 'Failed to fetch user', error);
 *   }
 * }
 *
 * // In caller:
 * const result = await repo.getUser(id);
 * if (!result.success) {
 *   // Handle actual error - log, retry, or propagate
 *   logger.error('Database error', { error: result.error });
 *   throw new Error(result.error.message);
 * }
 * if (result.data === null) {
 *   // Handle not-found case
 *   return { user: null };
 * }
 * return { user: result.data };
 */
export type Result<T> = SuccessResult<T> | FailureResult;

/**
 * Helper functions for creating Result values.
 */
export const Result = {
  /**
   * Create a success result with data.
   * Use null for "not found" scenarios.
   */
  ok<T>(data: T): SuccessResult<T> {
    return { success: true, data };
  },

  /**
   * Create a failure result with error details.
   */
  fail(code: RepositoryErrorCode, message: string, cause?: unknown): FailureResult {
    return {
      success: false,
      error: { code, message, cause },
    };
  },

  /**
   * Check if a result is successful.
   */
  isOk<T>(result: Result<T>): result is SuccessResult<T> {
    return result.success === true;
  },

  /**
   * Check if a result is a failure.
   */
  isFail<T>(result: Result<T>): result is FailureResult {
    return result.success === false;
  },

  /**
   * Unwrap a result or throw an error.
   * Use when you want to convert back to exception-based handling.
   */
  unwrap<T>(result: Result<T>): T {
    if (result.success) {
      return result.data;
    }
    const failure = result as FailureResult;
    throw new Error(`${failure.error.code}: ${failure.error.message}`);
  },

  /**
   * Unwrap a result or return a default value.
   */
  unwrapOr<T>(result: Result<T>, defaultValue: T): T {
    if (result.success) {
      return result.data;
    }
    return defaultValue;
  },
};
