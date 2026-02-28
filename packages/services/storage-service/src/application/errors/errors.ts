import { DomainErrorCode, createDomainServiceError } from '@aiponge/platform-core';

const StorageDomainCodes = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  ACCESS_DENIED: 'ACCESS_DENIED',
  INVALID_FILE: 'INVALID_FILE',
  INVALID_FILENAME: 'INVALID_FILENAME',
  INVALID_REQUEST: 'INVALID_REQUEST',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_EXPIRED: 'FILE_EXPIRED',
  SIGNED_URLS_NOT_SUPPORTED: 'SIGNED_URLS_NOT_SUPPORTED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  UPLOAD_ERROR: 'UPLOAD_ERROR',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  DOWNLOAD_ERROR: 'DOWNLOAD_ERROR',
  DELETE_FAILED: 'DELETE_FAILED',
  DELETE_ERROR: 'DELETE_ERROR',
  LIST_FILES_ERROR: 'LIST_FILES_ERROR',
  METADATA_ERROR: 'METADATA_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INVALID_CHECKSUM: 'INVALID_CHECKSUM',
  INVALID_METADATA: 'INVALID_METADATA',
  INVALID_PERMISSION: 'INVALID_PERMISSION',
  INVALID_LOCATION: 'INVALID_LOCATION',
  INVALID_PROVIDER: 'INVALID_PROVIDER',
  INVALID_TASK_STATUS: 'INVALID_TASK_STATUS',
  INVALID_SIZE_RANGE: 'INVALID_SIZE_RANGE',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  INVALID_LIMIT: 'INVALID_LIMIT',
  INVALID_OFFSET: 'INVALID_OFFSET',
  TARGET_FILE_NOT_FOUND: 'TARGET_FILE_NOT_FOUND',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  DUPLICATE_CONTENT: 'DUPLICATE_CONTENT',
  REVERT_FAILED: 'REVERT_FAILED',
  DELETE_ACTIVE_VERSION: 'DELETE_ACTIVE_VERSION',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  SIGNED_URL_ERROR: 'SIGNED_URL_ERROR',
} as const;

export const StorageErrorCode = { ...DomainErrorCode, ...StorageDomainCodes } as const;
export type StorageErrorCodeType = (typeof StorageErrorCode)[keyof typeof StorageErrorCode];

const StorageErrorBase = createDomainServiceError('Storage', StorageErrorCode);

export class StorageError extends StorageErrorBase {
  private static getStatusCodeForErrorCode(code: string): number {
    const statusMap: Record<string, number> = {
      [StorageErrorCode.FILE_NOT_FOUND]: 404,
      [StorageErrorCode.VERSION_NOT_FOUND]: 404,
      [StorageErrorCode.SESSION_NOT_FOUND]: 404,
      [StorageErrorCode.TASK_NOT_FOUND]: 404,
      [StorageErrorCode.ACCESS_DENIED]: 403,
      [StorageErrorCode.INVALID_FILE]: 400,
      [StorageErrorCode.INVALID_FILENAME]: 400,
      [StorageErrorCode.INVALID_REQUEST]: 400,
      [StorageErrorCode.FILE_TOO_LARGE]: 413,
      [StorageErrorCode.FILE_EXPIRED]: 410,
      [StorageErrorCode.SIGNED_URLS_NOT_SUPPORTED]: 501,
      [StorageErrorCode.UPLOAD_FAILED]: 500,
      [StorageErrorCode.UPLOAD_ERROR]: 500,
      [StorageErrorCode.DOWNLOAD_FAILED]: 500,
      [StorageErrorCode.DOWNLOAD_ERROR]: 500,
      [StorageErrorCode.DELETE_FAILED]: 500,
      [StorageErrorCode.DELETE_ERROR]: 500,
      [StorageErrorCode.LIST_FILES_ERROR]: 500,
      [StorageErrorCode.METADATA_ERROR]: 500,
      [StorageErrorCode.QUOTA_EXCEEDED]: 413,
      [StorageErrorCode.INVALID_CHECKSUM]: 400,
      [StorageErrorCode.INVALID_METADATA]: 400,
      [StorageErrorCode.INVALID_PERMISSION]: 400,
      [StorageErrorCode.INVALID_LOCATION]: 400,
      [StorageErrorCode.INVALID_PROVIDER]: 400,
      [StorageErrorCode.INVALID_TASK_STATUS]: 422,
      [StorageErrorCode.INVALID_SIZE_RANGE]: 400,
      [StorageErrorCode.INVALID_DATE_RANGE]: 400,
      [StorageErrorCode.INVALID_LIMIT]: 400,
      [StorageErrorCode.INVALID_OFFSET]: 400,
      [StorageErrorCode.TARGET_FILE_NOT_FOUND]: 404,
      [StorageErrorCode.PROVIDER_ERROR]: 502,
      [StorageErrorCode.VALIDATION_ERROR]: 400,
      [StorageErrorCode.DUPLICATE_CONTENT]: 409,
      [StorageErrorCode.REVERT_FAILED]: 500,
      [StorageErrorCode.DELETE_ACTIVE_VERSION]: 422,
      [StorageErrorCode.INTERNAL_ERROR]: 500,
      [StorageErrorCode.INVALID_STATE_TRANSITION]: 422,
      [StorageErrorCode.SERVICE_UNAVAILABLE]: 503,
      [StorageErrorCode.SIGNED_URL_ERROR]: 500,
    };
    return statusMap[code] || 500;
  }

