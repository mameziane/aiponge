/**
 * Query Error Handler Factory
 * Centralized error handling for React Query mutations and queries
 */

import { logError, getTranslatedFriendlyMessage } from '../utils/errorSerialization';
import type { TranslationFn } from '../types/common.types';

/**
 * Toast notification interface (compatible with shadcn/ui toast)
 */
interface ToastFn {
  (options: { title: string; description?: string; variant?: 'default' | 'destructive' }): void;
}

/**
 * Create standardized query error handler with i18n support
 * @param toast - Toast notification function
 * @param context - Context label for error logging (e.g., 'My Music Query')
 * @param endpoint - API endpoint for correlation
 * @param customTitle - Optional custom error title
 * @param t - Optional translation function for i18n support
 * @returns Error handler function
 */
export function createQueryErrorHandler(
  toast: ToastFn,
  context: string,
  endpoint: string,
  customTitle?: string,
  t?: TranslationFn
) {
  return (err: unknown) => {
    const serialized = logError(err, context, endpoint);
    // Fallback translator: when no i18n function provided, use the fallback string directly
    const translateFn: TranslationFn =
      t ||
      ((key, fallbackOrOptions) => {
        // Support both string fallback and options object with defaultValue
        if (typeof fallbackOrOptions === 'string') {
          return fallbackOrOptions;
        }
        if (typeof fallbackOrOptions === 'object' && fallbackOrOptions?.defaultValue) {
          return String(fallbackOrOptions.defaultValue);
        }
        return Array.isArray(key) ? key[0] : key;
      });
    toast({
      title: customTitle || translateFn('common.loadFailed', { defaultValue: 'Failed to Load Data' }),
      description: getTranslatedFriendlyMessage(serialized, translateFn),
      variant: 'destructive',
    });
    throw err;
  };
}

/**
 * Create standardized mutation error handler with i18n support
 * @param toast - Toast notification function
 * @param context - Context label for error logging (e.g., 'Create Playlist')
 * @param endpoint - API endpoint for correlation
 * @param customTitle - Optional custom error title
 * @param t - Optional translation function for i18n support
 * @returns Error handler function
 */
export function createMutationErrorHandler(
  toast: ToastFn,
  context: string,
  endpoint: string,
  customTitle?: string,
  t?: TranslationFn
) {
  return (error: unknown) => {
    const serialized = logError(error, context, endpoint);
    // Fallback translator: when no i18n function provided, use the fallback string directly
    const translateFn: TranslationFn =
      t ||
      ((key, fallbackOrOptions) => {
        // Support both string fallback and options object with defaultValue
        if (typeof fallbackOrOptions === 'string') {
          return fallbackOrOptions;
        }
        if (typeof fallbackOrOptions === 'object' && fallbackOrOptions?.defaultValue) {
          return String(fallbackOrOptions.defaultValue);
        }
        return Array.isArray(key) ? key[0] : key;
      });
    toast({
      title: customTitle || translateFn('common.operationFailed', { defaultValue: 'Operation Failed' }),
      description: getTranslatedFriendlyMessage(serialized, translateFn),
      variant: 'destructive',
    });
    // Mutations are not re-thrown — React Query doesn't retry mutations
  };
}

/**
 * Create silent error handler (logs but doesn't show toast)
 * Useful for background operations like analytics
 */
export function createSilentErrorHandler(context: string, endpoint: string) {
  return (err: unknown) => {
    logError(err, context, endpoint);
    // Silent - no user notification
  };
}
