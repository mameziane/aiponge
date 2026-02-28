import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Switch, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme, commonStyles, Z_INDEX, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { LiquidGlassView } from '../../components/ui';
import { ReminderModal } from '../../components/reminders/UnifiedReminderModal';
import { REMINDER_TYPES, type ReminderTypeId, type ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';
import type { IconName } from '../../types/ui.types';

export type ReminderType = ReminderTypeId;

export interface Reminder {
  id: string;
  type: ReminderType;
  title: string;
  prompt?: string | null;
  time: string;
  timezone: string;
  daysOfWeek: number[];
  enabled: boolean;
  notifyEnabled?: boolean;
  autoPlayEnabled?: boolean;
  bookId?: string | null;
  trackId?: string | null;
  userTrackId?: string | null;
  trackTitle?: string | null;
  createdAt: string;
  updatedAt: string;
}

type RemindersResponse = ServiceResponse<Reminder[]>;

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const createReminderTypeConfig = (
  colors: ColorScheme
): Record<ReminderType, { label: string; icon: IconName; color: string }> => ({
  [REMINDER_TYPES.BOOK]: { label: 'Book', icon: 'book-outline', color: colors.brand.primary },
  [REMINDER_TYPES.READING]: { label: 'Reading', icon: 'book-outline', color: colors.reminder.reading },
  [REMINDER_TYPES.LISTENING]: { label: 'Listening', icon: 'headset-outline', color: colors.reminder.listening },
  [REMINDER_TYPES.MEDITATION]: { label: 'Meditation', icon: 'leaf-outline', color: colors.reminder.meditation },
});

interface FilterOption {
  value: ReminderType | 'all';
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All Reminders' },
  { value: REMINDER_TYPES.BOOK, label: 'Book' },
  { value: REMINDER_TYPES.READING, label: 'Reading' },
  { value: REMINDER_TYPES.LISTENING, label: 'Listening' },
  { value: REMINDER_TYPES.MEDITATION, label: 'Meditation' },
];

export function RemindersScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const REMINDER_TYPE_CONFIG = useMemo(() => createReminderTypeConfig(colors), [colors]);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<ReminderType | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const queryKey = useMemo(
    () => (selectedFilter === 'all' ? queryKeys.reminders.all() : queryKeys.reminders.byType(selectedFilter)),
    [selectedFilter]
  );

  const apiPath = useMemo(
    () => (selectedFilter === 'all' ? '/api/v1/app/reminders' : `/api/v1/app/reminders?type=${selectedFilter}`),
    [selectedFilter]
  );

  const {
    data: remindersData,
    isLoading,
    refetch,
  } = useQuery<RemindersResponse>({
    queryKey,
    queryFn: async (): Promise<RemindersResponse> => {
      const response = await apiClient.get<RemindersResponse>(apiPath);
      const rawData = response.data as RemindersResponse | Reminder[];
      if ('data' in rawData && Array.isArray(rawData.data)) {
        return rawData as RemindersResponse;
      }
      return { success: true, data: rawData as Reminder[] };
    },
  });

  const reminders = remindersData?.data || [];

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiClient.patch(`/api/v1/app/reminders/${id}`, { enabled });
    },
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<RemindersResponse>(queryKey);
      queryClient.setQueryData<RemindersResponse>(queryKey, old => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map(reminder => (reminder.id === id ? { ...reminder, enabled } : reminder)),
        };
      });
      return { previousData };
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'REMINDER_UPDATED' });
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      logger.error('Failed to toggle reminder', error);
      Alert.alert(t('reminders.error'), t('reminders.failedToToggle'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/app/reminders/${id}`);
    },
    onMutate: async deletedId => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<RemindersResponse>(queryKey);
      queryClient.setQueryData<RemindersResponse>(queryKey, old => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter(reminder => reminder.id !== deletedId),
        };
      });
      return { previousData };
    },
    onSuccess: async () => {
      invalidateOnEvent(queryClient, { type: 'REMINDER_DELETED' });
    },
    onError: (error, _deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      logger.error('Failed to delete reminder', error);
      Alert.alert(t('reminders.error'), t('reminders.failedToDelete'));
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAddReminder = () => {
    setEditingReminder(undefined);
    setShowModal(true);
  };

  const handleEditReminder = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setShowModal(true);
  };

  const handleDeleteReminder = (reminder: Reminder) => {
    Alert.alert(t('reminders.deleteTitle'), t('reminders.deleteConfirm', { title: reminder.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(reminder.id),
      },
    ]);
  };

  const handleToggle = (reminder: Reminder) => {
    toggleMutation.mutate({ id: reminder.id, enabled: !reminder.enabled });
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingReminder(undefined);
  };

  const handleModalSave = async () => {
    await refetch();
  };

  const handleFilterSelect = (filter: ReminderType | 'all') => {
    setSelectedFilter(filter);
    setShowFilterDropdown(false);
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getTypeConfig = (type: ReminderType) => {
    return REMINDER_TYPE_CONFIG[type] || REMINDER_TYPE_CONFIG.book;
  };

  const renderReminder = ({ item: reminder }: { item: Reminder }) => {
    const typeConfig = getTypeConfig(reminder.type);

    return (
      <LiquidGlassView intensity="medium" style={styles.reminderCard}>
        <View style={styles.reminderHeader}>
          <View style={[styles.reminderIcon, { backgroundColor: typeConfig.color + '20' }]}>
            <Ionicons
              name={typeConfig.icon}
              size={24}
              color={reminder.enabled ? typeConfig.color : colors.text.tertiary}
            />
          </View>
          <View style={styles.reminderInfo}>
            <View style={styles.titleRow}>
              <Text style={[styles.reminderTitle, !reminder.enabled && styles.reminderDisabled]}>{reminder.title}</Text>
              <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '30' }]}>
                <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
              </View>
            </View>
            <Text style={styles.reminderTime}>{formatTime(reminder.time)}</Text>
          </View>
          <Switch
            value={reminder.enabled}
            onValueChange={() => handleToggle(reminder)}
            trackColor={{
              false: colors.background.subtle,
              true: typeConfig.color + '60',
            }}
            thumbColor={reminder.enabled ? typeConfig.color : colors.text.tertiary}
            testID={`switch-reminder-${reminder.id}`}
          />
        </View>

        {reminder.prompt && (
          <Text style={[styles.reminderPrompt, !reminder.enabled && styles.reminderDisabled]} numberOfLines={2}>
            "{reminder.prompt}"
          </Text>
        )}

        <View style={styles.daysRow}>
          {DAY_LABELS.map((day, index) => {
            const isActive = reminder.daysOfWeek.includes(index);
            return (
              <View
                key={index}
                style={[
                  styles.dayDot,
                  isActive && { backgroundColor: typeConfig.color, borderColor: typeConfig.color },
                  !reminder.enabled && styles.dayDotDisabled,
                ]}
              >
                <Text style={[styles.dayDotText, isActive && styles.dayDotTextActive]}>{day}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.reminderActions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => handleEditReminder(reminder)}
            testID={`button-edit-reminder-${reminder.id}`}
          >
            <Ionicons name="create-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.actionButtonText}>{t('common.edit')}</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => handleDeleteReminder(reminder)}
            testID={`button-delete-reminder-${reminder.id}`}
          >
            <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
            <Text style={[styles.actionButtonText, { color: colors.semantic.error }]}>{t('common.delete')}</Text>
          </Pressable>
        </View>
      </LiquidGlassView>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-off-outline" size={64} color={colors.text.tertiary} />
      <Text style={styles.emptyTitle}>{t('reminders.noReminders')}</Text>
      <Text style={styles.emptySubtitle}>{t('reminders.noRemindersDesc')}</Text>
      <Pressable style={styles.emptyButton} onPress={handleAddReminder} testID="button-add-first-reminder">
        <Ionicons name="add" size={20} color={colors.text.primary} />
        <Text style={styles.emptyButtonText}>{t('reminders.addReminder')}</Text>
      </Pressable>
    </View>
  );

  const selectedFilterLabel = FILTER_OPTIONS.find(f => f.value === selectedFilter)?.label || 'All Reminders';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('reminders.title')}</Text>
        <Pressable style={styles.addButton} onPress={handleAddReminder} testID="button-add-reminder">
          <Ionicons name="add" size={24} color={colors.text.primary} />
        </Pressable>
      </View>

      <Text style={styles.headerSubtitle}>{t('reminders.subtitle')}</Text>

      <View style={styles.filterContainer}>
        <Pressable
          style={styles.filterButton}
          onPress={() => setShowFilterDropdown(!showFilterDropdown)}
          testID="button-filter-dropdown"
        >
          <Ionicons name="filter-outline" size={18} color={colors.text.secondary} />
          <Text style={styles.filterButtonText}>{selectedFilterLabel}</Text>
          <Ionicons name={showFilterDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.secondary} />
        </Pressable>

        {showFilterDropdown && (
          <View style={styles.filterDropdown}>
            {FILTER_OPTIONS.map(option => (
              <Pressable
                key={option.value}
                style={[styles.filterOption, selectedFilter === option.value && styles.filterOptionActive]}
                onPress={() => handleFilterSelect(option.value)}
              >
                <Text
                  style={[styles.filterOptionText, selectedFilter === option.value && styles.filterOptionTextActive]}
                >
                  {option.label}
                </Text>
                {selectedFilter === option.value && (
                  <Ionicons name="checkmark" size={18} color={colors.brand.primary} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {isLoading ? (
        <LoadingState fullScreen={false} />
      ) : (
        <FlatList
          data={reminders}
          renderItem={renderReminder}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand.primary}
              colors={[colors.brand.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          testID="list-reminders"
        />
      )}

      <ReminderModal
        visible={showModal}
        onClose={handleModalClose}
        reminder={editingReminder}
        onSave={handleModalSave}
        defaultType={selectedFilter !== 'all' ? selectedFilter : undefined}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text.primary,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    filterContainer: {
      paddingHorizontal: 20,
      marginBottom: 12,
      zIndex: Z_INDEX.dropdown,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background.subtle,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignSelf: 'flex-start',
    },
    filterButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    filterDropdown: {
      position: 'absolute',
      top: 48,
      left: 20,
      right: 20,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.muted,
      shadowColor: colors.absolute.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      zIndex: Z_INDEX.popover,
    },
    filterOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    filterOptionActive: {
      backgroundColor: colors.brand.primary + '10',
    },
    filterOptionText: {
      fontSize: 15,
      color: colors.text.secondary,
    },
    filterOptionTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    loadingState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      padding: 16,
      paddingBottom: 32,
      flexGrow: 1,
    },
    reminderCard: {
      marginBottom: 16,
      padding: 16,
    },
    reminderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    reminderIcon: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    reminderInfo: {
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    reminderTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    typeBadge: {
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    typeBadgeText: {
      fontSize: 11,
      fontWeight: '600',
    },
    reminderTime: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    reminderDisabled: {
      opacity: 0.5,
    },
    reminderPrompt: {
      fontSize: 14,
      fontStyle: 'italic',
      color: colors.text.secondary,
      marginBottom: 12,
      paddingLeft: 60,
    },
    daysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      marginBottom: 12,
    },
    dayDot: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    dayDotDisabled: {
      opacity: 0.4,
    },
    dayDotText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    dayDotTextActive: {
      color: colors.text.primary,
      fontWeight: '700',
    },
    reminderActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
      paddingTop: 12,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.brand.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: BORDER_RADIUS.md,
    },
    emptyButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });

export default RemindersScreen;
