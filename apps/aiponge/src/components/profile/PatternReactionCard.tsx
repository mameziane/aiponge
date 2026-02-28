import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { usePatternReactions } from '../../hooks/profile/usePatternReactions';

interface PatternData {
  id: string;
  patternName: string;
  description: string | null;
  strength: string | null;
  trend: string | null;
  patternType: string;
  relatedThemes: string[] | null;
}

interface Props {
  pattern: PatternData;
}

type ReactionType = 'resonates' | 'partially' | 'not_me' | 'curious';

const REACTIONS: Array<{ key: ReactionType; icon: string; label: string; color: string }> = [
  { key: 'resonates', icon: 'checkmark-circle', label: 'Resonates', color: '#4CAF50' },
  { key: 'partially', icon: 'help-circle', label: 'Partially', color: '#FF9800' },
  { key: 'not_me', icon: 'close-circle', label: 'Not Me', color: '#F44336' },
  { key: 'curious', icon: 'search', label: 'Curious', color: '#2196F3' },
];

export const PatternReactionCard: React.FC<Props> = ({ pattern }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showEvidence, setShowEvidence] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(null);

  const { evidence, isLoadingEvidence, react, isReacting, followUpAction, refetchEvidence } = usePatternReactions(
    showEvidence ? pattern.id : null
  );

  const handleReact = (reaction: ReactionType) => {
    setSelectedReaction(reaction);
    react({ reaction, explanation: explanation || undefined });
    setExplanation('');
  };

  return (
    <View style={styles.card} testID={`pattern-card-${pattern.id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.patternInfo}>
          <Text style={styles.patternName}>{pattern.patternName}</Text>
          {pattern.description && <Text style={styles.patternDesc}>{pattern.description}</Text>}
        </View>
        {pattern.strength && (
          <View style={styles.strengthBadge}>
            <Text style={styles.strengthText}>{pattern.strength}</Text>
          </View>
        )}
      </View>

      {pattern.relatedThemes && pattern.relatedThemes.length > 0 && (
        <View style={styles.themesRow}>
          {pattern.relatedThemes.slice(0, 4).map((theme, i) => (
            <View key={i} style={styles.themeBadge}>
              <Text style={styles.themeText}>{theme}</Text>
            </View>
          ))}
        </View>
      )}

      <TextInput
        style={styles.explanationInput}
        placeholder="What does this pattern mean to you? (optional)"
        placeholderTextColor={colors.text.tertiary}
        value={explanation}
        onChangeText={setExplanation}
        multiline
        maxLength={300}
        testID={`explanation-${pattern.id}`}
      />

      <View style={styles.reactionsRow}>
        {REACTIONS.map(r => (
          <TouchableOpacity
            key={r.key}
            style={[styles.reactionButton, selectedReaction === r.key && { borderColor: r.color, borderWidth: 2 }]}
            onPress={() => handleReact(r.key)}
            disabled={isReacting}
            testID={`react-${r.key}-${pattern.id}`}
          >
            {isReacting && selectedReaction === r.key ? (
              <ActivityIndicator size="small" color={r.color} />
            ) : (
              <>
                <Ionicons name={r.icon as keyof typeof Ionicons.glyphMap} size={20} color={r.color} />
                <Text style={[styles.reactionLabel, { color: r.color }]}>{r.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {followUpAction && (
        <View style={styles.followUpCard}>
          <Ionicons name="sparkles" size={18} color={colors.brand.primary} />
          <Text style={styles.followUpText}>{followUpAction.message}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.evidenceToggle}
        onPress={() => {
          setShowEvidence(!showEvidence);
          if (!showEvidence) refetchEvidence();
        }}
        testID={`toggle-evidence-${pattern.id}`}
      >
        <Ionicons name={showEvidence ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.secondary} />
        <Text style={styles.evidenceToggleText}>{showEvidence ? 'Hide Evidence' : 'View Evidence'}</Text>
      </TouchableOpacity>

      {showEvidence && (
        <View style={styles.evidenceSection}>
          {isLoadingEvidence ? (
            <ActivityIndicator size="small" color={colors.brand.primary} />
          ) : evidence ? (
            <>
              {evidence.explorationPrompt && (
                <View style={styles.explorationPrompt}>
                  <Ionicons name="compass-outline" size={16} color={colors.brand.primary} />
                  <Text style={styles.explorationText}>{evidence.explorationPrompt}</Text>
                </View>
              )}
              {evidence.reactions.length > 0 && (
                <View style={styles.reactionsHistory}>
                  <Text style={styles.historyTitle}>Your Reactions</Text>
                  {evidence.reactions.slice(0, 5).map((r, i) => (
                    <View key={i} style={styles.historyItem}>
                      <Text style={styles.historyReaction}>{r.reaction}</Text>
                      {r.explanation && <Text style={styles.historyExplanation}>{r.explanation}</Text>}
                    </View>
                  ))}
                </View>
              )}
              {evidence.evidenceEntries.length > 0 && (
                <View style={styles.entriesSection}>
                  <Text style={styles.historyTitle}>Related Entries ({evidence.evidenceEntries.length})</Text>
                  {evidence.evidenceEntries.slice(0, 3).map((entry, i) => (
                    <View key={i} style={styles.entryPreview}>
                      <Text style={styles.entryContent} numberOfLines={2}>
                        {String((entry as Record<string, unknown>).content || '').substring(0, 100)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.noEvidence}>No evidence available yet.</Text>
          )}
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      marginBottom: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    patternInfo: {
      flex: 1,
      marginRight: 12,
    },
    patternName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    patternDesc: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 4,
      lineHeight: 18,
    },
    strengthBadge: {
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
    },
    strengthText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    themesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    themeBadge: {
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    themeText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    explanationInput: {
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.text.primary,
      marginTop: 12,
      minHeight: 36,
    },
    reactionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 14,
      gap: 8,
    },
    reactionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: 'transparent',
      gap: 4,
    },
    reactionLabel: {
      fontSize: 10,
      fontWeight: '500',
    },
    followUpCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: `${colors.brand.primary}15`,
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      marginTop: 12,
    },
    followUpText: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    evidenceToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      paddingVertical: 6,
    },
    evidenceToggleText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    evidenceSection: {
      marginTop: 8,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.background.subtle,
    },
    explorationPrompt: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: `${colors.brand.primary}10`,
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
    },
    explorationText: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      fontStyle: 'italic',
      lineHeight: 20,
    },
    reactionsHistory: {
      marginBottom: 12,
    },
    historyTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    historyItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    historyReaction: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.brand.primary,
      textTransform: 'capitalize',
    },
    historyExplanation: {
      flex: 1,
      fontSize: 12,
      color: colors.text.secondary,
    },
    entriesSection: {
      marginTop: 4,
    },
    entryPreview: {
      backgroundColor: colors.background.subtle,
      padding: 10,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 6,
    },
    entryContent: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    noEvidence: {
      fontSize: 13,
      color: colors.text.tertiary,
      textAlign: 'center',
      paddingVertical: 12,
    },
  });
