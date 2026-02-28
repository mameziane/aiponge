import { useMemo } from 'react';
import { useThemeMode } from './ThemeProvider';
import { type ColorScheme, colors as darkColors } from './colors';
import { lightColors } from './lightColors';

export function useThemeColors(): ColorScheme {
  const { isDark } = useThemeMode();
  return useMemo(() => (isDark ? darkColors : lightColors), [isDark]);
}
