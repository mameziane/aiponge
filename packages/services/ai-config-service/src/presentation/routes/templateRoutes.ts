/**
 * API Routes Configuration
 * Simple REST API routes for the consolidated template service
 */

import { Router } from 'express';
import { TemplateController } from '../controllers/TemplateController';
import { ExecutionController } from '../controllers/ExecutionController';
import { ImportExportController } from '../controllers/ImportExportController';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';

export function createRoutes(
  templateController: TemplateController,
  executionController: ExecutionController,
  importExportController: ImportExportController
): Router {
  const router = Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      service: 'ai-config-service',
      status: 'healthy',
      timestamp: new Date(),
      version: '1.0.0',
    });
  });

  // =====  TEMPLATE CRUD ROUTES =====
  // Note: This router is mounted at /api/templates, so routes are relative to that

  // Get template categories (must be before /:id to avoid conflict)
  router.get('/meta/categories', (req, res) => templateController.getCategories(req, res));

  // Get service statistics
  router.get('/meta/stats', (req, res) => templateController.getStats(req, res));

  // List templates with filtering
  router.get('/', (req, res) => templateController.listTemplates(req, res));

  // Create new template
  router.post('/', (req, res) => templateController.createTemplate(req, res));

  // Get template by ID
  router.get('/:id', (req, res) => templateController.getTemplate(req, res));

  // Update template (partial update)
  router.patch('/:id', (req, res) => templateController.updateTemplate(req, res));

  // Delete template
  router.delete('/:id', (req, res) => templateController.deleteTemplate(req, res));

  // ===== TEMPLATE EXECUTION ROUTES =====

  // Execute single template
  router.post('/execute', (req, res) => executionController.executeTemplate(req, res));

  // Batch execute templates
  router.post('/batch-execute', (req, res) => executionController.batchExecute(req, res));

  // Preview template execution
  router.post('/preview', (req, res) => executionController.previewTemplate(req, res));

  // ===== CACHE MANAGEMENT ROUTES =====

  // Clear cache
  router.post('/cache/clear', (req, res) => executionController.clearCache(req, res));

  // Get cache statistics
  router.get('/cache/stats', (req, res) => executionController.getCacheStats(req, res));

  // ===== IMPORT/EXPORT ROUTES =====

  // Import templates
  router.post('/import', (req, res) => importExportController.importTemplates(req, res));

  // Export templates (with criteria)
  router.post('/export', (req, res) => importExportController.exportTemplates(req, res));

  // Export all templates
  router.get('/export/all', (req, res) => importExportController.exportAllTemplates(req, res));

  // Bulk delete templates
  router.post('/bulk-delete', (req, res) => importExportController.bulkDeleteTemplates(req, res));

  // Upload templates from file
  router.post('/upload', (req, res) => importExportController.uploadTemplates(req, res));

  // ===== ERROR HANDLING =====

  // 404 handler for unmatched routes
  router.use('*', (req, res) => {
    StructuredErrors.notFound(res, `Route not found: ${req.method} ${req.originalUrl}`, {
      service: 'ai-config-service',
      correlationId: getCorrelationId(req),
    });
  });

  return router;
}
