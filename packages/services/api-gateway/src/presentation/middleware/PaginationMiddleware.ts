import { Request, Response, NextFunction } from 'express';

export function paginationMiddleware(maxLimit: number = 100, options?: { excludePaths?: string[] }) {
  const excludePaths = options?.excludePaths || [];
  return (req: Request, _res: Response, next: NextFunction) => {
    if (excludePaths.some(p => req.path.startsWith(p))) {
      return next();
    }
    if (req.query.limit) {
      const limit = parseInt(req.query.limit as string);
      if (isNaN(limit) || limit < 1) {
        req.query.limit = '20';
      } else {
        req.query.limit = String(Math.min(limit, maxLimit));
      }
    }
    if (req.query.offset) {
      const offset = parseInt(req.query.offset as string);
      if (isNaN(offset) || offset < 0) {
        req.query.offset = '0';
      }
    }
    next();
  };
}
