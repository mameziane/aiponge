/**
 * Generate Book Export Report Use Case
 * Creates a PDF export of user's personal book entries organized into chapters by date
 *
 * This use case:
 * 1. Fetches all user entries from user-service
 * 2. Organizes entries by date into chapters
 * 3. Produces a beautifully formatted PDF book export
 */

import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { ServiceLocator } from '@aiponge/platform-core';
import { getLogger, createServiceHttpClient } from '../../config/service-urls';
import { AnalyticsError } from '../errors';

const httpClient = createServiceHttpClient('internal');

const logger = getLogger('ai-analytics-service-book-export-report');

export interface GenerateBookExportRequest {
  userId: string;
  format?: 'chapters' | 'timeline';
  dateFrom?: string;
  dateTo?: string;
  requestId?: string;
}

export interface GenerateBookExportResult {
  success: boolean;
  reportId?: string;
  pdfBuffer?: Buffer;
  entryCount?: number;
  expiresAt?: string;
  error?: string;
  code?: string;
}

interface EntryData {
  id: string;
  content: string;
  type?: string;
  moodContext?: string;
  createdAt: string;
  images?: Array<{ id: string; artworkUrl: string }>;
}

interface ChapterData {
  date: string;
  formattedDate: string;
  entries: EntryData[];
}

export class GenerateBookExportReportUseCase {
  constructor() {
    logger.debug('Initialized book export report use case');
  }

