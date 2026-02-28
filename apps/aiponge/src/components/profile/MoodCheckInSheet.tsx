import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useMoodCheckin } from '../../hooks/profile/useMoodCheckin';

interface Props {
  onClose: () => void;
  visible: boolean;
}

const MOODS = [
  { key: 'happy', icon: 'happy-outline' as const, label: 'Happy', color: '#FFD700' },
  { key: 'calm', icon: 'leaf-outline' as const, label: 'Calm', color: '#4CAF50' },
  { key: 'grateful', icon: 'heart-outline' as const, label: 'Grateful', color: '#E91E63' },
  { key: 'neutral', icon: 'remove-circle-outline' as const, label: 'Neutral', color: '#9E9E9E' },
  { key: 'anxious', icon: 'thunderstorm-outline' as const, label: 'Anxious', color: '#FF9800' },
  { key: 'sad', icon: 'rainy-outline' as const, label: 'Sad', color: '#2196F3' },
  { key: 'frustrated', icon: 'flame-outline' as const, label: 'Frustrated', color: '#F44336' },
];

const INTENSITY_LABELS = ['Low', 'Mild', 'Moderate', 'Strong', 'Intense'];

export const MoodCheckInSheet: React.FC<Props> = ({ onClose, visible }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [note, setNote] = useState('');
  const [showMicroQuestion, setShowMicroQuestion] = useState(false);
  const [microResponse, setMicroResponse] = useState('');

  const { recordMood, isRecording, lastResult, respondToMicroQuestion, isResponding } = useMoodCheckin();

  const handleRecord = useCallback(() => {
    if (!selectedMood) return;
    recordMood(
      { mood: selectedMood, emotionalIntensity: intensity, content: note || undefined },
      {
        onSuccess: () => setShowMicroQuestion(true),
      }
    );
  }, [selectedMood, intensity, note, recordMood]);

  const handleMicroResponse = useCallback(() => {
    if (!lastResult?.checkin?.id || !microResponse.trim()) return;
    respondToMicroQuestion(
      { checkinId: lastResult.checkin.id, microQuestionResponse: microResponse.trim() },
      { onSuccess: () => onClose() }
    );
  }, [lastResult, microResponse, respondToMicroQuestion, onClose]);

  if (!visible) return null;

  return (
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mood Check-In</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} testID="close-mood">
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {!showMicroQuestion ? (
            <>
              <Text style={styles.sectionTitle}>How are you feeling?</Text>
              <View style={styles.moodGrid}>
                {MOODS.map(mood => (
                  <TouchableOpacity
                    key={mood.key}
                    style={[styles.moodItem, selectedMood === mood.key && { borderColor: mood.color, borderWidth: 2 }]}
                    onPress={() => setSelectedMood(mood.key)}
                    testID={`mood-${mood.key}`}
                  >
                    <Ionicons
                      name={mood.icon}
                      size={32}
                      color={selectedMood === mood.key ? mood.color : colors.text.secondary}
                    />
                    <Text style={[styles.moodLabel, selectedMood === mood.key && { color: mood.color }]}>
                      {mood.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {selectedMood && (
                <>
                  <Text style={styles.sectionTitle}>Intensity</Text>
                  <View style={styles.intensityRow}>
                    {[1, 3, 5, 7, 10].map((val, idx) => (
                      <TouchableOpacity
                        key={val}
                        style={[styles.intensityDot, intensity === val && styles.intensityDotActive]}
                        onPress={() => setIntensity(val)}
                        testID={`intensity-${val}`}
                      >
                        <Text style={[styles.intensityNumber, intensity === val && styles.intensityNumberActive]}>
                          {val}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.intensityLabel}>
                    {INTENSITY_LABELS[Math.min(Math.floor((intensity - 1) / 2), 4)]}
                  </Text>

                  <Text style={styles.sectionTitle}>Notes (optional)</Text>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="What's on your mind?"
                    placeholderTextColor={colors.text.tertiary}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={500}
                    testID="mood-note"
                  />

                  <TouchableOpacity
                    style={[styles.recordButton, isRecording && styles.recordButtonDisabled]}
                    onPress={handleRecord}
                    disabled={isRecording}
                    testID="record-mood"
                  >
                    {isRecording ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.recordButtonText}>Record Mood</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <View style={styles.checkMark}>
                <Ionicons name="checkmark-circle" size={48} color={colors.semantic.success} />
                <Text style={styles.recordedText}>Mood recorded!</Text>
              </View>

              {lastResult?.patternConnection?.message && (
                <View style={styles.patternCard}>
                  <Ionicons name="git-network-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.patternText}>{lastResult.patternConnection.message}</Text>
                </View>
              )}

              {lastResult?.microQuestion && (
                <>
                  <View style={styles.microQuestionCard}>
                    <Ionicons name="chatbubble-outline" size={18} color={colors.brand.primary} />
                    <Text style={styles.microQuestionText}>{lastResult.microQuestion}</Text>
                  </View>

                  <TextInput
                    style={styles.noteInput}
                    placeholder="Share your thoughts..."
                    placeholderTextColor={colors.text.tertiary}
                    value={microResponse}
                    onChangeText={setMicroResponse}
                    multiline
                    maxLength={500}
                    testID="micro-response"
                  />

                  <View style={styles.microActions}>
                    <TouchableOpacity style={styles.skipButton} onPress={onClose} testID="skip-micro">
                      <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.recordButton, { flex: 1 }, isResponding && styles.recordButtonDisabled]}
                      onPress={handleMicroResponse}
                      disabled={isResponding || !microResponse.trim()}
                      testID="submit-micro"
                    >
                      {isResponding ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.recordButtonText}>Share</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
      zIndex: 100,
    },
    container: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.background.subtle,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    closeButton: {
      padding: 4,
    },
    content: {
      flex: 1,
    },
    contentInner: {
      padding: 20,
      paddingBottom: 40,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
      marginTop: 16,
    },
    moodGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
    },
    moodItem: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 80,
      height: 80,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.background.darkCard,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    moodLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 4,
    },
    intensityRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    intensityDot: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background.darkCard,
      justifyContent: 'center',
      alignItems: 'center',
    },
    intensityDotActive: {
      backgroundColor: colors.brand.primary,
    },
    intensityNumber: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    intensityNumberActive: {
      color: '#fff',
    },
    intensityLabel: {
      textAlign: 'center',
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 8,
    },
    noteInput: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text.primary,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    recordButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 20,
    },
    recordButtonDisabled: {
      opacity: 0.5,
    },
    recordButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
    },
    checkMark: {
      alignItems: 'center',
      marginVertical: 16,
    },
    recordedText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 8,
    },
    patternCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: `${colors.brand.primary}15`,
      padding: 14,
      borderRadius: BORDER_RADIUS.lg,
      marginTop: 16,
    },
    patternText: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    microQuestionCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.background.darkCard,
      padding: 14,
      borderRadius: BORDER_RADIUS.lg,
      marginTop: 16,
      marginBottom: 12,
    },
    microQuestionText: {
      flex: 1,
      fontSize: 15,
      color: colors.text.primary,
      lineHeight: 22,
    },
    microActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    skipButton: {
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    skipText: {
      fontSize: 16,
      color: colors.text.secondary,
    },
  });
