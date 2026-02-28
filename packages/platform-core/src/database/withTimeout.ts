import { sql } from 'drizzle-orm';
import { timeoutHierarchy } from '../config/timeout-hierarchy.js';

const DEFAULT_STATEMENT_TIMEOUT = parseInt(
  process.env.STATEMENT_TIMEOUT_MS || String(timeoutHierarchy.getDatabaseTimeout())
);

export async function withExtendedTimeout<T>(
  db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T> {
  await db.execute(sql`SET statement_timeout = ${timeoutMs}`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`SET statement_timeout = ${DEFAULT_STATEMENT_TIMEOUT}`);
  }
}
