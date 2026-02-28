/**
 * Service Configuration Utilities
 *
 * Thin proxy to ServiceLocator - enforces services.config.ts as single source of truth
 * NO hardcoded port fallbacks allowed
 *
 * Includes lazy initialization to ensure ServiceLocator is ready before first use.
 */

import { ServiceLocator } from '../service-locator/service-locator';

let isInitialized = false;

/**
 * Ensure ServiceLocator is initialized before use
 * Lazy initialization pattern - automatically initializes on first call
 */
function ensureInitialized(): void {
  if (!isInitialized) {
    try {
      ServiceLocator.initialize();
      isInitialized = true;
    } catch (_error) {
      // ServiceLocator.initialize() might throw if already initialized
      // This is safe to ignore - just mark as initialized
      isInitialized = true;
    }
  }
}

/**
 * Get service port from centralized configuration
 *
 * Automatically initializes ServiceLocator on first call if not already initialized.
 *
 * @param serviceName - Name of the service (e.g., 'api-gateway', 'system-service')
 * @returns Port number from services.config.ts or environment variable
 * @throws Error if service not found in configuration
 *
 * @example
 * ```typescript
 * const port = getServicePort('api-gateway'); // Returns 8080 from services.config.ts
 * ```
 */
export function getServicePort(serviceName: string): number {
  ensureInitialized();
  return ServiceLocator.getServicePort(serviceName);
}

/**
 * Get service URL from centralized configuration
 *
 * Automatically initializes ServiceLocator on first call if not already initialized.
 *
 * @param serviceName - Name of the service
 * @returns Full service URL (e.g., 'http://localhost:8080')
 * @throws Error if service not found in configuration
 *
 * @example
 * ```typescript
 * const url = getServiceUrl('api-gateway'); // Returns 'http://localhost:8080'
 * ```
 */
export function getServiceUrl(serviceName: string): string {
  ensureInitialized();
  return ServiceLocator.getServiceUrl(serviceName);
}

/**
 * Explicitly initialize service configuration
 *
 * This is optional - lazy initialization happens automatically on first use.
 * Call this explicitly if you want to control initialization timing or ensure
 * ServiceLocator is ready before any configuration lookups.
 *
 * @example
 * ```typescript
 * initializeServiceConfig(); // Optional - explicit initialization
 * const port = getServicePort('api-gateway');
 * ```
 */
export function initializeServiceConfig(): void {
  ensureInitialized();
}
