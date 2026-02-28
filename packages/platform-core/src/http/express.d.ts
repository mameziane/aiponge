declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
      serviceName?: string;
      userId?: string;
    }
  }
}
export {};
