/**
 * HTTP Utilities
 *
 * Helper functions for HTTP client creation and management
 */

import { HttpClient } from './http-client';
import { HttpClientConfig } from '../types';

/**
 * Create a standard HTTP client with service-specific defaults
 */
export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  return new HttpClient(config);
}