  static getErrorType(statusCode: number): string {
    const typeMap: Record<number, string> = {
      400: 'ValidationError',
      401: 'UnauthorizedError',
      403: 'ForbiddenError',
      404: 'NotFoundError',
      409: 'ConflictError',
      413: 'PayloadTooLargeError',
      429: 'RateLimitError',
    };
    return typeMap[statusCode] || 'InternalError';
  }

  static createResponse(
    error: StorageError,
    correlationId?: string
  ): {
    status: number;
    body: {
      success: false;
      error: { type: string; code: string; message: string; correlationId?: string };
      timestamp: string;
    };
  } {
    return {
      status: error.statusCode,
      body: {
        success: false,
        error: {
          type: StorageError.getErrorType(error.statusCode),
          code: error.code,
          message: error.message,
          ...(correlationId ? { correlationId } : {}),
        },
        timestamp: new Date().toISOString(),
      },
    };
  }

  static fileNotFound(fileId: string) {
    return new StorageError(`File not found: ${fileId}`, 404, StorageErrorCode.FILE_NOT_FOUND);
  }

  static versionNotFound(versionId: string) {
    return new StorageError(`File version not found: ${versionId}`, 404, StorageErrorCode.VERSION_NOT_FOUND);
  }

  static sessionNotFound(sessionId: string) {
    return new StorageError(`Upload session not found: ${sessionId}`, 404, StorageErrorCode.SESSION_NOT_FOUND);
  }

  static accessDenied(resource: string, reason?: string) {
    const msg = reason ? `Access denied to ${resource}: ${reason}` : `Access denied to ${resource}`;
    return new StorageError(msg, 403, StorageErrorCode.ACCESS_DENIED);
  }

  static invalidFile(reason: string) {
    return new StorageError(`Invalid file: ${reason}`, 400, StorageErrorCode.INVALID_FILE);
  }

  static invalidFilename(filename: string, reason?: string) {
    const msg = reason ? `Invalid filename '${filename}': ${reason}` : `Invalid filename: ${filename}`;
    return new StorageError(msg, 400, StorageErrorCode.INVALID_FILENAME);
  }

  static invalidRequest(reason: string) {
    return new StorageError(`Invalid request: ${reason}`, 400, StorageErrorCode.INVALID_REQUEST);
  }

  static fileTooLarge(size: number, maxSize: number) {
    return new StorageError(
      `File size ${size} exceeds maximum allowed ${maxSize}`,
      413,
      StorageErrorCode.FILE_TOO_LARGE
    );
  }

  static fileExpired(fileId: string) {
    return new StorageError(`File has expired: ${fileId}`, 410, StorageErrorCode.FILE_EXPIRED);
  }

  static signedUrlsNotSupported(provider: string) {
    return new StorageError(
      `Signed URLs not supported by provider: ${provider}`,
      501,
      StorageErrorCode.SIGNED_URLS_NOT_SUPPORTED
    );
  }

  static uploadFailed(reason: string, cause?: Error) {
    return new StorageError(`Upload failed: ${reason}`, 500, StorageErrorCode.UPLOAD_FAILED, cause);
  }

  static downloadFailed(reason: string, cause?: Error) {
    return new StorageError(`Download failed: ${reason}`, 500, StorageErrorCode.DOWNLOAD_FAILED, cause);
  }

  static deleteFailed(reason: string, cause?: Error) {
    return new StorageError(`Delete failed: ${reason}`, 500, StorageErrorCode.DELETE_FAILED, cause);
  }

  static quotaExceeded(quotaType: string, limit: number, current: number) {
    return new StorageError(`${quotaType} quota exceeded: ${current}/${limit}`, 413, StorageErrorCode.QUOTA_EXCEEDED);
  }

  static invalidChecksum(expected: string, actual: string) {
    return new StorageError(
      `Checksum mismatch: expected ${expected}, got ${actual}`,
      400,
      StorageErrorCode.INVALID_CHECKSUM
    );
  }

  static invalidMetadata(field: string, reason: string) {
    return new StorageError(`Invalid metadata for ${field}: ${reason}`, 400, StorageErrorCode.INVALID_METADATA);
  }

  static invalidPermission(reason: string) {
    return new StorageError(`Invalid permission: ${reason}`, 400, StorageErrorCode.INVALID_PERMISSION);
  }

  static invalidLocation(reason: string) {
    return new StorageError(`Invalid storage location: ${reason}`, 400, StorageErrorCode.INVALID_LOCATION);
  }

  static invalidProvider(provider: string, reason?: string) {
    const msg = reason ? `Invalid provider '${provider}': ${reason}` : `Invalid storage provider: ${provider}`;
    return new StorageError(msg, 400, StorageErrorCode.INVALID_PROVIDER);
  }

  static providerError(provider: string, operation: string, cause?: Error) {
    return new StorageError(
      `Provider ${provider} failed during ${operation}`,
      502,
      StorageErrorCode.PROVIDER_ERROR,
      cause
    );
  }

  static invalidStateTransition(from: string, to: string, reason?: string) {
    const msg = reason
      ? `Invalid state transition from ${from} to ${to}: ${reason}`
      : `Invalid state transition from ${from} to ${to}`;
    return new StorageError(msg, 422, StorageErrorCode.INVALID_STATE_TRANSITION);
  }
}
