/**
 * AI Content Service Configuration
 * Domain-specific settings for the AI content service.
 * Platform-level concerns (ports, service URLs, database) are handled by platform-core.
 */

import { getServicePort, DomainError } from '@aiponge/platform-core';

export const contentServiceConfig = {
  server: {
    port: parseInt(process.env.AI_CONTENT_SERVICE_PORT || getServicePort('ai-content-service').toString()),
    host: process.env.HOST || '0.0.0.0',
    name: 'ai-content-service',
    version: process.env.SERVICE_VERSION || '1.0.0',
  },

  security: {
    apiKeyRequired: process.env.API_KEY_REQUIRED === 'true',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  features: {
    templateStrictMode: process.env.TEMPLATE_STRICT_MODE === 'true',
  },
};

export function validateConfig(): void {
  const requiredVars = ['DATABASE_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new DomainError(`Missing required environment variables: ${missingVars.join(', ')}`, 500);
  }

  if (contentServiceConfig.server.port <= 0 || contentServiceConfig.server.port > 65535) {
    throw new DomainError('PORT must be between 1 and 65535', 500);
  }
}

export default contentServiceConfig;
