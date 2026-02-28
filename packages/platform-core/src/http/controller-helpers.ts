/**
 * Controller Helpers - Reduce boilerplate in Express controllers
 *
 * Two helper tiers:
 *
 * 1. handleRequest (RECOMMENDED) - For standard CRUD controllers using sendSuccess:
 *    - Handler returns raw data; response is wrapped via sendSuccess({ success, data, timestamp })
 *    - Try-catch with ServiceErrors.fromException handled automatically
 *    - Validation guards stay outside as early returns
 *
 * 2. execute / executeSimple (LEGACY) - For use-case pattern controllers:
 *    - Handler returns UseCaseResult; response sent via res.status().json()
 *    - Use when response shape differs from sendSuccess format
 *
 * DO NOT USE for controllers with diverse response shapes:
 * - AuthController (varied token/session patterns)
 * - StorageController (proxy/pass-through)
 * - HealthController (K8s probe format)
 * - API Gateway aggregation controllers
 *
 * EXAMPLE (handleRequest):
 * ```typescript
 * const { handleRequest } = createControllerHelpers(
 *   'my-service',
 *   (res, error, msg, req) => ServiceErrors.fromException(res, error, msg, req)
 * );
 *
 * async getUser(req: Request, res: Response) {
 *   await handleRequest({
 *     req, res,
 *     errorMessage: 'Failed to get user',
 *     handler: async () => this.userService.findById(req.params.id),
 *   });
 * }
 * ```
 */

import { Request, Response } from 'express';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { createLogger } from '../logging/index.js';
import { serializeError } from '../logging/error-serializer.js';
import { sendErrorResponse } from '../error-handling/errors.js';

interface HandleRequestOptions {
  req: Request;
  res: Response;
  errorMessage: string;
  handler: () => Promise<unknown>;
  successStatus?: number;
}

const logger = createLogger('controller-helpers');

interface StructuredUseCaseError {
  code: string;
  message: string;
}

interface UseCaseResult {
  success: boolean;
  error?: string | StructuredUseCaseError;
  errorCode?: string;
  suggestedAction?: string;
  [key: string]: unknown;
}

