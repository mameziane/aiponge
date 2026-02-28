import { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { fontFamilies, fontSizes, lineHeights } from '../../theme/typography';

interface DeleteAccountConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function DeleteAccountConfirmationModal({
  visible,
  onClose,
  onConfirm,
  isDeleting,
}: DeleteAccountConfirmationModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [confirmText, setConfirmText] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

  const confirmationWord = t('components.deleteAccountModal.confirmationWord');
  const isConfirmEnabled = confirmText.toUpperCase() === confirmationWord.toUpperCase();

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  const handleConfirm = async () => {
    if (!isConfirmEnabled || isDeleting) return;
    await onConfirm();
  };

  const deletedItems = [
    { icon: 'chatbubble-outline' as const, text: t('components.deleteAccountModal.itemEntries') },
    { icon: 'musical-notes-outline' as const, text: t('components.deleteAccountModal.itemSongs') },
    { icon: 'document-text-outline' as const, text: t('components.deleteAccountModal.itemLyrics') },
    { icon: 'list-outline' as const, text: t('components.deleteAccountModal.itemPlaylists') },
    { icon: 'heart-outline' as const, text: t('components.deleteAccountModal.itemFavorites') },
    { icon: 'person-outline' as const, text: t('components.deleteAccountModal.itemProfile') },
    { icon: 'card-outline' as const, text: t('components.deleteAccountModal.itemSubscription') },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.iconContainer}>
              <View style={styles.warningIconBg}>
                <Ionicons name="warning" size={40} color={colors.semantic.error} />
              </View>
            </View>

            <Text style={styles.title}>{t('components.deleteAccountModal.title')}</Text>

            <View style={styles.warningBox}>
              <Ionicons name="alert-circle" size={20} color={colors.semantic.error} />
              <Text style={styles.warningText}>{t('components.deleteAccountModal.permanentWarning')}</Text>
            </View>

            <Text style={styles.description}>{t('components.deleteAccountModal.description')}</Text>

            <View style={styles.deletedItemsContainer}>
              <Text style={styles.deletedItemsTitle}>{t('components.deleteAccountModal.willBeDeleted')}</Text>
              {deletedItems.map((item, index) => (
                <View key={index} style={styles.deletedItem}>
                  <Ionicons name={item.icon} size={18} color={colors.semantic.error} />
                  <Text style={styles.deletedItemText}>{item.text}</Text>
                </View>
              ))}
            </View>

            <View style={styles.confirmationSection}>
              <Text style={styles.confirmationLabel}>
                {t('components.deleteAccountModal.typeToConfirm', { word: confirmationWord })}
              </Text>
              <TextInput
                style={styles.confirmationInput}
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={confirmationWord}
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isDeleting}
                testID="input-delete-confirmation"
              />
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
                disabled={isDeleting}
                testID="button-cancel-delete"
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteButton, (!isConfirmEnabled || isDeleting) && styles.deleteButtonDisabled]}
                onPress={handleConfirm}
                disabled={!isConfirmEnabled || isDeleting}
                testID="button-confirm-delete"
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.absolute.white} />
                ) : (
                  <>
                    <Ionicons name="trash" size={18} color={colors.absolute.white} />
                    <Text style={styles.deleteButtonText}>{t('components.deleteAccountModal.deleteForever')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContainer: {
      backgroundColor: colors.background.surface,
      borderRadius: 20,
      maxWidth: 400,
      width: '100%',
      maxHeight: '90%',
    },
    scrollContent: {
      padding: 24,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    warningIconBg: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.semantic.errorLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontFamily: fontFamilies.body.bold,
      fontSize: fontSizes.title2,
      lineHeight: lineHeights.title2,
      color: colors.text.dark,
      textAlign: 'center',
      marginBottom: 16,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.semantic.errorLight,
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
      gap: 10,
    },
    warningText: {
      flex: 1,
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.subhead,
      lineHeight: lineHeights.subhead,
      color: colors.semantic.error,
    },
    description: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.body,
      lineHeight: lineHeights.body,
      color: colors.text.muted,
      textAlign: 'center',
      marginBottom: 20,
    },
    deletedItemsContainer: {
      backgroundColor: colors.background.surfaceLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
    },
    deletedItemsTitle: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      lineHeight: lineHeights.callout,
      color: colors.text.dark,
      marginBottom: 12,
    },
    deletedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    deletedItemText: {
      fontFamily: fontFamilies.body.regular,
      fontSize: fontSizes.subhead,
      lineHeight: lineHeights.subhead,
      color: colors.text.muted,
    },
    confirmationSection: {
      marginBottom: 24,
    },
    confirmationLabel: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.subhead,
      lineHeight: lineHeights.subhead,
      color: colors.text.dark,
      marginBottom: 8,
      textAlign: 'center',
    },
    confirmationInput: {
      fontFamily: fontFamilies.body.medium,
      fontSize: fontSizes.body,
      color: colors.text.dark,
      backgroundColor: colors.absolute.white,
      borderWidth: 2,
      borderColor: colors.border.light,
      borderRadius: 12,
      padding: 14,
      textAlign: 'center',
      letterSpacing: 2,
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.light,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.text.dark,
    },
    deleteButton: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.semantic.error,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    deleteButtonDisabled: {
      backgroundColor: colors.text.tertiary,
    },
    deleteButtonText: {
      fontFamily: fontFamilies.body.semibold,
      fontSize: fontSizes.callout,
      color: colors.absolute.white,
    },
  });
