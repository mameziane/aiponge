import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';
import { BaseModal } from '../shared';

interface CreatePlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (params: { name: string; description?: string }) => Promise<void>;
}

export function CreatePlaylistModal({ visible, onClose, onCreate }: CreatePlaylistModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const trimmedName = playlistName.trim();
    if (!trimmedName) return;

    setIsCreating(true);
    try {
      await onCreate({ name: trimmedName, description: playlistDescription.trim() || undefined });
      setPlaylistName('');
      setPlaylistDescription('');
      onClose();
    } catch {
      // error surfaced via mutation state
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={t('library.createPlaylist')}
      animationType="fade"
      scrollable={false}
      avoidKeyboard
    >
      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('common.playlistName', { defaultValue: 'Playlist Name' })}</Text>
        <TextInput
          style={styles.formInput}
          value={playlistName}
          onChangeText={setPlaylistName}
          placeholder={t('common.playlistName', { defaultValue: 'Playlist Name' })}
          placeholderTextColor={colors.text.tertiary}
          autoFocus
          maxLength={100}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('common.description', { defaultValue: 'Description' })}</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={playlistDescription}
          onChangeText={setPlaylistDescription}
          placeholder={t('common.optional', { defaultValue: 'Optional' })}
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={3}
          maxLength={500}
        />
      </View>

      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={isCreating}>
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.createButton, !playlistName.trim() && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={!playlistName.trim() || isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color={colors.absolute.white} />
          ) : (
            <Text style={styles.createButtonText}>{t('common.create')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </BaseModal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    formGroup: {
      marginBottom: 16,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 8,
    },
    formInput: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    formTextArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    cancelButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    createButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      backgroundColor: colors.brand.primary,
    },
    createButtonDisabled: {
      opacity: 0.5,
    },
    createButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.absolute.white,
    },
  });
