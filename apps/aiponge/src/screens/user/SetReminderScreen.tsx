import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Switch, Alert, TouchableOpacity, ScrollView, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { useTranslation, i18n } from '../../i18n';
import {
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
  buildReminderParams,
} from '../../hooks/book/useReminders';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';

type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface ReminderConfig {
  date: Date;
  time: Date;
  repeatType: RepeatType;
  notifyEnabled: boolean;
  autoPlayEnabled: boolean;
}

export function SetReminderScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    trackId: string;
    trackTitle: string;
    trackArtist?: string;
    reminderId?: string;
    reminderDate?: string;
    reminderRepeatType?: RepeatType;
    reminderNotifyEnabled?: string;
    reminderAutoPlayEnabled?: string;
  }>();

  const queryClient = useQueryClient();
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);

  const existingReminderId = params.reminderId;
  const hasExistingReminder = !!existingReminderId;

  const [reminder, setReminder] = useState<ReminderConfig>(() => {
    if (params.reminderDate) {
      const existingDate = new Date(params.reminderDate);
      return {
        date: existingDate,
        time: existingDate,
        repeatType: params.reminderRepeatType || 'once',
        notifyEnabled: params.reminderNotifyEnabled !== 'false',
        autoPlayEnabled: params.reminderAutoPlayEnabled === 'true',
      };
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    return {
      date: tomorrow,
      time: tomorrow,
      repeatType: 'once',
      notifyEnabled: true,
      autoPlayEnabled: false,
    };
  });

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setReminder({ ...reminder, date: selectedDate });
    }
  };

  const handleTimeChange = (_event: unknown, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setReminder({ ...reminder, time: selectedTime });
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(i18n.language, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  const formatTime = (date: Date): string => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getDayName = (date: Date): string => {
    return date.toLocaleDateString(i18n.language, { weekday: 'long' });
  };

  const getRepeatLabel = (): string => {
    switch (reminder.repeatType) {
      case 'once':
        return t('reminder.repeatOnce');
      case 'daily':
        return t('reminder.repeatDaily');
      case 'weekly':
        return t('reminder.repeatWeekly', { day: getDayName(reminder.date) });
      case 'monthly':
        return t('reminder.repeatMonthly', { day: reminder.date.getDate() });
      case 'yearly':
        return t('reminder.repeatYearly');
      default:
        return '';
    }
  };

  const repeatOptions: { value: RepeatType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: 'once', label: t('reminder.once'), icon: 'calendar-outline' },
    { value: 'daily', label: t('reminder.daily'), icon: 'today-outline' },
    { value: 'weekly', label: t('reminder.weekly'), icon: 'calendar-number-outline' },
    { value: 'monthly', label: t('reminder.monthly'), icon: 'calendar' },
    { value: 'yearly', label: t('reminder.yearly'), icon: 'repeat' },
  ];

  const handleSave = async () => {
    const reminderParams = buildReminderParams(params.trackId, reminder.date, reminder.time, reminder.repeatType, {
      notifyEnabled: reminder.notifyEnabled,
      autoPlayEnabled: reminder.autoPlayEnabled,
    });

    const invalidateAllActivityQueries = () => {
      invalidateOnEvent(queryClient, { type: 'ACTIVITY_CALENDAR_UPDATED' });
    };

    if (existingReminderId) {
      updateReminder.mutate(
        {
          reminderId: existingReminderId,
          baseDate: reminderParams.baseDate,
          repeatType: reminderParams.repeatType,
          dayOfWeek: reminderParams.dayOfWeek,
          dayOfMonth: reminderParams.dayOfMonth,
          timezone: reminderParams.timezone,
          notifyEnabled: reminderParams.notifyEnabled,
          autoPlayEnabled: reminderParams.autoPlayEnabled,
        },
        {
          onSuccess: () => {
            invalidateAllActivityQueries();
            logger.debug('[SetReminderScreen] Reminder updated', { reminderId: existingReminderId });
            router.back();
          },
          onError: error => {
            logger.error('[SetReminderScreen] Failed to update reminder', error);
            Alert.alert(t('common.error'), t('reminder.saveFailed'));
          },
        }
      );
    } else {
      createReminder.mutate(reminderParams, {
        onSuccess: () => {
          invalidateAllActivityQueries();
          logger.debug('[SetReminderScreen] Reminder created', { trackId: params.trackId });
          router.back();
        },
        onError: error => {
          logger.error('[SetReminderScreen] Failed to create reminder', error);
          Alert.alert(t('common.error'), t('reminder.saveFailed'));
        },
      });
    }
  };

  const handleDeletePress = () => {
    if (!existingReminderId) return;

    Alert.alert(t('reminder.deleteTitle'), t('reminder.deleteConfirmation'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteReminder.mutate(existingReminderId, {
            onSuccess: () => {
              invalidateOnEvent(queryClient, { type: 'ACTIVITY_CALENDAR_UPDATED' });
              router.back();
            },
            onError: (error: unknown) => {
              if ((error as { statusCode?: number })?.statusCode !== 404) {
                Alert.alert(t('common.error'), t('reminder.deleteFailed'));
              } else {
                router.back();
              }
            },
          });
        },
      },
    ]);
  };

  const isSaving = createReminder.isPending || updateReminder.isPending || deleteReminder.isPending;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.trackCard}>
          <Ionicons name="musical-notes" size={24} color={colors.brand.primary} />
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {params.trackTitle}
            </Text>
            {params.trackArtist && (
              <Text style={styles.trackArtist} numberOfLines={1}>
                {params.trackArtist}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('reminder.date')} & {t('reminder.time')}
          </Text>
          <View style={styles.dateTimeRow}>
            <Pressable style={styles.dateTimeCard} onPress={() => setShowDatePicker(true)} testID="button-select-date">
              <Ionicons name="calendar-outline" size={24} color={colors.brand.primary} />
              <Text style={styles.dateTimeLabel}>{t('reminder.date')}</Text>
              <Text style={styles.dateTimeValue}>{formatDate(reminder.date)}</Text>
            </Pressable>

            <Pressable style={styles.dateTimeCard} onPress={() => setShowTimePicker(true)} testID="button-select-time">
              <Ionicons name="time-outline" size={24} color={colors.brand.primary} />
              <Text style={styles.dateTimeLabel}>{t('reminder.time')}</Text>
              <Text style={styles.dateTimeValue}>{formatTime(reminder.time)}</Text>
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={reminder.date}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              onChange={handleDateChange}
              textColor={colors.text.primary}
              themeVariant="dark"
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={reminder.time}
              mode="time"
              is24Hour={false}
              display="spinner"
              onChange={handleTimeChange}
              textColor={colors.text.primary}
              themeVariant="dark"
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('reminder.repeat')}</Text>
          <Pressable
            style={styles.repeatDropdown}
            onPress={() => setShowRepeatPicker(true)}
            testID="button-select-repeat"
          >
            <Ionicons name="repeat-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.repeatDropdownText}>
              {repeatOptions.find(o => o.value === reminder.repeatType)?.label}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.text.tertiary} />
          </Pressable>
          <Text style={styles.repeatSummary}>{getRepeatLabel()}</Text>
        </View>

        <Modal
          visible={showRepeatPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRepeatPicker(false)}
        >
          <Pressable style={styles.pickerOverlay} onPress={() => setShowRepeatPicker(false)}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{t('reminder.repeat')}</Text>
                <TouchableOpacity onPress={() => setShowRepeatPicker(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
              {repeatOptions.map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.pickerOption, reminder.repeatType === option.value && styles.pickerOptionActive]}
                  onPress={() => {
                    setReminder({ ...reminder, repeatType: option.value });
                    setShowRepeatPicker(false);
                  }}
                  testID={`button-repeat-${option.value}`}
                >
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={reminder.repeatType === option.value ? colors.brand.primary : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.pickerOptionText,
                      reminder.repeatType === option.value && styles.pickerOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {reminder.repeatType === option.value && (
                    <Ionicons name="checkmark" size={20} color={colors.brand.primary} style={styles.pickerCheck} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('common.options')}</Text>

          <View style={styles.toggleCard}>
            <View style={styles.toggleInfo}>
              <Ionicons name="notifications" size={22} color={colors.brand.primary} />
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>{t('reminder.sendNotification')}</Text>
                <Text style={styles.toggleHint}>{t('reminder.notificationHint')}</Text>
              </View>
            </View>
            <Switch
              value={reminder.notifyEnabled}
              onValueChange={value => setReminder({ ...reminder, notifyEnabled: value })}
              trackColor={{
                false: colors.background.tertiary,
                true: colors.brand.primary + '60',
              }}
              thumbColor={reminder.notifyEnabled ? colors.brand.primary : colors.text.tertiary}
              testID="switch-notify-enabled"
            />
          </View>

          <View style={styles.toggleCard}>
            <View style={styles.toggleInfo}>
              <Ionicons name="play-circle" size={22} color={colors.brand.primary} />
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>{t('reminder.autoPlay')}</Text>
                <Text style={styles.toggleHint}>{t('reminder.autoPlayHint')}</Text>
              </View>
            </View>
            <Switch
              value={reminder.autoPlayEnabled}
              onValueChange={value => setReminder({ ...reminder, autoPlayEnabled: value })}
              trackColor={{
                false: colors.background.tertiary,
                true: colors.brand.primary + '60',
              }}
              thumbColor={reminder.autoPlayEnabled ? colors.brand.primary : colors.text.tertiary}
              testID="switch-autoplay-enabled"
            />
          </View>
        </View>

        {hasExistingReminder && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeletePress}
            disabled={deleteReminder.isPending}
            testID="button-delete-reminder"
          >
            <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
            <Text style={styles.deleteButtonText}>
              {deleteReminder.isPending ? t('common.deleting') : t('reminder.deleteReminder')}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cancelButton} onPress={() => router.back()} testID="button-cancel-reminder">
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          testID="button-save-reminder"
        >
          <Ionicons name="checkmark" size={22} color={colors.text.primary} />
          <Text style={styles.saveButtonText}>{isSaving ? t('common.saving') : t('reminder.save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    content: commonStyles.flexOne,
    contentContainer: {
      padding: 20,
    },
    trackCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 24,
    },
    trackInfo: {
      flex: 1,
    },
    trackTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    trackArtist: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 2,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    dateTimeRow: {
      flexDirection: 'row',
      gap: 12,
    },
    dateTimeCard: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      gap: 8,
    },
    dateTimeLabel: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    dateTimeValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    repeatDropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    repeatDropdownText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
      marginLeft: 12,
    },
    repeatSummary: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginTop: 8,
      textAlign: 'center',
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[70],
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    pickerContainer: {
      width: '90%',
      maxWidth: 340,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    pickerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text.primary,
    },
    pickerOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    pickerOptionActive: {
      backgroundColor: colors.brand.primary + '15',
    },
    pickerOptionText: {
      flex: 1,
      fontSize: 16,
      color: colors.text.primary,
    },
    pickerOptionTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    pickerCheck: {
      marginLeft: 'auto',
    },
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 12,
    },
    toggleInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    toggleText: {
      flex: 1,
    },
    toggleTitle: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text.primary,
    },
    toggleHint: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
      marginTop: 8,
    },
    deleteButtonText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.semantic.error,
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      padding: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
