/**
 * ConfirmedState — Success message + checkmark, auto-close 2s.
 */

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../theme';

interface ConfirmedStateProps {
  recipientIsSelf: boolean;
  recipientName: string;
  onAutoClose: () => void;
}

export function ConfirmedState({ recipientIsSelf, recipientName, onAutoClose }: ConfirmedStateProps) {
  const colors = useThemeColors();

  useEffect(() => {
    const timer = setTimeout(onAutoClose, 2000);
    return () => clearTimeout(timer);
  }, [onAutoClose]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: '#4CAF50',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Ionicons name="checkmark" size={48} color="#fff" />
      </View>

      <Text
        style={{ fontSize: 22, fontWeight: '700', color: colors.text.primary, textAlign: 'center', marginBottom: 8 }}
      >
        All set!
      </Text>

      <Text style={{ fontSize: 15, color: colors.text.secondary, textAlign: 'center', lineHeight: 22 }}>
        {recipientIsSelf
          ? "Your personalized book and album are being created. We'll notify you when they're ready."
          : `A personalized book and album are being created for ${recipientName}. We'll notify you both when it's ready.`}
      </Text>
    </View>
  );
}
