/**
 * LyricsPreparationService - Consolidated service for lyrics generation, fetching, and title synthesis
 *
 * Consolidates duplicated lyrics logic from:
 * - GenerateMusicFromEntryUseCase.generateLyricsFromEntry()
 * - GenerateMusicFromEntryUseCase.fetchExistingLyrics()
 * - GenerateMusicFromEntryUseCase.generateSongTitle()
 * - GenerateAlbumFromChapterUseCase (similar patterns)
 */

import * as fs from 'fs';
import {
  getLogger,
  getServiceUrl,
  getOwnPort,
  createServiceHttpClient,
  type HttpClient,
} from '../../config/service-urls';
import {
  LyricsResponseSchema,
  LyricsListResponseSchema,
  ContentGenerationResponseSchema,
  SavedLyricsResponseSchema,
  validateAndExtract,
  isContentPubliclyAccessible,
  CONTENT_VISIBILITY,
  type ContentVisibility,
} from '@aiponge/shared-contracts';
import {
  EntryContentGateway,
  type UserPreferences,
  type NarrativeSeeds,
  type EntryContent,
  type UserPersonaData,
} from './EntryContentGateway';
import { ProvidersServiceClient } from '../../infrastructure/clients/ProvidersServiceClient';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
export type { ContentVisibility };

const logger = getLogger('music-service:lyrics-preparation');

