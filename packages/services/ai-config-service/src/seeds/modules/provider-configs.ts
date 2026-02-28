import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

function loadBackup(): Record<string, unknown>[] {
  const filePath = resolve(__dirname, '../data/cfg_provider_configs_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const providerConfigsSeed: SeedModule = {
  name: 'provider-configs',
  description: 'Seed cfg_provider_configs with all AI provider definitions',
  priority: 15,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    // SeedContext.db type doesn't expose raw execute(); cast needed for seed SQL
    const db = ctx.db as { execute: (query: string) => Promise<unknown> };
    const providers = loadBackup();

    for (const p of providers) {
      const configJson = typeof p.configuration === 'string' ? p.configuration : JSON.stringify(p.configuration);

      await db.execute(
        `INSERT INTO cfg_provider_configs (id, provider_id, provider_name, provider_type, description, configuration, is_active, is_primary, priority, cost_per_unit, health_status, credit_cost, created_at, updated_at)
         VALUES (
           ${p.id},
           '${escSql(p.provider_id as string)}',
           '${escSql(p.provider_name as string)}',
           '${escSql(p.provider_type as string)}',
           '${escSql((p.description as string) || '')}',
           '${escSql(configJson)}'::jsonb,
           ${p.is_active ?? true},
           ${p.is_primary ?? false},
           ${p.priority ?? 100},
           ${p.cost_per_unit ?? 0},
           '${escSql((p.health_status as string) || 'unknown')}',
           ${p.credit_cost ?? 0},
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           provider_id = EXCLUDED.provider_id,
           provider_name = EXCLUDED.provider_name,
           provider_type = EXCLUDED.provider_type,
           description = EXCLUDED.description,
           configuration = EXCLUDED.configuration,
           is_active = EXCLUDED.is_active,
           is_primary = EXCLUDED.is_primary,
           priority = EXCLUDED.priority,
           cost_per_unit = EXCLUDED.cost_per_unit,
           health_status = EXCLUDED.health_status,
           credit_cost = EXCLUDED.credit_cost,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted provider: ${p.provider_id} (${p.provider_name})`);
    }

    return result;
  },
};
