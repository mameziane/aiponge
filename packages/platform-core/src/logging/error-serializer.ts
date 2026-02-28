export interface SerializedError {
  message: string;
  stack?: string;
  name?: string;
  cause?: SerializedError;
  code?: string;
  details?: Record<string, unknown>;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const serialized: SerializedError = {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };

    const errorWithCode = error as Error & { code?: string };
    if (errorWithCode.code) {
      serialized.code = errorWithCode.code;
    }

    const errorWithCause = error as Error & { cause?: unknown };
    if (errorWithCause.cause) {
      serialized.cause = serializeError(errorWithCause.cause);
    }

    const errorWithDetails = error as Error & { details?: Record<string, unknown> };
    if (errorWithDetails.details && typeof errorWithDetails.details === 'object') {
      serialized.details = errorWithDetails.details;
    }

    return serialized;
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    return {
      message: String(obj.message || obj.error || JSON.stringify(error)),
      name: typeof obj.name === 'string' ? obj.name : undefined,
      code: typeof obj.code === 'string' ? obj.code : undefined,
    };
  }

  return { message: String(error) };
}
