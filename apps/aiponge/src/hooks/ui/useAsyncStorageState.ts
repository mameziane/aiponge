/**
 * AsyncStorage State Hook
 *
 * Provides a useState-like interface for AsyncStorage-backed state.
 * Eliminates repeated get/set/parse/error handling boilerplate.
 *
 * Features:
 * - Type-safe with generics
 * - Automatic JSON serialization/deserialization
 * - Loading states
 * - Error logging
 * - Optimistic updates with rollback on failure
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../lib/logger';

export interface UseAsyncStorageStateOptions<T> {
  /** Storage key (will be prefixed with @aiponge/ if not already prefixed) */
  key: string;
  /** Default value when nothing is stored */
  defaultValue: T;
  /** Optional parser for complex types (defaults to JSON.parse for objects, identity for primitives) */
  parse?: (value: string) => T;
  /** Optional serializer (defaults to JSON.stringify for objects, String for primitives) */
  serialize?: (value: T) => string;
}

export interface UseAsyncStorageStateReturn<T> {
  /** Current value (defaultValue during loading) */
  value: T;
  /** Set value (persists to AsyncStorage) */
  setValue: (newValue: T | ((prev: T) => T)) => Promise<boolean>;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Remove value from storage (resets to defaultValue) */
  remove: () => Promise<boolean>;
  /** Force reload from storage */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing AsyncStorage-backed state with a useState-like interface.
 *
 * @example
 * // Simple string value
 * const { value: language, setValue: setLanguage, isLoading } = useAsyncStorageState({
 *   key: 'language',
 *   defaultValue: 'en',
 * });
 *
 * @example
 * // Boolean value
 * const { value: isDarkMode, setValue: setDarkMode } = useAsyncStorageState({
 *   key: 'dark_mode',
 *   defaultValue: false,
 * });
 *
 * @example
 * // Object value with custom serialization
 * const { value: settings, setValue: setSettings } = useAsyncStorageState({
 *   key: 'user_settings',
 *   defaultValue: { theme: 'light', notifications: true },
 * });
 */
export function useAsyncStorageState<T>({
  key,
  defaultValue,
  parse,
  serialize,
}: UseAsyncStorageStateOptions<T>): UseAsyncStorageStateReturn<T> {
  const storageKey = key.startsWith('@') ? key : `@aiponge/${key}`;
  const [value, setLocalValue] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const isInitialized = useRef(false);
  const loadPromiseRef = useRef<Promise<T> | null>(null);
  const currentValueRef = useRef<T>(defaultValue);

  const defaultParse = useCallback(
    (str: string): T => {
      if (typeof defaultValue === 'boolean') {
        // as unknown: generic T is inferred from defaultValue; runtime type check guarantees correct shape
        return (str === 'true') as unknown as T;
      }
      if (typeof defaultValue === 'number') {
        // as unknown: generic T is inferred from defaultValue; runtime type check guarantees correct shape
        return parseFloat(str) as unknown as T;
      }
      if (typeof defaultValue === 'object') {
        try {
          return JSON.parse(str) as T;
        } catch {
          return defaultValue;
        }
      }
      // as unknown: generic T is inferred from defaultValue; string case fallback
      return str as unknown as T;
    },
    [defaultValue]
  );

  const defaultSerialize = useCallback((val: T): string => {
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  }, []);

  const parseValue = parse || defaultParse;
  const serializeValue = serialize || defaultSerialize;

  const loadValue = useCallback(async (): Promise<T> => {
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = parseValue(stored);
        setLocalValue(parsed);
        currentValueRef.current = parsed;
        return parsed;
      }
      return defaultValue;
    } catch (error) {
      logger.error(`Failed to load AsyncStorage value for key: ${storageKey}`, error);
      return defaultValue;
    } finally {
      setIsLoading(false);
    }
  }, [storageKey, parseValue, defaultValue]);

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      loadPromiseRef.current = loadValue();
    }
  }, [loadValue]);

  const setValue = useCallback(
    async (newValue: T | ((prev: T) => T)): Promise<boolean> => {
      if (loadPromiseRef.current) {
        await loadPromiseRef.current;
        loadPromiseRef.current = null;
      }

      const resolvedValue =
        typeof newValue === 'function' ? (newValue as (prev: T) => T)(currentValueRef.current) : newValue;

      const previousValue = currentValueRef.current;
      setLocalValue(resolvedValue);
      currentValueRef.current = resolvedValue;

      try {
        await AsyncStorage.setItem(storageKey, serializeValue(resolvedValue));
        return true;
      } catch (error) {
        logger.error(`Failed to save AsyncStorage value for key: ${storageKey}`, error);
        setLocalValue(previousValue);
        currentValueRef.current = previousValue;
        return false;
      }
    },
    [storageKey, serializeValue]
  );

  const remove = useCallback(async (): Promise<boolean> => {
    if (loadPromiseRef.current) {
      await loadPromiseRef.current;
      loadPromiseRef.current = null;
    }

    try {
      await AsyncStorage.removeItem(storageKey);
      setLocalValue(defaultValue);
      currentValueRef.current = defaultValue;
      return true;
    } catch (error) {
      logger.error(`Failed to remove AsyncStorage value for key: ${storageKey}`, error);
      return false;
    }
  }, [storageKey, defaultValue]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    loadPromiseRef.current = loadValue();
    await loadPromiseRef.current;
    loadPromiseRef.current = null;
  }, [loadValue]);

  return {
    value,
    setValue,
    isLoading,
    remove,
    refresh,
  };
}

