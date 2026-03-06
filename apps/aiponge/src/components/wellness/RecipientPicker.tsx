/**
 * RecipientPicker — Dropdown from membersList. "Myself" always first.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';
import type { WellnessMember } from '../../hooks/wellness';

interface RecipientPickerProps {
  members: WellnessMember[];
  selectedId: string | null;
  onSelect: (memberId: string | null) => void;
}

export function RecipientPicker({ members, selectedId, onSelect }: RecipientPickerProps) {
  const colors = useThemeColors();

  // "Myself" always first, then members
  const selfMember = members.find(m => m.relationship === 'self');
  const otherMembers = members.filter(m => m.relationship !== 'self');

  const isSelected = (id: string | null) => selectedId === id;

  const renderOption = (id: string | null, label: string, icon: keyof typeof Ionicons.glyphMap) => (
    <TouchableOpacity
      key={id ?? 'self'}
      onPress={() => onSelect(id)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: isSelected(id) ? colors.brand.primary + '20' : 'transparent',
        marginBottom: 4,
      }}
    >
      <Ionicons name={icon} size={20} color={isSelected(id) ? colors.brand.primary : colors.text.secondary} />
      <Text
        style={{
          marginLeft: 10,
          fontSize: 15,
          color: isSelected(id) ? colors.text.primary : colors.text.secondary,
          fontWeight: isSelected(id) ? '600' : '400',
          flex: 1,
        }}
      >
        {label}
      </Text>
      {isSelected(id) && <Ionicons name="checkmark-circle" size={20} color={colors.brand.primary} />}
    </TouchableOpacity>
  );

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8 }}>For whom?</Text>
      <ScrollView style={{ maxHeight: 200 }}>
        {renderOption(null, selfMember?.name || 'Myself', 'person')}
        {otherMembers.map(m => renderOption(m.id, m.name, 'people'))}
      </ScrollView>
    </View>
  );
}
