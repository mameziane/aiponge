/**
 * AI Service HTTP Routes
 * These routes maintain exact API contract compatibility with original ai-content-service
 */

import { Router } from 'express';
import { TextAnalysisController } from '../controllers/TextAnalysisController';
import { ReflectionController } from '../controllers/ReflectionController';
import { ContentController } from '../controllers/ContentController';
import { HealthController } from '../controllers/HealthController';
import { QuoteController } from '../controllers/QuoteController';
import { ImageController } from '../controllers/ImageController';
import { getLogger } from '../../config/service-urls';
import { StructuredErrors } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('ai-routes');

export function createAIRoutes(
  textAnalysisController: TextAnalysisController,
  reflectionController: ReflectionController,
  contentController: ContentController,
  healthController: HealthController,
  quoteController?: QuoteController,
  imageController?: ImageController
): Router {
  const router = Router();

  // ===== TEXT ANALYSIS ENDPOINTS =====

  // Main text analysis endpoint - matches ai-content-service API
  router.post('/ai/text/analyze', textAnalysisController.analyzeText.bind(textAnalysisController));

  // Additional text analysis endpoints
  router.get('/ai/text/health', textAnalysisController.healthCheck.bind(textAnalysisController));
  router.get('/ai/text/types', textAnalysisController.getAnalysisTypes.bind(textAnalysisController));
  router.post('/ai/text/analyze/batch', textAnalysisController.analyzeBatch.bind(textAnalysisController));

  // ===== REFLECTION GENERATION ENDPOINTS =====

  // Main reflection generation endpoint - matches ai-content-service API
  router.post('/ai/reflection/generate', reflectionController.generateReflection.bind(reflectionController));

  // Additional reflection endpoints
  router.get('/ai/reflection/health', reflectionController.healthCheck.bind(reflectionController));
  router.get('/ai/reflection/types', reflectionController.getReflectionTypes.bind(reflectionController));
  router.post(
    '/ai/reflection/generate/batch',
    reflectionController.generateBatchReflections.bind(reflectionController)
  );
  router.post('/ai/reflection/suggest', reflectionController.suggestReflectionType.bind(reflectionController));

  // ===== QUOTE GENERATION ENDPOINTS =====

  if (quoteController) {
    router.post('/quote/generate', quoteController.generateQuote.bind(quoteController));
  }

  // ===== IMAGE GENERATION ENDPOINTS =====
  // Centralized image generation for album artwork, playlist artwork, book covers

  if (imageController) {
    router.post('/images/generate', imageController.generateImage.bind(imageController));
    router.get('/images/health', imageController.healthCheck.bind(imageController));
  }

  // ===== CONTENT GENERATION ENDPOINTS =====

  // ===== HEALTH CHECK ENDPOINTS =====

  // AI service health endpoint - matches ai-content-service API
  router.get('/health', healthController.health.bind(healthController));

  // Overall AI capabilities health check
  router.get('/ai/health', async (req, res, next) => {
    try {
      const healthResults = await Promise.allSettled([
        // Test text analysis
        textAnalysisController.healthCheck(
          { body: {} } as Parameters<typeof textAnalysisController.healthCheck>[0],
          { status: () => ({ json: () => {} }) } as unknown as Parameters<typeof textAnalysisController.healthCheck>[1],
          next
        ),
        // Test reflection generation
        reflectionController.healthCheck(
          { body: {} } as Parameters<typeof reflectionController.healthCheck>[0],
          { status: () => ({ json: () => {} }) } as unknown as Parameters<typeof reflectionController.healthCheck>[1],
          next
        ),
      ]);

      const textAnalysisHealthy = healthResults[0].status === 'fulfilled';
      const reflectionHealthy = healthResults[1].status === 'fulfilled';
      const overallHealthy = textAnalysisHealthy && reflectionHealthy;

      res.status(overallHealthy ? 200 : 503).json({
        status: overallHealthy ? 'healthy' : 'degraded',
        service: 'ai-content-service',
        version: process.env.SERVICE_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        components: {
          textAnalysis: textAnalysisHealthy ? 'healthy' : 'unhealthy',
          reflectionGeneration: reflectionHealthy ? 'healthy' : 'unhealthy',
          contentGeneration: 'healthy', // Content generation is always available
        },
        capabilities: ['text-analysis', 'reflection-generation', 'content-generation', 'health-monitoring'],
      });
    } catch (error) {
      logger.error('❌ Error in AI health check', {
        module: 'ai_routes',
        operation: 'ai_health_check',
        error: serializeError(error),
        phase: 'health_check_error',
      });
      StructuredErrors.serviceUnavailable(res, error instanceof Error ? error.message : 'AI health check failed', {
        service: 'ai-content-service',
      });
    }
  });

  return router;
}
