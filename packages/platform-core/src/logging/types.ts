/**
 * Logging Types
 *
 * Interfaces and types for logging functionality
 */

// Re-export winston types for convenience
export type { Logger } from 'winston';

export interface LogContext {
  correlationId?: string;
  service?: string;
  module?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface LoggerMeta {
  service: string;
  env: string;
  version?: string;
  instanceId?: string;
}
