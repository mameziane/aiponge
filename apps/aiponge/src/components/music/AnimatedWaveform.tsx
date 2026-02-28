import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useThemeColors } from '../../theme';

interface AnimatedWaveformProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

export function AnimatedWaveform({ size = 'medium', color = 'white' }: AnimatedWaveformProps) {
  const colors = useThemeColors();
  const bar1Anim = useRef(new Animated.Value(0.3)).current;
  const bar2Anim = useRef(new Animated.Value(0.6)).current;
  const bar3Anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animateBar = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400 + delay,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0.3,
            duration: 400 + delay,
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Create individual loop references for proper cleanup
    const bar1Loop = animateBar(bar1Anim, 0);
    const bar2Loop = animateBar(bar2Anim, 100);
    const bar3Loop = animateBar(bar3Anim, 50);

    // Start all animations
    bar1Loop.start();
    bar2Loop.start();
    bar3Loop.start();

    // Cleanup: stop each loop individually
    return () => {
      bar1Loop.stop();
      bar2Loop.stop();
      bar3Loop.stop();
    };
  }, [bar1Anim, bar2Anim, bar3Anim]);

  const sizeConfig = {
    small: { barWidth: 2, maxHeight: 12, gap: 2 },
    medium: { barWidth: 3, maxHeight: 20, gap: 3 },
    large: { barWidth: 4, maxHeight: 28, gap: 4 },
  };

  const { barWidth, maxHeight, gap } = sizeConfig[size];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            backgroundColor: color,
            transform: [
              {
                scaleY: bar1Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
            height: maxHeight,
          },
        ]}
      />
      <View style={{ width: gap }} />
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            backgroundColor: color,
            transform: [
              {
                scaleY: bar2Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
            height: maxHeight,
          },
        ]}
      />
      <View style={{ width: gap }} />
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            backgroundColor: color,
            transform: [
              {
                scaleY: bar3Anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
            height: maxHeight,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    borderRadius: 2,
  },
});
