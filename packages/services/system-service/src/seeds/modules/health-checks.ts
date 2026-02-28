import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

function loadBackup(): Record<string, string>[] {
  const filePath = resolve(__dirname, '../data/sys_health_checks_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const healthChecksSeed: SeedModule = {
  name: 'health-checks',
  description: 'Seed sys_health_checks with service health check definitions',
  priority: 30,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as unknown as { execute(sql: string): Promise<unknown> };
    const checks = loadBackup();

    for (const c of checks) {
      const metadataJson =
        c.metadata != null
          ? `'${escSql(typeof c.metadata === 'string' ? c.metadata : JSON.stringify(c.metadata))}'::jsonb`
          : 'NULL';

      await db.execute(
        `INSERT INTO sys_health_checks (id, service_name, check_type, endpoint, interval_seconds, timeout_ms, retry_count, is_enabled, metadata, created_at, updated_at)
         VALUES (
           '${escSql(c.id)}',
           '${escSql(c.service_name)}',
           '${escSql(c.check_type)}',
           '${escSql(c.endpoint)}',
           ${c.interval_seconds ?? 30},
           ${c.timeout_ms ?? 5000},
           ${c.retry_count ?? 2},
           ${c.is_enabled ?? true},
           ${metadataJson},
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           service_name = EXCLUDED.service_name,
           check_type = EXCLUDED.check_type,
           endpoint = EXCLUDED.endpoint,
           interval_seconds = EXCLUDED.interval_seconds,
           timeout_ms = EXCLUDED.timeout_ms,
           retry_count = EXCLUDED.retry_count,
           is_enabled = EXCLUDED.is_enabled,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted health check: ${c.service_name} (${c.check_type})`);
    }

    return result;
  },
};
