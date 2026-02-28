import type { ReactNode } from 'react';
import { ViewStyle } from 'react-native';

export type GlassIntensity = 'light' | 'medium' | 'strong' | 'subtle';

export type GlassVariant = 'default' | 'card' | 'button' | 'navbar';

export interface LiquidGlassBaseProps {
  intensity?: GlassIntensity;
  borderRadius?: number;
  showBorder?: boolean;
  showTopHighlight?: boolean;
  style?: ViewStyle;
  children?: ReactNode;
}

export const glassConfig = {
  intensity: {
    subtle: {
      blur: 20,
      backgroundOpacity: 0.15,
      borderOpacity: 0.25,
      adaptiveBlur: 15,
      adaptiveOverlayOpacity: 0.05,
    },
    light: {
      blur: 40,
      backgroundOpacity: 0.25,
      borderOpacity: 0.35,
      adaptiveBlur: 25,
      adaptiveOverlayOpacity: 0.08,
    },
    medium: {
      blur: 60,
      backgroundOpacity: 0.35,
      borderOpacity: 0.45,
      adaptiveBlur: 40,
      adaptiveOverlayOpacity: 0.12,
    },
    strong: {
      blur: 80,
      backgroundOpacity: 0.45,
      borderOpacity: 0.55,
      adaptiveBlur: 60,
      adaptiveOverlayOpacity: 0.18,
    },
  },
  borderRadius: {
    small: 12,
    medium: 16,
    large: 24,
    xl: 32,
  },
} as const;
