import { useMemo } from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../../theme';
import { LiquidGlassBaseProps, glassConfig } from './types';

interface LiquidGlassViewProps extends LiquidGlassBaseProps {
  adaptive?: boolean;
  testID?: string;
  contentStyle?: ViewStyle;
}

export function LiquidGlassView({
  intensity = 'medium',
  borderRadius = glassConfig.borderRadius.medium,
  showBorder = true,
  showTopHighlight = true,
  adaptive = true,
  style,
  children,
  testID,
  contentStyle,
}: LiquidGlassViewProps) {
  const colors = useThemeColors();
  const config = glassConfig.intensity[intensity];

  const blurIntensity = adaptive ? config.adaptiveBlur : config.blur;
  const overlayOpacity = adaptive ? config.adaptiveOverlayOpacity : config.backgroundOpacity;

  const containerStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    ...(showBorder && {
      borderWidth: 1.5,
      borderColor: `rgba(255, 255, 255, ${adaptive ? config.borderOpacity * 0.6 : config.borderOpacity})`,
    }),
    shadowColor: colors.absolute.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  };

  const gradientColors = adaptive
    ? ([
        `rgba(200, 170, 220, ${overlayOpacity})`,
        `rgba(120, 80, 160, ${overlayOpacity})`,
        `rgba(60, 40, 100, ${overlayOpacity * 1.5})`,
      ] as const)
    : ([
        `rgba(200, 170, 220, ${config.backgroundOpacity + 0.1})`,
        `rgba(120, 80, 160, ${config.backgroundOpacity})`,
        `rgba(60, 40, 100, ${config.backgroundOpacity + 0.15})`,
      ] as const);

  return (
    <View style={[containerStyle, style]} testID={testID}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={blurIntensity}
          tint={adaptive ? 'systemChromeMaterialDark' : 'dark'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(80, 50, 120, ${overlayOpacity + 0.3})` }]}
        />
      )}

      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {showTopHighlight && (
        <View
          pointerEvents="none"
          style={[
            styles.topHighlight,
            {
              borderTopLeftRadius: borderRadius,
              borderTopRightRadius: borderRadius,
              opacity: adaptive ? 0.5 : 1,
            },
          ]}
        />
      )}

      <View
        pointerEvents="none"
        style={[
          styles.innerGlow,
          {
            borderRadius: borderRadius - 1,
            opacity: adaptive ? 0.5 : 1,
          },
        ]}
      />

      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  innerGlow: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
