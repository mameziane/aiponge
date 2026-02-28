export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T = unknown> extends APIResponse<T[]> {
  data?: T[]; // Override to ensure data is an array when paginated
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
  requestId?: string;
  details?: unknown;
}

export function isAPIResponse<T>(obj: unknown): obj is APIResponse<T> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'success' in obj &&
    typeof (obj as Record<string, unknown>).success === 'boolean' &&
    'timestamp' in obj &&
    typeof (obj as Record<string, unknown>).timestamp === 'string'
  );
}

export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'error' in obj &&
    typeof (obj as Record<string, unknown>).error === 'string' &&
    'statusCode' in obj &&
    typeof (obj as Record<string, unknown>).statusCode === 'number' &&
    'timestamp' in obj &&
    typeof (obj as Record<string, unknown>).timestamp === 'string'
  );
}

export function isPaginatedResponse<T>(obj: unknown): obj is PaginatedResponse<T> {
  return (
    isAPIResponse(obj) &&
    'pagination' in obj &&
    typeof (obj as Record<string, unknown>).pagination === 'object' &&
    (obj as Record<string, unknown>).pagination !== null &&
    'page' in ((obj as Record<string, unknown>).pagination as Record<string, unknown>) &&
    typeof ((obj as Record<string, unknown>).pagination as Record<string, unknown>).page === 'number' &&
    'limit' in ((obj as Record<string, unknown>).pagination as Record<string, unknown>) &&
    typeof ((obj as Record<string, unknown>).pagination as Record<string, unknown>).limit === 'number' &&
    'total' in ((obj as Record<string, unknown>).pagination as Record<string, unknown>) &&
    typeof ((obj as Record<string, unknown>).pagination as Record<string, unknown>).total === 'number'
  );
}