  /**
   * Sanitize text for PDF rendering with standard fonts.
   * PDFKit's built-in fonts (Helvetica, etc.) only support WinAnsiEncoding (Latin-1).
   * This method converts unsupported characters to their closest ASCII equivalents
   * or removes them entirely.
   */
  private sanitizeTextForPdf(text: string): string {
    if (!text) return '';

    // Common Unicode replacements
    const replacements: Record<string, string> = {
      // Quotes and apostrophes
      '\u2018': "'",
      '\u2019': "'",
      '\u201C': '"',
      '\u201D': '"',
      '\u2032': "'",
      '\u2033': '"',
      '\u2039': '<',
      '\u203A': '>',
      // Dashes and hyphens
      '\u2013': '-',
      '\u2014': '--',
      '\u2015': '--',
      '\u2212': '-',
      // Spaces
      '\u00A0': ' ',
      '\u2002': ' ',
      '\u2003': ' ',
      '\u2009': ' ',
      // Bullets and symbols
      '\u2022': '*',
      '\u2023': '>',
      '\u2043': '-',
      '\u25AA': '*',
      '\u25CF': '*',
      '\u25CB': 'o',
      '\u25A0': '*',
      '\u25A1': '[]',
      // Arrows
      '\u2192': '->',
      '\u2190': '<-',
      '\u2194': '<->',
      '\u21D2': '=>',
      // Check marks
      '\u2713': '[x]',
      '\u2714': '[x]',
      '\u2717': '[ ]',
      '\u2718': '[x]',
      '\u2705': '[x]',
      '\u274C': '[ ]',
      '\u2611': '[x]',
      '\u2610': '[ ]',
      // Other common symbols
      '\u00B7': '*',
      '\u2026': '...',
      '\u00AE': '(R)',
      '\u00A9': '(C)',
      '\u2122': '(TM)',
      '\u00B0': ' deg',
      '\u00BD': '1/2',
      '\u00BC': '1/4',
      '\u00BE': '3/4',
      '\u221E': 'infinity',
      '\u2260': '!=',
      '\u2264': '<=',
      '\u2265': '>=',
      '\u00D7': 'x',
      '\u00F7': '/',
      // Line separators
      '\u2028': '\n',
      '\u2029': '\n\n',
    };

    let result = text;

    // Apply known replacements
    for (const [unicode, replacement] of Object.entries(replacements)) {
      result = result.split(unicode).join(replacement);
    }

    // Remove emojis and other extended Unicode characters
    // Keep only printable ASCII and extended Latin characters that WinAnsiEncoding supports
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\u0000-\u001F]/g, ''); // Control characters
    result = result.replace(/[\u007F-\u009F]/g, ''); // More control characters

    // Replace characters outside Latin-1 range with closest match or remove
    result = result.replace(/[\u0100-\uFFFF]/g, char => {
      // Try to find a Latin-1 equivalent via normalization
      const normalized = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized.length === 1 && normalized.charCodeAt(0) < 256) {
        return normalized;
      }
      // Remove emoji and other symbols that can't be represented
      if (/\p{Emoji}/u.test(char)) {
        return '';
      }
      return '?';
    });

    // Clean up multiple spaces and normalize line breaks
    result = result.replace(/\r\n/g, '\n');
    result = result.replace(/\r/g, '\n');
    result = result.replace(/ +/g, ' ');
    result = result.trim();

    return result;
  }

  async execute(request: GenerateBookExportRequest): Promise<GenerateBookExportResult> {
    const { userId, format = 'chapters', dateFrom, dateTo, requestId = 'unknown' } = request;

    logger.info('Generating book export report', {
      userId,
      format,
      dateFrom,
      dateTo,
      requestId,
    });

    try {
      const entries = await this.fetchEntries(userId, dateFrom, dateTo, requestId);

      const chapters = entries.length > 0 ? this.organizeIntoChapters(entries) : [];
      const pdfBuffer = await this.generatePdf({ chapters, format, isEmpty: entries.length === 0 });

      const reportId = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      logger.info('Book export report generated successfully', {
        userId,
        reportId,
        entryCount: entries.length,
        chapterCount: chapters.length,
        pdfSize: pdfBuffer.length,
        requestId,
      });

      return {
        success: true,
        reportId,
        pdfBuffer,
        entryCount: entries.length,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to generate book export report', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        requestId,
      });

      return {
        success: false,
        error: 'Failed to generate book export report',
        code: 'GENERATION_FAILED',
      };
    }
  }

  private async fetchEntries(
    userId: string,
    dateFrom?: string,
    dateTo?: string,
    requestId?: string
  ): Promise<EntryData[]> {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    let url = `${userServiceUrl}/api/entries/${userId}?limit=1000`;
    if (dateFrom) {
      url += `&dateFrom=${dateFrom}`;
    }
    if (dateTo) {
      url += `&dateTo=${dateTo}`;
    }

    const entriesResponse = await httpClient.getWithResponse<Record<string, unknown>>(url, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId || 'unknown',
      },
      timeout: 30000,
    });

    if (!entriesResponse.ok) {
      logger.error('Failed to fetch entries', {
        userId,
        status: entriesResponse.status,
        requestId,
      });
      throw AnalyticsError.queryFailed('fetchEntries', 'Failed to fetch entries for book export');
    }

    const entriesData = entriesResponse.data as {
      success?: boolean;
      data?: { entries: EntryData[] };
      entries?: EntryData[];
    };

    return entriesData.data?.entries || entriesData.entries || [];
  }

  private organizeIntoChapters(entries: EntryData[]): ChapterData[] {
    const chapterMap = new Map<string, EntryData[]>();

    entries.forEach(entry => {
      const date = new Date(entry.createdAt);
      const dateKey = date.toISOString().split('T')[0];

      if (!chapterMap.has(dateKey)) {
        chapterMap.set(dateKey, []);
      }
      chapterMap.get(dateKey)!.push(entry);
    });

    const chapters: ChapterData[] = [];

    const sortedDates = Array.from(chapterMap.keys()).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    sortedDates.forEach(dateKey => {
      const entries = chapterMap.get(dateKey)!;
      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const date = new Date(dateKey);
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      chapters.push({
        date: dateKey,
        formattedDate,
        entries,
      });
    });

    return chapters;
  }

  private async generatePdf(options: {
    chapters: ChapterData[];
    format: 'chapters' | 'timeline';
    isEmpty?: boolean;
  }): Promise<Buffer> {
    const { chapters, isEmpty } = options;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 50, right: 50 },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(28).font('Helvetica-Bold').fillColor('#440972').text('My Personal Book', { align: 'center' });
      doc.moveDown(0.5);

      doc
        .fontSize(12)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `Exported on ${new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}`,
          { align: 'center' }
        );

      const totalEntries = chapters.reduce((sum, ch) => sum + ch.entries.length, 0);
      doc.text(`${totalEntries} entries across ${chapters.length} days`, { align: 'center' });
      doc.moveDown(2);

      doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      if (isEmpty || chapters.length === 0) {
        doc.moveDown(2);
        doc.fontSize(14).font('Helvetica-Oblique').fillColor('#666666').text('No entries yet.', { align: 'center' });
        doc.moveDown(1);
        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#999999')
          .text('Start writing your entries to see them here.', { align: 'center' });
        doc.moveDown(1);
        doc.text('Your personal book is a safe space for reflection and growth.', { align: 'center' });
      }

      chapters.forEach((chapter, chapterIndex) => {
        if (chapterIndex > 0) {
          doc.addPage();
        }

        doc.fontSize(18).font('Helvetica-Bold').fillColor('#212529').text(chapter.formattedDate);
        doc.moveDown(0.3);

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#666666')
          .text(`${chapter.entries.length} ${chapter.entries.length === 1 ? 'entry' : 'entries'}`);
        doc.moveDown(0.8);

        doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.8);

        chapter.entries.forEach((entry, entryIndex) => {
          const time = new Date(entry.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });

          doc.fontSize(9).font('Helvetica').fillColor('#999999').text(time);
          doc.moveDown(0.2);

          if (entry.moodContext) {
            doc
              .fontSize(10)
              .font('Helvetica-Oblique')
              .fillColor('#7C3AED')
              .text(`Feeling: ${this.sanitizeTextForPdf(entry.moodContext)}`);
            doc.moveDown(0.3);
          }

          doc.fontSize(11).font('Helvetica').fillColor('#333333').text(this.sanitizeTextForPdf(entry.content), {
            align: 'left',
            lineGap: 4,
          });
          doc.moveDown(1);

          if (entryIndex < chapter.entries.length - 1) {
            doc.strokeColor('#F3F4F6').lineWidth(0.5).moveTo(80, doc.y).lineTo(515, doc.y).stroke();
            doc.moveDown(0.8);
          }

          if (doc.y > 700 && entryIndex < chapter.entries.length - 1) {
            doc.addPage();
          }
        });
      });

      doc.addPage();
      doc
        .fontSize(12)
        .font('Helvetica-Oblique')
        .fillColor('#666666')
        .text('This book export was generated by aiponge.', { align: 'center' });
      doc.moveDown(0.5);
      doc.text('Your entries, your journey, your growth.', { align: 'center' });

      doc.end();
    });
  }
}
