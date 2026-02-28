/**
 * Simple Logger
 *
 * Provides a simple console-like logger interface using Winston underneath.
 */

import { getLogger as getWinstonLogger } from './logger.js';

export interface SimpleLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
}

/**
 * Create a simple logger with the given context
 */
export function getSimpleLogger(context = 'default'): SimpleLogger {
  const logger = getWinstonLogger(context);

  return {
    info: (...args) => logger.info(args.join(' ')),
    warn: (...args) => logger.warn(args.join(' ')),
    error: (...args) => logger.error(args.join(' ')),
    debug: (...args) => logger.debug(args.join(' ')),
    log: (...args) => logger.info(args.join(' ')),
  };
}

export { getSimpleLogger as getLogger };
export default { getLogger: getSimpleLogger };
