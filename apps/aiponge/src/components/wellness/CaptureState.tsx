/**
 * CaptureState — Mic button, live transcript, text input fallback.
 * [Cancel] [Done] — Done disabled until 5+ chars.
 */

import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';
import { AnimatedWaveform } from '../music/AnimatedWaveform';
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
              backgroundColor: speech.isListening ? '#EF4444' : colors.background.subtle,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            testID="wellness-mic-button"
          >
            {speech.isListening ? (
              <AnimatedWaveform size="large" color="#fff" />
            ) : (
              <Ionicons name="mic" size={36} color={colors.text.primary} />
            )}
          </TouchableOpacity>
          {speech.isListening && (
            <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 8 }}>Listening...</Text>
          )}
        </View>
      )}

      {/* Text input — shows speech transcript + interim results inline */}
      <TextInput
        value={speech.interimTranscript ? `${speech.transcript} ${speech.interimTranscript}`.trim() : speech.transcript}
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
