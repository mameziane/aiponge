/**
 * In-Memory Error Log Store
 * Stores recent errors with correlation IDs for admin dashboard viewing
 *
 * This provides quick access to recent errors without requiring external logging infrastructure.
 * In production, this would be supplemented with a proper logging system (ELK, Datadog, etc.)
 */

export interface StoredError {
  id: string;
  correlationId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  errorCode?: string;
  message: string;
  stack?: string;
  service?: string;
  userId?: string;
  userAgent?: string;
}

export interface ErrorLogQuery {
  correlationId?: string;
  path?: string;
  statusCode?: number;
  since?: Date;
  limit?: number;
}

class ErrorLogStoreImpl {
  private errors: StoredError[] = [];
  private readonly maxErrors = 500;

  /**
   * Store a new error in the log
   */
  addError(error: Omit<StoredError, 'id'>): void {
    const storedError: StoredError = {
      ...error,
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    this.errors.unshift(storedError);

    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }
  }

  /**
   * Get recent errors with optional filtering
   */
  getErrors(query: ErrorLogQuery = {}): StoredError[] {
    let results = [...this.errors];

    if (query.correlationId) {
      results = results.filter(e => e.correlationId.toLowerCase().includes(query.correlationId!.toLowerCase()));
    }

    if (query.path) {
      results = results.filter(e => e.path.toLowerCase().includes(query.path!.toLowerCase()));
    }

    if (query.statusCode) {
      results = results.filter(e => e.statusCode === query.statusCode);
    }

    if (query.since) {
      const sinceTime = query.since.getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    const limit = query.limit || 50;
    return results.slice(0, limit);
  }

  /**
   * Get a specific error by correlation ID
   */
  getByCorrelationId(correlationId: string): StoredError | undefined {
    return this.errors.find(e => e.correlationId === correlationId);
  }

  /**
   * Get error statistics
   */
  getStats(): {
    totalErrors: number;
    last24Hours: number;
    lastHour: number;
    byStatusCode: Record<number, number>;
    byPath: Record<string, number>;
  } {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const lastHour = this.errors.filter(e => new Date(e.timestamp).getTime() >= hourAgo).length;
    const last24Hours = this.errors.filter(e => new Date(e.timestamp).getTime() >= dayAgo).length;

    const byStatusCode: Record<number, number> = {};
    const byPath: Record<string, number> = {};

    for (const error of this.errors) {
      byStatusCode[error.statusCode] = (byStatusCode[error.statusCode] || 0) + 1;

      const pathKey = error.path.split('?')[0];
      byPath[pathKey] = (byPath[pathKey] || 0) + 1;
    }

    return {
      totalErrors: this.errors.length,
      last24Hours,
      lastHour,
      byStatusCode,
      byPath,
    };
  }

  /**
   * Clear all stored errors
   */
  clear(): void {
    this.errors = [];
  }
}

export const errorLogStore = new ErrorLogStoreImpl();
