/**
 * Logger
 *
 * Winston logger creation and management
 */

import * as winston from 'winston';
import { hostname } from 'os';
import { LoggerMeta } from './types';
import { correlationStorage } from './correlation';
import { createDevFormat, createProdFormat } from './formatting';

/**
 * Create a Winston logger instance
 */
export function createLogger(serviceName: string, options: Partial<LoggerMeta> = {}): winston.Logger {
  const meta: LoggerMeta = {
    service: serviceName,
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version,
    instanceId: process.env.INSTANCE_ID || process.env.HOSTNAME || process.env.POD_NAME || hostname() || 'unknown',
    ...options,
  };

  const getLogLevel = (): string => {
    if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;

    const nodeEnv = process.env.NODE_ENV as string;
    switch (nodeEnv) {
      case 'production':
        return 'info';
      case 'staging':
        return 'debug';
      case 'test':
        return 'warn';
      default:
        return 'debug';
    }
  };

  const isDevelopment = process.env.NODE_ENV === 'development';

  return winston.createLogger({
    level: getLogLevel(),
    defaultMeta: meta,
    format: isDevelopment ? createDevFormat(correlationStorage) : createProdFormat(correlationStorage),
    transports: [
      new winston.transports.Console(),
      ...(isDevelopment
        ? [
            new winston.transports.File({
              filename: `logs/${serviceName}-error.log`,
              level: 'error',
              maxsize: 10 * 1024 * 1024,
              maxFiles: 5,
            }),
            new winston.transports.File({
              filename: `logs/${serviceName}-combined.log`,
              maxsize: 10 * 1024 * 1024,
              maxFiles: 5,
            }),
          ]
        : []),
    ],
    // NOTE: Removed exceptionHandlers and rejectionHandlers to prevent duplicate
    // global error handler registration. ErrorHandlerManager provides centralized
    // global error handling, eliminating the need for per-logger handlers.
    // This reduces process listener count from ~31 to 2-3.
  });
}

/**
 * Get or create a logger
 */
const loggers = new Map<string, winston.Logger>();

export function getLogger(serviceOrModule: string): winston.Logger {
  if (!loggers.has(serviceOrModule)) {
    loggers.set(serviceOrModule, createLogger(serviceOrModule));
  }
  return loggers.get(serviceOrModule)!;
}
