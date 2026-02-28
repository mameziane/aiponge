import { type ZodType, type ZodError } from 'zod';
import { createLogger } from '../logging/logger.js';
import { ServiceError } from '../errors/service-error.js';

const logger = createLogger('response-validation');

export class ContractViolationError extends ServiceError {
  readonly zodError: ZodError;

  constructor(sourceService: string, operation: string, zodError: ZodError) {
    super('ContractViolationError', `Response contract violation from ${sourceService} in ${operation}`, {
      statusCode: 502,
      code: 'CONTRACT_VIOLATION',
      details: {
        sourceService,
        operation,
        issues: zodError.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      },
    });
    this.zodError = zodError;
  }
}

export function parseServiceResponse<T>(
  schema: ZodType<T>,
  data: unknown,
  sourceService: string,
  operation: string
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  logger.error('Response contract violation', {
    sourceService,
    operation,
    issues: result.error.issues.map(i => ({
      path: i.path.join('.'),
      expected: i.message,
      code: i.code,
    })),
    receivedKeys: data && typeof data === 'object' ? Object.keys(data) : typeof data,
  });

  throw new ContractViolationError(sourceService, operation, result.error);
}

export function tryParseServiceResponse<T>(
  schema: ZodType<T>,
  data: unknown,
  sourceService: string,
  operation: string
): { success: true; data: T } | { success: false; error: ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  logger.warn('Response contract violation (non-fatal)', {
    sourceService,
    operation,
    issues: result.error.issues.map(i => ({
      path: i.path.join('.'),
      expected: i.message,
      code: i.code,
    })),
    receivedKeys: data && typeof data === 'object' ? Object.keys(data) : typeof data,
  });

  return { success: false, error: result.error };
}
