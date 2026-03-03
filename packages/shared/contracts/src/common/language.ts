/**
 * Language Code Utilities
 *
 * Standardizes on ISO 639-1 short codes (e.g., 'en', 'es', 'fr', 'ar').
 * All database columns storing language values should use short codes.
 * Full locale codes (e.g., 'en-US', 'es-ES') are only used for i18n display.
 */

/**
 * Normalize any language string to a short ISO 639-1 code.
 * Handles 'en-US' → 'en', 'ES-ES' → 'es', null → 'en', '' → 'en'.
 */
export function toShortLanguageCode(input: string | null | undefined): string {
  if (!input) return 'en';
  const short = input.split('-')[0].toLowerCase().trim();
  return short || 'en';
}
