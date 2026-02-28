/**
 * Data utility functions for normalizing API responses
 * Extracted from library-routes.ts
 */

/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Check if a string value is numeric and should be parsed
 */
export function isNumericString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value));
}

/**
 * Normalize database row keys from snake_case to camelCase
 * Handles single objects or arrays of objects
 * Automatically converts numeric strings to numbers
 */
export function normalizeKeys<T = unknown>(data: unknown): T {
  if (Array.isArray(data)) {
    return data.map(item => normalizeKeys(item)) as T;
  }

  if (data && typeof data === 'object' && data.constructor === Object) {
    return Object.keys(data).reduce(
      (acc, key) => {
        const camelKey = toCamelCase(key);
        let value = (data as Record<string, unknown>)[key];

        if (isNumericString(value)) {
          value = Number(value);
        }

        acc[camelKey] = normalizeKeys(value);
        return acc;
      },
      {} as Record<string, unknown>
    ) as T;
  }

  return data as T;
}

/**
 * Format date as YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse query param as integer with default
 */
export function parseIntParam(value: unknown, defaultValue: number): number {
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Parse query param as boolean
 */
export function parseBoolParam(value: unknown, defaultValue: boolean = false): boolean {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return defaultValue;
}