function extractErrorMessage(error: string | StructuredUseCaseError | undefined, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

function extractErrorCode(result: UseCaseResult): string | undefined {
  if (result.errorCode) return result.errorCode;
  if (result.error && typeof result.error === 'object' && 'code' in result.error) {
    return result.error.code;
  }
  return undefined;
}

type ErrorHandler = (res: Response, error: unknown, message: string, req: Request) => void;

type NextFunction = (error?: unknown) => void;

interface ExecuteOptionsBase<TResult extends UseCaseResult> {
  req: Request;
  res: Response;
  next?: NextFunction;
  successStatus?: number;
  errorStatus?: number;
  errorMessage?: string;
  serviceName?: string;
  onError?: ErrorHandler;
  transformSuccess?: (result: TResult) => unknown;
  skipSuccessCheck?: boolean;
}

interface ExecuteWithUseCaseOptions<TInput, TResult extends UseCaseResult> extends ExecuteOptionsBase<TResult> {
  useCase: { execute: (input: TInput) => Promise<TResult> };
  getInput?: (req: Request) => TInput;
  validateInput?: (req: Request) => { valid: boolean; error?: string };
}

interface ExecuteWithFactoryOptions<TInput, TResult extends UseCaseResult> extends ExecuteOptionsBase<TResult> {
  createUseCase: () => { execute: (input: TInput) => Promise<TResult> };
  getInput?: (req: Request) => TInput;
  validateInput?: (req: Request) => { valid: boolean; error?: string };
}

interface ExecuteSimpleOptions<TResult extends UseCaseResult> extends ExecuteOptionsBase<TResult> {
  execute: () => Promise<TResult>;
}

function defaultErrorHandler(res: Response, error: unknown, message: string, req: Request, serviceName: string): void {
  const correlationId = getCorrelationId(req);
  StructuredErrors.fromException(res, error, message, {
    service: serviceName,
    correlationId,
  });
}

function sendFailureResponse<TResult extends UseCaseResult>(
  res: Response,
  result: TResult,
  errorStatus: number,
  errorMessage: string
): void {
  res.status(errorStatus).json({
    success: false,
    error: extractErrorMessage(result.error, errorMessage),
    errorCode: extractErrorCode(result),
    suggestedAction: result.suggestedAction,
  });
}

function handleControllerError(
  error: unknown,
  errorMessage: string,
  correlationId: string | undefined,
  res: Response,
  req: Request,
  serviceName: string,
  next?: NextFunction,
  onError?: ErrorHandler
): void {
  logger.error(errorMessage, {
    error: serializeError(error),
    correlationId,
  });

  if (next) {
    next(error);
  } else if (onError) {
    onError(res, error, errorMessage, req);
  } else {
    defaultErrorHandler(res, error, errorMessage, req, serviceName);
  }
}

function resolveUseCase<TInput, TResult extends UseCaseResult>(
  options: ExecuteWithUseCaseOptions<TInput, TResult> | ExecuteWithFactoryOptions<TInput, TResult>
): { execute: (input: TInput) => Promise<TResult> } {
  return 'createUseCase' in options ? options.createUseCase() : options.useCase;
}

function resolveGetInput<TInput, TResult extends UseCaseResult>(
  options: ExecuteWithUseCaseOptions<TInput, TResult> | ExecuteWithFactoryOptions<TInput, TResult>
): (r: Request) => TInput {
  return 'getInput' in options && options.getInput ? options.getInput : (r: Request) => r.body as TInput;
}

function runValidation<TInput, TResult extends UseCaseResult>(
  options: ExecuteWithUseCaseOptions<TInput, TResult> | ExecuteWithFactoryOptions<TInput, TResult>,
  req: Request,
  res: Response
): boolean {
  const validateInput = 'validateInput' in options ? options.validateInput : undefined;
  if (!validateInput) return true;
  const validation = validateInput(req);
  if (validation.valid) return true;
  sendErrorResponse(res, 400, validation.error || 'Validation failed');
  return false;
}

export async function executeControllerMethod<TInput, TResult extends UseCaseResult>(
  options: ExecuteWithUseCaseOptions<TInput, TResult> | ExecuteWithFactoryOptions<TInput, TResult>
): Promise<void> {
  const {
    req,
    res,
    successStatus = 200,
    errorStatus = 400,
    errorMessage = 'Operation failed',
    serviceName = 'unknown-service',
    onError,
    transformSuccess,
    skipSuccessCheck = false,
  } = options;

  const correlationId = getCorrelationId(req);

  try {
    if (!runValidation(options, req, res)) return;

    const useCase = resolveUseCase(options);
    const input = resolveGetInput(options)(req);
    const result = await useCase.execute(input);

    if (!skipSuccessCheck && !result.success) {
      sendFailureResponse(res, result, errorStatus, errorMessage);
      return;
    }

    const responseData = transformSuccess ? transformSuccess(result) : result;
    res.status(successStatus).json(responseData);
  } catch (error) {
    const next = 'next' in options ? options.next : undefined;
    handleControllerError(error, errorMessage, correlationId, res, req, serviceName, next, onError);
  }
}

export async function executeSimple<TResult extends UseCaseResult>(
  options: ExecuteSimpleOptions<TResult>
): Promise<void> {
  const {
    execute,
    req,
    res,
    next,
    successStatus = 200,
    errorStatus = 400,
    errorMessage = 'Operation failed',
    serviceName = 'unknown-service',
    onError,
    transformSuccess,
    skipSuccessCheck = false,
  } = options;

  const correlationId = getCorrelationId(req);

  try {
    const result = await execute();

    if (!skipSuccessCheck && !result.success) {
      sendFailureResponse(res, result, errorStatus, errorMessage);
      return;
    }

    const responseData = transformSuccess ? transformSuccess(result) : result;
    res.status(successStatus).json(responseData);
  } catch (error) {
    handleControllerError(error, errorMessage, correlationId, res, req, serviceName, next, onError);
  }
}

export function createControllerHelpers(serviceName: string, errorHandler?: ErrorHandler) {
  const serviceErrorHandler =
    errorHandler || ((res, error, message, req) => defaultErrorHandler(res, error, message, req, serviceName));

  return {
    handleRequest: async (options: HandleRequestOptions): Promise<void> => {
      const { req, res, errorMessage, handler, successStatus = 200 } = options;
      try {
        const data = await handler();
        res.status(successStatus).json({
          success: true,
          data,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const correlationId = getCorrelationId(req);
        logger.error(errorMessage, {
          error: serializeError(error),
          correlationId,
        });
        serviceErrorHandler(res, error, errorMessage, req);
      }
    },

    execute: <TInput, TResult extends UseCaseResult>(
      options: Omit<
        ExecuteWithUseCaseOptions<TInput, TResult> | ExecuteWithFactoryOptions<TInput, TResult>,
        'serviceName' | 'onError'
      >
    ) =>
      executeControllerMethod({
        ...options,
        serviceName,
        onError: serviceErrorHandler,
      } as ExecuteWithUseCaseOptions<TInput, TResult> | ExecuteWithFactoryOptions<TInput, TResult>),

    executeSimple: <TResult extends UseCaseResult>(
      options: Omit<ExecuteSimpleOptions<TResult>, 'serviceName' | 'onError'>
    ) =>
      executeSimple({
        ...options,
        serviceName,
        onError: serviceErrorHandler,
      }),
  };
}
