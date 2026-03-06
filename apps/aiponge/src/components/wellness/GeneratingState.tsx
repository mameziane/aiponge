/**
 * GeneratingState — Progress animation with phase labels.
 */

import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useThemeColors } from '../../theme';

interface GeneratingStateProps {
  progress: number;
  phase: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  initializing: 'Setting things up...',
  processing: 'Creating your preview track...',
  generating_lyrics: 'Writing lyrics...',
  generating_music: 'Composing music...',
  generating_artwork: 'Creating artwork...',
  finalizing: 'Almost done...',
};

export function GeneratingState({ progress, phase }: GeneratingStateProps) {
  const colors = useThemeColors();
  const phaseLabel = (phase && PHASE_LABELS[phase]) || 'Creating your preview...';

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <ActivityIndicator size="large" color={colors.brand.primary} style={{ marginBottom: 24 }} />

      <Text
        style={{ fontSize: 18, fontWeight: '600', color: colors.text.primary, textAlign: 'center', marginBottom: 8 }}
      >
        {phaseLabel}
      </Text>

      {/* Progress bar */}
      <View
        style={{
          width: '100%',
          height: 6,
          backgroundColor: colors.background.subtle,
          borderRadius: 3,
          marginTop: 16,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.min(progress, 100)}%`,
            height: '100%',
            backgroundColor: colors.brand.primary,
            borderRadius: 3,
          }}
        />
      </View>
      <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 8 }}>{Math.round(progress)}%</Text>
    </View>
  );
}
