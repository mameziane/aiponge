import { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Switch, ScrollView, Alert, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors, type ColorScheme } from '../../theme';
import { colors as themeColors } from '../../theme/colors';
import { BORDER_RADIUS } from '../../theme/constants';
import { useTranslation } from '../../i18n';
import { LiquidGlassView } from '../ui';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';
import type { Reminder, ReminderType } from '../../screens/user/RemindersScreen';
import type { IconName } from '../../types/ui.types';

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface TrackInfo {
  id: string;
  title: string;
  displayName?: string;
  isUserTrack?: boolean;
}

interface ReminderModalProps {
  visible: boolean;
  onClose: () => void;
  reminder?: Reminder;
  onSave?: () => void | Promise<void>;
  defaultType?: ReminderType;
  track?: TrackInfo;
}

interface ReminderConfig {
  reminderType: ReminderType;
  title: string;
  prompt: string;
  enabled: boolean;
  time: Date;
  days: boolean[];
  notifyEnabled: boolean;
  autoPlayEnabled: boolean;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface TypePreset {
  type: ReminderType;
  icon: IconName;
  label: string;
  color: string;
  defaultTitle: string;
  defaultPrompt: string;
  defaultTime: number[];
}

const REMINDER_TYPE_PRESETS: TypePreset[] = [
  {
    type: 'book',
    icon: 'book-outline',
    label: 'Book',
    color: themeColors.semantic.warning,
    defaultTitle: 'Daily Reflection',
    defaultPrompt: 'Take a moment to reflect on your day',
    defaultTime: [21, 0],
  },
  {
    type: 'reading',
    icon: 'book-outline',
    label: 'Reading',
    color: themeColors.reminder.reading,
    defaultTitle: 'Reading Time',
    defaultPrompt: 'Continue your reading journey',
    defaultTime: [20, 0],
  },
  {
    type: 'listening',
    icon: 'headset-outline',
    label: 'Listening',
    color: themeColors.reminder.listening,
    defaultTitle: 'Listening Session',
    defaultPrompt: 'Listen to your personalized tracks',
    defaultTime: [8, 0],
  },
  {
    type: 'meditation',
    icon: 'leaf-outline',
    label: 'Meditation',
    color: themeColors.reminder.meditation,
    defaultTitle: 'Meditation',
    defaultPrompt: 'Take time for mindfulness',
    defaultTime: [7, 0],
  },
];

export function ReminderModal({ visible, onClose, reminder, onSave, defaultType, track }: ReminderModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const isEditing = !!reminder;
  const isTrackMode = !!track;

  const getInitialPreset = () => {
    if (track) {
      return REMINDER_TYPE_PRESETS.find(p => p.type === 'listening') || REMINDER_TYPE_PRESETS[0];
    }
    if (defaultType) {
      return REMINDER_TYPE_PRESETS.find(p => p.type === defaultType) || REMINDER_TYPE_PRESETS[0];
    }
    return REMINDER_TYPE_PRESETS[0];
  };

  const [config, setConfig] = useState<ReminderConfig>({
    reminderType: 'book',
    title: '',
    prompt: '',
    enabled: true,
    time: new Date(),
    days: [true, true, true, true, true, true, true],
    notifyEnabled: true,
    autoPlayEnabled: false,
  });

  useEffect(() => {
    if (visible) {
      if (reminder) {
        const [hours, minutes] = reminder.time.split(':').map(Number);
        const time = new Date();
        time.setHours(hours, minutes, 0, 0);

        const days = [false, false, false, false, false, false, false];
        reminder.daysOfWeek.forEach(day => {
          days[day] = true;
        });

        setConfig({
          reminderType: reminder.type,
          title: reminder.title,
          prompt: reminder.prompt || '',
          enabled: reminder.enabled,
          time,
          days,
          notifyEnabled: reminder.notifyEnabled !== false,
          autoPlayEnabled: reminder.autoPlayEnabled === true,
        });
      } else if (track) {
        const preset = REMINDER_TYPE_PRESETS.find(p => p.type === 'listening') || REMINDER_TYPE_PRESETS[0];
        const time = new Date();
        time.setHours(preset.defaultTime[0], preset.defaultTime[1], 0, 0);

        const titleText = t('reminders.listenTo', { title: track.title, defaultValue: `Listen to: ${track.title}` });
        const promptText = track.displayName
          ? t('reminders.trackBy', { displayName: track.displayName, defaultValue: `by ${track.displayName}` })
          : '';

        setConfig({
          reminderType: 'listening',
          title: titleText,
          prompt: promptText,
          enabled: true,
          time,
          days: [true, true, true, true, true, true, true],
          notifyEnabled: true,
          autoPlayEnabled: true,
        });
      } else {
        const preset = getInitialPreset();
        const time = new Date();
        time.setHours(preset.defaultTime[0], preset.defaultTime[1], 0, 0);

        setConfig({
          reminderType: preset.type,
          title: preset.defaultTitle,
          prompt: preset.defaultPrompt,
          enabled: true,
          time,
          days: [true, true, true, true, true, true, true],
          notifyEnabled: true,
          autoPlayEnabled: false,
        });
      }
    }
  }, [visible, reminder, defaultType, track, t]);

  const selectType = (preset: TypePreset) => {
    const time = new Date();
    time.setHours(preset.defaultTime[0], preset.defaultTime[1], 0, 0);

    setConfig({
      ...config,
      reminderType: preset.type,
      title: preset.defaultTitle,
      prompt: preset.defaultPrompt,
      time,
    });
  };

  const toggleDay = (index: number) => {
    const newDays = [...config.days];
    newDays[index] = !newDays[index];
    setConfig({ ...config, days: newDays });
  };

  const handleTimeChange = (_event: unknown, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setConfig({ ...config, time: selectedDate });
    }
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getSelectedDaysLabel = () => {
    const selectedDays = config.days.map((selected, index) => (selected ? DAY_LABELS[index] : null)).filter(Boolean);

    if (selectedDays.length === 0) return t('reminders.noDaysSelected');
    if (selectedDays.length === 7) return t('reminders.everyday');
    if (selectedDays.length === 5 && !config.days[0] && !config.days[6]) {
      return t('reminders.weekdays');
    }
    if (selectedDays.length === 2 && config.days[0] && config.days[6]) {
      return t('reminders.weekends');
    }
    return selectedDays.join(', ');
  };

  const getCurrentTypePreset = () => {
    return REMINDER_TYPE_PRESETS.find(p => p.type === config.reminderType) || REMINDER_TYPE_PRESETS[0];
  };

  const handleSave = async () => {
    if (!config.days.some(d => d)) {
      Alert.alert(t('reminders.error'), t('reminders.selectAtLeastOneDay'));
      return;
    }

    if (!config.title.trim()) {
      Alert.alert(t('reminders.error'), t('reminders.titleRequired'));
      return;
    }

    setIsSaving(true);
    try {
      const hours = config.time.getHours();
      const minutes = config.time.getMinutes();
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      const daysOfWeek = config.days
        .map((selected, index) => (selected ? index : null))
        .filter((day): day is number => day !== null);

      const payload: Record<string, unknown> = {
        type: config.reminderType,
        title: config.title.trim(),
        prompt: config.prompt.trim() || undefined,
        time: timeString,
        daysOfWeek,
        enabled: config.enabled,
        notifyEnabled: config.notifyEnabled,
        autoPlayEnabled: config.autoPlayEnabled,
      };

      if (track) {
        if (track.isUserTrack) {
          payload.userTrackId = track.id;
        } else {
          payload.trackId = track.id;
        }
        payload.trackTitle = track.title;
      } else if (isEditing && reminder) {
        if (reminder.trackId) payload.trackId = reminder.trackId;
        if (reminder.userTrackId) payload.userTrackId = reminder.userTrackId;
        if (reminder.trackTitle) payload.trackTitle = reminder.trackTitle;
      }

      if (isEditing && reminder) {
        await apiClient.patch(`/api/v1/app/reminders/${reminder.id}`, payload);
        invalidateOnEvent(queryClient, { type: 'REMINDER_UPDATED' });
      } else {
        await apiClient.post('/api/v1/app/reminders', payload);
        invalidateOnEvent(queryClient, { type: 'REMINDER_CREATED' });
      }

      logger.debug('Reminder saved', {
        type: config.reminderType,
        time: timeString,
        daysOfWeek,
      });

      if (onSave) {
        await onSave();
      }
      onClose();
    } catch (error) {
      logger.error('Failed to save reminder', error);
      Alert.alert(t('reminders.error'), t('reminders.failedToSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const currentPreset = getCurrentTypePreset();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}>
          <LiquidGlassView intensity="strong" borderRadius={24} showBorder={true} style={styles.modalContainer}>
            <View style={styles.header}>
              <Ionicons name="notifications-outline" size={28} color={currentPreset.color} />
              <Text style={styles.headerTitle}>
                {isEditing ? t('reminders.editReminder') : t('reminders.newReminder')}
              </Text>
            </View>

            <View style={styles.divider} />

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {isTrackMode && track && (
                <View style={styles.trackInfoCard}>
                  <View style={styles.trackIconContainer}>
                    <Ionicons name="musical-notes" size={24} color={colors.reminder.listening} />
                  </View>
                  <View style={styles.trackInfoText}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    {track.displayName && (
                      <Text style={styles.trackArtist} numberOfLines={1}>
                        {track.displayName}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {!isEditing && !isTrackMode && (
                <View style={styles.typesSection}>
                  <Text style={styles.sectionLabel}>{t('reminders.reminderType')}</Text>
                  <View style={styles.typesGrid}>
                    {REMINDER_TYPE_PRESETS.map(preset => (
                      <Pressable
                        key={preset.type}
                        style={[
                          styles.typeButton,
                          config.reminderType === preset.type && {
                            borderColor: preset.color,
                            backgroundColor: preset.color + '15',
                          },
                        ]}
                        onPress={() => selectType(preset)}
                        testID={`button-type-${preset.type}`}
                      >
                        <View style={[styles.typeIconContainer, { backgroundColor: preset.color + '20' }]}>
                          <Ionicons
                            name={preset.icon}
                            size={22}
                            color={config.reminderType === preset.type ? preset.color : colors.text.tertiary}
                          />
                        </View>
                        <Text
                          style={[
                            styles.typeButtonText,
                            config.reminderType === preset.type && { color: preset.color },
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.inputSection}>
                <Text style={styles.sectionLabel}>{t('reminders.reminderTitle')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={config.title}
                  onChangeText={text => setConfig({ ...config, title: text })}
                  placeholder={t('reminders.titlePlaceholder')}
                  placeholderTextColor={colors.text.tertiary}
                  testID="input-reminder-title"
                />
              </View>

              <View style={styles.inputSection}>
                <Text style={styles.sectionLabel}>{t('reminders.reminderPrompt')}</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  value={config.prompt}
                  onChangeText={text => setConfig({ ...config, prompt: text })}
                  placeholder={t('reminders.promptPlaceholder')}
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  numberOfLines={3}
                  testID="input-reminder-prompt"
                />
              </View>

              <View style={styles.inputSection}>
                <Text style={styles.sectionLabel}>{t('reminders.time')}</Text>
                <Pressable
                  style={styles.timeButton}
                  onPress={() => setShowTimePicker(true)}
                  testID="button-select-time"
                >
                  <Ionicons name="time-outline" size={22} color={currentPreset.color} />
                  <Text style={styles.timeButtonText}>{formatTime(config.time)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                </Pressable>
              </View>

              {showTimePicker && (
                <DateTimePicker
                  value={config.time}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleTimeChange}
                  textColor={colors.text.primary}
                />
              )}

              <View style={styles.inputSection}>
                <Text style={styles.sectionLabel}>{t('reminders.repeatDays')}</Text>
                <Text style={styles.selectedDaysLabel}>{getSelectedDaysLabel()}</Text>
                <View style={styles.daysRow}>
                  {DAY_LABELS.map((day, index) => (
                    <Pressable
                      key={index}
                      style={[
                        styles.dayButton,
                        config.days[index] && {
                          backgroundColor: currentPreset.color,
                          borderColor: currentPreset.color,
                        },
                      ]}
                      onPress={() => toggleDay(index)}
                      testID={`button-day-${index}`}
                    >
                      <Text style={[styles.dayButtonText, config.days[index] && styles.dayButtonTextActive]}>
                        {day.charAt(0)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.switchSection}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Ionicons name="notifications-outline" size={20} color={colors.text.secondary} />
                    <Text style={styles.switchLabel}>{t('reminders.pushNotifications')}</Text>
                  </View>
                  <Switch
                    value={config.notifyEnabled}
                    onValueChange={value => setConfig({ ...config, notifyEnabled: value })}
                    trackColor={{ false: colors.background.subtle, true: currentPreset.color + '60' }}
                    thumbColor={config.notifyEnabled ? currentPreset.color : colors.text.tertiary}
                  />
                </View>

                {(config.reminderType === 'listening' || config.reminderType === 'meditation') && (
                  <View style={styles.switchRow}>
                    <View style={styles.switchInfo}>
                      <Ionicons name="play-circle-outline" size={20} color={colors.text.secondary} />
                      <Text style={styles.switchLabel}>{t('reminders.autoPlay')}</Text>
                    </View>
                    <Switch
                      value={config.autoPlayEnabled}
                      onValueChange={value => setConfig({ ...config, autoPlayEnabled: value })}
                      trackColor={{ false: colors.background.subtle, true: currentPreset.color + '60' }}
                      thumbColor={config.autoPlayEnabled ? currentPreset.color : colors.text.tertiary}
                    />
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={styles.cancelButton} onPress={onClose} testID="button-cancel">
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, { backgroundColor: currentPreset.color }]}
                onPress={handleSave}
                disabled={isSaving}
                testID="button-save"
              >
                <Text style={styles.saveButtonText}>{isSaving ? t('common.saving') : t('common.save')}</Text>
              </Pressable>
            </View>
          </LiquidGlassView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[70],
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 400,
      maxHeight: '85%',
      padding: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 20,
      paddingBottom: 16,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.muted,
      marginHorizontal: 20,
    },
    content: {
      padding: 20,
      paddingTop: 16,
    },
    typesSection: {
      marginBottom: 20,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    typesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    typeButton: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    typeIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    typeButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    inputSection: {
      marginBottom: 20,
    },
    textInput: {
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.md,
      padding: 14,
      fontSize: 16,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    textInputMultiline: {
      height: 80,
      textAlignVertical: 'top',
    },
    timeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.md,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    timeButtonText: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    selectedDaysLabel: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 12,
    },
    daysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    dayButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border.muted,
    },
    dayButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    dayButtonTextActive: {
      color: colors.text.primary,
    },
    switchSection: {
      marginBottom: 20,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    switchInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    switchLabel: {
      fontSize: 15,
      color: colors.text.primary,
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      padding: 20,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.subtle,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    trackInfoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      backgroundColor: colors.overlay.brand[10],
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.overlay.purple[30],
      marginBottom: 20,
    },
    trackIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.overlay.brand[20],
      justifyContent: 'center',
      alignItems: 'center',
    },
    trackInfoText: {
      flex: 1,
    },
    trackTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    trackArtist: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
  });

export default ReminderModal;
