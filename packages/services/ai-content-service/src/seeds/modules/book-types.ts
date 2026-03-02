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
  const filePath = resolve(__dirname, '../data/lib_book_types_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const bookTypesSeed: SeedModule = {
  name: 'book-types',
  description: 'Seed lib_book_types with all 32 book type definitions (8 categories × 4 types)',
  priority: 15,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    // SeedContext.db type doesn't expose raw execute(); cast needed for seed SQL
    const db = ctx.db as { execute: (query: string) => Promise<{ rows: Record<string, unknown>[] }> };
    const bookTypes = loadBackup();

    for (const bt of bookTypes) {
      const defaultSettings =
        typeof bt.default_settings === 'string' ? bt.default_settings : JSON.stringify(bt.default_settings);

      await db.execute(
        `INSERT INTO lib_book_types (id, name, description, prompt_template_id, default_settings, icon_name, is_user_creatable, is_editable, sort_order, category, created_at, updated_at)
         VALUES (
           '${escSql(bt.id as string)}',
           '${escSql(bt.name as string)}',
           '${escSql((bt.description as string) || '')}',
           ${bt.prompt_template_id ? `'${escSql(bt.prompt_template_id as string)}'` : 'NULL'},
           '${escSql(defaultSettings)}'::jsonb,
           ${bt.icon_name ? `'${escSql(bt.icon_name as string)}'` : 'NULL'},
           ${bt.is_user_creatable ?? true},
           ${bt.is_editable ?? true},
           ${bt.sort_order ?? 0},
           ${bt.category ? `'${escSql(bt.category as string)}'` : 'NULL'},
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           prompt_template_id = EXCLUDED.prompt_template_id,
           default_settings = EXCLUDED.default_settings,
           icon_name = EXCLUDED.icon_name,
           is_user_creatable = EXCLUDED.is_user_creatable,
           is_editable = EXCLUDED.is_editable,
           sort_order = EXCLUDED.sort_order,
           category = EXCLUDED.category,
           updated_at = NOW()`
      );

      const existing = await db.execute(
        `SELECT id FROM lib_book_types WHERE id = '${escSql(bt.id as string)}' AND updated_at < NOW() - INTERVAL '1 second'`
      );

      if (existing?.rows?.length > 0) {
        result.updated++;
        result.details!.push(`Updated book type: ${bt.id}`);
      } else {
        result.created++;
        result.details!.push(`Created/verified book type: ${bt.id}`);
      }
    }

    return result;
  },
};
