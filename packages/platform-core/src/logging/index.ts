/**
 * Logging Module - Index
 *
 * Exports all logging functionality for platform-core
 */

// Types
export * from './types.js';

// Core logger
export * from './logger.js';

// Formatting utilities
export * from './formatting.js';

// Middleware
export * from './middleware.js';

// Correlation context
export * from './correlation.js';

// Utilities
export * from './utilities.js';

// Error serialization for logging
export * from './error-serializer.js';

// Simple logger compatibility layer
export { getSimpleLogger, getLogger as getSimpleLoggerCompat } from './simple.js';
export type { SimpleLogger } from './simple.js';

// Main logger export for shared-backend compatibility
export { getLogger } from './logger.js';

// Re-export winston for convenience
import * as winston from 'winston';
export { winston };