/**
 * Hook for managing a simple counter in AsyncStorage.
 * Useful for tracking counts (sessions, actions, etc.)
 *
 * @example
 * const { count, increment, reset } = useAsyncStorageCounter('session_count');
 * await increment(); // count is now 1
 */
export function useAsyncStorageCounter(key: string) {
  const { value, setValue, isLoading, remove } = useAsyncStorageState({
    key,
    defaultValue: 0,
  });
  const resultRef = useRef(0);

  const increment = useCallback(
    async (amount = 1): Promise<number> => {
      await setValue(prev => {
        resultRef.current = prev + amount;
        return resultRef.current;
      });
      return resultRef.current;
    },
    [setValue]
  );

  const decrement = useCallback(
    async (amount = 1): Promise<number> => {
      await setValue(prev => {
        resultRef.current = Math.max(0, prev - amount);
        return resultRef.current;
      });
      return resultRef.current;
    },
    [setValue]
  );

  const reset = useCallback(async (): Promise<boolean> => {
    return remove();
  }, [remove]);

  return {
    count: value,
    increment,
    decrement,
    reset,
    isLoading,
  };
}

/**
 * Hook for managing a timestamp in AsyncStorage.
 * Useful for tracking "last X" dates.
 *
 * @example
 * const { date, setNow, daysSince } = useAsyncStorageTimestamp('last_review_prompt');
 * if (daysSince > 90) {
 *   await setNow();
 * }
 */
export function useAsyncStorageTimestamp(key: string) {
  const { value, setValue, isLoading, remove } = useAsyncStorageState<string | null>({
    key,
    defaultValue: null,
  });

  const setNow = useCallback(async (): Promise<boolean> => {
    return setValue(new Date().toISOString());
  }, [setValue]);

  const setDate = useCallback(
    async (date: Date): Promise<boolean> => {
      return setValue(date.toISOString());
    },
    [setValue]
  );

  const daysSince = value ? Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)) : null;

  const date = value ? new Date(value) : null;

  return {
    date,
    dateString: value,
    daysSince,
    setNow,
    setDate,
    clear: remove,
    isLoading,
  };
}

/**
 * Hook for managing a boolean flag in AsyncStorage.
 *
 * @example
 * const { value: hasSeenOnboarding, toggle, setTrue, setFalse } = useAsyncStorageFlag('has_seen_onboarding');
 */
export function useAsyncStorageFlag(key: string, defaultValue = false) {
  const { value, setValue, isLoading, remove } = useAsyncStorageState({
    key,
    defaultValue,
  });

  const toggle = useCallback(async (): Promise<boolean> => {
    return setValue(prev => !prev);
  }, [setValue]);

  const setTrue = useCallback(async (): Promise<boolean> => {
    return setValue(true);
  }, [setValue]);

  const setFalse = useCallback(async (): Promise<boolean> => {
    return setValue(false);
  }, [setValue]);

  return {
    value,
    toggle,
    setTrue,
    setFalse,
    reset: remove,
    isLoading,
  };
}

export { ADMIN_CACHE_CONFIG } from '../admin/useAdminQuery';
