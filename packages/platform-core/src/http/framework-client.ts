/**
 * Framework Client
 * Fetches psychological frameworks from ai-config-service with in-memory caching.
 * Uses HttpClient for retries and connection pooling.
 */

import { getServiceUrl } from '../config/service-config.js';
import { getLogger } from '../logging/logger.js';
import { serializeError } from '../logging/error-serializer.js';
import { HttpClient } from './http-client.js';

const logger = getLogger('framework-client');

export interface PsychologicalFramework {
  id: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  keyPrinciples: string[];
  therapeuticGoals: string[];
  triggerPatterns: string[];
  songStructureHint?: string;
  enabled: boolean;
}

interface FrameworkCache {
  frameworks: PsychologicalFramework[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let frameworkCache: FrameworkCache | null = null;
let httpClient: HttpClient | null = null;

function getClient(): HttpClient {
  if (!httpClient) {
    httpClient = new HttpClient({
      baseUrl: getServiceUrl('ai-config-service'),
      retries: 4,
      retryDelay: 1000,
      timeout: 10_000,
    });
  }
  return httpClient;
}

function mapApiResponse(r: Record<string, unknown>): PsychologicalFramework {
  return {
    id: r.id as string,
    name: r.name as string,
    shortName: r.shortName as string,
    category: r.category as string,
    description: r.description as string,
    keyPrinciples: r.keyPrinciples as string[],
    therapeuticGoals: r.therapeuticGoals as string[],
    triggerPatterns: r.triggerPatterns as string[],
    songStructureHint: (r.songStructureHint as string) || undefined,
    enabled: r.isEnabled as boolean,
  };
}

export async function getEnabledFrameworks(): Promise<PsychologicalFramework[]> {
  if (frameworkCache && Date.now() - frameworkCache.timestamp < CACHE_TTL_MS) {
    return frameworkCache.frameworks;
  }

  try {
    const data = await getClient().get<{ data: Record<string, unknown>[] }>('/api/frameworks/enabled');
    const frameworks = data.data.map(mapApiResponse);

    frameworkCache = { frameworks, timestamp: Date.now() };
    return frameworks;
  } catch (error) {
    logger.warn('Failed to fetch frameworks', { error: serializeError(error) });
    if (frameworkCache) {
      return frameworkCache.frameworks;
    }
    return [];
  }
}

export function invalidateFrameworkCache(): void {
  frameworkCache = null;
}

export function getFrameworkCacheAge(): number | null {
  if (!frameworkCache) return null;
  return Date.now() - frameworkCache.timestamp;
}
