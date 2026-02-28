import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { useThemeColors } from '@/theme';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import type { EntryChapter, Book } from '@/types/profile.types';
import { LiquidGlassView } from '../../../ui/LiquidGlassView';

interface MoveChapterModalProps {
  visible: boolean;
  chapterToMove: EntryChapter | null;
  books: Book[];
  currentBookId: string | null | undefined;
  moving: boolean;
  onMove: (targetBookId: string) => void;
  onClose: () => void;
}

export const MoveChapterModal: React.FC<MoveChapterModalProps> = ({
  visible,
  chapterToMove,
  books,
  currentBookId,
  moving,
  onMove,
  onClose,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = React.useMemo(() => createProfileEditorStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!moving) onClose();
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          justifyContent: 'flex-end',
        }}
      >
        <LiquidGlassView
          intensity="strong"
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingBottom: 40,
            maxHeight: '70%',
          }}
        >
          <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.cardTitle, { fontSize: 20 }]}>{t('bookContent.moveChapterToBook')}</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!moving) onClose();
                }}
                testID="button-close-move-chapter"
              >
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            {chapterToMove && (
              <Text style={[styles.settingDescription, { marginTop: 8 }]}>
                {t('bookContent.moveChapterDescription', { chapter: chapterToMove.title })}
              </Text>
            )}
          </View>

          <ScrollView style={{ paddingHorizontal: 24 }}>
            {books
              .filter(b => b.id !== currentBookId)
              .map(book => (
                <LiquidGlassView
                  key={book.id}
                  intensity="medium"
                  style={{ marginBottom: 12, padding: 16, borderRadius: 12, opacity: moving ? 0.5 : 1 }}
                >
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    onPress={() => onMove(book.id)}
                    disabled={moving}
                    testID={`button-move-to-book-${book.id}`}
                  >
                    <Ionicons name="book-outline" size={24} color={colors.text.secondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radioLabel}>{book.title}</Text>
                    </View>
                    {moving && <ActivityIndicator size="small" color={colors.brand.primary} />}
                  </TouchableOpacity>
                </LiquidGlassView>
              ))}
          </ScrollView>
        </LiquidGlassView>
      </View>
    </Modal>
  );
};
