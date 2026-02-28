import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LIBRARIAN_USER_ID = 'a027c10e-0c6b-4bfe-bf5c-1c92a1f5d55c';

const SUPPORTED_LANGUAGES = [
  { code: 'en', localeFile: 'en-US.json' },
  { code: 'es', localeFile: 'es-ES.json' },
  { code: 'pt', localeFile: 'pt-BR.json' },
  { code: 'de', localeFile: 'de-DE.json' },
  { code: 'fr', localeFile: 'fr-FR.json' },
  { code: 'ar', localeFile: 'ar.json' },
  { code: 'ja', localeFile: 'ja-JP.json' },
];

const BOOK_TYPE_KEYS = [
  'personal',
  'wisdom',
  'memoir',
  'fiction',
  'poetry',
  'affirmations',
  'meditation',
  'growth',
  'children',
  'educational',
  'philosophy',
  'dreams',
  'quotes',
  'scientific',
] as const;

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

function loadLocale(localeFile: string): Record<string, unknown> {
  const localesDir = resolve(__dirname, '../../../../../../apps/aiponge/src/i18n/locales');
  const filePath = resolve(localesDir, localeFile);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

interface ChapterDef {
  key: string;
  sortOrder: number;
  entries: EntryDef[];
}

interface EntryDef {
  content: string;
  entryType: string;
  sortOrder: number;
  tags?: string[];
}

function buildBookStructure(locale: Record<string, unknown>): {
  title: string;
  description: string;
  chapters: ChapterDef[];
} {
  const typedLocale = locale as Record<string, Record<string, unknown>>;
  const wb = typedLocale.welcomeBook as Record<string, unknown>;
  const wbEntries = wb.entries as Record<string, string>;
  const manifesto = typedLocale.manifesto as Record<string, Record<string, string>> | undefined;
  const ethics = typedLocale.ethics as Record<string, Record<string, string>> | undefined;
  const bookTypes = (typedLocale.books as Record<string, Record<string, Record<string, string>>> | undefined)?.types;

  const ch1Entries: EntryDef[] = [
    {
      content: `**${wbEntries.entriesBecomeSongs}**\n\n${wbEntries.entriesBecomeSongsContent}`,
      entryType: 'note',
      sortOrder: 0,
      tags: ['introduction'],
    },
    {
      content: `**${wbEntries.howItWorks}**\n\n${wbEntries.howItWorksContent}`,
      entryType: 'note',
      sortOrder: 1,
      tags: ['how-it-works'],
    },
  ];

  const ch2Entries: EntryDef[] = [];
  if (manifesto) {
    const sections = ['section1', 'section2', 'section3', 'section4'];
    sections.forEach((key, idx) => {
      const section = manifesto[key];
      if (section) {
        ch2Entries.push({
          content: `**${section.title}**\n\n${section.content}`,
          entryType: 'note',
          sortOrder: idx,
          tags: ['manifesto'],
        });
      }
    });
    if (manifesto.footer) {
      ch2Entries.push({
        content: `${manifesto.footer.quote1}\n${manifesto.footer.quote2}\n— ${manifesto.footer.source}`,
        entryType: 'quote',
        sortOrder: ch2Entries.length,
        tags: ['manifesto', 'delphic'],
      });
    }
  }

  const ch3Entries: EntryDef[] = [];
  BOOK_TYPE_KEYS.forEach((typeKey, idx) => {
    const typeName = bookTypes?.[typeKey]?.name || typeKey;
    const typeDesc = bookTypes?.[typeKey]?.description || '';
    const songTieIn = wb.songTieIn?.[typeKey] || '';

    let content = `**${typeName}**\n\n${typeDesc}`;
    if (songTieIn) {
      content += `\n\n🎵 ${songTieIn}`;
    }

    ch3Entries.push({
      content,
      entryType: 'note',
      sortOrder: idx,
      tags: ['book-type', typeKey],
    });
  });

  const ch4Entries: EntryDef[] = [];
  if (ethics) {
    const ethicsSections = [
      'section1',
      'section2',
      'section3',
      'section4',
      'section5',
      'section6',
      'section7',
      'section8',
    ];
    ethicsSections.forEach((key, idx) => {
      const section = ethics[key];
      if (section) {
        let content = `**${section.title}**\n\n${section.description}`;
        const bullets: string[] = [];
        for (let i = 1; i <= 5; i++) {
          const bullet = section[`bullet${i}`];
          if (bullet) bullets.push(`• ${bullet}`);
        }
        if (bullets.length > 0) {
          content += '\n\n' + bullets.join('\n');
        }
        ch4Entries.push({
          content,
          entryType: 'note',
          sortOrder: idx,
          tags: ['ethics'],
        });
      }
    });

    if (ethics.commitment) {
      ch4Entries.push({
        content: `**${ethics.commitment.title}**\n\n${ethics.commitment.text}\n\n_${ethics.commitment.tagline}_`,
        entryType: 'note',
        sortOrder: ch4Entries.length,
        tags: ['ethics', 'commitment'],
      });
    }
  }

  return {
    title: wb.title as string,
    description: wb.description as string,
    chapters: [
      { key: 'welcome', sortOrder: 0, entries: ch1Entries },
      { key: 'manifesto', sortOrder: 1, entries: ch2Entries },
      { key: 'whatYouCanCreate', sortOrder: 2, entries: ch3Entries },
      { key: 'ethicsValues', sortOrder: 3, entries: ch4Entries },
    ],
  };
}

export const welcomeBooksSeed: SeedModule = {
  name: 'welcome-books',
  description: 'Create localized Welcome to aiponge books for all supported languages',
  priority: 20,
  dependencies: [],
  version: '1.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    // SeedContext.db type doesn't expose raw execute(); cast needed for seed SQL
    const db = ctx.db as { execute: (query: string) => Promise<{ rows: Record<string, unknown>[] }> };

    for (const lang of SUPPORTED_LANGUAGES) {
      const systemType = `welcome-guide-${lang.code}`;

      const existingBook = await db.execute(
        `SELECT id FROM lib_books WHERE user_id = '${LIBRARIAN_USER_ID}' AND system_type = '${systemType}' AND deleted_at IS NULL`
      );

      if (existingBook?.rows?.length > 0) {
        const bookId = existingBook.rows[0].id;
        await db.execute(`DELETE FROM lib_illustrations WHERE book_id = '${bookId}'`);
        await db.execute(`DELETE FROM lib_entries WHERE book_id = '${bookId}'`);
        await db.execute(`DELETE FROM lib_chapters WHERE book_id = '${bookId}'`);
        await db.execute(`DELETE FROM lib_books WHERE id = '${bookId}'`);
        result.deleted++;
        result.details!.push(`Replaced existing ${lang.code} welcome book`);
      }

      let locale: Record<string, unknown>;
      try {
        locale = loadLocale(lang.localeFile);
      } catch (err) {
        result.details!.push(`Failed to load locale ${lang.localeFile}: ${err}`);
        continue;
      }

      const structure = buildBookStructure(locale);

      const bookInsert = await db.execute(
        `INSERT INTO lib_books (user_id, type_id, title, description, author, language, visibility, status, system_type, is_read_only, chapter_count, entry_count, created_by, updated_by)
         VALUES ('${LIBRARIAN_USER_ID}', 'personal', '${escSql(structure.title)}', '${escSql(structure.description)}', 'aiponge', '${lang.code}', 'shared', 'active', '${systemType}', true, ${structure.chapters.length}, ${structure.chapters.reduce((sum, ch) => sum + ch.entries.length, 0)}, '${LIBRARIAN_USER_ID}', '${LIBRARIAN_USER_ID}')
         RETURNING id`
      );

      const bookId = bookInsert.rows[0].id;

      for (const chapter of structure.chapters) {
        const wbChapters = (locale.welcomeBook as Record<string, unknown>).chapters as Record<string, string>;
        const chapterTitle = wbChapters[chapter.key] || chapter.key;

        const chapterInsert = await db.execute(
          `INSERT INTO lib_chapters (book_id, user_id, title, sort_order, entry_count)
           VALUES ('${bookId}', '${LIBRARIAN_USER_ID}', '${escSql(chapterTitle)}', ${chapter.sortOrder}, ${chapter.entries.length})
           RETURNING id`
        );

        const chapterId = chapterInsert.rows[0].id;

        for (const entry of chapter.entries) {
          const tagsArray = entry.tags?.length
            ? `ARRAY[${entry.tags.map(t => `'${escSql(t)}'`).join(',')}]::text[]`
            : "'{}'::text[]";

          await db.execute(
            `INSERT INTO lib_entries (chapter_id, book_id, user_id, content, entry_type, sort_order, processing_status, tags)
             VALUES ('${chapterId}', '${bookId}', '${LIBRARIAN_USER_ID}', '${escSql(entry.content)}', '${entry.entryType}', ${entry.sortOrder}, 'completed', ${tagsArray})`
          );
        }
      }

      result.details!.push(`Cover for ${lang.code} welcome book should be generated via GenerateBookCoverUseCase`);

      result.created++;
      result.details!.push(
        `Created ${lang.code} welcome book: "${structure.title}" (${structure.chapters.reduce((sum, ch) => sum + ch.entries.length, 0)} entries)`
      );
    }

    return result;
  },
};
