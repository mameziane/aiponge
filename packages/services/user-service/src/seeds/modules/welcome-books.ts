import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

interface EntryData {
  content: string;
  entryType: string;
  sortOrder: number;
  tags: string[];
}

interface ChapterData {
  title: string;
  sortOrder: number;
  entries: EntryData[];
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
  visibility: string;
  status: string;
  systemType: string;
  chapters?: ChapterData[];
}

function loadBackup(): WelcomeBookData[] {
  const filePath = resolve(__dirname, '../data/lib_welcome_books_backup.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export const welcomeBooksSeed: SeedModule = {
  name: 'welcome-books',
  description: 'Seed welcome guide books with localized chapters, entries, and metadata',
  priority: 20,
  dependencies: ['system-users'],
  version: '2.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as { execute: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };
    const books = loadBackup();

    for (const b of books) {
      const chapters = b.chapters || [];
      const chapterCount = chapters.length;
      const entryCount = chapters.reduce((sum, ch) => sum + ch.entries.length, 0);

      // Upsert book metadata
      await db.execute(
        `INSERT INTO lib_books (id, type_id, title, subtitle, description, author, user_id, is_read_only, category, language, visibility, status, system_type, chapter_count, entry_count, created_at, updated_at)
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
           '${escSql(b.visibility)}',
           '${escSql(b.status)}',
           '${escSql(b.systemType)}',
           ${chapterCount},
           ${entryCount},
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
           visibility = EXCLUDED.visibility,
           status = EXCLUDED.status,
           system_type = EXCLUDED.system_type,
           chapter_count = EXCLUDED.chapter_count,
           entry_count = EXCLUDED.entry_count,
           updated_at = NOW()`
      );

      // Skip chapter seeding if no chapters in backup
      if (chapters.length === 0) {
        result.created++;
        result.details!.push(`Upserted welcome book (no chapters): ${b.systemType} (${b.language})`);
        continue;
      }

      // Check if chapters already exist for this book
      const existingChapters = await db.execute(
        `SELECT id FROM lib_chapters WHERE book_id = '${escSql(b.id)}' AND deleted_at IS NULL LIMIT 1`
      );

      if (existingChapters?.rows?.length > 0) {
        result.updated++;
        result.details!.push(`Updated book metadata (chapters exist): ${b.systemType} (${b.language})`);
        continue;
      }

      // Seed chapters and entries
      for (const chapter of chapters) {
        const chapterResult = await db.execute(
          `INSERT INTO lib_chapters (book_id, user_id, title, sort_order, entry_count)
           VALUES ('${escSql(b.id)}', '${escSql(b.userId)}', '${escSql(chapter.title)}', ${chapter.sortOrder}, ${chapter.entries.length})
           RETURNING id`
        );

        const chapterId = chapterResult.rows[0].id as string;

        for (const entry of chapter.entries) {
          const tagsArray =
            entry.tags?.length > 0
              ? `ARRAY[${entry.tags.map((t: string) => `'${escSql(t)}'`).join(',')}]::text[]`
              : "'{}'::text[]";

          await db.execute(
            `INSERT INTO lib_entries (chapter_id, book_id, user_id, content, entry_type, sort_order, processing_status, tags)
             VALUES ('${chapterId}', '${escSql(b.id)}', '${escSql(b.userId)}', '${escSql(entry.content)}', '${escSql(entry.entryType)}', ${entry.sortOrder}, 'completed', ${tagsArray})`
          );
        }
      }

      result.created++;
      result.details!.push(
        `Created welcome book with ${chapterCount} chapters, ${entryCount} entries: ${b.systemType} (${b.language})`
      );
    }

    return result;
  },
};
