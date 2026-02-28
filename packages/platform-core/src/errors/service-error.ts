export interface ServiceErrorOptions {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export class ServiceError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(name: string, message: string, options: ServiceErrorOptions = {}) {
    super(message);
    this.name = name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code;
    this.details = options.details;
  }
}

export function createServiceError(name: string, defaultStatusCode: number = 500) {
  return class extends ServiceError {
    constructor(message: string, details?: Record<string, unknown>) {
      super(name, message, { statusCode: defaultStatusCode, details });
    }
  };
}
