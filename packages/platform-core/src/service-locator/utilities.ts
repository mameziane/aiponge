/**
 * Service Locator Utilities
 *
 * Helper functions and convenience exports
 */

import { ServiceLocator } from './service-locator';
import { ServiceLocatorOptions } from './types';

/**
 * Create and initialize a service locator instance
 */
export function createServiceLocator(options?: ServiceLocatorOptions): typeof ServiceLocator {
  ServiceLocator.initialize(options);
  return ServiceLocator;
}
