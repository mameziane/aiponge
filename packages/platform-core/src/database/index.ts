/**
 * Database Module
 *
 * Centralized database connection management for all microservices.
 */

export {
  createDatabaseConnectionFactory,
  resetAllDatabaseConnections,
  DatabaseConnectionFactoryClass,
  type DatabaseConfig,
  type DatabaseConnectionFactoryInstance,
  type SQLConnection,
} from './DatabaseConnectionFactory.js';

export {
  validateSchema,
  type SchemaValidationConfig,
  type SchemaValidationResult,
  type SchemaMismatch,
  type ColumnInfo,
} from './schema-validator.js';

export { withExtendedTimeout } from './withTimeout.js';
