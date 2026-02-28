import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

function toSqlJsonbOrNull(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  const json = typeof val === 'string' ? val : JSON.stringify(val);
  return `'${escSql(json)}'::jsonb`;
}

function toSqlTextOrNull(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${escSql(val)}'`;
}

function loadBackup(): Record<string, string>[] {
  const filePath = resolve(__dirname, '../data/sys_service_dependencies_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const serviceDependenciesSeed: SeedModule = {
  name: 'service-dependencies',
  description: 'Seed sys_service_dependencies with service dependency graph',
  priority: 30,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as unknown as { execute(sql: string): Promise<unknown> };
    const deps = loadBackup();

    for (const d of deps) {
      await db.execute(
        `INSERT INTO sys_service_dependencies (id, service_id, dependency_name, dependency_type, timeout, health_check, is_required, metadata, created_at, updated_at)
         VALUES (
           '${escSql(d.id)}',
           '${escSql(d.service_id)}',
           '${escSql(d.dependency_name)}',
           '${escSql(d.dependency_type)}',
           ${d.timeout ?? 5000},
           ${toSqlTextOrNull(d.health_check)},
           ${d.is_required ?? true},
           ${toSqlJsonbOrNull(d.metadata)},
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           service_id = EXCLUDED.service_id,
           dependency_name = EXCLUDED.dependency_name,
           dependency_type = EXCLUDED.dependency_type,
           timeout = EXCLUDED.timeout,
           health_check = EXCLUDED.health_check,
           is_required = EXCLUDED.is_required,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted dependency: ${d.dependency_name} (${d.dependency_type})`);
    }

    return result;
  },
};
