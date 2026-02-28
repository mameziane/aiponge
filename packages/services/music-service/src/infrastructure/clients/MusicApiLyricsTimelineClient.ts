/**
 * MusicApiLyricsTimelineClient
 *
 * Robust client for fetching synchronized lyrics timeline from MusicAPI.ai
 * Uses the "Get Lyrics Timeline" endpoint for karaoke-style word-level sync
 *
 * Features:
 * - Retry logic with exponential backoff for transient network failures
 * - Request timeout handling with AbortController (30s default)
 * - In-memory caching by clipId (first request costs 1 credit, subsequent are free)
 * - Structured logging with alignment confidence statistics
 * - Helper methods for playback timestamp lookups
 *
 * API Documentation: https://docs.musicapi.ai/get-suno-lyrics-timeline
 */

import { getLogger } from '../../config/service-urls';
import { PipelineError } from '../../application/errors';
import { INFRASTRUCTURE, LYRICS_FORMAT, CACHE } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-lyrics-timeline-client');

const MUSICAPI_BASE_URL = process.env.MUSICAPI_BASE_URL || 'https://api.musicapi.ai';
const REQUEST_TIMEOUT_MS = INFRASTRUCTURE.DEFAULT_TIMEOUT_MS;
const MAX_RETRIES = INFRASTRUCTURE.MAX_RETRIES;
const INITIAL_RETRY_DELAY_MS = 1000;

export interface MusicApiAlignedWord {
  word: string;
  start_s: number;
  end_s: number;
  p_align: number;
  success: boolean;
}

export interface MusicApiLyricsTimelineResponse {
  code: number;
  data: {
    alignment: MusicApiAlignedWord[];
  };
  message: string;
}

export type LineType = 'line' | 'section' | 'backing' | 'instrumental';

export interface SyncedWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface SyncedLine {
  startTime: number;
  endTime: number;
  text: string;
  type?: LineType;
  words?: SyncedWord[];
}

const MAX_CHARS_PER_LINE = LYRICS_FORMAT.MAX_CHARS_PER_LINE;
const TIMING_GAP_THRESHOLD_MS = 500;
const MIN_WORDS_PER_LINE = LYRICS_FORMAT.MIN_WORDS_PER_LINE;

export interface AlignmentStats {
  minConfidence: number;
  maxConfidence: number;
  avgConfidence: number;
  totalWords: number;
  successfulWords: number;
  timelineGaps: Array<{ gapStart: number; gapEnd: number; durationMs: number }>;
}

export interface LyricsTimelineResult {
  success: boolean;
  clipId: string;
  rawAlignment?: MusicApiAlignedWord[];
  syncedLines?: SyncedLine[];
  alignmentStats?: AlignmentStats;
  error?: string;
  processingTimeMs?: number;
  fromCache?: boolean;
}

interface CacheEntry {
  result: LyricsTimelineResult;
  cachedAt: number;
}

export class MusicApiLyricsTimelineClient {
  private apiKey: string;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs = 60 * 60 * 1000;

  constructor() {
    const apiKey = process.env.MUSICAPI_API_KEY;
    if (!apiKey) {
      throw PipelineError.serviceUnavailable(
        'MusicAPI.ai',
        new Error('MUSICAPI_API_KEY environment variable is required for lyrics timeline')
      );
    }
    this.apiKey = apiKey;
    logger.info('MusicApiLyricsTimelineClient initialized with retry, timeout, and caching');
  }

  /**
   * Fetch the synchronized lyrics timeline for a clip with retry and caching
   * @param clipId - The MusicAPI.ai clip ID from music generation
   * @param forceRefresh - Skip cache and fetch fresh data from MusicAPI
   * @returns Aligned words with timestamps
   */
  async fetchLyricsTimeline(clipId: string, forceRefresh: boolean = false): Promise<LyricsTimelineResult> {
    const startTime = Date.now();

    if (!forceRefresh) {
      const cached = this.getCachedResult(clipId);
      if (cached) {
        logger.info('Returning cached lyrics timeline', { clipId, cachedAgo: Date.now() - cached.cachedAt });
        return { ...cached.result, fromCache: true };
      }
    }

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.fetchWithTimeout(clipId, attempt);

      if (result.success) {
        this.setCachedResult(clipId, result);
        return result;
      }

      lastError = result.error;

      if (this.isRetryableError(result.error) && attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn('Retrying lyrics timeline fetch', {
          clipId,
          attempt,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          error: result.error,
        });
        await this.sleep(delay);
      } else {
        break;
      }
    }

