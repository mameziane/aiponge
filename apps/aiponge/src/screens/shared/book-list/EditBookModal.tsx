import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { CATEGORIES, ERAS, TRADITIONS, VISIBILITY_OPTIONS, LIFECYCLE_OPTIONS, type BookFormData } from './types';
import { useMemo } from 'react';

interface EditBookModalProps {
  visible: boolean;
  onClose: () => void;
  formData: BookFormData;
  onChangeFormData: (data: BookFormData) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function EditBookModal({
  visible,
  onClose,
  formData,
  onChangeFormData,
  onSubmit,
  isPending,
}: EditBookModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const renderPicker = (label: string, value: string, options: readonly string[], onChange: (v: string) => void) => (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.formPill, value === opt && styles.formPillActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.formPillText, value === opt && styles.formPillTextActive]}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('librarian.books.editBook') || 'Edit Book'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('librarian.books.bookTitle') || 'Title'} *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.title}
                onChangeText={text => onChangeFormData({ ...formData, title: text })}
                placeholder="e.g., Meditations on Inner Peace"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('librarian.books.subtitle') || 'Subtitle'}</Text>
              <TextInput
                style={styles.textInput}
                value={formData.subtitle}
                onChangeText={text => onChangeFormData({ ...formData, subtitle: text })}
                placeholder={t('librarian.books.subtitlePlaceholder')}
                placeholderTextColor={colors.text.tertiary}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('librarian.books.author') || 'Original Author'}</Text>
              <TextInput
                style={styles.textInput}
                value={formData.author}
                onChangeText={text => onChangeFormData({ ...formData, author: text })}
                placeholder={t('librarian.books.authorPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>{t('librarian.books.description') || 'Description'}</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={formData.description}
                onChangeText={text => onChangeFormData({ ...formData, description: text })}
                placeholder={t('librarian.books.descriptionPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={4}
              />
            </View>

            {renderPicker(t('librarian.books.category') || 'Category', formData.category, CATEGORIES, v =>
              onChangeFormData({ ...formData, category: v })
            )}
            {renderPicker(t('librarian.books.era') || 'Era', formData.era, ERAS, v =>
              onChangeFormData({ ...formData, era: v })
            )}
            {renderPicker(t('librarian.books.tradition') || 'Tradition', formData.tradition, TRADITIONS, v =>
              onChangeFormData({ ...formData, tradition: v })
            )}
            {renderPicker(t('librarian.books.visibility') || 'Visibility', formData.visibility, VISIBILITY_OPTIONS, v =>
              onChangeFormData({ ...formData, visibility: v })
            )}
            {renderPicker(t('librarian.books.status') || 'Status', formData.status, LIFECYCLE_OPTIONS, v =>
              onChangeFormData({ ...formData, status: v })
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, isPending && styles.submitBtnDisabled]}
              onPress={onSubmit}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator size="small" color={colors.absolute.white} />
              ) : (
                <Text style={styles.submitBtnText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    formField: {
      marginBottom: 16,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    textInput: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      fontSize: 15,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    pickerScroll: {
      maxHeight: 40,
    },
    formPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.background.secondary,
      marginRight: 8,
    },
    formPillActive: {
      backgroundColor: colors.brand.primary,
    },
    formPillText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    formPillTextActive: {
      color: colors.absolute.white,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[60],
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    modalBody: {
      padding: 16,
    },
    modalFooter: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    cancelBtn: {
      flex: 1,
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.secondary,
      alignItems: 'center',
    },
    cancelBtnText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    submitBtn: {
      flex: 1,
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
    },
    submitBtnDisabled: {
      opacity: 0.6,
    },
    submitBtnText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
  });
