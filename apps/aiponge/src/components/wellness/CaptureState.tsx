/**
 * CaptureState — Mic button, live transcript, text input fallback.
 * [Cancel] [Done] — Done disabled until 5+ chars.
 */

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';
import type { SpeechToTextResult } from '../../hooks/wellness';

interface CaptureStateProps {
  speech: SpeechToTextResult;
  onDone: () => void;
  onCancel: () => void;
}

export function CaptureState({ speech, onDone, onCancel }: CaptureStateProps) {
  const colors = useThemeColors();

  const handleMicPress = async () => {
    if (speech.isListening) {
      speech.stop();
    } else {
      await speech.start();
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{ fontSize: 20, fontWeight: '600', color: colors.text.primary, textAlign: 'center', marginBottom: 8 }}
      >
        How are you feeling?
      </Text>
      <Text style={{ fontSize: 14, color: colors.text.secondary, textAlign: 'center', marginBottom: 24 }}>
        Speak or type what&apos;s on your mind
      </Text>

      {/* Mic Button */}
      {speech.isAvailable && (
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <TouchableOpacity
            onPress={handleMicPress}
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: speech.isListening ? colors.brand.primary : colors.background.subtle,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            testID="wellness-mic-button"
          >
            {speech.isListening ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="mic" size={36} color={speech.isListening ? '#fff' : colors.text.primary} />
            )}
          </TouchableOpacity>
          {speech.isListening && (
            <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 8 }}>Listening...</Text>
          )}
        </View>
      )}

      {/* Interim transcript */}
      {speech.interimTranscript ? (
        <Text
          style={{
            fontSize: 14,
            color: colors.text.secondary,
            fontStyle: 'italic',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          {speech.interimTranscript}
        </Text>
      ) : null}

      {/* Text input (manual or displays speech result) */}
      <TextInput
        value={speech.transcript}
        onChangeText={speech.setTranscript}
        placeholder="Or type here..."
        placeholderTextColor={colors.text.secondary}
        multiline
        style={{
          flex: 1,
          minHeight: 120,
          backgroundColor: colors.background.subtle,
          borderRadius: 12,
          padding: 16,
          fontSize: 16,
          color: colors.text.primary,
          textAlignVertical: 'top',
        }}
        testID="wellness-transcript-input"
      />

      {/* Error */}
      {speech.error && (
        <Text style={{ color: '#FF4444', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{speech.error}</Text>
      )}

      {/* Debug overlay — TEMPORARY: remove after fixing speech recognition */}
      {speech._debugLog && speech._debugLog.length > 0 && (
        <ScrollView
          style={{
            marginTop: 8,
            padding: 8,
            backgroundColor: '#1a1a2e',
            borderRadius: 8,
            maxHeight: 180,
          }}
        >
          <Text style={{ color: '#00ff88', fontSize: 10, fontWeight: '700', marginBottom: 2 }}>
            SR Debug ({speech._debugLog.length})
          </Text>
          {speech._debugLog.map((line, i) => (
            <Text key={i} style={{ color: '#aaffcc', fontSize: 9 }}>
              {line}
            </Text>
          ))}
        </ScrollView>
      )}

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: colors.background.subtle,
            alignItems: 'center',
          }}
          testID="wellness-cancel-button"
        >
          <Text style={{ fontSize: 16, color: colors.text.secondary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDone}
          disabled={!speech.isValid}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: speech.isValid ? colors.brand.primary : colors.background.subtle,
            alignItems: 'center',
            opacity: speech.isValid ? 1 : 0.5,
          }}
          testID="wellness-done-button"
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: speech.isValid ? '#fff' : colors.text.secondary }}>
            Done
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
