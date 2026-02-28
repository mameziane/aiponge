import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useThemeColors } from './useThemeColors';
import type { ColorScheme } from './colors';

type StyleFactory<T> = (colors: ColorScheme) => T;

export function useStyles<T>(factory: StyleFactory<T>): T {
  const colors = useThemeColors();
  return useMemo(() => factory(colors), [colors]);
}

export function useStyleSheet<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ColorScheme) => T
): StyleSheet.NamedStyles<T> {
  const colors = useThemeColors();
  return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
}
