/**
 * Common Types
 * Shared utility types used across the application
 */

import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';

/**
 * Translation function type compatible with i18next TFunction
 * Used for internationalization across the app
 *
 * Note: Uses 'unknown' for options to maintain compatibility with i18next's complex
 * TFunction type while avoiding 'any' for type safety.
 */
export type TranslationFn = (key: string | string[], options?: Record<string, unknown>) => string;

/**
 * Style prop type for React Native components
 * Compatible with ViewStyle, TextStyle, etc.
 */
export type StyleProp = Record<string, unknown> | undefined;

/**
 * DateTimePicker change event handler
 * Native type for DateTimePicker onChange callbacks
 */
export type DateTimePickerChangeHandler = (event: DateTimePickerEvent, selectedDate?: Date) => void;

/**
 * Native module stub type
 * Used for conditionally loaded native modules that may be unavailable in Expo Go
 */
export type NativeModuleStub<T = unknown> = T | null;

/**
 * API error response shape
 * Common structure for error responses from backend
 */
export interface ApiErrorResponse {
  response?: {
    status?: number;
    data?: {
      message?: string;
      error?: string;
    };
  };
  statusCode?: number;
  message?: string;
}

/**
 * Type guard to check if error has response property
 */
export function hasResponseProperty(error: unknown): error is { response: { status: number } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response: unknown }).response === 'object' &&
    (error as { response: { status?: unknown } }).response !== null &&
    typeof (error as { response: { status?: number } }).response.status === 'number'
  );
}

/**
 * Type guard to check if error has statusCode property
 */
export function hasStatusCodeProperty(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  );
}

/**
 * Check if error is a 404 Not Found
 */
export function isNotFoundError(error: unknown): boolean {
  if (hasResponseProperty(error)) {
    return error.response.status === 404;
  }
  if (hasStatusCodeProperty(error)) {
    return error.statusCode === 404;
  }
  return false;
}
