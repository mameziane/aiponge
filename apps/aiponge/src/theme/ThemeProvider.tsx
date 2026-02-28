import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../lib/logger';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  isLoaded: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  isDark: true,
  isLoaded: false,
  setMode: () => {},
  toggleMode: () => {},
});

const THEME_STORAGE_KEY = '@aiponge/theme_mode';
const VALID_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(stored => {
        if (stored && VALID_MODES.includes(stored as ThemeMode)) {
          setModeState(stored as ThemeMode);
        }
        setIsLoaded(true);
      })
      .catch(e => {
        logger.warn('[ThemeProvider] Failed to load theme preference', e);
        setIsLoaded(true);
      });
  }, []);

  const isDark = useMemo(() => {
    if (mode === 'system') {
      return systemColorScheme !== 'light';
    }
    return mode === 'dark';
  }, [mode, systemColorScheme]);

  const setMode = useCallback(async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch {
      // Ignore storage errors when persisting theme preference
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  const value = useMemo(
    () => ({
      mode,
      isDark,
      isLoaded,
      setMode,
      toggleMode,
    }),
    [mode, isDark, isLoaded, setMode, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  return useContext(ThemeContext);
}
