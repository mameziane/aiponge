/**
 * Schema Validator for Development
 *
 * Validates that database columns match the Drizzle schema at startup.
 * This catches schema mismatches early in development before they cause runtime errors.
 *
 * @example
 * import { validateSchema } from '@aiponge/platform-core';
 * import * as schema from './schema/music-schema';
 *
 * // In beforeStart hook:
 * await validateSchema({
 *   serviceName: 'music-service',
 *   schema,
 *   sql: getSQLConnection(),
 * });
 */

import type { SQLConnection } from './DatabaseConnectionFactory';
import { createLogger } from '../logging/logger.js';
import { serializeError } from '../logging/error-serializer.js';
import { getTableName, getTableColumns } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { is } from 'drizzle-orm';

export interface SchemaValidationConfig {
  serviceName: string;
  schema: Record<string, unknown>;
  sql: SQLConnection;
  failOnMismatch?: boolean;
}

export interface ColumnInfo {
  tableName: string;
  columnName: string;
  dataType: string;
}

export interface SchemaMismatch {
  type: 'missing_column' | 'extra_column' | 'type_mismatch';
  tableName: string;
  columnName: string;
  expected?: string;
  actual?: string;
}

export interface SchemaValidationResult {
  success: boolean;
  tablesChecked: number;
  columnsChecked: number;
  mismatches: SchemaMismatch[];
}

function isDrizzleTable(value: unknown): boolean {
  try {
    return is(value as PgTable, PgTable);
  } catch {
    return false;
  }
}

function extractColumnsFromDrizzleTable(table: unknown): Set<string> {
  const columnSet = new Set<string>();
  try {
    const cols = getTableColumns(table as PgTable);
    for (const col of Object.values(cols)) {
      columnSet.add((col as { name: string }).name);
    }
  } catch {
    // fallback: ignore
  }
  return columnSet;
}

async function fetchDatabaseColumns(sql: SQLConnection): Promise<Map<string, Set<string>>> {
  const dbColumnsResult = (await sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `) as Array<{ table_name: string; column_name: string; data_type: string }>;

  const dbColumns = new Map<string, Set<string>>();
  for (const row of dbColumnsResult) {
    const tableName = row.table_name as string;
    const columnName = row.column_name as string;

    if (!dbColumns.has(tableName)) {
      dbColumns.set(tableName, new Set());
    }
    dbColumns.get(tableName)!.add(columnName);
  }

  return dbColumns;
}

function compareTableColumns(
  expectedTables: Map<string, Set<string>>,
  dbColumns: Map<string, Set<string>>,
  logger: ReturnType<typeof createLogger>
): { columnsChecked: number; mismatches: SchemaMismatch[] } {
  const mismatches: SchemaMismatch[] = [];
  let columnsChecked = 0;

  for (const [tableName, expectedColumns] of expectedTables) {
    const actualColumns = dbColumns.get(tableName);

    if (!actualColumns) {
      logger.debug(`Table ${tableName} not found in database (may be in a different service)`);
      continue;
    }

    for (const expectedColumn of expectedColumns) {
      columnsChecked++;
      if (!actualColumns.has(expectedColumn)) {
        mismatches.push({
          type: 'missing_column',
          tableName,
          columnName: expectedColumn,
        });
      }
    }

    for (const actualColumn of actualColumns) {
      if (!expectedColumns.has(actualColumn)) {
        mismatches.push({
          type: 'extra_column',
          tableName,
          columnName: actualColumn,
        });
      }
    }
  }

  return { columnsChecked, mismatches };
}

function reportMismatches(
  mismatches: SchemaMismatch[],
  tablesChecked: number,
  columnsChecked: number,
  failOnMismatch: boolean,
  logger: ReturnType<typeof createLogger>
): void {
  if (mismatches.length === 0) {
    logger.debug('Schema validation passed', { tablesChecked, columnsChecked });
    return;
  }

  const missingColumns = mismatches.filter(m => m.type === 'missing_column');
  const extraColumns = mismatches.filter(m => m.type === 'extra_column');

  logger.error('❌ SCHEMA VALIDATION FAILED!', {
    tablesChecked,
    columnsChecked,
    missingCount: missingColumns.length,
    extraCount: extraColumns.length,
  });

  if (missingColumns.length > 0) {
    logger.error('Missing columns (code expects but database does not have):', {
      columns: missingColumns.map(m => `${m.tableName}.${m.columnName}`),
    });
  }

  if (extraColumns.length > 0) {
    logger.warn('Extra columns (database has but code does not expect):', {
      columns: extraColumns.map(m => `${m.tableName}.${m.columnName}`),
    });
  }

  logger.error('🔧 ACTION REQUIRED: Run "npm run db:push" in the service directory to sync the database schema');

  if (failOnMismatch) {
    throw new Error(
      `Schema validation failed: ${missingColumns.length} missing columns, ${extraColumns.length} extra columns. Run "npm run db:push" to fix.`
    );
  }
}

function extractTablesFromSchema(schema: Record<string, unknown>): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  for (const [_key, value] of Object.entries(schema)) {
    if (isDrizzleTable(value)) {
      try {
        const tableName = getTableName(value as PgTable);
        const columns = extractColumnsFromDrizzleTable(value);
        if (columns.size > 0) {
          tables.set(tableName, columns);
        }
      } catch {
        // skip non-table exports
      }
    }
  }

  return tables;
}

export async function validateSchema(config: SchemaValidationConfig): Promise<SchemaValidationResult> {
  const { serviceName, schema, sql, failOnMismatch = false } = config;
  const logger = createLogger(`${serviceName}-schema-validator`);
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    logger.debug('Schema validation skipped (not in development mode)');
    return { success: true, tablesChecked: 0, columnsChecked: 0, mismatches: [] };
  }

  const expectedTables = extractTablesFromSchema(schema);
  const mismatches: SchemaMismatch[] = [];
  let columnsChecked = 0;

  if (expectedTables.size === 0) {
    return { success: true, tablesChecked: 0, columnsChecked: 0, mismatches: [] };
  }

  logger.debug('Starting schema validation...', { tables: expectedTables.size });

  try {
    const dbColumns = await fetchDatabaseColumns(sql);

    const tableValidation = compareTableColumns(expectedTables, dbColumns, logger);
    columnsChecked = tableValidation.columnsChecked;
    mismatches.push(...tableValidation.mismatches);

    reportMismatches(mismatches, expectedTables.size, columnsChecked, failOnMismatch, logger);

    return {
      success: mismatches.length === 0,
      tablesChecked: expectedTables.size,
      columnsChecked,
      mismatches,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Schema validation failed')) {
      throw error;
    }

    logger.error('Schema validation error', {
      service: serviceName,
      error: serializeError(error),
    });

    return {
      success: false,
      tablesChecked: expectedTables.size,
      columnsChecked,
      mismatches: [],
    };
  }
}
