import { useMemo } from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors, type ColorScheme } from '../../theme';
import { LiquidGlassBaseProps, glassConfig } from './types';

interface LiquidGlassCardProps extends LiquidGlassBaseProps {
  padding?: number;
  elevated?: boolean;
  adaptive?: boolean;
  testID?: string;
}

export function LiquidGlassCard({
  intensity = 'medium',
  borderRadius = glassConfig.borderRadius.large,
  showBorder = true,
  showTopHighlight = true,
  padding = 16,
  elevated = false,
  adaptive = true,
  style,
  children,
  testID,
}: LiquidGlassCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = glassConfig.intensity[intensity];

  const containerStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    ...(showBorder && {
      borderWidth: 1,
      borderColor: adaptive ? `rgba(255, 255, 255, ${config.borderOpacity * 0.6})` : colors.overlay.purple[30],
    }),
    ...(elevated && {
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    }),
  };

  const blurIntensity = adaptive ? config.adaptiveBlur : config.blur;
  const overlayOpacity = adaptive ? config.adaptiveOverlayOpacity : config.backgroundOpacity;

  const gradientColors = adaptive
    ? ([`rgba(162, 128, 188, ${overlayOpacity})`, `rgba(45, 27, 78, ${overlayOpacity * 1.5})`] as const)
    : ([
        `rgba(162, 128, 188, ${config.backgroundOpacity * 0.8})`,
        `rgba(45, 27, 78, ${config.backgroundOpacity + 0.15})`,
      ] as const);

  return (
    <View style={[containerStyle, style]} testID={testID}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={blurIntensity}
          tint={adaptive ? 'systemChromeMaterialDark' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(45, 27, 78, ${overlayOpacity + 0.25})` }]} />
      )}

      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {showTopHighlight && (
        <View
          style={[
            styles.topHighlight,
            {
              borderTopLeftRadius: borderRadius,
              borderTopRightRadius: borderRadius,
              opacity: adaptive ? 0.6 : 1,
            },
          ]}
        />
      )}

      <View style={[styles.content, { padding }]}>{children}</View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    topHighlight: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.border.primary,
    },
    content: {
      position: 'relative',
      zIndex: 1,
    },
  });
