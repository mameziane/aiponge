import { type ReactNode, useMemo } from 'react';
import { Pressable, View, Text, StyleSheet, Platform, ViewStyle, TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors, type ColorScheme } from '../../theme';
import { GlassIntensity, glassConfig } from './types';

interface LiquidGlassButtonProps {
  onPress: () => void;
  children?: ReactNode;
  label?: string;
  intensity?: GlassIntensity;
  borderRadius?: number;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  adaptive?: boolean;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  testID?: string;
  numberOfLines?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function LiquidGlassButton({
  onPress,
  children,
  label,
  intensity = 'medium',
  borderRadius = glassConfig.borderRadius.medium,
  disabled = false,
  size = 'medium',
  fullWidth = false,
  adaptive = true,
  style,
  labelStyle,
  testID,
  numberOfLines = 1,
  accessibilityLabel,
  accessibilityHint,
}: LiquidGlassButtonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = glassConfig.intensity[intensity];

  const sizeStyles = {
    small: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 44 },
    medium: { paddingVertical: 12, paddingHorizontal: 24 },
    large: { paddingVertical: 16, paddingHorizontal: 32 },
  };

  const labelSizes = {
    small: 14,
    medium: 16,
    large: 18,
  };

  const blurIntensity = adaptive ? config.adaptiveBlur : config.blur;
  const overlayOpacity = adaptive ? config.adaptiveOverlayOpacity : config.backgroundOpacity;

  const gradientColors = adaptive
    ? ([
        `rgba(200, 170, 220, ${overlayOpacity + 0.05})`,
        `rgba(160, 100, 200, ${overlayOpacity})`,
        `rgba(120, 60, 180, ${overlayOpacity})`,
      ] as const)
    : ([
        `rgba(200, 170, 220, ${config.backgroundOpacity + 0.15})`,
        `rgba(160, 100, 200, ${config.backgroundOpacity + 0.05})`,
        `rgba(120, 60, 180, ${config.backgroundOpacity})`,
      ] as const);

  const pressedGradientColors = adaptive
    ? ([
        `rgba(220, 190, 240, ${overlayOpacity + 0.2})`,
        `rgba(180, 120, 220, ${overlayOpacity + 0.15})`,
        `rgba(140, 80, 200, ${overlayOpacity + 0.1})`,
      ] as const)
    : ([
        `rgba(220, 190, 240, ${config.backgroundOpacity + 0.35})`,
        `rgba(180, 120, 220, ${config.backgroundOpacity + 0.25})`,
        `rgba(140, 80, 200, ${config.backgroundOpacity + 0.2})`,
      ] as const);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        {
          borderRadius,
          overflow: 'hidden',
          opacity: disabled ? 0.5 : 1,
          borderWidth: 1.5,
          borderColor: pressed
            ? 'rgba(255, 255, 255, 0.5)'
            : `rgba(255, 255, 255, ${adaptive ? config.borderOpacity * 0.6 : config.borderOpacity})`,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: colors.absolute.black,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <View style={{ borderRadius }}>
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={blurIntensity}
              tint={adaptive ? 'systemChromeMaterialDark' : 'dark'}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(80, 50, 120, ${overlayOpacity + 0.3})` }]}
            />
          )}

          <LinearGradient
            colors={pressed ? pressedGradientColors : gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View
            style={[
              styles.topHighlight,
              {
                borderTopLeftRadius: borderRadius,
                borderTopRightRadius: borderRadius,
                opacity: pressed ? 0.4 : adaptive ? 0.5 : 1,
              },
            ]}
          />

          <View style={[styles.content, sizeStyles[size]]}>
            {children || (
              <Text style={[styles.label, { fontSize: labelSizes[size] }, labelStyle]} numberOfLines={numberOfLines}>
                {label}
              </Text>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    topHighlight: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.4)',
    },
    content: {
      position: 'relative',
      zIndex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    label: {
      color: colors.text.primary,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
