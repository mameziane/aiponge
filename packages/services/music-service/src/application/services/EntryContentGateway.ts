/**
 * EntryContentGateway - Unified service for fetching entry content, user preferences, and narrative seeds
 *
 * Consolidates duplicated HTTP calls to user-service that were previously in:
 * - GenerateMusicFromEntryUseCase
 * - GenerateAlbumFromChapterUseCase
 */

import { getLogger, getServiceUrl, createServiceHttpClient, type HttpClient } from '../../config/service-urls';
import {
  EntryResponseSchema,
  UserPreferencesResponseSchema,
  UserPersonaResponseSchema,
  validateAndExtract,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-service:entry-gateway');

// Entry types (unified library content)
export interface EntryContent {
  content: string;
  updatedAt?: string | null;
  chapterId?: string | null;
}

export interface UserPreferences {
  currentMood?: string;
  displayName?: string;
  languagePreference?: string;
  emotionalState?: string;
  wellnessIntention?: string;
}

export interface NarrativeSeeds {
  keywords?: string[];
  emotionalProfile?: Record<string, unknown>;
}

export interface UserPersonaData {
  id: string;
  userId: string;
  personaName: string;
  personaDescription?: string | null;
  personality: {
    primaryTraits: Array<{ trait: string; score: number }>;
    secondaryTraits: Array<{ trait: string; score: number }>;
    personalityType: string;
    cognitiveStyle: string;
    emotionalProfile: {
      dominantEmotions: string[];
      emotionalRange: number;
      emotionalStability: number;
      resilience: number;
    };
  };
  behavior: {
    patterns: Array<{ pattern: string; frequency: number; strength: number; trend: string }>;
    preferences: {
      communicationStyle: string;
      learningStyle: string;
      decisionMaking: string;
      conflictResolution: string;
    };
    motivators: string[];
    stressors: string[];
  };
  cognitive: {
    thinkingPatterns: string[];
    problemSolvingStyle: string;
    creativity: number;
    analyticalThinking: number;
    intuitiveThinkers: number;
  };
  social: {
    relationshipStyle: string;
    socialNeeds: string[];
    communicationPreferences: string[];
  };
  growth: {
    developmentAreas: string[];
    strengths: string[];
    potentialGrowthPaths: string[];
  };
  confidence: number;
  dataPoints: number;
  version: string;
  isActive: boolean;
  generatedAt: string;
  updatedAt: string;
}

export interface FetchPersonaResult {
  success: boolean;
  persona?: UserPersonaData;
  error?: string;
}

export interface FetchEntryResult {
  success: boolean;
  entry?: EntryContent;
  error?: string;
  code?: string;
}

export interface FetchPreferencesResult {
  success: boolean;
  preferences?: UserPreferences;
}

export interface FetchNarrativeSeedsResult {
  success: boolean;
  seeds?: NarrativeSeeds;
}

export class EntryContentGateway {
  private httpClient: HttpClient;
  private userServiceUrl: string;

  constructor() {
    this.httpClient = createServiceHttpClient('internal');
    this.userServiceUrl = getServiceUrl('user-service');
  }

  /**
   * Fetch entry content - uses snapshot if provided, otherwise fetches from user-service
   */
  async fetchEntryContent(
    entryId: string | undefined,
    userId: string,
    requestId: string,
    snapshot?: EntryContent | null
  ): Promise<FetchEntryResult> {
    if (snapshot?.content) {
      logger.debug('Using pre-fetched entry snapshot', {
        entryId,
        hasContent: true,
        hasUpdatedAt: !!snapshot.updatedAt,
      });
      return {
        success: true,
        entry: {
          content: snapshot.content,
          updatedAt: snapshot.updatedAt ? new Date(snapshot.updatedAt).toISOString() : null,
          chapterId: snapshot.chapterId ?? undefined,
        },
      };
    }

    if (!entryId) {
      return {
        success: false,
        error: 'Either entryId or snapshot is required',
        code: 'MISSING_ENTRY',
      };
    }

    try {
      // Use new /entries/* endpoint
      const response = await this.httpClient.getWithResponse<Record<string, unknown>>(
        `${this.userServiceUrl}/api/entries/id/${entryId}`,
        {
          headers: { 'x-user-id': userId, 'x-request-id': requestId },
          timeout: 30000,
        }
      );

      if (!response.ok) {
        logger.error('Failed to fetch entry', { entryId, status: response.status });
        return { success: false, error: 'Entry not found', code: 'ENTRY_NOT_FOUND' };
      }

      const rawData = response.data;
      const validated = validateAndExtract(EntryResponseSchema, rawData, logger);

      if (!validated?.content) {
        return { success: false, error: 'Entry has no content', code: 'EMPTY_ENTRY' };
      }

      return {
        success: true,
        entry: {
          content: validated.content,
          updatedAt: validated.updatedAt ? new Date(validated.updatedAt).toISOString() : null,
          chapterId: (rawData?.data as Record<string, unknown>)?.chapterId as string | undefined,
        },
      };
    } catch (error) {
      logger.error('Error fetching entry', {
        error: error instanceof Error ? error.message : String(error),
        entryId,
      });
      return {
        success: false,
        error: 'Failed to fetch entry content',
        code: 'ENTRY_FETCH_ERROR',
      };
    }
  }

  /**
   * Fetch user preferences for personalization
   */
  async fetchUserPreferences(userId: string, requestId: string): Promise<FetchPreferencesResult> {
    try {
      // Use correct endpoint: /api/profiles/:userId (userId in path, not header-only)
      const response = await this.httpClient.getWithResponse<Record<string, unknown>>(
        `${this.userServiceUrl}/api/profiles/${userId}`,
        {
          headers: { 'x-user-id': userId, 'x-request-id': requestId },
          timeout: 30000,
        }
      );

      if (!response.ok) {
        logger.warn('Failed to fetch user preferences', { userId, status: response.status });
        return { success: false };
      }

      const rawData = response.data;
      const validated = validateAndExtract(UserPreferencesResponseSchema, rawData, logger);

      if (validated) {
        return {
          success: true,
          preferences: {
            currentMood: validated.preferences?.currentMood,
            displayName: validated.profile?.displayName,
            languagePreference: validated.preferences?.languagePreference,
            emotionalState: validated.preferences?.currentMood,
            wellnessIntention: validated.preferences?.wellnessIntention,
          },
        };
      }

      return { success: false };
    } catch (error) {
      logger.warn('Error fetching user preferences', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return { success: false };
    }
  }

  /**
   * Fetch narrative seeds for hyper-personalized lyrics
   */
  async fetchNarrativeSeeds(userId: string, requestId: string): Promise<FetchNarrativeSeedsResult> {
    try {
      // Use correct endpoint: /api/narrative-seeds/:userId (userId in path)
      const response = await this.httpClient.getWithResponse<Record<string, unknown>>(
        `${this.userServiceUrl}/api/narrative-seeds/${userId}`,
        { headers: { 'x-user-id': userId, 'x-request-id': requestId }, timeout: 30000 }
      );

      if (!response.ok) {
        return { success: false };
      }

      const rawData = response.data;
      const data = rawData?.data as Record<string, unknown> | undefined;

      if (data) {
        return {
          success: true,
          seeds: {
            keywords: data.keywords as string[] | undefined,
            emotionalProfile: data.emotionalProfile as Record<string, unknown> | undefined,
          },
        };
      }

      return { success: false };
    } catch (error) {
      logger.debug('Narrative seeds not available', { userId });
      return { success: false };
    }
  }

  /**
   * Fetch chapter info for an entry (used for album linking)
   */
  async fetchChapterIdForEntry(entryId: string, userId: string, requestId: string): Promise<string | undefined> {
    try {
      const response = await this.httpClient.getWithResponse<Record<string, unknown>>(
        `${this.userServiceUrl}/api/entries/id/${entryId}`,
        {
          headers: { 'x-user-id': userId, 'x-request-id': requestId },
          timeout: 30000,
        }
      );

      if (response.ok) {
        const data = response.data as { data?: { chapterId?: string } };
        return data?.data?.chapterId;
      }
    } catch (error) {
      logger.warn('Failed to fetch chapterId for entry', {
        entryId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return undefined;
  }

  /**
   * Fetch persisted user persona for enhanced personalization
   * Returns the latest computed persona if available
   * Uses shared contract validation for type safety
   */
  async fetchUserPersona(userId: string, requestId: string): Promise<FetchPersonaResult> {
    try {
      const response = await this.httpClient.getWithResponse<Record<string, unknown>>(
        `${this.userServiceUrl}/api/persona/${userId}/latest`,
        { headers: { 'x-user-id': userId, 'x-request-id': requestId }, timeout: 30000 }
      );

      if (!response.ok) {
        logger.debug('No persona available for user', { userId, status: response.status });
        return { success: false, error: 'Persona not available' };
      }

      const rawData = response.data as Record<string, unknown>;

      // Validate response against shared contract schema
      const parseResult = UserPersonaResponseSchema.safeParse(rawData);

      if (!parseResult.success) {
        logger.warn('Response validation failed', {
          errors: parseResult.error.issues,
          rawData: JSON.stringify(rawData).slice(0, 500),
        });
        return { success: false, error: 'Invalid response format' };
      }

      const validated = parseResult.data;

      if (validated.success && validated.persona) {
        logger.debug('Fetched user persona (contract validated)', {
          userId,
          personaId: validated.persona.id,
          confidence: validated.persona.confidence,
          dataPoints: validated.persona.dataPoints,
        });
        // Map validated contract type to internal UserPersonaData type
        const persona: UserPersonaData = {
          id: validated.persona.id,
          userId: validated.persona.userId,
          personaName: validated.persona.personaName,
          personaDescription: validated.persona.personaDescription ?? null,
          personality: validated.persona.personality,
          behavior: validated.persona.behavior,
          cognitive: validated.persona.cognitive,
          social: validated.persona.social,
          growth: validated.persona.growth,
          confidence: validated.persona.confidence,
          dataPoints: validated.persona.dataPoints,
          version: validated.persona.version,
          isActive: validated.persona.isActive,
          generatedAt: validated.persona.generatedAt,
          updatedAt: validated.persona.updatedAt,
        };
        return { success: true, persona };
      }

      return { success: false, error: validated.error || 'Persona not found' };
    } catch (error) {
      logger.warn('Error fetching user persona', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return { success: false, error: 'Failed to fetch persona' };
    }
  }
}

// Primary export (unified terminology)
export const entryContentGateway = new EntryContentGateway();
