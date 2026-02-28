import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import type { SeedHistoryRecord } from './types.js';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sys_seed_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_name VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  result JSONB,
  error TEXT,
  executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sys_seed_history_name ON sys_seed_history(seed_name);
CREATE INDEX IF NOT EXISTS idx_sys_seed_history_name_version ON sys_seed_history(seed_name, version);
`;

export async function ensureSeedHistoryTable(db: NodePgDatabase<Record<string, unknown>>): Promise<void> {
  const statements = CREATE_TABLE_SQL.split(';')
    .map(s => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await db.execute(sql.raw(`${stmt};`));
  }
}

export async function getLastSuccessfulRun(
  db: NodePgDatabase<Record<string, unknown>>,
  seedName: string
): Promise<{ version: string; executedAt: Date } | null> {
  const rows = await db.execute(
    sql`SELECT version, executed_at FROM sys_seed_history
     WHERE seed_name = ${seedName} AND status = 'success'
     ORDER BY executed_at DESC LIMIT 1`
  );
  if (!rows?.rows?.length) return null;
  const row = rows.rows[0] as { version: string; executed_at: string };
  return { version: row.version, executedAt: new Date(row.executed_at) };
}

export async function recordSeedRun(
  db: NodePgDatabase<Record<string, unknown>>,
  record: SeedHistoryRecord
): Promise<void> {
  await db.execute(
    sql`INSERT INTO sys_seed_history (seed_name, version, status, result, error, executed_at, duration_ms)
     VALUES (${record.seedName}, ${record.version}, ${record.status},
     ${JSON.stringify(record.result || {})}::jsonb,
     ${record.error ? record.error : null},
     NOW(), ${record.durationMs})`
  );
}
