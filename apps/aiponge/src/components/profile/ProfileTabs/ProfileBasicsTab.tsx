import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  Image,
  Modal,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from '@/i18n';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import type { ProfileData } from '@/types/profile.types';
import { useThemeColors, type ColorScheme } from '@/theme';
import { LiquidGlassView } from '../../ui';
import { useMediaPicker } from '@/hooks/ui/useMediaPicker';
import { normalizeMediaUrl } from '@/lib/apiConfig';

interface ProfileBasicsTabProps {
  profileData: ProfileData;
  profileForm: { name: string };
  setProfileForm: (updater: (prev: { name: string }) => { name: string }) => void;
  onNameSave?: (name: string) => Promise<void>;
  avatarUrl?: string | null;
  birthdate?: string | null;
  email?: string;
  onAvatarChange?: (uri: string) => void;
  onBirthdateChange?: (date: Date) => void;
  isSavingAvatar?: boolean;
  isSavingBirthdate?: boolean;
  onSaveComplete?: () => void;
}

export const ProfileBasicsTab: React.FC<ProfileBasicsTabProps> = ({
  profileData,
  profileForm,
  setProfileForm,
  onNameSave,
  avatarUrl,
  birthdate,
  email,
  onAvatarChange,
  onBirthdateChange,
  isSavingAvatar = false,
  isSavingBirthdate = false,
  onSaveComplete,
}) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProfileEditorStyles(colors), [colors]);
  const avatarStyles = useMemo(() => createAvatarStyles(colors), [colors]);
  const birthdateStyles = useMemo(() => createBirthdateStyles(colors), [colors]);
  const datePickerStyles = useMemo(() => createDatePickerStyles(colors), [colors]);
  const saveButtonStyles = useMemo(() => createSaveButtonStyles(colors), [colors]);
  const nameFieldStyles = useMemo(() => createNameFieldStyles(colors), [colors]);

  const [editingName, setEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameValue, setNameValue] = useState(profileForm.name);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [pendingBirthdateValue, setPendingBirthdateValue] = useState<Date | null>(null);
  const { pickMedia } = useMediaPicker({ aspect: [1, 1], quality: 0.8 });

  // Parse birthdate string to Date object
  const birthdateValue = useMemo(() => {
    if (!birthdate) return null;
    return new Date(birthdate);
  }, [birthdate]);

  // Initialize pending birthdate when date picker opens (iOS)
  useEffect(() => {
    if (showDatePicker && Platform.OS === 'ios') {
      setPendingBirthdateValue(birthdateValue || new Date(2000, 0, 1));
    }
  }, [showDatePicker, birthdateValue]);

  // Sync nameValue when profileForm.name changes
  useEffect(() => {
    setNameValue(profileForm.name);
  }, [profileForm.name]);

  // Reset local avatar state when save completes
  useEffect(() => {
    if (!isSavingAvatar && newAvatarUri !== null) {
      // Save completed, clear local pending state
      setNewAvatarUri(null);
    }
  }, [isSavingAvatar]);

  const maxDate = new Date();
  const minDate = new Date(1900, 0, 1);

  const handleNameSave = async () => {
    if (onNameSave && nameValue.trim() !== profileForm.name) {
      setIsSavingName(true);
      try {
        await onNameSave(nameValue.trim());
      } finally {
        setIsSavingName(false);
      }
    }
    setEditingName(false);
  };

  const handleNameCancel = () => {
    setNameValue(profileForm.name);
    setEditingName(false);
  };

  const pickImage = async () => {
    const result = await pickMedia();
    if (result) {
      setNewAvatarUri(result.uri);
      onAvatarChange?.(result.uri);
    }
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleDateChange = (event: { type?: string }, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      // Android: close picker immediately and save if confirmed
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        onBirthdateChange?.(selectedDate);
      }
    } else {
      // iOS: just update pending value (save happens on Done)
      if (selectedDate) {
        setPendingBirthdateValue(selectedDate);
      }
    }
  };

  const handleDatePickerDone = () => {
    setShowDatePicker(false);
    if (pendingBirthdateValue) {
      onBirthdateChange?.(pendingBirthdateValue);
    }
  };

  const handleDatePickerCancel = () => {
    setShowDatePicker(false);
    setPendingBirthdateValue(null);
  };

  const displayAvatarUrl = newAvatarUri || normalizeMediaUrl(avatarUrl) || null;

  return (
    <View style={styles.tabContent}>
      {/* Avatar Section */}
      <View style={avatarStyles.avatarSection}>
        <TouchableOpacity
          style={avatarStyles.avatarContainer}
          onPress={pickImage}
          disabled={isSavingAvatar}
          testID="button-change-avatar"
          accessibilityLabel={t('profileSettings.changePhoto')}
        >
          {displayAvatarUrl ? (
            <Image source={{ uri: displayAvatarUrl }} style={avatarStyles.avatar} />
          ) : (
            <View style={avatarStyles.avatarPlaceholder}>
              <Ionicons name="person" size={48} color={colors.text.tertiary} />
            </View>
          )}
          {isSavingAvatar ? (
            <View style={avatarStyles.avatarLoadingOverlay}>
              <ActivityIndicator size="small" color={colors.brand.primary} />
            </View>
          ) : (
            <View style={avatarStyles.avatarEditBadge}>
              <Ionicons name="camera" size={16} color={colors.background.surface} />
            </View>
          )}
        </TouchableOpacity>
        <Text style={avatarStyles.changePhotoText}>
          {isSavingAvatar ? t('common.saving') : t('profileSettings.changePhoto')}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{t('profile.basicInformation')}</Text>
        </View>
        <View style={styles.cardContent}>
          {/* Display Name Field */}
          <View style={styles.formField}>
            <Text style={nameFieldStyles.label}>{t('profile.displayName')}</Text>
            {editingName ? (
              <TextInput
                style={styles.input}
                value={nameValue}
                onChangeText={setNameValue}
                placeholder={t('profile.enterDisplayName')}
                placeholderTextColor={colors.text.tertiary}
                autoFocus
                testID="input-display-name"
              />
            ) : (
              <Pressable
                style={({ pressed }) => [nameFieldStyles.displayField, pressed && nameFieldStyles.displayFieldPressed]}
                onPress={() => setEditingName(true)}
                testID="button-edit-display-name"
              >
                <Text style={nameFieldStyles.displayText}>{profileForm.name || t('profile.tapToSetDisplayName')}</Text>
              </Pressable>
            )}
          </View>

          {/* Birthdate Field */}
          <View style={[styles.formField, { marginTop: 12 }]}>
            <Text style={nameFieldStyles.label}>{t('profileSettings.birthdate')}</Text>
            <TouchableOpacity
              style={birthdateStyles.dateInput}
              onPress={() => setShowDatePicker(true)}
              disabled={isSavingBirthdate}
              testID="button-birthdate"
              accessibilityLabel={t('profileSettings.selectBirthdate')}
            >
              <Text style={[birthdateStyles.dateInputText, !birthdateValue && birthdateStyles.placeholderText]}>
                {birthdateValue ? formatDate(birthdateValue) : t('profileSettings.selectBirthdate')}
              </Text>
              {isSavingBirthdate ? (
                <ActivityIndicator size="small" color={colors.brand.primary} />
              ) : (
                <Ionicons name="calendar-outline" size={20} color={colors.text.tertiary} />
              )}
            </TouchableOpacity>
            <Text style={birthdateStyles.helpText}>{t('profileSettings.birthdateHelp')}</Text>
          </View>

          {/* Email Field (Read-only) */}
          {email && (
            <View style={[styles.formField, { marginTop: 12 }]}>
              <Text style={nameFieldStyles.label}>{t('profileSettings.email')}</Text>
              <View style={birthdateStyles.readOnlyInput}>
                <Text style={birthdateStyles.readOnlyText}>{email}</Text>
                <Ionicons name="lock-closed" size={16} color={colors.text.tertiary} />
              </View>
              <Text style={birthdateStyles.helpText}>{t('profileSettings.emailHelp')}</Text>
            </View>
          )}

          {/* Action Buttons at Bottom */}
          {editingName && (
            <View style={nameFieldStyles.bottomButtonRow}>
              <Pressable
                style={({ pressed }) => [
                  nameFieldStyles.button,
                  nameFieldStyles.buttonSecondary,
                  pressed && nameFieldStyles.buttonPressed,
                ]}
                onPress={handleNameCancel}
                testID="button-cancel-name"
              >
                <Text style={nameFieldStyles.buttonSecondaryText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  nameFieldStyles.button,
                  nameFieldStyles.buttonPrimary,
                  pressed && nameFieldStyles.buttonPressed,
                  isSavingName && nameFieldStyles.buttonDisabled,
                ]}
                onPress={handleNameSave}
                disabled={isSavingName}
                testID="button-save-name"
              >
                {isSavingName ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Text style={nameFieldStyles.buttonPrimaryText}>{t('common.save')}</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Date Picker Modal */}
      {Platform.OS === 'ios' ? (
        <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={handleDatePickerCancel}>
          <Pressable style={datePickerStyles.datePickerOverlay} onPress={handleDatePickerCancel}>
            <LiquidGlassView
              intensity="strong"
              borderRadius={16}
              showBorder={false}
              style={datePickerStyles.datePickerContainer}
            >
              <View style={datePickerStyles.datePickerHeader}>
                <TouchableOpacity onPress={handleDatePickerCancel}>
                  <Text style={datePickerStyles.datePickerCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDatePickerDone}>
                  <Text style={datePickerStyles.datePickerDone}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pendingBirthdateValue || birthdateValue || new Date(2000, 0, 1)}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                maximumDate={maxDate}
                minimumDate={minDate}
                textColor={colors.text.dark}
                style={datePickerStyles.datePicker}
              />
            </LiquidGlassView>
          </Pressable>
        </Modal>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={birthdateValue || new Date(2000, 0, 1)}
            mode="date"
            display="default"
            onChange={handleDateChange}
            maximumDate={maxDate}
            minimumDate={minDate}
          />
        )
      )}
    </View>
  );
};

const createAvatarStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    avatarSection: {
      alignItems: 'center',
      marginBottom: 24,
    },
    avatarContainer: {
      position: 'relative',
      width: 120,
      height: 120,
      borderRadius: 60,
      marginBottom: 12,
    },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
    },
    avatarPlaceholder: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.background.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarEditBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: colors.background.primary,
    },
    avatarLoadingOverlay: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background.surface,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.brand.primary,
    },
    changePhotoText: {
      fontSize: 14,
      color: colors.brand.primary,
      fontWeight: '500',
    },
  });

const createBirthdateStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    dateInput: {
      backgroundColor: colors.background.darkCard,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    dateInputText: {
      fontSize: 16,
      color: colors.text.primary,
    },
    placeholderText: {
      color: colors.text.tertiary,
    },
    readOnlyInput: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    readOnlyText: {
      fontSize: 16,
      color: colors.text.secondary,
    },
    helpText: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 4,
    },
  });

const createDatePickerStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    datePickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    datePickerContainer: {
      backgroundColor: colors.background.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    datePickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    datePickerCancel: {
      fontSize: 16,
      color: colors.text.muted,
    },
    datePickerDone: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    datePicker: {
      height: 200,
    },
  });

const createSaveButtonStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    saveButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 24,
    },
    saveButtonDisabled: {
      backgroundColor: colors.brand.primary,
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.interactive.primaryForeground,
    },
  });

const createNameFieldStyles = (colors: ColorScheme) => ({
  label: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.text.secondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  displayField: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.background.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  displayFieldPressed: {
    opacity: 0.7,
    backgroundColor: colors.background.secondary,
  },
  displayText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
    marginTop: 12,
  },
  bottomButtonRow: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonPrimary: {
    backgroundColor: colors.brand.primary,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPrimaryText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text.primary,
  },
  buttonSecondaryText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: colors.text.secondary,
  },
});
