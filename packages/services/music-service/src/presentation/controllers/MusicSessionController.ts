import { Request, Response } from 'express';
import { getLogger } from '../../config/service-urls';
import { serializeError, extractAuthContext, isFeatureEnabled, getResponseHelpers } from '@aiponge/platform-core';
import { FEATURE_FLAGS } from '@aiponge/shared-contracts/common';
import {
  getGenerationJobStatus,
  enqueueGenerationJob,
  type GenerationJobPayload,
} from '../../application/services/GenerationQueueProcessor';
import { v4 as uuidv4 } from 'uuid';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = getLogger('music-service-session-controller');

export class MusicSessionController {
  async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        status: 'healthy',
        service: 'music-service',
        version: process.env.SERVICE_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        capabilities: {
          musicGeneration: true,
          audioProcessing: true,
          templateManagement: true,
          analytics: true,
        },
      });
    } catch (error) {
      ServiceErrors.serviceUnavailable(res, 'Music service health check failed', _req);
    }
  }

  async getVersion(_req: Request, res: Response): Promise<void> {
    res.json({
      service: 'music-service',
      version: process.env.SERVICE_VERSION || '1.0.0',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      commit: process.env.GIT_COMMIT || 'unknown',
      environment: process.env.NODE_ENV || 'development',
    });
  }

  async getCapabilities(_req: Request, res: Response): Promise<void> {
    res.json({
      supportedMusicTypes: ['song', 'instrumental', 'jingle', 'background', 'soundtrack', 'loop'],
      supportedFormats: {
        input: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
        output: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
      },
      supportedStyles: [
        'pop',
        'rock',
        'classical',
        'jazz',
        'electronic',
        'hip-hop',
        'country',
        'folk',
        'blues',
        'reggae',
      ],
      supportedMoods: ['happy', 'sad', 'energetic', 'calm', 'romantic', 'mysterious', 'uplifting', 'melancholic'],
      audioProcessingTypes: ['normalize', 'master', 'effects', 'convert', 'enhance'],
      limits: {
        maxDuration: 600,
        maxPromptLength: 5000,
        maxFileSize: 100 * 1024 * 1024,
        maxConcurrentRequests: 10,
      },
      rateLimit: {
        generation: '10 requests per minute',
        processing: '5 requests per minute',
        downloads: '30 requests per minute',
        streams: '60 requests per minute',
      },
    });
  }

  async getGenerationJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const status = getGenerationJobStatus(jobId as string);

      if (!status) {
        ServiceErrors.notFound(res, 'Job', req);
        return;
      }

      sendSuccess(res, status);
    } catch (error) {
      logger.error('Failed to get job status', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get job status', req);
    }
  }

  async generateAsync(req: Request, res: Response): Promise<void> {
    if (!isFeatureEnabled(FEATURE_FLAGS.ASYNC_GENERATION)) {
      ServiceErrors.notFound(res, 'Async generation', req);
      return;
    }

    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const jobId = uuidv4();
      const payload: GenerationJobPayload = {
        jobId,
        userId,
        requestId: uuidv4(),
        musicType: req.body.musicType || 'song',
        prompt: req.body.prompt || '',
        style: req.body.style,
        genre: req.body.genre,
        mood: req.body.mood,
        tempo: req.body.tempo,
        duration: req.body.duration,
        entryId: req.body.entryId,
        lyricsId: req.body.lyricsId,
        parameters: req.body.parameters,
        metadata: req.body.metadata,
      };

      const enqueuedJobId = await enqueueGenerationJob(payload);

      if (!enqueuedJobId) {
        ServiceErrors.serviceUnavailable(res, 'Queue unavailable, use synchronous generation endpoint', req);
        return;
      }

      sendSuccess(res, {
        jobId: enqueuedJobId,
        status: 'queued',
        statusUrl: `/api/music/generation-jobs/${enqueuedJobId}/status`,
      }, 202);
    } catch (error) {
      logger.error('Failed to enqueue generation job', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to enqueue generation job', req);
    }
  }

  async migrateAlbumVisibility(req: Request, res: Response): Promise<void> {
    try {
      const { UnifiedAlbumRepository } = await import('../../infrastructure/database/UnifiedAlbumRepository');
      const { getDbFactory } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const db = getDbFactory().getDatabase();
      const albumRepo = new UnifiedAlbumRepository(db);

      const result = await albumRepo.ensureValidVisibility();
      logger.info('Album visibility sync completed', result);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Album visibility sync failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Album visibility sync failed', req);
    }
  }

  async analyzePreferences(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      const { musicPreferences } = req.body;

      logger.info('[ANALYZE PREFERENCES] Starting', { userId, requestId });

      if (!musicPreferences || typeof musicPreferences !== 'string' || musicPreferences.trim().length === 0) {
        sendSuccess(res, {
          rawPreferences: '',
          styles: [],
          genres: [],
          moods: [],
          instruments: [],
          excludedStyles: [],
          culturalStyles: [],
        });
        return;
      }

      const MAX_PREFERENCES_LENGTH = 2000;
      if (musicPreferences.length > MAX_PREFERENCES_LENGTH) {
        ServiceErrors.badRequest(
          res,
          `Music preferences too long. Maximum ${MAX_PREFERENCES_LENGTH} characters allowed.`,
          req
        );
        return;
      }

      const sanitizedPreferences = musicPreferences.trim().slice(0, MAX_PREFERENCES_LENGTH);

      const analysisPrompt = `Analyze the following music preferences and extract structured information:

User Preferences: "${sanitizedPreferences}"

Extract and return ONLY a JSON object (no markdown, no code blocks) with these fields:
{
  "styles": ["list of music styles mentioned - include specific music styles like flamenco, bossa nova, ambient, etc."],
  "genres": ["list of genres mentioned - rock, pop, jazz, classical, latin, folk, electronic, etc."],
  "moods": ["list of moods/emotions mentioned"],
  "instruments": ["list of instruments mentioned"],
  "excludedStyles": ["list of styles user dislikes or wants to avoid"],
  "culturalStyles": ["list of cultural/regional music styles - flamenco, bollywood, afrobeat, k-pop, reggaeton, celtic, etc."]
}

IMPORTANT: For cultural/regional music styles like flamenco, bossa nova, reggaeton, put them in BOTH "styles" AND "culturalStyles".

Examples:
- "uplifting pop music" → styles: ["pop", "uplifting"]
- "calm acoustic for meditation" → styles: ["acoustic", "calm"], moods: ["calm", "meditative"], genres: ["acoustic"]
- "energetic electronic beats for workouts, no slow ballads" → styles: ["electronic", "energetic"], moods: ["energetic"], excludedStyles: ["slow", "ballad"]
- "piano and guitar" → instruments: ["piano", "guitar"]
- "flamenco" → styles: ["flamenco"], genres: ["latin"], culturalStyles: ["flamenco"]
- "bollywood" → styles: ["bollywood"], culturalStyles: ["bollywood"]

Return ONLY the JSON object.`;

      const aiContentClient = getServiceRegistry().aiContentClient;

      const aiResponse = await aiContentClient.generateContent({
        templateId: 'analyze-preferences',
        contentType: 'analysis',
        variables: {
          prompt: analysisPrompt,
        },
        options: {
          userId,
          maxLength: 500,
        },
      });

      if (!aiResponse.success || !aiResponse.content) {
        logger.error('[ANALYZE PREFERENCES] AI service failed', {
          requestId,
          error: aiResponse.error,
        });
        ServiceErrors.fromException(
          res,
          new Error(aiResponse.error || 'Failed to analyze preferences'),
          'Failed to analyze preferences',
          req
        );
        return;
      }

      const content = aiResponse.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);

          sendSuccess(res, {
            rawPreferences: musicPreferences,
            styles: Array.isArray(parsed.styles) ? parsed.styles : [],
            genres: Array.isArray(parsed.genres) ? parsed.genres : [],
            moods: Array.isArray(parsed.moods) ? parsed.moods : [],
            instruments: Array.isArray(parsed.instruments) ? parsed.instruments : [],
            excludedStyles: Array.isArray(parsed.excludedStyles) ? parsed.excludedStyles : [],
            culturalStyles: Array.isArray(parsed.culturalStyles) ? parsed.culturalStyles : [],
          });
          return;
        } catch (parseError) {
          logger.warn('[ANALYZE PREFERENCES] JSON parse failed', { requestId, content });
        }
      }

      logger.error('[ANALYZE PREFERENCES] Failed to parse AI response', { requestId });
      ServiceErrors.fromException(
        res,
        new Error('Failed to parse AI response'),
        'Failed to parse AI response',
        req
      );
    } catch (error) {
      logger.error('[ANALYZE PREFERENCES] Error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Internal server error', req);
    }
  }
}
