import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { createProviderStyles } from './styles';

interface ProviderEditModalShellProps {
  title: string;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  saveError?: Error | null;
  testIdPrefix?: string;
  children: React.ReactNode;
}

export function ProviderEditModalShell({
  title,
  onClose,
  onSave,
  isSaving,
  saveError,
  testIdPrefix = '',
  children,
}: ProviderEditModalShellProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} data-testid={`text-${testIdPrefix}modal-title`}>
              Configure {title}
            </Text>
            <TouchableOpacity onPress={onClose} data-testid={`button-close-${testIdPrefix}modal`}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              data-testid={`button-${testIdPrefix}cancel`}
            >
              <Text style={styles.cancelButtonText}>{t('admin.providers.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={onSave}
              disabled={isSaving}
              data-testid={`button-${testIdPrefix}save`}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <Text style={styles.saveButtonText}>{t('admin.providers.saveChanges')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {saveError && <Text style={styles.errorMessage}>Failed to save: {saveError.message || 'Unknown error'}</Text>}
        </View>
      </View>
    </Modal>
  );
}
