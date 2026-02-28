import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Pressable, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import type { Entry } from '@/types/profile.types';
import { BookReferences } from '../../../book/BookReferences';
import { RichText } from '../../../shared/RichText';

interface BookContentEntryCardProps {
  entry: Entry;
  isSelected: boolean;
  isEditing: boolean;
  hasSong: boolean;
  editedContent: string;
  savingEntry: boolean;
  saveFailedForEntry: string | null;
  deletingEntryId: string | null;
  canDelete: boolean;
  onTap: (entry: Entry) => void;
  onLongPress: (entry: Entry) => void;
  onContentChange: (text: string) => void;
  onBlurSave: () => void;
  onDelete: (entry: Entry) => void;
  onCreateSong: (entry: Entry) => void;
  onClearSaveError: (entryId: string) => void;
}

export const BookContentEntryCard: React.FC<BookContentEntryCardProps> = ({
  entry,
  isSelected,
  isEditing,
  hasSong,
  editedContent,
  savingEntry,
  saveFailedForEntry,
  deletingEntryId,
  canDelete,
  onTap,
  onLongPress,
  onContentChange,
  onBlurSave,
  onDelete,
  onCreateSong,
  onClearSaveError,
}) => {
  const colors = useThemeColors();
  const styles = React.useMemo(() => createProfileEditorStyles(colors), [colors]);

  const date = new Date(entry.createdAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const renderSwipeRightActions = React.useCallback(
    (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const trans = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [0, 80],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View
          style={{
            backgroundColor: colors.semantic.error,
            justifyContent: 'center',
            alignItems: 'flex-end',
            borderRadius: 12,
            marginBottom: 8,
            transform: [{ translateX: trans }],
          }}
        >
          <TouchableOpacity
            style={{
              width: 80,
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={() => onDelete(entry)}
            testID={`button-delete-entry-${entry.id}`}
          >
            {deletingEntryId === entry.id ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <Ionicons name="trash" size={24} color={colors.text.primary} />
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [deletingEntryId, entry, onDelete, colors]
  );

  const cardContent = (
    <Pressable onPress={() => onTap(entry)} onLongPress={() => onLongPress(entry)} testID={`entry-${entry.id}`}>
      <View
        style={[
          styles.entryCard,
          {
            borderWidth: 2,
            borderColor: isEditing ? colors.brand.primary : isSelected ? colors.brand.primary : colors.border.muted,
            opacity: isSelected || isEditing ? 1 : 0.8,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.entryMeta}>{formattedDate}</Text>
            {hasSong && (
              <View
                style={{
                  backgroundColor: colors.brand.primary + '20',
                  borderRadius: 10,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}
                testID={`music-indicator-${entry.id}`}
              >
                <Ionicons name="musical-note" size={12} color={colors.brand.primary} />
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.entryMeta}>{formattedTime}</Text>
            {!hasSong && (
              <TouchableOpacity
                onPress={() => onCreateSong(entry)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  backgroundColor: colors.brand.primary,
                  borderRadius: 12,
                  padding: 4,
                }}
                testID={`create-song-${entry.id}`}
              >
                <Ionicons name="musical-notes" size={14} color={colors.background.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {isEditing ? (
          <TextInput
            style={[styles.entryContent, { minHeight: 60, textAlignVertical: 'top' }]}
            value={editedContent}
            onChangeText={text => {
              onContentChange(text);
              if (saveFailedForEntry === entry.id) {
                onClearSaveError(entry.id);
              }
            }}
            onBlur={onBlurSave}
            multiline
            autoFocus
            editable={!savingEntry}
            testID={`entry-input-${entry.id}`}
          />
        ) : isSelected ? (
          <View testID={`entry-content-${entry.id}`}>
            <RichText content={entry.content} fontSize={14} lineHeight={20} />
          </View>
        ) : (
          <Text style={styles.entryContent} numberOfLines={2} testID={`entry-content-${entry.id}`}>
            {entry.content}
          </Text>
        )}
        {isSelected && entry.sources && entry.sources.length > 0 && <BookReferences sources={entry.sources} />}
      </View>
    </Pressable>
  );

  if (canDelete) {
    return (
      <Swipeable renderRightActions={renderSwipeRightActions} overshootRight={false}>
        {cardContent}
      </Swipeable>
    );
  }

  return cardContent;
};
