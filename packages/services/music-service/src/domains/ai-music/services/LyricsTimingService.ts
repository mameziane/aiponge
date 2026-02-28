/**
 * Lyrics Timing Service - Audio Analysis for Accurate Lyric Synchronization
 *
 * Primary method: MusicAPI.ai "Get Lyrics Timeline" endpoint (native to audio source)
 * Fallback: OpenAI Whisper API for post-hoc audio analysis
 *
 * Architecture:
 * 1. If clipId available: Use MusicAPI.ai lyrics timeline (preferred - native timing)
 * 2. Fallback: Send MP3 to Whisper API for word-level transcription
 * 3. Align timestamps with existing lyrics text
 * 4. Return accurate synced_lines for karaoke-style display
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { getLogger } from '@config/service-urls';
import { PipelineError } from '../../../application/errors';
import type { ILyricsTimelineClient, MusicApiAlignedWord } from '../ports/ILyricsTimelineClient';
import type { IProvidersClient } from '../ports/IProvidersClient';
import { serializeError, withCircuitBreaker } from '@aiponge/platform-core';

const logger = getLogger('music-service-lyricstiming');

// Cache for audio model configuration (refreshed every 5 minutes)
let cachedAudioModel: { model: string; fetchedAt: number } | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface SyncedLine {
  startTime: number;
  endTime: number;
  text: string;
  type?: string;
}

export type TimingMethod = 'musicapi-timeline' | 'whisper-audio-analysis';

export interface AudioAnalysisResult {
  success: boolean;
  syncedLines?: SyncedLine[];
  rawTimeline?: MusicApiAlignedWord[];
  metadata: {
    duration: number;
    wordCount: number;
    confidence: number;
    processingTime: number;
    method: TimingMethod;
  };
  error?: string;
}

export class LyricsTimingService {
  private openai: OpenAI | null = null;
  private musicApiClient: ILyricsTimelineClient | null = null;
  private providersClient: IProvidersClient;
  private whisperEnabled: boolean;

  constructor(deps: {
    providersClient: IProvidersClient;
    musicApiClient?: ILyricsTimelineClient | null;
    openaiClient?: OpenAI | null;
  }) {
    this.providersClient = deps.providersClient;
    this.musicApiClient = deps.musicApiClient ?? null;
    this.openai = deps.openaiClient ?? null;
    this.whisperEnabled = this.openai !== null || !!process.env.OPENAI_API_KEY;

    if (this.whisperEnabled) {
      logger.info('🎵 LyricsTimingService: Whisper fallback enabled');
    }

    if (this.musicApiClient) {
      logger.info('🎵 LyricsTimingService: MusicAPI.ai timeline enabled (primary)');
    }

    if (!this.whisperEnabled && !this.musicApiClient) {
      throw PipelineError.missingRequiredField('OPENAI_API_KEY or MUSICAPI_API_KEY');
    }

    logger.info('🎵 LyricsTimingService initialized');
  }

  private getOpenAIClient(): OpenAI {
    if (!this.openai) {
      if (!process.env.OPENAI_API_KEY) {
        throw PipelineError.missingRequiredField('OPENAI_API_KEY');
      }
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  /**
   * Get audio model from database configuration with caching
   * Single source of truth: cfg_provider_configs table
   */
  private async getAudioModel(): Promise<string> {
    // Check cache first
    if (cachedAudioModel && Date.now() - cachedAudioModel.fetchedAt < MODEL_CACHE_TTL_MS) {
      return cachedAudioModel.model;
    }

    try {
      const result = await this.providersClient.getModelConfiguration('audio', 'openai-whisper');
      const model = result.config?.model || 'whisper-1';

      // Update cache
      cachedAudioModel = { model, fetchedAt: Date.now() };

      logger.info('Audio model configuration loaded from database', { model });
      return model;
    } catch (error) {
      logger.warn('Failed to fetch audio model config, using default', {
        error: serializeError(error),
      });
      return 'whisper-1';
    }
  }

  /**
   * Get synchronized lyrics using the best available method
   * Primary: MusicAPI.ai timeline (if clipId provided)
   * Fallback: Whisper audio analysis (if audio file available)
   *
   * @param options.forceRefresh - Skip cache and fetch fresh data from MusicAPI (useful for re-sync)
   */
  async getSyncedLyrics(options: {
    clipId?: string;
    audioFilePath?: string;
    lyricsText?: string;
    lyricsLines?: Array<{ text: string; type?: string }>;
    forceRefresh?: boolean;
  }): Promise<AudioAnalysisResult> {
    const startTime = Date.now();

    if (options.clipId && this.musicApiClient) {
      logger.info('🎵 Attempting MusicAPI.ai lyrics timeline', {
        clipId: options.clipId,
        forceRefresh: options.forceRefresh || false,
      });

      const timelineResult = await this.musicApiClient.fetchLyricsTimeline(
        options.clipId,
        options.forceRefresh || false
      );

      if (timelineResult.success && timelineResult.syncedLines) {
        const syncedLines: SyncedLine[] = timelineResult.syncedLines.map(line => ({
          startTime: line.startTime,
          endTime: line.endTime,
          text: line.text,
          type: line.type,
        }));

        logger.info('🎵 MusicAPI.ai lyrics timeline success', {
          clipId: options.clipId,
          syncedLinesCount: syncedLines.length,
          fromCache: timelineResult.fromCache || false,
          alignmentStats: timelineResult.alignmentStats,
        });

        return {
          success: true,
          syncedLines,
          rawTimeline: timelineResult.rawAlignment,
          metadata: {
            duration: syncedLines.length > 0 ? syncedLines[syncedLines.length - 1].endTime : 0,
            wordCount: timelineResult.rawAlignment?.length || 0,
            confidence: timelineResult.alignmentStats?.avgConfidence || 1.0,
            processingTime: Date.now() - startTime,
            method: 'musicapi-timeline',
          },
        };
      }

      logger.warn('MusicAPI.ai timeline failed, falling back to Whisper', {
        clipId: options.clipId,
        error: timelineResult.error,
        processingTimeMs: timelineResult.processingTimeMs,
      });
    }

    if (options.audioFilePath && options.lyricsText && this.whisperEnabled) {
      logger.info('🎤 Falling back to Whisper audio analysis', { audioFilePath: options.audioFilePath });
      return this.analyzeLyricsTiming(options.audioFilePath, options.lyricsText, options.lyricsLines);
    }

    return {
      success: false,
      metadata: {
        duration: 0,
        wordCount: 0,
        confidence: 0,
        processingTime: Date.now() - startTime,
        method: 'whisper-audio-analysis',
      },
      error: 'No valid method available for lyrics timing (need clipId for MusicAPI or audioFilePath for Whisper)',
    };
  }

  /**
   * Analyze MP3 file and generate accurate timestamps for lyrics
   * @param audioFilePath - Full path to MP3 file (e.g., /path/to/public/my-music/song.mp3)
   * @param lyricsText - Existing lyrics text to align with audio
   * @param lyricsLines - Structured lyrics lines (optional, for better alignment)
   */
  async analyzeLyricsTiming(
    audioFilePath: string,
    lyricsText: string,
    lyricsLines?: Array<{ text: string; type?: string }>
  ): Promise<AudioAnalysisResult> {
    const startTime = Date.now();

    try {
      logger.info('🎤 Starting audio analysis for lyrics timing', {
        audioFilePath,
        lyricsLength: lyricsText.length,
        hasStructuredLines: !!lyricsLines,
      });

      // Step 1: Validate audio file exists
      if (!fs.existsSync(audioFilePath)) {
        throw PipelineError.validationFailed('audioFilePath', `Audio file not found: ${audioFilePath}`);
      }

      const fileStats = fs.statSync(audioFilePath);
      logger.debug('📊 Audio file stats', {
        size: fileStats.size,
        sizeKB: Math.round(fileStats.size / 1024),
      });

      // Step 2: Send to Whisper API for transcription with timestamps
      const transcription = await this.transcribeWithWhisper(audioFilePath);

      if (!transcription.words || transcription.words.length === 0) {
        throw PipelineError.generationFailed('Whisper returned no word timestamps');
      }

      logger.info('✅ Whisper transcription complete', {
        wordCount: transcription.words.length,
        duration: transcription.duration,
        language: transcription.language,
      });

      // Step 3: Align Whisper timestamps with our lyrics
      const syncedLines = this.alignLyricsWithTimestamps(
        lyricsLines || this.parseSimpleLyrics(lyricsText),
        transcription.words
      );

      const processingTime = Date.now() - startTime;

      logger.info('🎯 Lyrics timing analysis complete', {
        syncedLinesCount: syncedLines.length,
        processingTimeMs: processingTime,
        avgLineLength: syncedLines.reduce((sum, l) => sum + l.text.length, 0) / syncedLines.length,
      });

      return {
        success: true,
        syncedLines,
        metadata: {
          duration: transcription.duration,
          wordCount: transcription.words.length,
          confidence: this.calculateConfidence(syncedLines),
          processingTime,
          method: 'whisper-audio-analysis',
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('❌ Audio analysis failed', { error, processingTime });

      return {
        success: false,
        metadata: {
          duration: 0,
          wordCount: 0,
          confidence: 0,
          processingTime,
          method: 'whisper-audio-analysis',
        },
        error: error instanceof Error ? error.message : 'Unknown error during audio analysis',
      };
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper API with word-level timestamps
   * Model name is fetched from cfg_provider_configs database (single source of truth)
   */
  private async transcribeWithWhisper(audioFilePath: string): Promise<{
    text: string;
    words: Array<{ word: string; start: number; end: number }>;
    duration: number;
    language: string;
  }> {
    const openai = this.getOpenAIClient();

    // Get model from database configuration (single source of truth)
    const model = await this.getAudioModel();

    logger.debug('📤 Sending audio to Whisper API...', { model });

    const audioStream = fs.createReadStream(audioFilePath);

    const response = await withCircuitBreaker(
      'openai-whisper-api',
      async () =>
        openai.audio.transcriptions.create({
          file: audioStream,
          model: model as string & Record<string, never>,
          response_format: 'verbose_json',
          timestamp_granularities: ['word'],
        }),
      {
        timeout: 120000,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 5,
      }
    );

    // Whisper returns word-level timestamps when using verbose_json + word granularity
    const verboseResponse = response as unknown as {
      words?: Array<{ word: string; start: number; end: number }>;
      duration?: number;
      language?: string;
    };
    const words = verboseResponse.words || [];
    const duration = verboseResponse.duration || 0;
    const language = verboseResponse.language || 'unknown';

    return {
      text: response.text,
      words: words.map((w: { word: string; start: number; end: number }) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      })),
      duration,
      language,
    };
  }

  /**
   * Align lyrics lines with Whisper word timestamps
   * Uses fuzzy matching to handle differences between lyrics text and transcription
   */
  private alignLyricsWithTimestamps(
    lyricsLines: Array<{ text: string; type?: string }>,
    whisperWords: Array<{ word: string; start: number; end: number }>
  ): SyncedLine[] {
    const syncedLines: SyncedLine[] = [];
    let wordIndex = 0;

    for (const line of lyricsLines) {
      // Skip empty lines or section markers like [Verse], [Chorus]
      if (!line.text.trim() || /^\[.*\]$/.test(line.text.trim())) {
        syncedLines.push({
          startTime: wordIndex < whisperWords.length ? whisperWords[wordIndex].start : 0,
          endTime: wordIndex < whisperWords.length ? whisperWords[wordIndex].start + 0.1 : 0.1,
          text: line.text,
          type: line.type,
        });
        continue;
      }

      // Count words in this line
      const lineWords = line.text.split(/\s+/).filter(w => w.length > 0);
      const wordsInLine = lineWords.length;

      if (wordsInLine === 0) {
        continue;
      }

      // Find matching words in Whisper transcription
      const startWordIndex = wordIndex;
      const endWordIndex = Math.min(wordIndex + wordsInLine, whisperWords.length);

      if (startWordIndex >= whisperWords.length) {
        // No more words available, use last known timestamp
        const lastWord = whisperWords[whisperWords.length - 1];
        syncedLines.push({
          startTime: lastWord.end,
          endTime: lastWord.end + 2, // Estimate 2 seconds
          text: line.text,
          type: line.type,
        });
        continue;
      }

      // Get actual timing from Whisper
      const startTime = whisperWords[startWordIndex].start;
      const endTime =
        endWordIndex > startWordIndex ? whisperWords[endWordIndex - 1].end : whisperWords[startWordIndex].end;

      syncedLines.push({
        startTime: Math.max(0, startTime),
        endTime: Math.max(startTime + 0.5, endTime), // Ensure minimum 0.5s duration
        text: line.text,
        type: line.type,
      });

      wordIndex = endWordIndex;
    }

    return syncedLines;
  }

  /**
   * Parse simple lyrics text into lines (fallback when structured lines not provided)
   */
  private parseSimpleLyrics(lyricsText: string): Array<{ text: string; type?: string }> {
    return lyricsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => ({
        text: line,
        type: this.detectLineType(line),
      }));
  }

  /**
   * Detect line type from text (Verse, Chorus, Bridge, etc.)
   */
  private detectLineType(line: string): string | undefined {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('[verse]')) return 'verse';
    if (lowerLine.includes('[chorus]')) return 'chorus';
    if (lowerLine.includes('[bridge]')) return 'bridge';
    if (lowerLine.includes('[pre-chorus]')) return 'pre-chorus';
    if (lowerLine.includes('[outro]')) return 'outro';
    if (lowerLine.includes('[intro]')) return 'intro';
    return undefined;
  }

  /**
   * Calculate confidence score based on timing consistency
   */
  private calculateConfidence(syncedLines: SyncedLine[]): number {
    if (syncedLines.length === 0) return 0;

    let validLines = 0;
    for (const line of syncedLines) {
      // Valid if has reasonable duration and positive timestamps
      if (
        line.startTime >= 0 &&
        line.endTime > line.startTime &&
        line.endTime - line.startTime < 30 // Max 30s per line
      ) {
        validLines++;
      }
    }

    return validLines / syncedLines.length;
  }
}
