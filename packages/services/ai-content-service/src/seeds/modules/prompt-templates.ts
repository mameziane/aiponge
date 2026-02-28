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

function toSqlJsonbOrNull(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  const json = typeof val === 'string' ? val : JSON.stringify(val);
  return `'${escSql(json)}'::jsonb`;
}

function toSqlTextOrNull(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${escSql(val)}'`;
}

function loadBackup(): Record<string, unknown>[] {
  const filePath = resolve(__dirname, '../data/aic_prompt_templates_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const promptTemplatesSeed: SeedModule = {
  name: 'prompt-templates',
  description: 'Seed aic_prompt_templates with all AI content prompt templates',
  priority: 25,
  dependencies: ['book-types'],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    // SeedContext.db type doesn't expose raw execute(); cast needed for seed SQL
    const db = ctx.db as { execute: (query: string) => Promise<{ rows: Record<string, unknown>[] }> };
    const templates = loadBackup();

    for (const t of templates) {
      await db.execute(
        `INSERT INTO aic_prompt_templates (
           id, name, description, content_type, category, tags,
           system_prompt, user_prompt_structure,
           required_variables, optional_variables,
           configuration, context_analysis_rules, inference_rules,
           cultural_adaptations, llm_compatibility, metadata,
           is_active, created_by, visibility,
           created_at, updated_at
         ) VALUES (
           '${escSql(t.id as string)}',
           '${escSql(t.name as string)}',
           ${toSqlTextOrNull(t.description as string)},
           '${escSql(t.content_type as string)}',
           '${escSql(t.category as string)}',
           ${toSqlArray((t.tags as string[]) || [])},
           ${toSqlTextOrNull(t.system_prompt as string)},
           ${toSqlTextOrNull(t.user_prompt_structure as string)},
           ${toSqlArray((t.required_variables as string[]) || [])},
           ${toSqlArray((t.optional_variables as string[]) || [])},
           ${toSqlJsonbOrNull(t.configuration)},
           ${toSqlJsonbOrNull(t.context_analysis_rules)},
           ${toSqlJsonbOrNull(t.inference_rules)},
           ${toSqlJsonbOrNull(t.cultural_adaptations)},
           ${toSqlJsonbOrNull(t.llm_compatibility)},
           ${toSqlJsonbOrNull(t.metadata)},
           ${t.is_active ?? true},
           ${toSqlTextOrNull((t.created_by as string) || 'system')},
           '${escSql((t.visibility as string) || 'shared')}',
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           content_type = EXCLUDED.content_type,
           category = EXCLUDED.category,
           tags = EXCLUDED.tags,
           system_prompt = EXCLUDED.system_prompt,
           user_prompt_structure = EXCLUDED.user_prompt_structure,
           required_variables = EXCLUDED.required_variables,
           optional_variables = EXCLUDED.optional_variables,
           configuration = EXCLUDED.configuration,
           context_analysis_rules = EXCLUDED.context_analysis_rules,
           inference_rules = EXCLUDED.inference_rules,
           cultural_adaptations = EXCLUDED.cultural_adaptations,
           llm_compatibility = EXCLUDED.llm_compatibility,
           metadata = EXCLUDED.metadata,
           is_active = EXCLUDED.is_active,
           visibility = EXCLUDED.visibility,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted template: ${t.id} (${t.content_type}/${t.category})`);
    }

    return result;
  },
};
