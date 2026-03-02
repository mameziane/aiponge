import { useState, useCallback } from 'react';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, NativeModules } from 'react-native';

// expo-print is imported lazily inside each function that uses it.
// A top-level import causes 'Cannot find native module ExpoPrint' to throw
// at module load time, which prevents the entire route from mounting and
// cascades into an Expo Router ErrorBoundary failure.
// Lazy require means the error only surfaces when the user taps Print/Export,
// where it can be caught and shown as an Alert rather than a route crash.
//
// IMPORTANT: We must also verify the native module is linked before calling
// any expo-print API. On the New Architecture (TurboModules), calling an
// unlinked native module causes a fatal crash that JS try/catch cannot catch.

/** Check whether the ExpoPrint native module is linked into the binary. */
function isPrintAvailable(): boolean {
  // expo-modules-core registers modules on globalThis.__expo_module_registry__ (new arch)
  // or via NativeModules (old arch). Check both paths.
  const hasNewArch =
    typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).__expo_module_registry__ != null;
  if (hasNewArch) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('expo-print');
      // If the module loaded but the native side is missing, printAsync will be undefined
      return typeof mod?.printAsync === 'function';
    } catch {
      return false;
    }
  }
  // Old architecture fallback
  return NativeModules.ExpoPrint != null;
}

function getPrint() {
  if (!isPrintAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-print') as typeof import('expo-print');
  } catch {
    return null;
  }
}
import { apiClient } from '../../lib/axiosApiClient';
import { normalizeMediaUrl } from '../../lib/apiConfig';
import { parseContentBlocks } from '../../components/book/richTextParser';
import type { BookDisplay, BookDisplayEntry } from './types';
import type { ServiceResponse } from '@aiponge/shared-contracts';

interface ChapterWithEntries {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  entries: BookDisplayEntry[];
}

