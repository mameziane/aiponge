import { memo, ReactNode, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';
import { useTranslation } from '@/i18n';
import { createStyles } from './styles';
import type { Entry } from '@/types/profile.types';

interface EntryActionsProps {
  isNewEntryMode: boolean;
  currentEntry: Entry | null;
  editedContent: string;
  isSaving: boolean;
  isDeleting: boolean;
  hasUnsavedChanges: boolean;
  onDelete: () => void;
  onCreateEntry: () => Promise<void>;
  onSaveChanges: () => Promise<void>;
  onNewEntryMode: () => void;
  middleActionContent?: ReactNode;
  canDelete?: boolean;
}

export const EntryActions = memo(function EntryActions({
  isNewEntryMode,
  currentEntry,
  editedContent,
  isSaving,
  isDeleting,
  hasUnsavedChanges,
  onDelete,
  onCreateEntry,
  onSaveChanges,
  onNewEntryMode,
  middleActionContent,
  canDelete = true,
}: EntryActionsProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.actionsBar}>
      <View style={styles.actionsLeft}>
        {!isNewEntryMode && canDelete && (
          <TouchableOpacity
            style={[styles.navButton, (!currentEntry || isDeleting) && styles.navButtonDisabled]}
            onPress={onDelete}
            disabled={!currentEntry || isDeleting}
            testID="button-delete-entry"
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <Ionicons name="trash" size={20} color={colors.text.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionsCenter}>{middleActionContent}</View>

      <View style={styles.actionsRight}>
        {isNewEntryMode ? (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.actionButtonSuccess,
              (!editedContent.trim() || isSaving) && styles.actionButtonDisabled,
            ]}
            onPress={onCreateEntry}
            disabled={!editedContent.trim() || isSaving}
            testID="button-save-entry"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <Ionicons name="send" size={24} color={colors.text.primary} />
            )}
          </TouchableOpacity>
        ) : (
          <>
            {hasUnsavedChanges && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSuccess, isSaving && styles.actionButtonDisabled]}
                onPress={onSaveChanges}
                disabled={isSaving}
                testID="button-save-changes"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Ionicons name="checkmark" size={24} color={colors.text.primary} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.navButton} onPress={onNewEntryMode} testID="button-new-entry">
              <Ionicons name="add" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
});
