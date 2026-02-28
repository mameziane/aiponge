/**
 * Service Discovery Module
 *
 * Service discovery is handled by ServiceLocator (service-locator/) for port-based
 * resolution, and createServiceUrlsConfig (config/service-urls-factory.ts) for
 * URL-based resolution. Both derive from the single source of truth:
 * packages/platform-core/src/config/services-definition.ts
 *
 * The ServiceUrlResolver has been removed as it duplicated ServiceLocator
 * functionality with zero external consumers.
 */

// Re-export ServiceLocator as the canonical discovery mechanism
export { ServiceLocator } from '../service-locator/service-locator.js';
