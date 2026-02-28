/**
 * Skeleton Loading Components
 * Provides placeholder UI while content is loading
 *
 * iOS 26 guard: Reanimated 4.1.x withRepeat/withSequence worklets crash on iPhone OS 26
 * (same UIKit internal conflict as the RNTP and expo-audio crashes). On iOS 26 the
 * skeleton boxes render as a static low-opacity placeholder — visually identical but
 * without the Reanimated worklet thread. The RN built-in Animated API is used instead,
 * which runs on the JS thread and has no UIKit worklet interaction. Animation is fully
 * restored on iOS < 26 and Android.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue, Platform, Animated } from 'react-native';
import { useThemeColors } from '../../theme';
import { ANIMATION, BORDER_RADIUS } from '../../theme/constants';

const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

// ---------------------------------------------------------------------------
// iOS 26 safe skeleton — static opacity, zero Reanimated dependency
// ---------------------------------------------------------------------------
const StaticSkeletonBox: React.FC<{
  width: DimensionValue;
  height: number;
  style?: ViewStyle;
  backgroundColor: string;
}> = ({ width, height, style, backgroundColor }) => (
  <View style={[{ width, height, backgroundColor, borderRadius: BORDER_RADIUS.sm, opacity: 0.4 }, style]} />
);

// ---------------------------------------------------------------------------
// Animated skeleton — uses RN built-in Animated (no Reanimated worklet)
// ---------------------------------------------------------------------------
const AnimatedSkeletonBox: React.FC<{
  width: DimensionValue;
  height: number;
  style?: ViewStyle;
  backgroundColor: string;
}> = ({ width, height, style, backgroundColor }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: ANIMATION.skeleton, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: ANIMATION.skeleton, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.View style={[{ width, height, backgroundColor, borderRadius: BORDER_RADIUS.sm, opacity }, style]} />;
};

// ---------------------------------------------------------------------------
// Public SkeletonBox — picks the right implementation based on OS version
// ---------------------------------------------------------------------------
const SkeletonBox: React.FC<{ width: DimensionValue; height: number; style?: ViewStyle }> = ({
  width,
  height,
  style,
}) => {
  const colors = useThemeColors();
  const backgroundColor = colors.brand.primary;

  if (isIOS26OrLater) {
    return <StaticSkeletonBox width={width} height={height} style={style} backgroundColor={backgroundColor} />;
  }
  return <AnimatedSkeletonBox width={width} height={height} style={style} backgroundColor={backgroundColor} />;
};

export const EntryCardSkeleton: React.FC = () => {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.cardHeader}>
        <SkeletonBox width={80} height={24} />
        <SkeletonBox width={100} height={16} />
      </View>
      <View style={skeletonStyles.cardContent}>
        <SkeletonBox width="100%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBox width="90%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBox width="95%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBox width="70%" height={16} />
      </View>
      <View style={skeletonStyles.cardFooter}>
        <SkeletonBox width={60} height={20} />
        <SkeletonBox width={60} height={20} />
      </View>
    </View>
  );
};

export const EntriesListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <EntryCardSkeleton key={index} />
      ))}
    </>
  );
};

export const InsightCardSkeleton: React.FC = () => {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.cardHeader}>
        <SkeletonBox width={100} height={24} />
        <SkeletonBox width={80} height={16} />
      </View>
      <View style={skeletonStyles.cardContent}>
        <SkeletonBox width="100%" height={18} style={{ marginBottom: 12 }} />
        <SkeletonBox width="100%" height={14} style={{ marginBottom: 8 }} />
        <SkeletonBox width="95%" height={14} style={{ marginBottom: 8 }} />
        <SkeletonBox width="85%" height={14} />
      </View>
      <View style={skeletonStyles.tagsRow}>
        <SkeletonBox width={70} height={24} style={{ marginRight: 8 }} />
        <SkeletonBox width={90} height={24} style={{ marginRight: 8 }} />
        <SkeletonBox width={60} height={24} />
      </View>
    </View>
  );
};

export const InsightsListSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <InsightCardSkeleton key={index} />
      ))}
    </>
  );
};

export const LyricsGeneratingSkeleton: React.FC = () => {
  return (
    <View style={skeletonStyles.lyricsCard}>
      <View style={skeletonStyles.lyricsHeader}>
        <SkeletonBox width={24} height={24} style={{ borderRadius: BORDER_RADIUS.md }} />
        <SkeletonBox width={140} height={18} style={{ marginLeft: 8 }} />
      </View>
      <View style={skeletonStyles.lyricsContent}>
        <SkeletonBox width="85%" height={14} style={{ marginBottom: 10 }} />
        <SkeletonBox width="90%" height={14} style={{ marginBottom: 10 }} />
        <SkeletonBox width="75%" height={14} style={{ marginBottom: 10 }} />
        <SkeletonBox width="95%" height={14} style={{ marginBottom: 10 }} />
        <SkeletonBox width="80%" height={14} style={{ marginBottom: 10 }} />
        <SkeletonBox width="70%" height={14} />
      </View>
    </View>
  );
};

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(101, 45, 144, 0.2)',
    borderRadius: BORDER_RADIUS.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(162, 128, 188, 0.3)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardContent: {
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  lyricsCard: {
    backgroundColor: 'rgba(101, 45, 144, 0.15)',
    borderRadius: BORDER_RADIUS.md,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(162, 128, 188, 0.3)',
  },
  lyricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  lyricsContent: {
    paddingLeft: 4,
  },
});
