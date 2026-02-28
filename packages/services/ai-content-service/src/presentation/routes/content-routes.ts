/**
 * Content Service HTTP Routes
 * Defines all API endpoints for content operations
 */

import { Router } from 'express';
import { ContentController } from '../controllers/ContentController';
import { TemplateController } from '../controllers/TemplateController';
import { HealthController } from '../controllers/HealthController';
import { StructuredErrors } from '@aiponge/shared-contracts';

export function createContentRoutes(
  contentController: ContentController,
  templateController: TemplateController,
  healthController: HealthController
): Router {
  const router = Router();

  // Health and status endpoints
  router.get('/health', healthController.health.bind(healthController));
  router.get('/health/live', healthController.liveness.bind(healthController));
  router.get('/health/ready', healthController.readiness.bind(healthController));
  router.get('/health/startup', healthController.startup.bind(healthController));

  // Content generation and management routes
  router.post('/content/generate', contentController.generateContent.bind(contentController));
  router.get('/content/:id', contentController.getContentById.bind(contentController));
  router.get('/content', contentController.getContentList.bind(contentController));
  router.patch('/content/:id', contentController.updateContent.bind(contentController));
  router.delete('/content/:id', contentController.deleteContent.bind(contentController));
  router.get('/content/stats', contentController.getContentStats.bind(contentController));
  router.get('/content/search', contentController.searchContent.bind(contentController));

  // Content feedback route
  router.post('/content/feedback', contentController.submitFeedback.bind(contentController));

  // Template management routes
  router.post('/templates', templateController.createTemplate.bind(templateController));
  router.get('/templates/:id', templateController.getTemplateById.bind(templateController));
  router.get('/templates', templateController.getTemplatesList.bind(templateController));
  router.patch('/templates/:id', templateController.updateTemplate.bind(templateController));
  router.delete('/templates/:id', templateController.deleteTemplate.bind(templateController));
  router.post('/templates/:id/process', templateController.processTemplate.bind(templateController));
  router.get('/templates/categories', templateController.getTemplateCategories.bind(templateController));
  router.get('/templates/search', templateController.searchTemplates.bind(templateController));

  return router;
}

/**
 * Create minimal routes for basic functionality
 * Used when full dependency injection is not available
 */
export function createMinimalContentRoutes(): Router {
  const router = Router();

  // Basic health endpoint
  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'ai-content-service',
      timestamp: new Date().toISOString(),
      version: process.env.SERVICE_VERSION || '1.0.0',
      uptime: process.uptime(),
    });
  });

  // Basic content generation endpoint (stub)
  router.post('/content/generate', (req, res) => {
    StructuredErrors.serviceUnavailable(res, 'Content generation service is initializing');
  });

  // Basic template listing endpoint (stub)
  router.get('/templates', (req, res) => {
    StructuredErrors.serviceUnavailable(res, 'Template service is initializing');
  });

  return router;
}
