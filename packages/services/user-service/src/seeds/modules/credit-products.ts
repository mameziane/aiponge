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
  const filePath = resolve(__dirname, '../data/usr_credit_products_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const creditProductsSeed: SeedModule = {
  name: 'credit-products',
  description: 'Seed usr_credit_products with all credit pack, session, and gift definitions',
  priority: 15,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as { execute: (sql: string) => Promise<unknown> };
    const products = loadBackup();

    for (const p of products) {
      const metadataJson = typeof p.metadata === 'string' ? p.metadata : JSON.stringify(p.metadata || {});

      await db.execute(
        `INSERT INTO usr_credit_products (id, product_id, product_type, name, description, credits, price_usd, is_active, is_popular, sort_order, metadata, created_at, updated_at)
         VALUES (
           '${escSql(p.id as string)}',
           '${escSql(p.product_id as string)}',
           '${escSql(p.product_type as string)}',
           '${escSql(p.name as string)}',
           '${escSql((p.description as string) || '')}',
           ${p.credits ?? 0},
           ${p.price_usd ?? 0},
           ${p.is_active ?? true},
           ${p.is_popular ?? false},
           ${p.sort_order ?? 0},
           '${escSql(metadataJson)}'::jsonb,
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           product_id = EXCLUDED.product_id,
           product_type = EXCLUDED.product_type,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           credits = EXCLUDED.credits,
           price_usd = EXCLUDED.price_usd,
           is_active = EXCLUDED.is_active,
           is_popular = EXCLUDED.is_popular,
           sort_order = EXCLUDED.sort_order,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted product: ${p.product_id} (${p.name})`);
    }

    return result;
  },
};
