import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

interface WelcomeBookData {
  id: string;
  typeId: string;
  title: string;
  subtitle: string;
  description: string;
  author: string;
  userId: string;
  isReadOnly: boolean;
  category: string;
  language: string;
  era: string;
  tradition: string;
  visibility: string;
  status: string;
  systemType: string;
}

function loadBackup(): WelcomeBookData[] {
  const filePath = resolve(__dirname, '../data/lib_welcome_books_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const welcomeBooksSeed: SeedModule = {
  name: 'welcome-books',
  description: 'Seed welcome guide books with localized titles, subtitles, era, tradition, and category',
  priority: 20,
  dependencies: ['system-users'],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as { execute: (sql: string) => Promise<unknown> };
    const books = loadBackup();

    for (const b of books) {
      await db.execute(
        `INSERT INTO lib_books (id, type_id, title, subtitle, description, author, user_id, is_read_only, category, language, era, tradition, visibility, status, system_type, chapter_count, entry_count, created_at, updated_at)
         VALUES (
           '${escSql(b.id)}',
           '${escSql(b.typeId)}',
           '${escSql(b.title)}',
           '${escSql(b.subtitle)}',
           '${escSql(b.description)}',
           '${escSql(b.author)}',
           '${escSql(b.userId)}',
           ${b.isReadOnly},
           '${escSql(b.category)}',
           '${escSql(b.language)}',
           '${escSql(b.era)}',
           '${escSql(b.tradition)}',
           '${escSql(b.visibility)}',
           '${escSql(b.status)}',
           '${escSql(b.systemType)}',
           0,
           0,
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           subtitle = EXCLUDED.subtitle,
           description = EXCLUDED.description,
           author = EXCLUDED.author,
           category = EXCLUDED.category,
           language = EXCLUDED.language,
           era = EXCLUDED.era,
           tradition = EXCLUDED.tradition,
           visibility = EXCLUDED.visibility,
           status = EXCLUDED.status,
           system_type = EXCLUDED.system_type,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted welcome book: ${b.systemType} (${b.language})`);
    }

    return result;
  },
};
