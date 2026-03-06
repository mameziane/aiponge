/**
 * ReviewState — Editable interpretation, RecipientPicker, plan summary.
 * [Back] [Generate] — re-plan on recipient change.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';
import { RecipientPicker } from './RecipientPicker';
import type { WellnessPlanResponse, WellnessMember } from '../../hooks/wellness';

interface ReviewStateProps {
  planData: WellnessPlanResponse;
  selectedRecipientId: string | null;
  onRecipientChange: (memberId: string | null) => void;
  onGenerate: () => void;
  onBack: () => void;
}

export function ReviewState({
  planData,
  selectedRecipientId,
  onRecipientChange,
  onGenerate,
  onBack,
}: ReviewStateProps) {
  const colors = useThemeColors();
  const { interpretation, plan, membersList } = planData;

  return (
    <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Interpretation Summary */}
      <View
        style={{
          backgroundColor: colors.background.subtle,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 6 }}>
          What I understood
        </Text>
        <Text style={{ fontSize: 15, color: colors.text.primary, lineHeight: 22 }}>{interpretation.summary}</Text>
        {interpretation.emotionalState && (
          <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 6 }}>
            Mood: {interpretation.emotionalState}
          </Text>
        )}
      </View>

      {/* Recipient Picker */}
      <View style={{ marginBottom: 16 }}>
        <RecipientPicker members={membersList} selectedId={selectedRecipientId} onSelect={onRecipientChange} />
      </View>

      {/* Plan Summary */}
      <View style={{ backgroundColor: colors.background.subtle, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8 }}>
          What I&apos;ll create
        </Text>

        {/* Book */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Ionicons name="book-outline" size={18} color={colors.text.secondary} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text.primary }}>
              {plan.book.suggestedTitle}
            </Text>
            <Text style={{ fontSize: 12, color: colors.text.secondary }}>
              {plan.book.chapterCount} chapters · {plan.book.bookTypeName}
            </Text>
          </View>
        </View>

        {/* Album */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="musical-notes-outline" size={18} color={colors.text.secondary} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text.primary }}>
              {plan.album.suggestedTitle}
            </Text>
            <Text style={{ fontSize: 12, color: colors.text.secondary }}>
              {plan.album.trackCount} tracks · {plan.album.genres.join(', ')}
            </Text>
          </View>
        </View>
      </View>

      {/* What happens next */}
      <View style={{ backgroundColor: colors.background.subtle, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 6 }}>
          What happens next
        </Text>
        <Text style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 20 }}>
          1. Preview a track based on your mood{'\n'}
          2. Confirm to start creating your book & album{'\n'}
          3. We&apos;ll notify you when everything is ready
        </Text>
      </View>

      {/* Buttons */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: colors.background.subtle,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 16, color: colors.text.secondary }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onGenerate}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: colors.brand.primary,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Generate Preview</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
