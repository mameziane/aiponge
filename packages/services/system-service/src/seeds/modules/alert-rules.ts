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

function toSqlTextArray(arr: string[]): string {
  if (!arr || arr.length === 0) return 'ARRAY[]::text[]';
  const items = arr.map(s => `'${escSql(s)}'`).join(',');
  return `ARRAY[${items}]::text[]`;
}

function loadBackup(): Record<string, any>[] {
  const filePath = resolve(__dirname, '../data/sys_alert_rules_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const alertRulesSeed: SeedModule = {
  name: 'alert-rules',
  description: 'Seed sys_alert_rules with monitoring alert rule definitions',
  priority: 30,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as unknown as { execute(sql: string): Promise<unknown> };
    const rules = loadBackup();

    for (const r of rules) {
      await db.execute(
        `INSERT INTO sys_alert_rules (id, name, description, condition_type, condition_config, severity, is_enabled, notification_channels, cooldown_minutes, metadata, created_at, updated_at)
         VALUES (
           '${escSql(r.id)}',
           '${escSql(r.name)}',
           '${escSql(r.description || '')}',
           '${escSql(r.condition_type)}',
           ${toSqlJsonbOrNull(r.condition_config)},
           '${escSql(r.severity)}',
           ${r.is_enabled ?? true},
           ${toSqlTextArray(r.notification_channels || [])},
           ${r.cooldown_minutes ?? 5},
           ${toSqlJsonbOrNull(r.metadata)},
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           condition_type = EXCLUDED.condition_type,
           condition_config = EXCLUDED.condition_config,
           severity = EXCLUDED.severity,
           is_enabled = EXCLUDED.is_enabled,
           notification_channels = EXCLUDED.notification_channels,
           cooldown_minutes = EXCLUDED.cooldown_minutes,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted alert rule: ${r.name} (${r.severity})`);
    }

    return result;
  },
};