async function fetchEntriesForChapter(chapterId: string): Promise<BookDisplayEntry[]> {
  try {
    const response = await apiClient.get<
      ServiceResponse<{
        entries?: Array<{
          entry: {
            id: string;
            content: string;
            attribution?: string;
            sortOrder: number;
          };
        }>;
      }>
    >(`/api/v1/app/library/chapters/${chapterId}/entries`);
    if (!response.success) return [];
    const rawEntries = response.data?.entries || [];
    return rawEntries
      .map(
        (item): BookDisplayEntry => ({
          id: item.entry.id,
          text: item.entry.content,
          reference: item.entry.attribution || undefined,
          sortOrder: item.entry.sortOrder,
        })
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
}

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const normalized = normalizeMediaUrl(url);
    if (!normalized) return null;
    const ext = normalized.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const mimeType = mimeMap[ext] || 'image/jpeg';
    const tmpPath = `${FileSystem.cacheDirectory}book_cover_${Date.now()}.${ext}`;
    const { status } = await FileSystem.downloadAsync(normalized, tmpPath);
    if (status !== 200) return null;
    const base64 = await FileSystem.readAsStringAsync(tmpPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.deleteAsync(tmpPath, { idempotent: true });
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

function renderEntryContentHtml(text: string): string {
  const blocks = parseContentBlocks(text);
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'pause') {
      parts.push('<div class="pause"></div>');
      continue;
    }

    const renderText = (plainText: string, boldRanges: { start: number; end: number }[]): string => {
      if (!boldRanges.length) return escapeHtml(plainText);
      let result = '';
      let lastEnd = 0;
      for (const range of boldRanges) {
        if (range.start > lastEnd) {
          result += escapeHtml(plainText.slice(lastEnd, range.start));
        }
        result += `<strong>${escapeHtml(plainText.slice(range.start, range.end))}</strong>`;
        lastEnd = range.end;
      }
      if (lastEnd < plainText.length) {
        result += escapeHtml(plainText.slice(lastEnd));
      }
      return result;
    };

    const rendered = renderText(block.plainText, block.boldRanges);

    if (block.type === 'quote') {
      parts.push(`<blockquote class="quote">${rendered}</blockquote>`);
    } else if (block.type === 'reflection') {
      parts.push(`<div class="reflection">${rendered}</div>`);
    } else if (block.type === 'numbered') {
      parts.push(
        `<div class="numbered-item"><span class="num">${block.number}.</span><span class="num-text">${rendered}</span></div>`
      );
    } else {
      parts.push(`<p class="paragraph">${rendered}</p>`);
    }
  }

  return parts.join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBookHtml(book: BookDisplay, chapters: ChapterWithEntries[], coverBase64: string | null): string {
  const coverHtml = coverBase64
    ? `<img class="cover-img" src="${coverBase64}" alt="Book cover" />`
    : `<div class="cover-placeholder"><span class="cover-icon">📖</span></div>`;

  const metaBadges: string[] = [];
  if (book.category) metaBadges.push(`<span class="badge">${escapeHtml(book.category)}</span>`);

  const tocItems = chapters
    .map(
      (ch, i) =>
        `<div class="toc-item">
          <span class="toc-num">${i + 1}.</span>
          <span class="toc-title">${escapeHtml(ch.title)}</span>
          <span class="toc-dots"></span>
        </div>`
    )
    .join('');

  const chaptersHtml = chapters
    .map(
      (ch, i) => `
      <div class="chapter ${i === 0 ? '' : 'page-break'}">
        <div class="chapter-header">
          <span class="chapter-label">Chapter ${i + 1}</span>
          <h2 class="chapter-title">${escapeHtml(ch.title)}</h2>
          ${ch.description ? `<p class="chapter-description">${escapeHtml(ch.description)}</p>` : ''}
        </div>
        <div class="entries">
          ${
            ch.entries.length === 0
              ? '<p class="no-entries">No entries in this chapter.</p>'
              : ch.entries
                  .map(
                    entry => `
                    <div class="entry">
                      <div class="entry-content">${renderEntryContentHtml(entry.text)}</div>
                      ${entry.reference ? `<p class="entry-reference">— ${escapeHtml(entry.reference)}</p>` : ''}
                    </div>`
                  )
                  .join('')
          }
        </div>
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(book.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #1a1a1a;
      line-height: 1.7;
      background: #fff;
    }

    /* Cover page */
    .cover-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px;
      text-align: center;
      page-break-after: always;
      background: linear-gradient(160deg, #f8f6f2 0%, #eee8df 100%);
    }

    .cover-img {
      width: 200px;
      height: 280px;
      object-fit: cover;
      border-radius: 8px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.25);
      margin-bottom: 40px;
    }

    .cover-placeholder {
      width: 200px;
      height: 280px;
      border-radius: 8px;
      background: #d4c9b5;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 40px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.15);
    }

    .cover-icon { font-size: 72px; }

    .cover-title {
      font-size: 32px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 10px;
      letter-spacing: -0.5px;
      line-height: 1.2;
    }

    .cover-subtitle {
      font-size: 18px;
      color: #555;
      font-style: italic;
      margin-bottom: 20px;
    }

    .cover-author {
      font-size: 16px;
      color: #666;
      margin-bottom: 24px;
    }

    .badges {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }

    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: #e8e2d9;
      color: #555;
      font-family: -apple-system, sans-serif;
      letter-spacing: 0.3px;
    }

    .badge-accent {
      background: #c8a97a;
      color: #fff;
    }

    .cover-description {
      font-size: 15px;
      color: #666;
      max-width: 480px;
      line-height: 1.6;
      font-style: italic;
    }

    /* Table of Contents */
    .toc-page {
      padding: 60px 80px;
      page-break-after: always;
      min-height: 60vh;
    }

    .toc-heading {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 32px;
      padding-bottom: 12px;
      border-bottom: 2px solid #d4c9b5;
      letter-spacing: -0.3px;
    }

    .toc-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 16px;
    }

    .toc-num {
      color: #a08060;
      font-weight: 600;
      min-width: 28px;
    }

    .toc-title {
      color: #1a1a1a;
      flex: 1;
    }

    .toc-dots {
      flex: 1;
      border-bottom: 1px dotted #ccc;
      margin: 0 8px 4px;
    }

    /* Chapters */
    .chapter {
      padding: 60px 80px;
    }

    .page-break {
      page-break-before: always;
    }

    .chapter-header {
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e8e2d9;
    }

    .chapter-label {
      font-size: 13px;
      font-weight: 600;
      color: #a08060;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-family: -apple-system, sans-serif;
      display: block;
      margin-bottom: 8px;
    }

    .chapter-title {
      font-size: 26px;
      font-weight: 700;
      color: #1a1a1a;
      line-height: 1.25;
      letter-spacing: -0.3px;
    }

    .chapter-description {
      font-size: 15px;
      color: #666;
      font-style: italic;
      margin-top: 12px;
      line-height: 1.6;
    }

    /* Entries */
    .entries { }

    .entry {
      margin-bottom: 36px;
      padding-bottom: 32px;
      border-bottom: 1px solid #f0ece6;
    }

    .entry:last-child {
      border-bottom: none;
    }

    .entry-content { }

    .paragraph {
      font-size: 15px;
      line-height: 1.8;
      color: #1a1a1a;
      margin-bottom: 14px;
    }

    .paragraph:last-child { margin-bottom: 0; }

    blockquote.quote {
      border-left: 3px solid #c8a97a;
      padding-left: 16px;
      margin: 14px 0;
      font-style: italic;
      color: #555;
      font-size: 15px;
      line-height: 1.7;
    }

    .reflection {
      background: #f8f5f0;
      border-radius: 6px;
      padding: 14px 18px;
      margin: 14px 0;
      font-size: 14px;
      color: #555;
      line-height: 1.7;
      border-left: 3px solid #d4c9b5;
    }

    .numbered-item {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 15px;
      line-height: 1.7;
    }

    .num {
      color: #a08060;
      font-weight: 700;
      min-width: 22px;
      flex-shrink: 0;
    }

    .num-text { flex: 1; color: #1a1a1a; }

    .pause {
      height: 20px;
    }

    .entry-reference {
      font-size: 13px;
      color: #999;
      font-style: italic;
      margin-top: 12px;
    }

    .no-entries {
      font-size: 14px;
      color: #aaa;
      font-style: italic;
    }

    @media print {
      .page-break { page-break-before: always; }
      .cover-page { page-break-after: always; }
      .toc-page { page-break-after: always; }
    }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover-page">
    ${coverHtml}
    <h1 class="cover-title">${escapeHtml(book.title)}</h1>
    ${book.subtitle ? `<p class="cover-subtitle">${escapeHtml(book.subtitle)}</p>` : ''}
    ${book.author ? `<p class="cover-author">by ${escapeHtml(book.author)}</p>` : ''}
    ${metaBadges.length ? `<div class="badges">${metaBadges.join('')}</div>` : ''}
    ${book.description ? `<p class="cover-description">${escapeHtml(book.description)}</p>` : ''}
  </div>

  <!-- Table of Contents -->
  ${
    chapters.length > 1
      ? `<div class="toc-page">
          <h2 class="toc-heading">Contents</h2>
          ${tocItems}
        </div>`
      : ''
  }

  <!-- Chapters -->
  ${chaptersHtml}

</body>
</html>`;
}

export function useBookPDF(book: BookDisplay | null) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const collectData = useCallback(async (): Promise<{ chapters: ChapterWithEntries[]; coverBase64: string | null }> => {
    if (!book) throw new Error('No book data available');

    const sortedChapters = [...(book.chapters || [])].sort((a, b) => a.sortOrder - b.sortOrder);

    const [chaptersWithEntries, coverBase64] = await Promise.all([
      Promise.all(
        sortedChapters.map(async ch => {
          const preloaded = ch.entries?.length ? ch.entries : null;
          const entries = preloaded ?? (await fetchEntriesForChapter(ch.id));
          return {
            id: ch.id,
            title: ch.title,
            description: ch.description,
            sortOrder: ch.sortOrder,
            entries,
          } satisfies ChapterWithEntries;
        })
      ),
      book.coverIllustrationUrl ? imageUrlToBase64(book.coverIllustrationUrl) : Promise.resolve(null),
    ]);

    return { chapters: chaptersWithEntries, coverBase64 };
  }, [book]);

  const generatePDF = useCallback(async () => {
    if (!book) return;
    setIsGenerating(true);
    try {
      const { chapters, coverBase64 } = await collectData();
      const html = buildBookHtml(book, chapters, coverBase64);
      const Print = getPrint();
      if (!Print) throw new Error('PDF printing is not available on this device.');
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const fileName = `${book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      const destUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.moveAsync({ from: uri, to: destUri });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(destUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share "${book.title}"`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Generated', `Saved to: ${destUri}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Export Failed', `Could not generate PDF: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  }, [book, collectData]);

  const printBook = useCallback(async () => {
    if (!book) return;
    setIsPrinting(true);
    try {
      const { chapters, coverBase64 } = await collectData();
      const html = buildBookHtml(book, chapters, coverBase64);
      const Print = getPrint();
      if (!Print) throw new Error('PDF printing is not available on this device.');
      await Print.printAsync({ html });
    } catch (err) {
      if (err instanceof Error && err.message.includes('cancelled')) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Print Failed', `Could not open print dialog: ${msg}`);
    } finally {
      setIsPrinting(false);
    }
  }, [book, collectData]);

  const printAvailable = isPrintAvailable();

  return { generatePDF, printBook, isGenerating, isPrinting, printAvailable };
}
