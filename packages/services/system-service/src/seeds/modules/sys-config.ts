import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

function toSqlTextOrNull(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${escSql(val)}'`;
}

function loadBackup(): Record<string, string>[] {
  const filePath = resolve(__dirname, '../data/sys_config_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const sysConfigSeed: SeedModule = {
  name: 'sys-config',
  description: 'Seed sys_config with system configuration flags',
  priority: 30,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as unknown as { execute(sql: string): Promise<unknown> };
    const configs = loadBackup();

    for (const c of configs) {
      const valueJson = typeof c.value === 'string' ? c.value : JSON.stringify(c.value);

      await db.execute(
        `INSERT INTO sys_config (id, key, value, description, updated_at, updated_by)
         VALUES (
           '${escSql(c.id)}',
           '${escSql(c.key)}',
           '${escSql(valueJson)}'::jsonb,
           ${toSqlTextOrNull(c.description)},
           NOW(),
           NULL
         )
         ON CONFLICT (id) DO UPDATE SET
           key = EXCLUDED.key,
           value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted config: ${c.key}`);
    }

    return result;
  },
};
