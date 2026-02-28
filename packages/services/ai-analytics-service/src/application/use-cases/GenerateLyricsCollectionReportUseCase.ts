/**
 * Generate Lyrics Collection Report Use Case
 * Creates a PDF collection of user's AI-generated lyrics
 *
 * This use case:
 * 1. Fetches all user lyrics from user-service
 * 2. Organizes lyrics with metadata (title, style, mood)
 * 3. Produces a beautifully formatted PDF lyrics collection
 */

import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { ServiceLocator } from '@aiponge/platform-core';
import { getLogger, createServiceHttpClient } from '../../config/service-urls';
import { AnalyticsError } from '../errors';

const httpClient = createServiceHttpClient('internal');

const logger = getLogger('ai-analytics-service-lyrics-collection-report');

export interface GenerateLyricsCollectionRequest {
  userId: string;
  includeFavoritesOnly?: boolean;
  trackId?: string;
  requestId?: string;
}

export interface GenerateLyricsCollectionResult {
  success: boolean;
  reportId?: string;
  pdfBuffer?: Buffer;
  lyricsCount?: number;
  expiresAt?: string;
  error?: string;
  code?: string;
}

interface LyricsData {
  id: string;
  title?: string | null;
  content: string;
  style?: string | null;
  mood?: string | null;
  themes?: string[] | null;
  language?: string | null;
  createdAt: string;
}

export class GenerateLyricsCollectionReportUseCase {
  constructor() {
    logger.debug('Initialized lyrics collection report use case');
  }

  /**
   * Sanitize text for PDF rendering with standard fonts.
   * PDFKit's built-in fonts (Helvetica, etc.) only support WinAnsiEncoding (Latin-1).
   */
  private sanitizeTextForPdf(text: string): string {
    if (!text) return '';

    const replacements: Record<string, string> = {
      '\u2018': "'",
      '\u2019': "'",
      '\u201C': '"',
      '\u201D': '"',
      '\u2032': "'",
      '\u2033': '"',
      '\u2039': '<',
      '\u203A': '>',
      '\u2013': '-',
      '\u2014': '--',
      '\u2015': '--',
      '\u2212': '-',
      '\u00A0': ' ',
      '\u2002': ' ',
      '\u2003': ' ',
      '\u2009': ' ',
      '\u2022': '*',
      '\u2023': '>',
      '\u2043': '-',
      '\u25AA': '*',
      '\u25CF': '*',
      '\u25CB': 'o',
      '\u25A0': '*',
      '\u25A1': '[]',
      '\u2192': '->',
      '\u2190': '<-',
      '\u2194': '<->',
      '\u21D2': '=>',
      '\u2713': '[x]',
      '\u2714': '[x]',
      '\u2717': '[ ]',
      '\u2718': '[x]',
      '\u2705': '[x]',
      '\u274C': '[ ]',
      '\u2611': '[x]',
      '\u2610': '[ ]',
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
      '\u2028': '\n',
      '\u2029': '\n\n',
    };

    let result = text;
    for (const [unicode, replacement] of Object.entries(replacements)) {
      result = result.split(unicode).join(replacement);
    }

    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\u0000-\u001F]/g, '');
    result = result.replace(/[\u007F-\u009F]/g, '');
    result = result.replace(/[\u0100-\uFFFF]/g, char => {
      const normalized = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized.length === 1 && normalized.charCodeAt(0) < 256) {
        return normalized;
      }
      if (/\p{Emoji}/u.test(char)) {
        return '';
      }
      return '?';
    });

    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/ +/g, ' ').trim();
    return result;
  }

  async execute(request: GenerateLyricsCollectionRequest): Promise<GenerateLyricsCollectionResult> {
    const { userId, includeFavoritesOnly = false, trackId, requestId = 'unknown' } = request;

    logger.info('Generating lyrics report', {
      userId,
      includeFavoritesOnly,
      trackId,
      requestId,
    });

    try {
      let lyrics: LyricsData[];

      if (trackId) {
        // Fetch lyrics for a specific track
        const trackLyrics = await this.fetchLyricsForTrack(trackId, userId, requestId);
        lyrics = trackLyrics ? [trackLyrics] : [];
      } else {
        // Fetch all user lyrics for collection report
        lyrics = await this.fetchLyrics(userId, requestId);
      }

      // Note: isFavorite filtering not supported - music-service lyrics don't have favorites field
      // includeFavoritesOnly parameter kept for API compatibility but currently ignored

      const pdfBuffer = await this.generatePdf(lyrics, includeFavoritesOnly);

      const reportId = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      logger.info('Lyrics collection report generated successfully', {
        userId,
        reportId,
        lyricsCount: lyrics.length,
        pdfSize: pdfBuffer.length,
        requestId,
      });

      return {
        success: true,
        reportId,
        pdfBuffer,
        lyricsCount: lyrics.length,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to generate lyrics collection report', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        requestId,
      });

      return {
        success: false,
        error: 'Failed to generate lyrics collection report',
        code: 'GENERATION_FAILED',
      };
    }
  }

  private async fetchLyrics(userId: string, requestId?: string): Promise<LyricsData[]> {
    // Lyrics are stored in music-service (mus_lyrics table), not user-service
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');

    const lyricsResponse = await httpClient.getWithResponse<Record<string, unknown>>(
      `${musicServiceUrl}/api/lyrics/user/${userId}?limit=500`,
      {
        headers: {
          'x-user-id': userId,
          'x-request-id': requestId || 'unknown',
        },
        timeout: 30000,
      }
    );

    if (!lyricsResponse.ok) {
      logger.error('Failed to fetch lyrics', {
        userId,
        status: lyricsResponse.status,
        requestId,
      });
      throw AnalyticsError.queryFailed('fetchLyrics', 'Failed to fetch lyrics for collection');
    }

    const lyricsData = lyricsResponse.data as {
      success?: boolean;
      data?: LyricsData[];
    };

    // music-service returns { success: true, data: [...lyrics] }
    return lyricsData.data || [];
  }

  private async fetchLyricsForTrack(trackId: string, userId: string, requestId?: string): Promise<LyricsData | null> {
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');

    // First, fetch track details to get lyricsId
    const trackResponse = await httpClient.getWithResponse<Record<string, unknown>>(
      `${musicServiceUrl}/api/library/track/${trackId}`,
      {
        headers: {
          'x-user-id': userId,
          'x-request-id': requestId || 'unknown',
        },
        timeout: 30000,
      }
    );

    if (!trackResponse.ok) {
      logger.error('Failed to fetch track details', {
        trackId,
        userId,
        status: trackResponse.status,
        requestId,
      });
      return null;
    }

    const trackData = trackResponse.data as {
      success?: boolean;
      data?: {
        id: string;
        title?: string;
        lyricsId?: string;
        createdAt?: string;
      };
    };

    if (!trackData.success || !trackData.data) {
      logger.warn('Track data not found', { trackId, requestId });
      return null;
    }

    const track = trackData.data;
    const lyricsId = track.lyricsId;

    if (!lyricsId) {
      logger.warn('Track has no lyrics', { trackId, requestId });
      return null;
    }

    // Fetch the actual lyrics by ID
    const lyricsResponse = await httpClient.getWithResponse<Record<string, unknown>>(
      `${musicServiceUrl}/api/lyrics/${lyricsId}`,
      {
        headers: {
          'x-user-id': userId,
          'x-request-id': requestId || 'unknown',
        },
        timeout: 30000,
      }
    );

    if (!lyricsResponse.ok) {
      logger.error('Failed to fetch lyrics', {
        lyricsId,
        trackId,
        status: lyricsResponse.status,
        requestId,
      });
      return null;
    }

    const lyricsResult = lyricsResponse.data as {
      success?: boolean;
      data?: LyricsData;
    };

    if (!lyricsResult.success || !lyricsResult.data) {
      logger.warn('Lyrics not found', { lyricsId, trackId, requestId });
      return null;
    }

    // Use track title if lyrics title is empty
    const lyrics = lyricsResult.data;
    if (!lyrics.title && track.title) {
      lyrics.title = track.title;
    }

    return lyrics;
  }

  private cleanLyricsContent(content: string): string {
    const formatted = content
      .replace(/\[Verse\s*\d*\]/gi, '\n[Verse]\n')
      .replace(/\[Chorus\]/gi, '\n[Chorus]\n')
      .replace(/\[Bridge\]/gi, '\n[Bridge]\n')
      .replace(/\[Outro\]/gi, '\n[Outro]\n')
      .replace(/\[Intro\]/gi, '\n[Intro]\n')
      .replace(/\[Pre-Chorus\]/gi, '\n[Pre-Chorus]\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return this.sanitizeTextForPdf(formatted);
  }

  private async generatePdf(lyrics: LyricsData[], includeFavoritesOnly: boolean = false): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 50, right: 50 },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(28).font('Helvetica-Bold').fillColor('#440972').text('My Lyrics Collection', { align: 'center' });
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

      doc.text(`${lyrics.length} lyrics in collection`, { align: 'center' });
      doc.moveDown(2);

      doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      if (lyrics.length === 0) {
        doc.moveDown(2);
        doc
          .fontSize(14)
          .font('Helvetica-Oblique')
          .fillColor('#666666')
          .text(includeFavoritesOnly ? 'No favorite lyrics yet.' : 'No lyrics yet.', { align: 'center' });
        doc.moveDown(1);
        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#999999')
          .text('Generate some songs to build your lyrics collection.', { align: 'center' });
        doc.moveDown(1);
        doc.text('Each song you create adds unique lyrics to your collection.', { align: 'center' });

        doc.addPage();
        doc
          .fontSize(12)
          .font('Helvetica-Oblique')
          .fillColor('#666666')
          .text('This lyrics collection was generated by aiponge.', { align: 'center' });
        doc.moveDown(0.5);
        doc.text('Your words, your melodies, your story.', { align: 'center' });

        doc.end();
        return;
      }

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#212529').text('Table of Contents');
      doc.moveDown(0.5);

      lyrics.forEach((lyric, index) => {
        const title = this.sanitizeTextForPdf(lyric.title || `Untitled #${index + 1}`);
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#495057')
          .text(`${index + 1}. ${title}`, { continued: true });

        if (lyric.style || lyric.mood) {
          doc
            .fillColor('#999999')
            .text(` - ${this.sanitizeTextForPdf([lyric.style, lyric.mood].filter(Boolean).join(', '))}`);
        } else {
          doc.text('');
        }
      });

      lyrics.forEach((lyric, index) => {
        doc.addPage();

        const title = this.sanitizeTextForPdf(lyric.title || `Untitled #${index + 1}`);
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#212529').text(title, { align: 'center' });
        doc.moveDown(0.3);

        const metadata: string[] = [];
        if (lyric.style) metadata.push(`Style: ${this.sanitizeTextForPdf(lyric.style)}`);
        if (lyric.mood) metadata.push(`Mood: ${this.sanitizeTextForPdf(lyric.mood)}`);
        if (lyric.themes && lyric.themes.length > 0) {
          metadata.push(`Themes: ${this.sanitizeTextForPdf(lyric.themes.slice(0, 3).join(', '))}`);
        }

        if (metadata.length > 0) {
          doc
            .fontSize(10)
            .font('Helvetica-Oblique')
            .fillColor('#666666')
            .text(metadata.join(' | '), { align: 'center' });
          doc.moveDown(0.3);
        }

        const createdDate = new Date(lyric.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        doc.fontSize(9).font('Helvetica').fillColor('#999999').text(`Created: ${createdDate}`, { align: 'center' });
        doc.moveDown(1);

        doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(100, doc.y).lineTo(495, doc.y).stroke();
        doc.moveDown(1);

        const cleanContent = this.cleanLyricsContent(lyric.content);
        const lines = cleanContent.split('\n');

        lines.forEach(line => {
          const trimmedLine = line.trim();

          if (trimmedLine.match(/^\[.*\]$/)) {
            doc.moveDown(0.3);
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#7C3AED').text(trimmedLine, { align: 'center' });
            doc.moveDown(0.3);
          } else if (trimmedLine) {
            doc.fontSize(11).font('Helvetica').fillColor('#333333').text(trimmedLine, { align: 'center', lineGap: 3 });
          } else {
            doc.moveDown(0.3);
          }

          if (doc.y > 720) {
            doc.addPage();
          }
        });

        doc.moveDown(2);
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#CCCCCC')
          .text(`- ${index + 1} of ${lyrics.length} -`, { align: 'center' });
      });

      doc.addPage();
      doc
        .fontSize(12)
        .font('Helvetica-Oblique')
        .fillColor('#666666')
        .text('This lyrics collection was generated by aiponge.', { align: 'center' });
      doc.moveDown(0.5);
      doc.text('Your words, your melodies, your story.', { align: 'center' });

      doc.end();
    });
  }
}
