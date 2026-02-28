import { z } from 'zod';
import type { ServiceResponse } from '../common/index.js';

export class ResponseValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly rawData: unknown
  ) {
    super(message);
    this.name = 'ResponseValidationError';
  }
}

export function parseResponse<T extends z.ZodTypeAny>(schema: T, data: unknown, context?: string): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = context
      ? `Response validation failed for ${context}: ${result.error.message}`
      : `Response validation failed: ${result.error.message}`;
    throw new ResponseValidationError(message, result.error.issues, data);
  }
  return result.data;
}

export function safeParseResponse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError; rawData: unknown } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error, rawData: data };
}

export function validateAndExtract<T>(
  schema: z.ZodType<ServiceResponse<T>>,
  data: unknown,
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void }
): T | undefined {
  const parseResult = schema.safeParse(data);

  if (!parseResult.success) {
    logger?.warn('Response validation failed', {
      errors: parseResult.error.issues,
      rawData: JSON.stringify(data).slice(0, 500),
    });
    return undefined;
  }

  const response = parseResult.data;
  if (response.success && response.data) {
    return response.data;
  }

  return undefined;
}

export function isSuccessResponse<T>(response: ServiceResponse<T>): response is ServiceResponse<T> & { data: T } {
  return response.success === true && response.data !== undefined;
}

export function isErrorResponse<T>(response: ServiceResponse<T>): boolean {
  return response.success === false || response.error !== undefined;
}