    return {
      success: false,
      clipId,
      error: lastError || 'Failed after all retry attempts',
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Fetch with timeout using AbortController
   */
  private async fetchWithTimeout(clipId: string, attempt: number): Promise<LyricsTimelineResult> {
    const startTime = Date.now();
    const endpoint = `${MUSICAPI_BASE_URL}/api/v1/sonic/aligned-lyrics`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      logger.info('Fetching lyrics timeline from MusicAPI.ai', {
        clipId,
        endpoint,
        attempt,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clip_id: clipId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const isRetryable = response.status >= 500 || response.status === 429;
        logger.error('MusicAPI.ai lyrics timeline request failed', {
          clipId,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          isRetryable,
        });
        return {
          success: false,
          clipId,
          error: `HTTP ${response.status}: ${response.statusText}${isRetryable ? ' (retryable)' : ''}`,
          processingTimeMs: Date.now() - startTime,
        };
      }

      const result = await response.json() as MusicApiLyricsTimelineResponse;

      if (result.code !== 200 || !result.data?.alignment) {
        logger.error('MusicAPI.ai lyrics timeline returned error', {
          clipId,
          code: result.code,
          message: result.message,
        });
        return {
          success: false,
          clipId,
          error: result.message || 'Failed to get lyrics timeline',
          processingTimeMs: Date.now() - startTime,
        };
      }

      const alignment = result.data.alignment;

      if (alignment.length === 0) {
        logger.warn('MusicAPI.ai returned empty alignment array', { clipId });
        return {
          success: false,
          clipId,
          error: 'Empty alignment array - song may have no detected lyrics',
          processingTimeMs: Date.now() - startTime,
        };
      }

      const syncedLines = this.transformToSyncedLines(alignment);
      const alignmentStats = this.computeAlignmentStats(alignment);

      logger.info('Successfully fetched lyrics timeline', {
        clipId,
        alignmentCount: alignment.length,
        syncedLinesCount: syncedLines.length,
        processingTimeMs: Date.now() - startTime,
        ...alignmentStats,
      });

      return {
        success: true,
        clipId,
        rawAlignment: alignment,
        syncedLines,
        alignmentStats,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const isAbort = error instanceof Error && error.name === 'AbortError';
      const errorMessage = isAbort
        ? `Request timeout after ${REQUEST_TIMEOUT_MS}ms (retryable)`
        : error instanceof Error
          ? error.message
          : 'Unknown error';

      logger.error('Exception fetching lyrics timeline', {
        clipId,
        error: errorMessage,
        isTimeout: isAbort,
      });

      return {
        success: false,
        clipId,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Compute alignment confidence statistics for debugging
   */
  private computeAlignmentStats(alignment: MusicApiAlignedWord[]): AlignmentStats {
    const successfulWords = alignment.filter(w => w.success);
    const confidences = successfulWords.map(w => w.p_align);

    const gaps: Array<{ gapStart: number; gapEnd: number; durationMs: number }> = [];
    for (let i = 1; i < successfulWords.length; i++) {
      const prev = successfulWords[i - 1];
      const curr = successfulWords[i];
      const gapDuration = (curr.start_s - prev.end_s) * 1000;
      if (gapDuration > 500) {
        gaps.push({
          gapStart: prev.end_s,
          gapEnd: curr.start_s,
          durationMs: gapDuration,
        });
      }
    }

    return {
      minConfidence: confidences.length > 0 ? Math.min(...confidences) : 0,
      maxConfidence: confidences.length > 0 ? Math.max(...confidences) : 0,
      avgConfidence: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      totalWords: alignment.length,
      successfulWords: successfulWords.length,
      timelineGaps: gaps,
    };
  }

  /**
   * Transform MusicAPI.ai alignment format to our SyncedLine format
   *
   * Creates display-optimized lines using:
   * 1. Original newlines (preserve musical structure from lyrics)
   * 2. Timing gaps > 500ms (natural pauses in singing)
   * 3. Max characters per line (readability on mobile - ~42 chars)
   *
   * Each line includes word-level timing data for karaoke-style display
   */
  private transformToSyncedLines(alignment: MusicApiAlignedWord[]): SyncedLine[] {
    const syncedLines: SyncedLine[] = [];
    let currentLineWords: MusicApiAlignedWord[] = [];
    let currentLineStart: number | null = null;
    let currentLineCharCount = 0;

    const flushLine = (endTime: number) => {
      if (currentLineWords.length === 0 || currentLineStart === null) return;

      const lineText = currentLineWords
        .map(w => w.word.replace(/\n/g, ''))
        .join('')
        .trim();

      if (lineText.length > 0) {
        const words: SyncedWord[] = currentLineWords.map(w => ({
          word: w.word.replace(/\n/g, ''),
          startTime: w.start_s,
          endTime: w.end_s,
          confidence: w.p_align,
        }));

        syncedLines.push({
          startTime: currentLineStart,
          endTime,
          text: lineText,
          type: this.detectLineType(lineText),
          words,
        });
      }

      currentLineWords = [];
      currentLineStart = null;
      currentLineCharCount = 0;
    };

    for (let i = 0; i < alignment.length; i++) {
      const word = alignment[i];
      if (!word.success) continue;

      const wordText = word.word.replace(/\n/g, '');
      const hasNewline = word.word.includes('\n');

      if (currentLineStart === null) {
        currentLineStart = word.start_s;
      }

      const prevWord = currentLineWords.length > 0 ? currentLineWords[currentLineWords.length - 1] : null;
      const timingGapMs = prevWord ? (word.start_s - prevWord.end_s) * 1000 : 0;
      const hasTimingGap = timingGapMs > TIMING_GAP_THRESHOLD_MS;

      const wouldExceedMaxChars = currentLineCharCount + wordText.length > MAX_CHARS_PER_LINE;
      const hasMinWords = currentLineWords.length >= MIN_WORDS_PER_LINE;

      // Detect word fragments: if word doesn't start with space or capital,
      // and doesn't look like a complete word, don't break
      const startsWithSpace = wordText.startsWith(' ');
      const startsWithCapital = /^[A-ZÀ-ÖØ-Ý]/.test(wordText.trim());
      const isWordFragment = !startsWithSpace && !startsWithCapital && /^[a-zà-öø-ÿ',;:!?.-]/.test(wordText);

      if (hasTimingGap && hasMinWords && !isWordFragment) {
        flushLine(prevWord!.end_s);
        currentLineStart = word.start_s;
      }

      if (wouldExceedMaxChars && hasMinWords && !hasTimingGap && !isWordFragment) {
        flushLine(prevWord!.end_s);
        currentLineStart = word.start_s;
      }

      currentLineWords.push(word);
      currentLineCharCount += wordText.length;

      if (hasNewline) {
        flushLine(word.end_s);
      }
    }

    flushLine(currentLineWords.length > 0 ? currentLineWords[currentLineWords.length - 1].end_s : 0);

    return syncedLines;
  }

  /**
   * Detect line type based on content patterns relevant to therapeutic songs:
   * - Section markers: [Verse], [Chorus], [Bridge], [Outro], [Intro]
   * - Backing vocals/ad-libs: (ooh, aah), (yeah), (hmm)
   * - Instrumental markers: [Instrumental], [Solo], [Break]
   */
  private detectLineType(text: string): LineType {
    const trimmed = text.trim();

    const sectionPattern = /^\[(Verse|Chorus|Bridge|Outro|Intro|Pre-Chorus|Hook|Refrain)\s*\d*\]$/i;
    if (sectionPattern.test(trimmed)) {
      return 'section';
    }

    const instrumentalPattern = /^\[(Instrumental|Solo|Break|Interlude|Music)\]$/i;
    if (instrumentalPattern.test(trimmed)) {
      return 'instrumental';
    }

    const backingPattern = /^\([^)]{1,30}\)$/;
    if (backingPattern.test(trimmed)) {
      return 'backing';
    }

    return 'line';
  }

  /**
   * Find the active line index for a given playback timestamp using binary search
   * @param syncedLines - Array of synced lines
   * @param currentTimeSeconds - Current playback position in seconds
   * @returns Index of the current line, or -1 if no line is active
   */
  findCurrentLineIndex(syncedLines: SyncedLine[], currentTimeSeconds: number): number {
    if (!syncedLines || syncedLines.length === 0) return -1;

    let left = 0;
    let right = syncedLines.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const line = syncedLines[mid];

      if (currentTimeSeconds >= line.startTime && currentTimeSeconds < line.endTime) {
        return mid;
      } else if (currentTimeSeconds < line.startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return -1;
  }

  /**
   * Get upcoming lines for pre-rendering or animation preparation
   * @param syncedLines - Array of synced lines
   * @param currentTimeSeconds - Current playback position in seconds
   * @param count - Number of upcoming lines to return (default: 3)
   * @returns Array of upcoming lines with their indices
   */
  getUpcomingLines(
    syncedLines: SyncedLine[],
    currentTimeSeconds: number,
    count: number = 3
  ): Array<{ line: SyncedLine; index: number }> {
    if (!syncedLines || syncedLines.length === 0) return [];

    const startIndex = syncedLines.findIndex(line => line.startTime > currentTimeSeconds);
    if (startIndex === -1) return [];

    const result: Array<{ line: SyncedLine; index: number }> = [];
    for (let i = startIndex; i < Math.min(startIndex + count, syncedLines.length); i++) {
      result.push({ line: syncedLines[i], index: i });
    }

    return result;
  }

  /**
   * Get raw word-level alignment for karaoke-style display
   * Useful for word-by-word highlighting during playback
   */
  async fetchWordLevelAlignment(
    clipId: string,
    forceRefresh: boolean = false
  ): Promise<{
    success: boolean;
    words?: Array<{ word: string; startTime: number; endTime: number; confidence: number }>;
    error?: string;
  }> {
    const result = await this.fetchLyricsTimeline(clipId, forceRefresh);

    if (!result.success || !result.rawAlignment) {
      return {
        success: false,
        error: result.error,
      };
    }

    const words = result.rawAlignment
      .filter(w => w.success)
      .map(w => ({
        word: w.word.replace(/\n/g, ' ').trim(),
        startTime: w.start_s,
        endTime: w.end_s,
        confidence: w.p_align,
      }))
      .filter(w => w.word.length > 0);

    return {
      success: true,
      words,
    };
  }

  /**
   * Check if an error is retryable (transient network issues)
   */
  private isRetryableError(error?: string): boolean {
    if (!error) return false;
    return (
      error.includes('retryable') ||
      error.includes('timeout') ||
      error.includes('ECONNRESET') ||
      error.includes('ETIMEDOUT') ||
      error.includes('fetch failed')
    );
  }

  private getCachedResult(clipId: string): CacheEntry | null {
    const entry = this.cache.get(clipId);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > this.cacheTtlMs) {
      this.cache.delete(clipId);
      return null;
    }

    return entry;
  }

  private setCachedResult(clipId: string, result: LyricsTimelineResult): void {
    this.cache.set(clipId, {
      result,
      cachedAt: Date.now(),
    });
  }

  /**
   * Clear cache for a specific clipId or all entries
   */
  clearCache(clipId?: string): void {
    if (clipId) {
      this.cache.delete(clipId);
    } else {
      this.cache.clear();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let instance: MusicApiLyricsTimelineClient | null = null;

export function getMusicApiLyricsTimelineClient(): MusicApiLyricsTimelineClient {
  if (!instance) {
    instance = new MusicApiLyricsTimelineClient();
  }
  return instance;
}
