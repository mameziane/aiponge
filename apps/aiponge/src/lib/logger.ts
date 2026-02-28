/**
 * Production-Ready Logging Utility
 *
 * Features:
 * - Environment-aware log levels (DEBUG disabled in production)
 * - Structured logging with context
 * - TypeScript support
 * - Drop-in replacement for console.log
 * - Performance-optimized (no-op in production for debug logs)
 *
 * Usage:
 * import { logger } from '@/lib/logger';
 *
 * logger.debug('Detailed debug info', { userId, trackId });
 * logger.info('User action completed', { action: 'play_track' });
 * logger.warn('Deprecated feature used', { feature: 'oldApi' });
 * logger.error('Request failed', error, { url, correlationId });
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment: boolean;
  private logLevel: LogLevel;

  constructor() {
    // Detect environment - __DEV__ is set by Metro bundler in React Native
    this.isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

    // Set log level based on environment
    this.logLevel = this.isDevelopment ? 'DEBUG' : 'INFO';

    // Startup diagnostic - always logs to verify logger is working
    console.log(
      `[aiponge-logger] Initialized: isDev=${this.isDevelopment}, level=${this.logLevel}, __DEV__=${typeof __DEV__ !== 'undefined' ? __DEV__ : 'undefined'}`
    );
  }

  /**
   * Format log message with timestamp and context
   */
  private format(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (context && Object.keys(context).length > 0) {
      return `${prefix} ${message}`;
    }

    return `${prefix} ${message}`;
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * DEBUG: Detailed information for debugging
   * Disabled in production for performance
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('DEBUG')) return;

    console.log(this.format('DEBUG', message, context), context || '');
  }

  /**
   * INFO: General informational messages
   * Useful for tracking user flows and important events
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('INFO')) return;

    console.log(this.format('INFO', message, context), context || '');
  }

  /**
   * WARN: Warning messages for potentially harmful situations
   * Something unexpected but application can continue
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('WARN')) return;

    console.warn(this.format('WARN', message, context), context || '');
  }

  /**
   * ERROR: Error messages for serious problems
   * Application may not continue normally
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.shouldLog('ERROR')) return;

    // SAFETY: error.stack access is guarded with try/catch.
    // On iPhone OS 26 with a corrupted Hermes GC heap (e.g. after a TurboModule
    // NSException), the error.stack getter calls errorStackGetter → _newChunkAndPHV
    // which crashes with EXC_BAD_ACCESS on the corrupted pointer. We must not let
    // the logger itself become the crash site.
    let safeStack: string[] | undefined;
    if (error instanceof Error) {
      try {
        safeStack = error.stack?.split('\n').slice(0, 5);
      } catch {
        safeStack = ['[error.stack threw]'];
      }
    }
    const errorContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: safeStack,
            }
          : error,
    };

    console.error(this.format('ERROR', message, errorContext), errorContext);
  }

  /**
   * Create a child logger with persistent context
   * Useful for adding context like userId, trackId, etc.
   */
  child(persistentContext: LogContext): ChildLogger {
    return new ChildLogger(this, persistentContext);
  }

  /**
   * Set log level programmatically (useful for testing)
   */
  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

/**
 * Child logger with persistent context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: LogContext
  ) {}

  debug(message: string, additionalContext?: LogContext): void {
    this.parent.debug(message, { ...this.context, ...additionalContext });
  }

  info(message: string, additionalContext?: LogContext): void {
    this.parent.info(message, { ...this.context, ...additionalContext });
  }

  warn(message: string, additionalContext?: LogContext): void {
    this.parent.warn(message, { ...this.context, ...additionalContext });
  }

  error(message: string, error?: Error | unknown, additionalContext?: LogContext): void {
    this.parent.error(message, error, { ...this.context, ...additionalContext });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger };
