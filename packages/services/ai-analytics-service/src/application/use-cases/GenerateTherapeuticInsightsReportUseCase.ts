/**
 * Generate Therapeutic Insights Report Use Case
 * Creates comprehensive PDF reports for therapeutic purposes from user entries
 *
 * This use case:
 * 1. Fetches user entries from user-service
 * 2. Analyzes patterns, themes, and emotional trends
 * 3. Generates AI summaries using ai-content-service templates
 * 4. Produces PDF reports for sharing with therapists
 */

import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { ServiceLocator } from '@aiponge/platform-core';
import { getLogger, createServiceHttpClient } from '../../config/service-urls';
import { AnalyticsError } from '../errors';

const httpClient = createServiceHttpClient('internal');

const logger = getLogger('ai-analytics-service-therapeutic-insights-report');

// ===== REQUEST/RESPONSE TYPES =====

export interface IncludeSections {
  overview?: boolean;
  themes?: boolean;
  emotionalTrends?: boolean;
  growthHighlights?: boolean;
  suggestions?: boolean;
}

export interface GenerateTherapeuticReportRequest {
  userId: string;
  timeRangeDays?: number;
  includeSections?: IncludeSections;
  requestId?: string;
  language?: string;
}

export interface GenerateTherapeuticReportResult {
  success: boolean;
  reportId?: string;
  pdfBuffer?: Buffer;
  entryCount?: number;
  timeRangeDays?: number;
  expiresAt?: string;
  error?: string;
  code?: string;
}

// ===== INTERNAL TYPES =====

interface EntryData {
  id: string;
  content: string;
  type?: string;
  moodContext?: string;
  createdAt: string;
}

interface AnalyticsData {
  entryActivity: {
    totalEntries: number;
    entriesPerDay: number;
    mostActiveDay: string;
  };
  emotionalWellbeing: {
    overallSentiment: string;
    positiveEntries: number;
    challengingEntries: number;
  };
  cognitivePatterns: {
    topThemes: Array<{ theme: string; count: number }>;
  };
  growthIndicators: {
    selfAwarenessScore: number;
    reflectionDepth: number;
  };
}

// ===== USE CASE IMPLEMENTATION =====

export class GenerateTherapeuticInsightsReportUseCase {
  constructor() {
    logger.debug('Initialized therapeutic insights report use case');
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

  async execute(request: GenerateTherapeuticReportRequest): Promise<GenerateTherapeuticReportResult> {
    const { userId, timeRangeDays = 90, includeSections = {}, requestId = 'unknown' } = request;

    logger.info('Generating therapeutic insights report', {
      userId,
      timeRangeDays,
      includeSections,
      requestId,
    });

    try {
      // Step 1: Fetch user's entries from the specified time range
      const entries = await this.fetchEntries(userId, timeRangeDays, requestId);

      if (entries.length < 5) {
        return {
          success: false,
          error: 'Insufficient data to generate a meaningful report. At least 5 entries are required.',
          code: 'INSUFFICIENT_DATA',
          entryCount: entries.length,
        };
      }

      // Step 2: Generate analytics from the entries
      const analytics = this.generateAnalytics(entries);

      // Step 3: Generate AI summary if AI service is available (fallback to basic analysis)
      const aiSummary = await this.generateAiSummary(userId, entries, analytics, requestId);

      // Step 4: Generate PDF
      const pdfBuffer = await this.generatePdf({
        userId,
        timeRangeDays,
        includeSections,
        entries,
        analytics,
        aiSummary,
      });

      // Step 5: Return report data
      const reportId = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      logger.info('Therapeutic insights report generated successfully', {
        userId,
        reportId,
        entryCount: entries.length,
        pdfSize: pdfBuffer.length,
        requestId,
      });

      return {
        success: true,
        reportId,
        pdfBuffer,
        entryCount: entries.length,
        timeRangeDays,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to generate therapeutic insights report', {
        userId,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate report',
        code: 'GENERATION_FAILED',
      };
    }
  }

  private async fetchEntries(userId: string, timeRangeDays: number, requestId: string): Promise<EntryData[]> {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRangeDays);

    const entriesResponse = await httpClient.getWithResponse<Record<string, unknown>>(
      `${userServiceUrl}/api/entries/${userId}?limit=500&dateFrom=${startDate.toISOString()}`,
      {
        headers: {
          'x-user-id': userId,
          'x-request-id': requestId,
        },
        timeout: 30000,
      }
    );

    if (!entriesResponse.ok) {
      logger.error('Failed to fetch entries', {
        userId,
        status: entriesResponse.status,
        requestId,
      });
      throw AnalyticsError.queryFailed('fetchEntries', 'Failed to fetch entries for report');
    }

    const entryData = entriesResponse.data as {
      success?: boolean;
      data?: { entries: EntryData[] };
      entries?: EntryData[];
    };

    return entryData.data?.entries || entryData.entries || [];
  }

  private generateAnalytics(entries: EntryData[]): AnalyticsData {
    // Calculate entry activity
    const dayOfWeekCounts: Record<string, number> = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    entries.forEach(t => {
      const day = days[new Date(t.createdAt).getDay()];
      dayOfWeekCounts[day] = (dayOfWeekCounts[day] || 0) + 1;
    });

    const mostActiveDay = Object.entries(dayOfWeekCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

    // Analyze themes (simple word frequency)
    const wordCounts: Record<string, number> = {};
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'is',
      'it',
      'i',
      'my',
      'me',
      'we',
      'you',
      'that',
      'this',
      'was',
      'with',
      'have',
      'been',
      'be',
      'are',
      'not',
      'so',
      'as',
      'from',
      'about',
    ]);

    entries.forEach(t => {
      const words = t.content
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 3 && !stopWords.has(w));
      words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
    });

    const topThemes = Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count }));

    // Estimate sentiment based on mood context
    let positiveCount = 0;
    let challengingCount = 0;

    const positiveMoods = ['happy', 'calm', 'grateful', 'peaceful', 'excited', 'hopeful', 'content', 'inspired'];
    const challengingMoods = [
      'sad',
      'anxious',
      'stressed',
      'frustrated',
      'angry',
      'worried',
      'confused',
      'overwhelmed',
    ];

    entries.forEach(t => {
      const mood = (t.moodContext || '').toLowerCase();
      if (positiveMoods.some(m => mood.includes(m))) {
        positiveCount++;
      } else if (challengingMoods.some(m => mood.includes(m))) {
        challengingCount++;
      }
    });

    const totalDays = Math.max(
      1,
      Math.ceil(
        (new Date(entries[0]?.createdAt || Date.now()).getTime() -
          new Date(entries[entries.length - 1]?.createdAt || Date.now()).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    return {
      entryActivity: {
        totalEntries: entries.length,
        entriesPerDay: Math.round((entries.length / totalDays) * 100) / 100,
        mostActiveDay,
      },
      emotionalWellbeing: {
        overallSentiment:
          positiveCount > challengingCount
            ? 'Generally positive'
            : challengingCount > positiveCount
              ? 'Facing challenges'
              : 'Balanced',
        positiveEntries: positiveCount,
        challengingEntries: challengingCount,
      },
      cognitivePatterns: {
        topThemes,
      },
      growthIndicators: {
        selfAwarenessScore: Math.min(100, Math.round((entries.length / 30) * 50 + 50)),
        reflectionDepth: Math.min(
          100,
          Math.round(entries.reduce((sum, t) => sum + t.content.length, 0) / entries.length / 10)
        ),
      },
    };
  }

  private async generateAiSummary(
    userId: string,
    entries: EntryData[],
    analytics: AnalyticsData,
    requestId: string
  ): Promise<string | null> {
    const AI_TIMEOUT_MS = 120000; // 2 minutes for AI content generation

    try {
      const aiContentServiceUrl = ServiceLocator.getServiceUrl('ai-content-service');
      const prompt = this.buildAiPrompt(entries, analytics);

      logger.info('Calling AI content service for insights report', {
        requestId,
        userId,
        timeoutMs: AI_TIMEOUT_MS,
      });

      const aiResponse = await httpClient.postWithResponse<Record<string, unknown>>(
        `${aiContentServiceUrl}/api/content/generate`,
        {
          userId,
          prompt,
          contentType: 'insights_report',
        },
        {
          headers: {
            'x-user-id': userId,
            'x-request-id': requestId,
          },
          timeout: AI_TIMEOUT_MS,
        }
      );

      if (aiResponse.ok) {
        const aiData = aiResponse.data as { content?: string; data?: { content?: string } };
        logger.info('AI insights report generated successfully', { requestId, userId });
        return aiData.content || aiData.data?.content || null;
      }

      logger.warn('AI summary generation returned non-OK response', {
        status: aiResponse.status,
        requestId,
        userId,
      });
      return null;
    } catch (aiError) {
      const isTimeout =
        aiError instanceof Error &&
        (aiError.name === 'AbortError' || (aiError as { code?: string }).code === 'ECONNABORTED');
      logger.warn('AI summary generation failed, using basic analysis', {
        error: aiError instanceof Error ? aiError.message : 'Unknown error',
        errorType: isTimeout ? 'TIMEOUT' : 'EXCEPTION',
        requestId,
        userId,
      });
      return null;
    }
  }

  private buildAiPrompt(entries: EntryData[], analytics: AnalyticsData): string {
    const sampleEntries = entries
      .slice(0, 10)
      .map(t => `- "${t.content.substring(0, 100)}..."`)
      .join('\n');
    const themes = analytics.cognitivePatterns.topThemes.map(t => t.theme).join(', ');

    return `Analyze this user's reflection patterns and provide a brief, supportive summary for their therapist:

Sample entries:
${sampleEntries}

Key themes: ${themes}
Total entries: ${analytics.entryActivity.totalEntries}
Sentiment: ${analytics.emotionalWellbeing.overallSentiment}

Provide a 2-3 paragraph professional summary highlighting:
1. Main patterns or themes observed
2. Emotional trends
3. Suggested areas to explore in therapy

Keep the tone professional but warm, and focus on patterns rather than diagnoses.`;
  }

  private async generatePdf(options: {
    userId: string;
    timeRangeDays: number;
    includeSections: IncludeSections;
    entries: EntryData[];
    analytics: AnalyticsData;
    aiSummary: string | null;
  }): Promise<Buffer> {
    const { timeRangeDays, includeSections, entries, analytics, aiSummary } = options;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#440972').text('Insights Report', { align: 'center' });
      doc.moveDown(0.5);

      doc
        .fontSize(12)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `Generated on ${new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}`,
          { align: 'center' }
        );
      doc.text(`Covering the last ${timeRangeDays} days`, { align: 'center' });
      doc.moveDown(1.5);

      // Horizontal line
      doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Overview Section
      if (includeSections.overview !== false) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#212529').text('Overview');
        doc.moveDown(0.5);

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#495057')
          .text(`This report summarizes ${entries.length} entries recorded over the past ${timeRangeDays} days.`);
        doc.moveDown(0.3);
        doc.text(`Average reflection frequency: ${analytics.entryActivity.entriesPerDay} entries per day`);
        doc.text(`Most active day for reflection: ${analytics.entryActivity.mostActiveDay}`);
        doc.moveDown(1);
      }

      // AI Summary (if available)
      if (aiSummary) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#212529').text('Summary Analysis');
        doc.moveDown(0.5);

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#495057')
          .text(this.sanitizeTextForPdf(aiSummary), { align: 'justify', lineGap: 2 });
        doc.moveDown(1);
      }

      // Key Themes Section
      if (includeSections.themes !== false) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#212529').text('Key Themes');
        doc.moveDown(0.5);

        if (analytics.cognitivePatterns.topThemes.length > 0) {
          analytics.cognitivePatterns.topThemes.forEach((theme, i) => {
            doc
              .fontSize(11)
              .font('Helvetica')
              .fillColor('#495057')
              .text(`${i + 1}. ${this.sanitizeTextForPdf(theme.theme)} (mentioned ${theme.count} times)`);
          });
        } else {
          doc
            .fontSize(11)
            .font('Helvetica-Oblique')
            .fillColor('#6C757D')
            .text('Not enough data to identify clear themes');
        }
        doc.moveDown(1);
      }

      // Emotional Trends Section
      if (includeSections.emotionalTrends !== false) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#212529').text('Emotional Patterns');
        doc.moveDown(0.5);

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#495057')
          .text(`Overall sentiment: ${analytics.emotionalWellbeing.overallSentiment}`);
        doc.text(`Positive reflections: ${analytics.emotionalWellbeing.positiveEntries}`);
        doc.text(`Challenging reflections: ${analytics.emotionalWellbeing.challengingEntries}`);
        doc.moveDown(1);
      }

      // Growth Highlights Section
      if (includeSections.growthHighlights !== false) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#212529').text('Growth Indicators');
        doc.moveDown(0.5);

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#495057')
          .text(`Self-awareness engagement: ${analytics.growthIndicators.selfAwarenessScore}%`);
        doc.text(`Reflection depth: ${analytics.growthIndicators.reflectionDepth}%`);
        doc.moveDown(1);
      }

      // Suggestions Section
      if (includeSections.suggestions !== false) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#212529').text('Suggested Talking Points');
        doc.moveDown(0.5);

        const suggestions = [
          'Explore the connection between the recurring themes identified',
          'Discuss patterns in emotional responses over this period',
          'Consider what triggers more reflective moments',
          'Examine progress toward personal goals',
        ];

        suggestions.forEach((suggestion, i) => {
          doc
            .fontSize(11)
            .font('Helvetica')
            .fillColor('#495057')
            .text(`${i + 1}. ${suggestion}`);
        });
        doc.moveDown(1);
      }

      // Footer
      doc.moveDown(2);
      doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor('#6C757D')
        .text('This report is generated by aiponge to facilitate therapeutic conversations.', {
          align: 'center',
        });
      doc.text('It is not a clinical assessment and should be discussed with a qualified professional.', {
        align: 'center',
      });

      doc.end();
    });
  }
}
