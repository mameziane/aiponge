/**
 * PreviewState — Audio preview, track metadata, recipient reminder.
 * [Regenerate] [Send to Alex / Create for me]
 */

import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';
import type { PreviewTrack } from '../../hooks/wellness';

interface PreviewStateProps {
  previewTrack: PreviewTrack;
  recipientName: string;
  recipientIsSelf: boolean;
  onConfirm: () => void;
  onRegenerate: () => void;
  onBack: () => void;
  isConfirming: boolean;
}

export function PreviewState({
  previewTrack,
  recipientName,
  recipientIsSelf,
  onConfirm,
  onRegenerate,
  onBack,
  isConfirming,
}: PreviewStateProps) {
  const colors = useThemeColors();

  const confirmLabel = recipientIsSelf ? 'Create for me' : `Send to ${recipientName}`;

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{ fontSize: 20, fontWeight: '600', color: colors.text.primary, textAlign: 'center', marginBottom: 4 }}
      >
        Preview Track
      </Text>
      <Text style={{ fontSize: 14, color: colors.text.secondary, textAlign: 'center', marginBottom: 24 }}>
        Listen to a sample before confirming
      </Text>

      {/* Track Card */}
      <View
        style={{
          backgroundColor: colors.background.subtle,
          borderRadius: 16,
          padding: 20,
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        {previewTrack.artworkUrl ? (
          <Image
            source={{ uri: previewTrack.artworkUrl }}
            style={{ width: 120, height: 120, borderRadius: 12, marginBottom: 16 }}
          />
        ) : (
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 12,
              backgroundColor: colors.brand.primary,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Ionicons name="musical-notes" size={48} color="#fff" />
          </View>
        )}

        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text.primary, textAlign: 'center' }}>
          {previewTrack.title}
        </Text>
        {previewTrack.genre && (
          <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 4 }}>
            {previewTrack.genre} · {previewTrack.mood}
          </Text>
        )}

        {/* Play button hint */}
        <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 12, fontStyle: 'italic' }}>
          Tap the track in your library to listen
        </Text>
      </View>

      {/* Recipient reminder */}
      {!recipientIsSelf && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background.subtle,
            borderRadius: 10,
            padding: 12,
            marginBottom: 20,
          }}
        >
          <Ionicons name="gift-outline" size={18} color={colors.brand.primary} />
          <Text style={{ marginLeft: 8, fontSize: 13, color: colors.text.secondary, flex: 1 }}>
            This will be created as a gift for {recipientName}
          </Text>
        </View>
      )}

      {/* Buttons */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 'auto' }}>
        <TouchableOpacity
          onPress={onRegenerate}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: colors.background.subtle,
          }}
        >
          <Ionicons name="refresh" size={18} color={colors.text.secondary} />
          <Text style={{ fontSize: 14, color: colors.text.secondary, marginLeft: 6 }}>Regenerate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onConfirm}
          disabled={isConfirming}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: colors.brand.primary,
            alignItems: 'center',
            opacity: isConfirming ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>
            {isConfirming ? 'Confirming...' : confirmLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
