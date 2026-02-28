import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';

function handleZodError(res: Response, req: Request, error: z.ZodError, serviceName: string, message: string): void {
  StructuredErrors.validation(res, message, {
    service: serviceName,
    correlationId: getCorrelationId(req),
    details: {
      errors: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      })),
    },
  });
}

export function createValidateBody(serviceName: string) {
  return function validateBody<T>(schema: z.ZodSchema<T>): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        req.body = schema.parse(req.body);
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          handleZodError(res, req, error, serviceName, 'Request body validation failed');
        } else {
          next(error);
        }
      }
    };
  };
}

export function createValidateQuery(serviceName: string) {
  return function validateQuery<T>(schema: z.ZodSchema<T>): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        req.query = schema.parse(req.query) as typeof req.query;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          handleZodError(res, req, error, serviceName, 'Query parameters validation failed');
        } else {
          next(error);
        }
      }
    };
  };
}

export function createValidateParams(serviceName: string) {
  return function validateParams<T extends Record<string, string>>(schema: z.ZodSchema<T>): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        req.params = schema.parse(req.params) as typeof req.params;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          handleZodError(res, req, error, serviceName, 'URL parameters validation failed');
        } else {
          next(error);
        }
      }
    };
  };
}

export function createValidateRequest(serviceName: string) {
  return function validateRequest<T>(schema: z.ZodSchema<T>): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const validatedData = schema.parse({
          body: req.body,
          query: req.query,
          params: req.params,
        });
        (req as Request & { validated: unknown }).validated = validatedData;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          handleZodError(res, req, error, serviceName, 'Request validation failed');
        } else {
          next(error);
        }
      }
    };
  };
}

export interface ValidationMiddleware {
  validateBody: ReturnType<typeof createValidateBody>;
  validateQuery: ReturnType<typeof createValidateQuery>;
  validateParams: ReturnType<typeof createValidateParams>;
  validateRequest: ReturnType<typeof createValidateRequest>;
}

export function createValidation(serviceName: string): ValidationMiddleware {
  return {
    validateBody: createValidateBody(serviceName),
    validateQuery: createValidateQuery(serviceName),
    validateParams: createValidateParams(serviceName),
    validateRequest: createValidateRequest(serviceName),
  };
}

let _validationMiddleware: ValidationMiddleware | null = null;

export function initValidation(serviceName: string): ValidationMiddleware {
  _validationMiddleware = createValidation(serviceName);
  return _validationMiddleware;
}

function resolveValidation(): ValidationMiddleware {
  if (!_validationMiddleware) {
    throw new Error(
      'Validation middleware not initialized. Call initValidation(serviceName) during service bootstrap.'
    );
  }
  return _validationMiddleware;
}

export function getValidation(): ValidationMiddleware {
  return {
    validateBody:
      <T>(schema: z.ZodSchema<T>): RequestHandler =>
      (req, res, next) =>
        resolveValidation().validateBody(schema)(req, res, next),
    validateQuery:
      <T>(schema: z.ZodSchema<T>): RequestHandler =>
      (req, res, next) =>
        resolveValidation().validateQuery(schema)(req, res, next),
    validateParams:
      <T extends Record<string, string>>(schema: z.ZodSchema<T>): RequestHandler =>
      (req, res, next) =>
        resolveValidation().validateParams(schema)(req, res, next),
    validateRequest:
      <T>(schema: z.ZodSchema<T>): RequestHandler =>
      (req, res, next) =>
        resolveValidation().validateRequest(schema)(req, res, next),
  };
}
