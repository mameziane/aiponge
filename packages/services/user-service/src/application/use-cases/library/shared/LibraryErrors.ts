/**
 * Library Domain Errors
 * Explicit error codes for library operations - no silent failures
 */

export const LibraryErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  OWNERSHIP_REQUIRED: 'OWNERSHIP_REQUIRED',
  ROLE_INSUFFICIENT: 'ROLE_INSUFFICIENT',
  BOOK_TYPE_INVALID: 'BOOK_TYPE_INVALID',
  BOOK_READ_ONLY: 'BOOK_READ_ONLY',
  CHAPTER_LOCKED: 'CHAPTER_LOCKED',
  PARENT_NOT_FOUND: 'PARENT_NOT_FOUND',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  OPERATION_FAILED: 'OPERATION_FAILED',
} as const;

export type LibraryErrorCodeType = (typeof LibraryErrorCode)[keyof typeof LibraryErrorCode];

export interface LibraryErrorInfo {
  code: LibraryErrorCodeType;
  message: string;
  details?: Record<string, unknown>;
}

export interface LibraryResult<T> {
  success: true;
  data: T;
}

export interface LibraryFailure {
  success: false;
  error: LibraryErrorInfo;
}

export type LibraryResponse<T> = LibraryResult<T> | LibraryFailure;

export function success<T>(data: T): LibraryResult<T> {
  return { success: true, data };
}

export function failure(
  code: LibraryErrorCodeType,
  message: string,
  details?: Record<string, unknown>
): LibraryFailure {
  return {
    success: false,
    error: { code, message, details },
  };
}

export function notFound(resource: string, id?: string): LibraryFailure {
  return failure(
    LibraryErrorCode.NOT_FOUND,
    `${resource} not found${id ? `: ${id}` : ''}`,
    id ? { resourceId: id } : undefined
  );
}

export function forbidden(action: string, reason?: string): LibraryFailure {
  return failure(LibraryErrorCode.FORBIDDEN, reason || `Not authorized to ${action}`, { action });
}

export function validationError(message: string, details?: Record<string, unknown>): LibraryFailure {
  return failure(LibraryErrorCode.VALIDATION_ERROR, message, details);
}

export function roleInsufficient(requiredRole: string, currentRole: string): LibraryFailure {
  return failure(
    LibraryErrorCode.ROLE_INSUFFICIENT,
    `Insufficient permissions. Required: ${requiredRole}, current: ${currentRole}`,
    { requiredRole, currentRole }
  );
}

export function parentNotFound(parentType: string, parentId: string): LibraryFailure {
  return failure(LibraryErrorCode.PARENT_NOT_FOUND, `${parentType} not found: ${parentId}`, { parentType, parentId });
}

export function operationFailed(operation: string, reason?: string): LibraryFailure {
  return failure(LibraryErrorCode.OPERATION_FAILED, reason || `Failed to ${operation}`, { operation });
}