// Direct file logging for debugging - writes to /tmp/aiponge-logs/music-generation.log
const LOG_FILE = '/tmp/aiponge-logs/music-generation.log';
function logToFile(level: string, message: string, data?: Record<string, unknown>): void {
  try {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    const line = `${timestamp} [${level}] ${message}${dataStr}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch (fileError) {
    logger.warn('Failed to write to debug log file', {
      error: fileError instanceof Error ? fileError.message : String(fileError),
    });
  }
}

// Cache for LLM model configuration (refreshed every 5 minutes)
let cachedLlmModel: { model: string; fetchedAt: number } | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const MAX_TITLE_PROMPT_LENGTH = 500;
const MAX_SONG_TITLE_LENGTH = 100;

/**
 * Parse [Title] section from generated lyrics and extract the title
 * Returns both the clean lyrics (without title section) and the extracted title
 *
 * Handles formats:
 * - [Title]\nSong Name\n\n[Verse 1]...
 * - [Title] Song Name\n\n[Verse 1]...
 * - Leading whitespace before [Title]
 */
const LANGUAGE_CODE_TO_LOCALE: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  fr: 'fr-FR',
  ja: 'ja-JP',
};

function normalizeLanguageCode(language: string): string {
  if (language.includes('-')) return language;
  return LANGUAGE_CODE_TO_LOCALE[language.toLowerCase()] || language;
}

function parseTitleFromLyrics(lyricsWithTitle: string): { lyrics: string; title: string | null } {
  // Normalize leading whitespace to improve template compliance
  const normalized = lyricsWithTitle.trimStart();

  // Match [Title] section followed by title text, then blank line or next section
  // Supports: [Title]\nSong Name or [Title] Song Name on same line
  const titlePattern = /^\[Title\]\s*\n?(.+?)(?:\n\n|\n(?=\[))/is;
  const match = normalized.match(titlePattern);

  if (match && match[1]) {
    const extractedTitle = match[1].trim();
    if (extractedTitle.length > 0 && extractedTitle.length < MAX_SONG_TITLE_LENGTH) {
      const cleanLyrics = normalized.replace(titlePattern, '').trim();
      logger.debug('🎵 Extracted title from lyrics', { title: extractedTitle });
      return { lyrics: cleanLyrics, title: extractedTitle };
    }
  }

  return { lyrics: lyricsWithTitle, title: null };
}

/**
 * Remove section headers like [Verse 1], [Chorus], [Bridge], [Outro], etc. from lyrics
 * These are structural markers that shouldn't be stored or displayed to users
 */
function removeSectionHeaders(lyrics: string): string {
  // Pattern matches lines that are purely section headers:
  // [Verse], [Verse 1], [Chorus], [Pre-Chorus], [Bridge], [Outro], [Intro], [Hook], etc.
  // Handles optional numbers, spaces, and common variations
  const sectionHeaderPattern =
    /^\s*\[(Verse|Chorus|Pre-Chorus|Bridge|Outro|Intro|Hook|Refrain|Interlude|Break|Coda|Ending|Fade)(?:\s*\d*)?\]\s*$/gim;

  return lyrics
    .split('\n')
    .filter(line => !sectionHeaderPattern.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple blank lines to max 2
    .trim();
}

export interface CachedUserContextInput {
  preferences?: { currentMood?: string; displayName?: string; languagePreference?: string; emotionalState?: string; wellnessIntention?: string };
  narrativeSeeds?: { keywords?: string[]; emotionalProfile?: Record<string, unknown> };
  persona?: Record<string, unknown>;
}

export interface BookContext {
  bookType?: string;
  bookTitle?: string;
  bookDescription?: string;
  chapterTitle?: string;
  bookCategory?: string;
  bookTags?: string[];
  bookThemes?: string[];
}

export interface LyricsPreparationRequest {
  userId: string;
  requestId: string;
  entryId?: string;
  entryContent?: EntryContent;
  providedLyricsId?: string;
  style?: string;
  mood?: string;
  language?: string;
  culturalLanguages?: string[];
  isBilingual?: boolean;
  visibility?: ContentVisibility;
  skipCache?: boolean;
  cachedUserContext?: CachedUserContextInput;
  bookContext?: BookContext;
}

export interface LyricsPreparationResult {
  success: boolean;
  lyricsContent: string | null;
  lyricsId: string | null;
  songTitle: string | null;
  entryContent?: string; // Returned for title generation in pipeline
  error?: string;
  code?: string;
}

/**
 * Metadata for lyrics persistence
 */
interface LyricsSaveMetadata {
  content: string;
  entryId?: string;
  userId: string;
  requestId: string;
  visibility: ContentVisibility;
  language?: string;
  style?: string;
  mood?: string;
  aiProvider?: string;
  aiModel?: string;
  generationPrompt?: string;
  themes?: string[];
  title?: string;
}

export class LyricsPreparationService {
  private httpClient: HttpClient;
  private aiHttpClient: HttpClient;
  private entryGateway: EntryContentGateway;
  private musicServiceUrl: string;
  private aiContentServiceUrl: string;
  private providersClient: ProvidersServiceClient;
  private lyricsRepository?: import('../../infrastructure/database/UnifiedLyricsRepository').UnifiedLyricsRepository;

  constructor(
    entryGateway?: EntryContentGateway,
    lyricsRepository?: import('../../infrastructure/database/UnifiedLyricsRepository').UnifiedLyricsRepository
  ) {
    this.httpClient = createServiceHttpClient('internal');
    this.aiHttpClient = createServiceHttpClient('ai');
    this.entryGateway = entryGateway || new EntryContentGateway();
    this.musicServiceUrl = `http://localhost:${getOwnPort()}`;
    this.aiContentServiceUrl = getServiceUrl('ai-content-service');
    this.providersClient = getServiceRegistry().providersClient as unknown as ProvidersServiceClient;
    this.lyricsRepository = lyricsRepository;
  }

  /**
   * Get LLM model from database configuration with caching
   * Single source of truth: cfg_provider_configs table
   */
  private async getLlmModel(): Promise<string> {
    // Check cache first
    if (cachedLlmModel && Date.now() - cachedLlmModel.fetchedAt < MODEL_CACHE_TTL_MS) {
      return cachedLlmModel.model;
    }

    try {
      const result = await this.providersClient.getModelConfiguration('llm');
      const model = result.config?.model || 'gpt-4o-mini';

      // Update cache
      cachedLlmModel = { model, fetchedAt: Date.now() };

      logger.debug('LLM model configuration loaded from database', { model });
      return model;
    } catch (error) {
      logger.warn('Failed to fetch LLM model config, using default', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'gpt-4o-mini';
    }
  }

  /**
   * Main entry point - prepares lyrics and title for music generation
   */
  async prepareLyrics(request: LyricsPreparationRequest): Promise<LyricsPreparationResult> {
    const { userId, requestId, providedLyricsId, entryId, entryContent } = request;

    if (providedLyricsId) {
      return this.fetchExistingLyricsById(providedLyricsId, userId, requestId);
    }

    if (entryContent || entryId) {
      return this.generateLyricsFromEntry(request);
    }

    return {
      success: false,
      lyricsContent: null,
      lyricsId: null,
      songTitle: null,
      error: 'Either lyricsId, entryId, or entryContent is required',
      code: 'MISSING_INPUT',
    };
  }

  /**
   * Fetch existing lyrics by ID
   */
  async fetchExistingLyricsById(lyricsId: string, userId: string, requestId: string): Promise<LyricsPreparationResult> {
    const fetchUrl = `${this.musicServiceUrl}/api/lyrics/${lyricsId}`;
    logger.info('Fetching existing lyrics', { lyricsId, userId });

    try {
      const rawData = await this.httpClient.get<Record<string, unknown>>(fetchUrl, {
        headers: { 'x-user-id': userId, 'x-request-id': requestId },
      });

      const validated = validateAndExtract(LyricsResponseSchema, rawData, logger);

      if (validated?.content) {
        return {
          success: true,
          lyricsContent: validated.content,
          lyricsId,
          songTitle: null,
        };
      }

      const dataObj = rawData?.data as Record<string, unknown> | undefined;
      if (rawData?.success === true && typeof dataObj?.content === 'string') {
        logger.warn('Using fallback lyrics extraction', { lyricsId });
        return {
          success: true,
          lyricsContent: dataObj.content,
          lyricsId,
          songTitle: null,
        };
      }

      return {
        success: false,
        lyricsContent: null,
        lyricsId: null,
        songTitle: null,
        error: 'Failed to fetch lyrics content',
        code: 'LYRICS_FETCH_FAILED',
      };
    } catch (error) {
      logger.error('Error fetching lyrics', {
        error: error instanceof Error ? error.message : String(error),
        lyricsId,
      });
      return {
        success: false,
        lyricsContent: null,
        lyricsId: null,
        songTitle: null,
        error: 'Failed to fetch lyrics',
        code: 'LYRICS_FETCH_ERROR',
      };
    }
  }

  /**
   * Generate lyrics from entry content
   */
  private async generateLyricsFromEntry(request: LyricsPreparationRequest): Promise<LyricsPreparationResult> {
    const {
      userId,
      requestId,
      entryId,
      entryContent,
      style,
      mood,
      language,
      culturalLanguages,
      visibility,
      skipCache,
    } = request;

    const shared = isContentPubliclyAccessible(visibility ?? CONTENT_VISIBILITY.PERSONAL);

    // Get LLM model from database config (single source of truth)
    const llmModel = await this.getLlmModel();

    let content: string;
    let updatedAt: string | null = null;

    if (entryContent) {
      content = entryContent.content;
      updatedAt = entryContent.updatedAt ?? null;
    } else if (entryId) {
      const result = await this.entryGateway.fetchEntryContent(entryId, userId, requestId);
      if (!result.success || !result.entry) {
        return {
          success: false,
          lyricsContent: null,
          lyricsId: null,
          songTitle: null,
          error: result.error || 'Failed to fetch entry',
          code: result.code || 'ENTRY_FETCH_FAILED',
        };
      }
      content = result.entry.content;
      updatedAt = result.entry.updatedAt ?? null;
    } else {
      return {
        success: false,
        lyricsContent: null,
        lyricsId: null,
        songTitle: null,
        error: 'No entry content available',
        code: 'MISSING_ENTRY',
      };
    }

    if (!skipCache && entryId) {
      const cached = await this.checkExistingLyrics(entryId, userId, requestId, updatedAt ? new Date(updatedAt) : null);
      if (cached) {
        // NOTE: Title is extracted from lyrics content by the generation service
        // This allows frontend to display lyrics instantly while title is extracted separately
        return {
          success: true,
          lyricsContent: cached.content,
          lyricsId: cached.id,
          songTitle: null, // Title generated separately in pipeline
          entryContent: content, // Return entry content for title generation
        };
      }
    }

    // NOTE: Race condition exists between cache check and save. Concurrent requests for the
    // same entryId may both generate lyrics. This is acceptable because:
    // 1. Duplicates don't cause data corruption (each lyrics entry is independent)
    // 2. The next request will use the cached version
    // 3. Full mitigation would require distributed locking (Redis) or DB upsert with unique constraint
    // Future: Consider adding unique index on (entryId, userId) and using upsert pattern

    // For shared library (librarian) generation, skip personal preferences/persona
    // Librarian content is for general audience, not personalized to the librarian's own preferences
    // This prevents genre mismatches (e.g., librarian's "flamenco" preference overriding "pop" request)
    let prefResult: Awaited<ReturnType<typeof this.entryGateway.fetchUserPreferences>> = { success: false };
    let seedsResult: Awaited<ReturnType<typeof this.entryGateway.fetchNarrativeSeeds>> = { success: false };
    let personaResult: Awaited<ReturnType<typeof this.entryGateway.fetchUserPersona>> = { success: false };

    if (!shared) {
      if (request.cachedUserContext) {
        logger.debug('Using cached user context from album-level fetch', { requestId, userId });
        const cached = request.cachedUserContext;
        if (cached.preferences) prefResult = { success: true, preferences: cached.preferences };
        if (cached.narrativeSeeds) seedsResult = { success: true, seeds: cached.narrativeSeeds };
        if (cached.persona) personaResult = { success: true, persona: cached.persona as unknown as UserPersonaData };
      } else {
        [prefResult, seedsResult, personaResult] = await Promise.all([
          this.entryGateway.fetchUserPreferences(userId, requestId),
          this.entryGateway.fetchNarrativeSeeds(userId, requestId),
          this.entryGateway.fetchUserPersona(userId, requestId),
        ]);
      }
    } else {
      logger.info('Skipping personal preferences for shared library generation', {
        requestId,
        userId,
        visibility,
      });
    }

    const inferredBilingual =
      culturalLanguages && culturalLanguages.length === 2 && culturalLanguages[0] !== culturalLanguages[1];
    const effectiveBilingual = request.isBilingual ?? inferredBilingual;
    const rawLanguage = language || culturalLanguages?.[0] || prefResult.preferences?.languagePreference || 'en-US';
    const primaryLanguage = normalizeLanguageCode(rawLanguage);

    const lyricsResult = await this.callLyricsGeneration(
      content,
      userId,
      requestId,
      style,
      mood,
      primaryLanguage,
      culturalLanguages || [],
      effectiveBilingual,
      prefResult.preferences,
      seedsResult.seeds,
      personaResult.persona,
      request.bookContext
    );

    if (!lyricsResult.success) {
      logger.error('🎵 [LYRICS] Generation failed with specific error', {
        requestId,
        userId,
        error: lyricsResult.error,
        code: lyricsResult.code,
      });
      return {
        success: false,
        lyricsContent: null,
        lyricsId: null,
        songTitle: null,
        error: lyricsResult.error,
        code: lyricsResult.code,
      };
    }

    const rawLyricsContent = lyricsResult.content;

    // Parse title from generated lyrics (saves an extra AI call)
    const { lyrics: lyricsWithoutTitle, title: extractedTitle } = parseTitleFromLyrics(rawLyricsContent);

    // Keep section headers like [Verse 1], [Chorus], [Bridge] — MusicAPI.ai uses them to structure the song
    const cleanLyrics = lyricsWithoutTitle.trim();

    if (extractedTitle) {
      logger.info('🎵 Title extracted from lyrics generation - skipping separate title call', {
        title: extractedTitle,
        userId,
        entryId,
      });
    }

    const themes: string[] = [];
    if (style) themes.push(style);
    if (mood) themes.push(mood);

    const savedLyricsId = await this.saveLyrics({
      content: cleanLyrics,
      entryId,
      userId,
      requestId,
      visibility: visibility ?? CONTENT_VISIBILITY.PERSONAL,
      language: primaryLanguage,
      style,
      mood,
      themes: themes.length > 0 ? themes : undefined,
      aiProvider: 'openai',
      aiModel: llmModel,
      generationPrompt: content.substring(0, 2000),
      title: extractedTitle || undefined,
    });

    if (!savedLyricsId) {
      logger.error('Lyrics generated but persistence FAILED - aborting generation', {
        userId,
        entryId,
        visibility,
        requestId,
      });
      return {
        success: false,
        lyricsContent: null,
        lyricsId: null,
        songTitle: null,
        error: 'Failed to save lyrics to database',
        code: 'LYRICS_PERSISTENCE_FAILED',
      };
    }

    return {
      success: true,
      lyricsContent: cleanLyrics,
      lyricsId: savedLyricsId,
      songTitle: extractedTitle, // Return extracted title (no separate AI call needed)
      entryContent: content, // Return entry content as fallback for title generation
    };
  }

  /**
   * Check for existing lyrics that match the entry
   */
  private async checkExistingLyrics(
    entryId: string,
    userId: string,
    requestId: string,
    entryUpdatedAt: Date | null
  ): Promise<{ id: string; content: string } | null> {
    try {
      if (this.lyricsRepository) {
        const existing = await this.lyricsRepository.findByEntryId(entryId);
        if (!existing?.content) return null;

        const lyricsCreatedAt = existing.createdAt ? new Date(existing.createdAt) : null;
        if (entryUpdatedAt && lyricsCreatedAt && entryUpdatedAt > lyricsCreatedAt) {
          logger.info('Regenerating lyrics - entry modified', { entryId });
          return null;
        }

        logger.info('Using cached lyrics (direct DB)', { entryId, lyricsId: existing.id });
        return { id: existing.id, content: existing.content };
      }

      const url = `${this.musicServiceUrl}/api/lyrics?entryId=${entryId}&limit=1`;
      const rawData = await this.httpClient.get<Record<string, unknown>>(url, {
        headers: { 'x-user-id': userId, 'x-request-id': requestId },
      });

      const validated = validateAndExtract(LyricsListResponseSchema, rawData, logger);
      const existing = validated?.lyrics?.[0];

      if (!existing?.content) return null;

      const lyricsCreatedAt = existing.createdAt ? new Date(existing.createdAt) : null;

      if (entryUpdatedAt && lyricsCreatedAt && entryUpdatedAt > lyricsCreatedAt) {
        logger.info('Regenerating lyrics - entry modified', { entryId });
        return null;
      }

      logger.info('Using cached lyrics', { entryId, lyricsId: existing.id });
      return { id: existing.id, content: existing.content };
    } catch (error) {
      logger.debug('Failed to check existing lyrics', {
        entryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Call AI content service to generate lyrics
   * Returns content on success, or error details on failure
   */
  private async callLyricsGeneration(
    entryContent: string,
    userId: string,
    requestId: string,
    style?: string,
    mood?: string,
    language?: string,
    culturalLanguages?: string[],
    isBilingual?: boolean,
    preferences?: UserPreferences,
    seeds?: NarrativeSeeds,
    persona?: UserPersonaData,
    bookContext?: BookContext
  ): Promise<{ success: true; content: string } | { success: false; error: string; code: string }> {
    const WELLNESS_INTENTION_MAP: Record<string, { primary_goal: string; motivators: string[] }> = {
      stress_relief: {
        primary_goal: 'finding calm and relief from stress',
        motivators: ['Inner peace', 'Relaxation', 'Emotional balance'],
      },
      self_discovery: {
        primary_goal: 'understanding myself more deeply',
        motivators: ['Self-awareness', 'Personal insight', 'Identity exploration'],
      },
      motivation: {
        primary_goal: 'building motivation and drive',
        motivators: ['Achievement', 'Personal growth', 'Overcoming challenges'],
      },
      sleep: { primary_goal: 'improving rest and sleep quality', motivators: ['Rest', 'Tranquility', 'Letting go'] },
      focus: {
        primary_goal: 'sharpening focus and clarity',
        motivators: ['Clarity', 'Productivity', 'Mental sharpness'],
      },
      emotional_healing: {
        primary_goal: 'processing and healing emotions',
        motivators: ['Emotional processing', 'Healing', 'Self-compassion'],
      },
      creative_expression: {
        primary_goal: 'expressing creativity freely',
        motivators: ['Creative freedom', 'Artistic expression', 'Imagination'],
      },
      mindfulness: {
        primary_goal: 'cultivating present-moment awareness',
        motivators: ['Mindfulness', 'Presence', 'Acceptance'],
      },
    };

    const personaContext = persona
      ? {
          personality_type: persona.personality.personalityType,
          cognitive_style: persona.personality.cognitiveStyle,
          dominant_emotions: persona.personality.emotionalProfile.dominantEmotions,
          emotional_stability: persona.personality.emotionalProfile.emotionalStability,
          resilience: persona.personality.emotionalProfile.resilience,
          communication_style: persona.behavior.preferences.communicationStyle,
          motivators: persona.behavior.motivators,
          stressors: persona.behavior.stressors,
          thinking_patterns: persona.cognitive.thinkingPatterns,
          problem_solving_style: persona.cognitive.problemSolvingStyle,
          creativity_level: persona.cognitive.creativity,
          strengths: persona.growth.strengths,
          development_areas: persona.growth.developmentAreas,
          persona_confidence: persona.confidence,
        }
      : undefined;

    const wellnessContext =
      !persona && preferences?.wellnessIntention ? WELLNESS_INTENTION_MAP[preferences.wellnessIntention] : undefined;

    const body = {
      userId,
      contentType: 'creative',
      prompt: entryContent,
      parameters: {
        style,
        mood,
        currentMood: preferences?.currentMood,
        displayName: preferences?.displayName,
        language,
        culturalLanguages,
        isBilingual,
        narrativeSeeds: seeds?.keywords,
        narrativeEmotionalContext: seeds?.emotionalProfile,
        // Persona-based personalization for enhanced lyrics
        ...personaContext,
        // Wellness intention fallback when no persona exists
        ...(wellnessContext && {
          primary_goal: wellnessContext.primary_goal,
          motivators: wellnessContext.motivators,
          motivation_type: preferences!.wellnessIntention,
        }),
        // Book context for source-aware lyrics
        ...(bookContext && {
          book_type: bookContext.bookType,
          book_title: bookContext.bookTitle,
          book_description: bookContext.bookDescription,
          chapter_title: bookContext.chapterTitle,
          book_category: bookContext.bookCategory,
          book_tags: bookContext.bookTags,
          book_themes: bookContext.bookThemes,
        }),
      },
      options: { templateId: 'music-lyrics' },
    };

    if (persona) {
      logger.info('🎭 Using persona for lyrics personalization', {
        userId,
        personalityType: persona.personality.personalityType,
        confidence: persona.confidence,
        dataPoints: persona.dataPoints,
      });
    } else if (wellnessContext) {
      logger.info('🌿 Using wellness intention for lyrics personalization (no persona yet)', {
        userId,
        wellnessIntention: preferences?.wellnessIntention,
        primaryGoal: wellnessContext.primary_goal,
      });
    }

    try {
      const url = `${this.aiContentServiceUrl}/api/content/generate`;

      const callData = {
        requestId,
        userId,
        promptLength: entryContent.length,
        language,
        templateId: 'music-lyrics',
        url,
      };
      logger.info('🎵 [LYRICS] Calling AI content service', callData);
      logToFile('INFO', '🎵 [LYRICS] Calling AI content service', callData);

      // Use aiHttpClient with 120s timeout for AI content generation
      const rawResult = await this.aiHttpClient.post<Record<string, unknown>>(url, body, {
        headers: { 'x-user-id': userId, 'x-request-id': requestId },
      });

      // Log raw response for debugging
      const responseData = {
        requestId,
        hasRawResult: !!rawResult,
        rawResultKeys: rawResult ? Object.keys(rawResult) : [],
        success: rawResult?.success,
        hasContent: !!(rawResult as Record<string, unknown>)?.content,
        errorField: (rawResult as Record<string, unknown>)?.error,
      };
      logger.debug('🎵 [LYRICS] AI content service response', responseData);
      logToFile('DEBUG', '🎵 [LYRICS] AI content service response', responseData);

      const validated = validateAndExtract(ContentGenerationResponseSchema, rawResult, logger);

      if (validated?.content && validated.content.trim().length > 0) {
        const successData = {
          requestId,
          contentLength: validated.content.length,
        };
        logger.info('🎵 [LYRICS] Generation successful', successData);
        logToFile('INFO', '🎵 [LYRICS] Generation successful', successData);
        return { success: true, content: validated.content };
      }

      // Extract specific error from AI service response
      const rawError = (rawResult as Record<string, unknown>)?.error;
      const errorMessage: string =
        typeof rawError === 'string' ? rawError : String((rawError as Record<string, unknown> | undefined)?.message || 'AI service returned empty content');

      const emptyData = {
        requestId,
        userId,
        promptLength: entryContent.length,
        validatedContent: validated?.content?.substring(0, 100),
        rawSuccess: rawResult?.success,
        rawError,
        errorMessage,
      };
      logger.error('🎵 [LYRICS] Generation returned empty or invalid content', emptyData);
      logToFile('ERROR', '🎵 [LYRICS] Generation returned empty or invalid content', emptyData);
      return {
        success: false,
        error: errorMessage,
        code: 'AI_CONTENT_EMPTY',
      };
    } catch (error) {
      // Enhanced error logging with full details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              stack: error.stack?.split('\n').slice(0, 3).join('\n'),
            }
          : { raw: String(error) };

      const errorData = {
        requestId,
        userId,
        promptLength: entryContent.length,
        language,
        ...errorDetails,
      };
      logger.error('🎵 [LYRICS] Generation FAILED with exception', errorData);
      logToFile('ERROR', '🎵 [LYRICS] Generation FAILED with exception', errorData);
      return {
        success: false,
        error: `AI service error: ${errorMessage}`,
        code: 'AI_SERVICE_EXCEPTION',
      };
    }
  }

  /**
   * Save generated lyrics to database
   * @returns The saved lyrics ID, or null if save failed
   */
  private async saveLyrics(metadata: LyricsSaveMetadata): Promise<string | null> {
    const {
      content,
      entryId,
      userId,
      requestId,
      visibility,
      language,
      style,
      mood,
      aiProvider,
      aiModel,
      generationPrompt,
      themes,
      title,
    } = metadata;

    const shared = isContentPubliclyAccessible(visibility);

    try {
      const headers: Record<string, string> = {
        'x-user-id': userId,
        'x-request-id': requestId,
      };
      if (shared) {
        headers['x-internal-service'] = 'music-service';
      }

      const url = `${this.musicServiceUrl}/api/lyrics`;
      const rawData = await this.httpClient.post<Record<string, unknown>>(
        url,
        {
          content,
          entryId,
          userId,
          sourceType: 'generated',
          language,
          style,
          mood,
          aiProvider,
          aiModel,
          generationPrompt,
          themes,
          title,
          visibility,
        },
        { headers }
      );

      const validated = validateAndExtract(SavedLyricsResponseSchema, rawData, logger);
      if (validated?.id) {
        logger.info('Lyrics saved successfully', { lyricsId: validated.id, visibility });
        return validated.id;
      }

      // Log details about why validation failed
      logger.error('Lyrics save response validation failed', {
        visibility,
        userId,
        rawDataSuccess: (rawData as Record<string, unknown>)?.success,
        rawDataError: (rawData as Record<string, unknown>)?.error,
        hasData: !!(rawData as Record<string, unknown>)?.data,
      });
      return null;
    } catch (error) {
      logger.error('Failed to save lyrics - HTTP error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
        visibility,
        userId,
      });
      return null;
    }
  }

  /**
   * Generate song title from entry content
   * @returns The generated title, or null if generation failed
   */
  async generateSongTitle(
    entryContent: string,
    userId: string,
    requestId: string,
    style?: string,
    mood?: string
  ): Promise<string | null> {
    try {
      const url = `${this.aiContentServiceUrl}/api/content/generate`;
      // Use aiHttpClient with 120s timeout for AI content generation
      const rawData = await this.aiHttpClient.post<Record<string, unknown>>(
        url,
        {
          userId,
          contentType: 'title',
          prompt: entryContent.substring(0, MAX_TITLE_PROMPT_LENGTH),
          parameters: { style, mood },
          options: { templateId: 'song-title-generation-v1' },
        },
        {
          headers: { 'x-user-id': userId, 'x-request-id': requestId },
        }
      );

      const validated = validateAndExtract(ContentGenerationResponseSchema, rawData, logger);
      const title = validated?.content?.trim();
      if (title && title.length > 0 && title.length < MAX_SONG_TITLE_LENGTH) {
        return title;
      }
      return null;
    } catch (error) {
      logger.warn('Failed to generate song title', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

let _lyricsPreparationServiceInstance: LyricsPreparationService | null = null;

export async function getLyricsPreparationService(): Promise<LyricsPreparationService> {
  if (!_lyricsPreparationServiceInstance) {
    try {
      const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const { UnifiedLyricsRepository } = await import('../../infrastructure/database/UnifiedLyricsRepository');
      const db = getDatabase();
      _lyricsPreparationServiceInstance = new LyricsPreparationService(undefined, new UnifiedLyricsRepository(db));
    } catch {
      _lyricsPreparationServiceInstance = new LyricsPreparationService();
    }
  }
  return _lyricsPreparationServiceInstance;
}

export const lyricsPreparationService = new LyricsPreparationService();
