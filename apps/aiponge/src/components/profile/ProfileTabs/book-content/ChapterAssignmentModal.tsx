import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { useThemeColors } from '@/theme';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import type { Entry, EntryChapter } from '@/types/profile.types';
import { LiquidGlassView } from '../../../ui/LiquidGlassView';

interface ChapterAssignmentModalProps {
  visible: boolean;
  entryToAssign: Entry | null;
  sortedChapters: EntryChapter[];
  assigning: boolean;
  onAssign: (chapterId: string | null) => void;
  onClose: () => void;
}

export const ChapterAssignmentModal: React.FC<ChapterAssignmentModalProps> = ({
  visible,
  entryToAssign,
  sortedChapters,
  assigning,
  onAssign,
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
        if (!assigning) onClose();
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
              <Text style={[styles.cardTitle, { fontSize: 20 }]}>{t('components.profileTabs.assignToChapter')}</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!assigning) onClose();
                }}
                testID="button-close-assignment"
              >
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            {entryToAssign && (
              <Text style={[styles.settingDescription, { marginTop: 8 }]} numberOfLines={2}>
                "{entryToAssign.content}"
              </Text>
            )}
          </View>

          <ScrollView style={{ paddingHorizontal: 24 }}>
            <LiquidGlassView
              intensity="medium"
              style={{ marginBottom: 12, padding: 16, borderRadius: 12, opacity: assigning ? 0.5 : 1 }}
            >
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                onPress={() => onAssign(null)}
                disabled={assigning}
                testID="button-assign-none"
              >
                <Ionicons name="remove-circle-outline" size={24} color={colors.text.tertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.radioLabel}>{t('components.profileTabs.noChapter')}</Text>
                  <Text style={styles.settingDescription}>{t('components.profileTabs.removeFromChapter')}</Text>
                </View>
                {assigning && entryToAssign && !entryToAssign.chapterId && (
                  <ActivityIndicator size="small" color={colors.brand.primary} />
                )}
              </TouchableOpacity>
            </LiquidGlassView>

            {sortedChapters.map(chapter => {
              const isCurrentChapter = entryToAssign?.chapterId === chapter.id;
              return (
                <LiquidGlassView
                  key={chapter.id}
                  intensity={isCurrentChapter ? 'strong' : 'medium'}
                  style={{
                    marginBottom: 12,
                    padding: 16,
                    borderRadius: 12,
                    opacity: assigning ? 0.5 : 1,
                    borderWidth: isCurrentChapter ? 1 : 0,
                    borderColor: colors.brand.primary,
                  }}
                >
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    onPress={() => onAssign(chapter.id)}
                    disabled={assigning}
                    testID={`button-assign-${chapter.id}`}
                  >
                    <Ionicons
                      name={isCurrentChapter ? 'checkmark-circle' : 'book-outline'}
                      size={24}
                      color={isCurrentChapter ? colors.brand.primary : colors.text.secondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radioLabel}>{chapter.title}</Text>
                    </View>
                    {isCurrentChapter && (
                      <Text style={{ color: colors.brand.primary, fontSize: 12 }}>
                        {t('components.profileTabs.current')}
                      </Text>
                    )}
                    {assigning && entryToAssign?.chapterId !== chapter.id && (
                      <ActivityIndicator size="small" color={colors.brand.primary} />
                    )}
                  </TouchableOpacity>
                </LiquidGlassView>
              );
            })}
          </ScrollView>
        </LiquidGlassView>
      </View>
    </Modal>
  );
};
