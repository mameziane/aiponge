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
  const filePath = resolve(__dirname, '../data/usr_guest_conversion_policy_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const guestConversionPolicySeed: SeedModule = {
  name: 'guest-conversion-policy',
  description: 'Seed usr_guest_conversion_policy with default conversion thresholds',
  priority: 15,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as { execute: (sql: string) => Promise<unknown> };
    const policies = loadBackup();

    for (const p of policies) {
      await db.execute(
        `INSERT INTO usr_guest_conversion_policy (id, policy_name, songs_threshold, tracks_threshold, entries_created_threshold, cooldown_hours, is_active, created_at, updated_at)
         VALUES (
           ${p.id},
           '${escSql(p.policy_name as string)}',
           ${p.songs_threshold ?? 1},
           ${p.tracks_threshold ?? 5},
           ${p.entries_created_threshold ?? 3},
           ${p.cooldown_hours ?? 24},
           ${p.is_active ?? true},
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           policy_name = EXCLUDED.policy_name,
           songs_threshold = EXCLUDED.songs_threshold,
           tracks_threshold = EXCLUDED.tracks_threshold,
           entries_created_threshold = EXCLUDED.entries_created_threshold,
           cooldown_hours = EXCLUDED.cooldown_hours,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted policy: ${p.policy_name}`);
    }

    return result;
  },
};
