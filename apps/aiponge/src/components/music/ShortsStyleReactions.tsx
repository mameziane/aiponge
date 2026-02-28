import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';

interface ShortsStyleReactionsProps {
  isLiked: boolean;
  onLike: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export function ShortsStyleReactions({ isLiked, onLike, disabled = false, style }: ShortsStyleReactionsProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [likeScale] = React.useState(new Animated.Value(1));

  const animateButton = (scaleAnim: Animated.Value, callback: () => void) => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    callback();
  };

  const handleLike = () => {
    if (!disabled) {
      animateButton(likeScale, onLike);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={{ transform: [{ scale: likeScale }] }}>
        <TouchableOpacity
          style={[styles.button, isLiked && styles.buttonActive]}
          onPress={handleLike}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? 'Unlike track' : 'Like track'}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={28}
            color={isLiked ? colors.semantic.error : colors.text.primary}
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      gap: 16,
    },
    button: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.overlay.black[50],
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.absolute.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    buttonActive: {
      backgroundColor: colors.overlay.black[70],
    },
  });
