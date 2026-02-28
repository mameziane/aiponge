import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

function toSqlArray(arr: string[]): string {
  if (!arr || arr.length === 0) return 'ARRAY[]::text[]';
  const items = arr.map(s => `'${escSql(s)}'`).join(',');
  return `ARRAY[${items}]::text[]`;
}

function loadBackup(): Record<string, unknown>[] {
  const filePath = resolve(__dirname, '../data/cfg_psychological_frameworks_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const psychologicalFrameworksSeed: SeedModule = {
  name: 'psychological-frameworks',
  description: 'Seed cfg_psychological_frameworks with all 29 framework definitions',
  priority: 15,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    // SeedContext.db type doesn't expose raw execute(); cast needed for seed SQL
    const db = ctx.db as { execute: (query: string) => Promise<unknown> };
    const frameworks = loadBackup();

    for (const fw of frameworks) {
      await db.execute(
        `INSERT INTO cfg_psychological_frameworks (id, name, short_name, category, description, key_principles, therapeutic_goals, trigger_patterns, song_structure_hint, is_enabled, sort_order, created_at, updated_at)
         VALUES (
           '${escSql(fw.id as string)}',
           '${escSql(fw.name as string)}',
           '${escSql(fw.short_name as string)}',
           '${escSql(fw.category as string)}',
           '${escSql(fw.description as string)}',
           ${toSqlArray(fw.key_principles as string[])},
           ${toSqlArray(fw.therapeutic_goals as string[])},
           ${toSqlArray(fw.trigger_patterns as string[])},
           ${fw.song_structure_hint ? `'${escSql(fw.song_structure_hint as string)}'` : 'NULL'},
           ${fw.is_enabled ?? true},
           ${fw.sort_order ?? 0},
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           short_name = EXCLUDED.short_name,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           key_principles = EXCLUDED.key_principles,
           therapeutic_goals = EXCLUDED.therapeutic_goals,
           trigger_patterns = EXCLUDED.trigger_patterns,
           song_structure_hint = EXCLUDED.song_structure_hint,
           is_enabled = EXCLUDED.is_enabled,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted framework: ${fw.id as string} (${fw.short_name as string})`);
    }

    return result;
  },
};
