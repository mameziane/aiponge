import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useReflectionDialogue, type ReflectionTurn } from '../../hooks/profile/useReflectionDialogue';

interface Props {
  reflectionId: string;
  onClose: () => void;
  visible: boolean;
}

export const ReflectionDialogueSheet: React.FC<Props> = ({ reflectionId, onClose, visible }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [response, setResponse] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const breakthroughAnim = useRef(new Animated.Value(0)).current;

  const { reflection, turns, isLoading, continueDialogue, isContinuing, latestResult } = useReflectionDialogue(
    visible ? reflectionId : null
  );

  useEffect(() => {
    if (latestResult?.isBreakthrough) {
      Animated.sequence([
        Animated.timing(breakthroughAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(breakthroughAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(breakthroughAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [latestResult?.isBreakthrough, breakthroughAnim]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [turns.length]);

  const handleSend = () => {
    if (!response.trim() || isContinuing) return;
    continueDialogue({ userResponse: response.trim() });
    setResponse('');
  };

  if (!visible) return null;

  const currentQuestion =
    turns.find((t: ReflectionTurn) => !t.response)?.question ||
    reflection?.challengeQuestion ||
    'What would you like to reflect on?';

  return (
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reflection Dialogue</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} testID="close-dialogue">
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.brand.primary} />
          ) : (
            <>
              {turns.map((turn: ReflectionTurn) => (
                <View key={turn.id}>
                  <View style={styles.questionBubble}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.brand.primary} />
                    <Text style={styles.questionText}>{turn.question}</Text>
                  </View>

                  {turn.response && (
                    <>
                      <View style={styles.responseBubble}>
                        <Text style={styles.responseText}>{turn.response}</Text>
                      </View>

                      {turn.microInsight && (
                        <View style={styles.insightBubble}>
                          <Ionicons name="sparkles" size={14} color={colors.semantic.warning} />
                          <Text style={styles.insightText}>{turn.microInsight}</Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              ))}

              {turns.every((t: ReflectionTurn) => t.response) && (
                <View style={styles.questionBubble}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.brand.primary} />
                  <Text style={styles.questionText}>{currentQuestion}</Text>
                </View>
              )}

              {latestResult?.isBreakthrough && (
                <Animated.View style={[styles.breakthroughCard, { opacity: breakthroughAnim }]}>
                  <Ionicons name="flash" size={24} color={colors.semantic.warning} />
                  <Text style={styles.breakthroughTitle}>Breakthrough Moment</Text>
                  <Text style={styles.breakthroughText}>You reached a moment of deeper understanding.</Text>
                </Animated.View>
              )}

              {latestResult?.synthesis && (
                <View style={styles.synthesisCard}>
                  <Ionicons name="document-text-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.synthesisTitle}>Synthesis</Text>
                  <Text style={styles.synthesisText}>{latestResult.synthesis}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.inputArea}>
          <TextInput
            style={styles.textInput}
            placeholder="Share your thoughts..."
            placeholderTextColor={colors.text.tertiary}
            value={response}
            onChangeText={setResponse}
            multiline
            maxLength={2000}
            testID="dialogue-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!response.trim() || isContinuing) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!response.trim() || isContinuing}
            testID="send-response"
          >
            {isContinuing ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <Ionicons name="send" size={20} color={colors.text.primary} />
            )}
          </TouchableOpacity>
        </View>
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
      minHeight: '50%',
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
    chatArea: {
      flex: 1,
      paddingHorizontal: 16,
    },
    chatContent: {
      paddingVertical: 16,
      gap: 12,
    },
    questionBubble: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.background.darkCard,
      padding: 14,
      borderRadius: BORDER_RADIUS.lg,
      borderTopLeftRadius: 4,
      maxWidth: '85%',
    },
    questionText: {
      flex: 1,
      fontSize: 15,
      color: colors.text.primary,
      lineHeight: 22,
    },
    responseBubble: {
      alignSelf: 'flex-end',
      backgroundColor: colors.brand.primary,
      padding: 14,
      borderRadius: BORDER_RADIUS.lg,
      borderTopRightRadius: 4,
      maxWidth: '85%',
    },
    responseText: {
      fontSize: 15,
      color: '#fff',
      lineHeight: 22,
    },
    insightBubble: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: `${colors.semantic.warning}15`,
      padding: 10,
      borderRadius: BORDER_RADIUS.md,
      maxWidth: '80%',
    },
    insightText: {
      flex: 1,
      fontSize: 13,
      color: colors.semantic.warning,
      fontStyle: 'italic',
      lineHeight: 18,
    },
    breakthroughCard: {
      alignItems: 'center',
      backgroundColor: `${colors.semantic.warning}20`,
      padding: 20,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.semantic.warning,
      marginVertical: 8,
    },
    breakthroughTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.semantic.warning,
      marginTop: 8,
    },
    breakthroughText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 4,
    },
    synthesisCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 3,
      borderLeftColor: colors.brand.primary,
      marginVertical: 8,
    },
    synthesisTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 8,
      marginBottom: 4,
    },
    synthesisText: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    inputArea: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.background.subtle,
      gap: 8,
    },
    textInput: {
      flex: 1,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text.primary,
      maxHeight: 100,
    },
    sendButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.full,
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
  });
