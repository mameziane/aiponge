import { getLogger } from '../../../config/service-urls';

const logger = getLogger('ai-analytics-service-timescale-utils');

export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.warn('Failed to parse JSON, using fallback', {
      preview: jsonString.substring(0, 100),
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}
