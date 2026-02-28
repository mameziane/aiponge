import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

type DateData = { dateString: string; day: number; month: number; year: number; timestamp: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Calendar: any = null;
try {
  const calendarsModule = require('react-native-calendars');
  Calendar = calendarsModule.Calendar;
} catch {
  // react-native-calendars not available
}
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { getApiGatewayUrl } from '../../lib/apiConfig';
import { useAuthStore, selectUser } from '../../auth/store';
import { useDeleteAlarm, type AlarmData } from '../../hooks/profile/useActivityMutations';
import type { IconName } from '../../types/ui.types';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { queryKeys } from '../../lib/queryKeys';

const resolveImageUrl = (url?: string): string | null => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  const baseUrl = getApiGatewayUrl();
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
};

interface DayActivity {
  date: string;
  tracksCreated: number;
  tracksListened: number;
  tracksScheduled: number;
}

type CalendarActivityResponse = ServiceResponse<{
  activities: DayActivity[];
  summary: {
    totalTracksCreated: number;
    totalTracksListened: number;
    totalTracksScheduled: number;
    activeDays: number;
    firstActivityDate: string | null;
    lastActivityDate: string | null;
  };
}>;

type DayDetailResponse = ServiceResponse<{
  date: string;
  tracksCreated: Array<{
    id: string;
    title: string;
    artworkUrl?: string;
    fileUrl?: string;
    lyricsId?: string;
    durationSeconds: number;
    createdAt: string;
  }>;
  tracksListened: Array<{
    trackId: string;
    title: string;
    artworkUrl?: string;
    fileUrl?: string;
    lyricsId?: string;
    playedAt: string;
  }>;
  tracksScheduled?: Array<{
    id: string;
    title: string;
    artworkUrl?: string;
    fileUrl?: string;
    lyricsId?: string;
    durationSeconds?: number;
    playOnDate?: string;
    repeatType?: 'once' | 'yearly' | 'monthly' | 'weekly';
    scheduleId?: string;
  }>;
}>;

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function ActivityCalendarTab() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAuthStore(selectUser);
  const displayName = user?.name || 'You';
  const { tierConfig } = useSubscriptionData();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const deleteAlarmMutation = useDeleteAlarm();
  const deletingAlarmRef = useRef<string | null>(null);
  const [deletedAlarmIds, setDeletedAlarmIds] = useState<Set<string>>(new Set());
  const [deletedScheduleIds, setDeletedScheduleIds] = useState<Set<string>>(new Set());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const canAccess = tierConfig.canAccessActivityCalendar;

  const {
    data: activityData,
    isLoading,
    isError,
    refetch,
  } = useQuery<CalendarActivityResponse>({
    queryKey: queryKeys.activity.calendar(),
    enabled: canAccess,
    queryFn: async (): Promise<CalendarActivityResponse> => {
      const response = await apiClient.get<Record<string, unknown>>('/api/v1/app/activity/calendar');
      const rawData = response.data as Record<string, unknown>;
      if (rawData.data) {
        return rawData as unknown as CalendarActivityResponse;
      }
      return { success: true, data: rawData } as CalendarActivityResponse;
    },
    staleTime: QUERY_STALE_TIME.long,
  });

  const { data: dayDetail, isLoading: isDayLoading } = useQuery<DayDetailResponse>({
    queryKey: queryKeys.activity.day(selectedDate ?? undefined),
    enabled: canAccess && !!selectedDate,
    queryFn: async (): Promise<DayDetailResponse> => {
      const response = await apiClient.get<Record<string, unknown>>(`/api/v1/app/activity/day/${selectedDate}`);
      const rawData = response.data as Record<string, unknown>;
      if (rawData.data) {
        return rawData as unknown as DayDetailResponse;
      }
      return { success: true, data: rawData } as DayDetailResponse;
    },
  });

  const { data: alarmsData } = useQuery<AlarmData[]>({
    queryKey: queryKeys.activity.alarms(),
    enabled: canAccess,
    queryFn: async () => {
      const response = await apiClient.get<Record<string, unknown>>('/api/v1/app/activity/alarms');
      const rawData = response.data as Record<string, unknown>;
      if (rawData?.data && Array.isArray(rawData.data)) {
        return rawData.data as AlarmData[];
      }
      if (Array.isArray(rawData)) {
        return rawData as unknown as AlarmData[];
      }
      return [];
    },
    staleTime: QUERY_STALE_TIME.long,
  });

  // Paid tier feature gate - placed after all hooks
  if (!canAccess) {
    return (
      <View style={styles.lockedContainer}>
        <View style={styles.lockedIconContainer}>
          <Ionicons name="lock-closed" size={48} color={colors.text.tertiary} />
        </View>
        <Text style={styles.lockedTitle}>{t('activityCalendar.premiumRequired')}</Text>
        <Text style={styles.lockedDescription}>{t('activityCalendar.premiumDescription')}</Text>
        <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push('/paywall')} testID="button-upgrade">
          <Ionicons name="star" size={20} color={colors.text.primary} />
          <Text style={styles.upgradeButtonText}>{t('common.upgrade')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getAlarmDatesForMonth = useCallback((alarm: AlarmData, targetYear: number, targetMonth: number): string[] => {
    const dates: string[] = [];
    const baseDate = new Date(alarm.baseDate);
    const baseDateStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());

    if (alarm.repeatType === 'once') {
      const alarmMonth = baseDate.getMonth();
      const alarmYear = baseDate.getFullYear();
      if (alarmMonth === targetMonth && alarmYear === targetYear) {
        dates.push(formatLocalDate(baseDate));
      }
    } else if (alarm.repeatType === 'weekly' && alarm.dayOfWeek !== undefined) {
      const firstDay = new Date(targetYear, targetMonth, 1);
      const lastDay = new Date(targetYear, targetMonth + 1, 0);
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === alarm.dayOfWeek && d >= baseDateStart) {
          dates.push(formatLocalDate(d));
        }
      }
    } else if (alarm.repeatType === 'monthly') {
      const dayOfMonth = baseDate.getDate();
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const targetDay = Math.min(dayOfMonth, lastDayOfMonth);
      const targetDate = new Date(targetYear, targetMonth, targetDay);
      if (targetDate >= baseDateStart) {
        dates.push(formatLocalDate(targetDate));
      }
    } else if (alarm.repeatType === 'yearly') {
      if (baseDate.getMonth() === targetMonth) {
        const dayOfMonth = baseDate.getDate();
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const targetDay = Math.min(dayOfMonth, lastDayOfMonth);
        const targetDate = new Date(targetYear, targetMonth, targetDay);
        if (targetDate >= baseDateStart) {
          dates.push(formatLocalDate(targetDate));
        }
      }
    }

    return dates;
  }, []);

  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      { dots: Array<{ key: string; color: string }>; selected: boolean; selectedColor: string }
    > = {};

    if (activityData?.data?.activities) {
      activityData.data.activities.forEach((activity: DayActivity) => {
        const dots = [];

        if (activity.tracksCreated > 0) {
          dots.push({ key: 'created', color: colors.activity.created });
        }
        if (activity.tracksListened > 0) {
          dots.push({ key: 'listened', color: colors.activity.listened });
        }
        if (activity.tracksScheduled > 0) {
          dots.push({ key: 'scheduled', color: colors.activity.scheduled });
        }

        marks[activity.date] = {
          dots,
          selected: activity.date === selectedDate,
          selectedColor: 'rgba(162, 128, 188, 0.4)',
        };
      });
    }

    if (alarmsData && alarmsData.length > 0) {
      alarmsData.forEach(alarm => {
        const alarmDates = getAlarmDatesForMonth(alarm, visibleMonth.year, visibleMonth.month);
        alarmDates.forEach(dateStr => {
          if (!marks[dateStr]) {
            marks[dateStr] = {
              dots: [],
              selected: dateStr === selectedDate,
              selectedColor: 'rgba(162, 128, 188, 0.4)',
            };
          }
          const existingAlarmDot = marks[dateStr].dots?.find((d: { key: string }) => d.key === 'alarm');
          if (!existingAlarmDot) {
            marks[dateStr].dots = marks[dateStr].dots || [];
            marks[dateStr].dots.push({ key: 'alarm', color: colors.activity.alarm });
          }
        });
      });
    }

    if (selectedDate && !marks[selectedDate]) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: 'rgba(162, 128, 188, 0.4)',
        dots: [],
      };
    }

    return marks;
  }, [activityData, alarmsData, selectedDate, visibleMonth, getAlarmDatesForMonth]);

  const handleDayPress = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getRepeatLabel = (repeatType?: string): string | null => {
    switch (repeatType) {
      case 'yearly':
        return t('activityCalendar.repeatsYearly');
      case 'monthly':
        return t('activityCalendar.repeatsMonthly');
      case 'weekly':
        return t('activityCalendar.repeatsWeekly');
      default:
        return null;
    }
  };

  const getRepeatIcon = (repeatType?: string): IconName => {
    switch (repeatType) {
      case 'yearly':
        return 'calendar';
      case 'monthly':
        return 'today';
      case 'weekly':
        return 'refresh';
      default:
        return 'time';
    }
  };

  const handleEditSchedule = useCallback(
    (track: {
      id: string;
      title: string;
      scheduleId?: string;
      playOnDate?: string;
      repeatType?: 'once' | 'yearly' | 'monthly' | 'weekly';
    }) => {
      router.push({
        pathname: '/set-reminder',
        params: {
          trackId: track.id,
          trackTitle: track.title,
          trackDisplayName: displayName,
          reminderId: track.scheduleId || '',
          reminderDate: track.playOnDate || '',
          reminderRepeatType: track.repeatType || 'once',
        },
      });
    },
    [displayName]
  );

  const formatAlarmTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleDeleteAlarm = useCallback(
    (alarmId: string) => {
      if (deletingAlarmRef.current || deleteAlarmMutation.isPending) return;
      deletingAlarmRef.current = alarmId;

      // Immediately hide from UI via local state (instant feedback)
      setDeletedAlarmIds(prev => new Set([...prev, alarmId]));

      deleteAlarmMutation.mutate(alarmId, {
        onSettled: () => {
          deletingAlarmRef.current = null;
        },
        onError: () => {
          // Rollback local state on error
          setDeletedAlarmIds(prev => {
            const next = new Set(prev);
            next.delete(alarmId);
            return next;
          });
        },
      });
    },
    [deleteAlarmMutation]
  );

  const getAlarmsForDate = useCallback(
    (dateStr: string): AlarmData[] => {
      if (!alarmsData || !dateStr) return [];

      const dateParts = dateStr.split('-');
      const targetYear = parseInt(dateParts[0], 10);
      const targetMonth = parseInt(dateParts[1], 10) - 1;

      return alarmsData.filter(alarm => {
        const alarmDates = getAlarmDatesForMonth(alarm, targetYear, targetMonth);
        return alarmDates.includes(dateStr);
      });
    },
    [alarmsData, getAlarmDatesForMonth]
  );

  const handleMonthChange = useCallback((month: { year: number; month: number }) => {
    setVisibleMonth({ year: month.year, month: month.month - 1 });
  }, []);

  const selectedDateAlarms = useMemo(() => {
    const alarmsForDate = selectedDate ? getAlarmsForDate(selectedDate) : [];
    // Filter out locally deleted alarms for instant UI feedback
    return alarmsForDate.filter(alarm => !deletedAlarmIds.has(alarm.id));
  }, [selectedDate, getAlarmsForDate, alarmsData, deletedAlarmIds]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
        <Text style={styles.loadingText}>{t('activityCalendar.loading')}</Text>
      </View>
    );
  }

  const activeScheduledTracks = useMemo(() => {
    return dayDetail?.data?.tracksScheduled?.filter(t => !deletedScheduleIds.has(t.scheduleId || '')) ?? [];
  }, [dayDetail?.data?.tracksScheduled, deletedScheduleIds]);

  const navigateToTrackDetail = useCallback((trackData: Record<string, unknown>) => {
    router.push(`/private-track-detail?track=${encodeURIComponent(JSON.stringify(trackData))}`);
  }, []);

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.semantic.error} />
        <Text style={styles.errorText}>{t('activityCalendar.loadError')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()} testID="button-retry">
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{t('activityCalendar.yourActivity')}</Text>
        <View style={styles.summaryStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{activityData?.data?.summary?.totalTracksCreated || 0}</Text>
            <Text style={styles.statLabel}>{t('activityCalendar.tracksCreated')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{activityData?.data?.summary?.totalTracksListened || 0}</Text>
            <Text style={styles.statLabel}>{t('activityCalendar.tracksListened')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{activityData?.data?.summary?.activeDays || 0}</Text>
            <Text style={styles.statLabel}>{t('activityCalendar.activeDays')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.activity.created }]} />
          <Text style={styles.legendText}>{t('activityCalendar.created')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.activity.listened }]} />
          <Text style={styles.legendText}>{t('activityCalendar.listened')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.activity.scheduled }]} />
          <Text style={styles.legendText}>{t('activityCalendar.scheduled')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.activity.alarm }]} />
          <Text style={styles.legendText}>{t('activityCalendar.alarm')}</Text>
        </View>
      </View>

      <View style={styles.calendarContainer}>
        {Calendar ? (
          <Calendar
            markingType="multi-dot"
            markedDates={markedDates}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            theme={{
              backgroundColor: colors.absolute.transparent,
              calendarBackground: colors.absolute.transparent,
              textSectionTitleColor: colors.text.secondary,
              selectedDayBackgroundColor: colors.brand.primary,
              selectedDayTextColor: colors.absolute.white,
              todayTextColor: colors.activity.created,
              todayBackgroundColor: 'rgba(34, 197, 94, 0.2)',
              dayTextColor: colors.text.primary,
              textDisabledColor: colors.text.tertiary,
              dotColor: colors.brand.primary,
              selectedDotColor: colors.absolute.white,
              arrowColor: colors.brand.primary,
              monthTextColor: colors.text.primary,
              textDayFontWeight: '500',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: '600',
              textDayFontSize: 15,
              textMonthFontSize: 16,
              textDayHeaderFontSize: 12,
            }}
            style={styles.calendar}
          />
        ) : (
          <Text style={{ color: colors.text.secondary, textAlign: 'center', padding: 20 }}>Calendar not available</Text>
        )}
      </View>

      {selectedDate && (
        <View style={styles.dayDetailCard}>
          <Text style={styles.dayDetailTitle}>
            {new Date(selectedDate).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>

          {isDayLoading ? (
            <ActivityIndicator size="small" color={colors.brand.primary} style={styles.dayLoading} />
          ) : (
            <>
              {dayDetail?.data?.tracksCreated && dayDetail.data.tracksCreated.length > 0 && (
                <View style={styles.daySection}>
                  <View style={styles.daySectionHeader}>
                    <Ionicons name="musical-notes" size={18} color={colors.activity.created} />
                    <Text style={styles.daySectionTitle}>
                      {t('activityCalendar.createdTracks')} ({dayDetail.data.tracksCreated.length})
                    </Text>
                  </View>
                  {dayDetail.data.tracksCreated.map(track => (
                    <TouchableOpacity
                      key={track.id}
                      style={styles.trackItem}
                      onPress={() =>
                        navigateToTrackDetail({
                          id: track.id,
                          title: track.title,
                          artworkUrl: track.artworkUrl,
                          fileUrl: track.fileUrl,
                          duration: track.durationSeconds,
                          lyricsId: track.lyricsId,
                          displayName: displayName,
                        })
                      }
                      testID={`track-created-${track.id}`}
                    >
                      {resolveImageUrl(track.artworkUrl) ? (
                        <Image source={{ uri: resolveImageUrl(track.artworkUrl)! }} style={styles.trackArtwork} />
                      ) : (
                        <View style={styles.trackArtworkPlaceholder}>
                          <Ionicons name="musical-note" size={20} color={colors.text.tertiary} />
                        </View>
                      )}
                      <View style={styles.trackInfo}>
                        <Text style={styles.trackTitle} numberOfLines={1}>
                          {track.title}
                        </Text>
                        <Text style={styles.trackMeta}>
                          {formatDuration(track.durationSeconds)} • {formatTime(track.createdAt)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {dayDetail?.data?.tracksListened && dayDetail.data.tracksListened.length > 0 && (
                <View style={styles.daySection}>
                  <View style={styles.daySectionHeader}>
                    <Ionicons name="headset" size={18} color={colors.activity.listened} />
                    <Text style={styles.daySectionTitle}>
                      {t('activityCalendar.listenedTracks')} ({dayDetail.data.tracksListened.length})
                    </Text>
                  </View>
                  {dayDetail.data.tracksListened.slice(0, 10).map((track, index) => (
                    <TouchableOpacity
                      key={`${track.trackId}-${index}`}
                      style={styles.trackItem}
                      onPress={() =>
                        navigateToTrackDetail({
                          id: track.trackId,
                          title: track.title,
                          artworkUrl: track.artworkUrl,
                          fileUrl: track.fileUrl,
                          lyricsId: track.lyricsId,
                          displayName: displayName,
                        })
                      }
                      testID={`track-listened-${track.trackId}`}
                    >
                      {resolveImageUrl(track.artworkUrl) ? (
                        <Image source={{ uri: resolveImageUrl(track.artworkUrl)! }} style={styles.trackArtwork} />
                      ) : (
                        <View style={styles.trackArtworkPlaceholder}>
                          <Ionicons name="musical-note" size={20} color={colors.text.tertiary} />
                        </View>
                      )}
                      <View style={styles.trackInfo}>
                        <Text style={styles.trackTitle} numberOfLines={1}>
                          {track.title}
                        </Text>
                        <Text style={styles.trackMeta}>{formatTime(track.playedAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {dayDetail.data.tracksListened.length > 10 && (
                    <Text style={styles.moreText}>
                      +{dayDetail.data.tracksListened.length - 10} {t('activityCalendar.more')}
                    </Text>
                  )}
                </View>
              )}

              {activeScheduledTracks.length > 0 && (
                <View style={styles.daySection}>
                  <View style={styles.daySectionHeader}>
                    <Ionicons name="time" size={18} color={colors.activity.scheduled} />
                    <Text style={styles.daySectionTitle}>
                      {t('activityCalendar.scheduledTracks')} ({activeScheduledTracks.length})
                    </Text>
                  </View>
                  {activeScheduledTracks.map((track, index) => (
                    <View key={track.scheduleId || `${track.id}-${index}`} style={styles.scheduledTrackRow}>
                      <TouchableOpacity
                        style={styles.trackItemFlex}
                        onPress={() =>
                          navigateToTrackDetail({
                            id: track.id,
                            title: track.title,
                            artworkUrl: track.artworkUrl,
                            fileUrl: track.fileUrl,
                            duration: track.durationSeconds,
                            lyricsId: track.lyricsId,
                            displayName: displayName,
                          })
                        }
                        testID={`track-scheduled-${track.id}`}
                      >
                        {resolveImageUrl(track.artworkUrl) ? (
                          <Image source={{ uri: resolveImageUrl(track.artworkUrl)! }} style={styles.trackArtwork} />
                        ) : (
                          <View style={styles.trackArtworkPlaceholder}>
                            <Ionicons name="musical-note" size={20} color={colors.text.tertiary} />
                          </View>
                        )}
                        <View style={styles.trackInfo}>
                          <Text style={styles.trackTitle} numberOfLines={1}>
                            {track.title}
                          </Text>
                          <View style={styles.trackMetaRow}>
                            <Text style={styles.trackMeta}>{t('activityCalendar.playOnLabel')}</Text>
                            {track.repeatType && track.repeatType !== 'once' && (
                              <View style={styles.repeatBadge}>
                                <Ionicons
                                  name={getRepeatIcon(track.repeatType)}
                                  size={12}
                                  color={colors.activity.scheduled}
                                />
                                <Text style={styles.repeatBadgeText}>{getRepeatLabel(track.repeatType)}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editScheduleButton}
                        onPress={() => handleEditSchedule(track)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        testID={`button-edit-schedule-${track.id}`}
                      >
                        <Ionicons name="create-outline" size={20} color={colors.brand.primary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {selectedDateAlarms.length > 0 && (
                <View style={styles.daySection}>
                  <View style={styles.daySectionHeader}>
                    <Ionicons name="alarm" size={18} color={colors.activity.alarm} />
                    <Text style={styles.daySectionTitle}>
                      {t('activityCalendar.alarms')} ({selectedDateAlarms.length})
                    </Text>
                  </View>
                  {selectedDateAlarms.map(alarm => (
                    <View key={alarm.id} style={styles.alarmRow}>
                      <View style={styles.alarmInfo}>
                        {resolveImageUrl(alarm.trackArtworkUrl) ? (
                          <Image
                            source={{ uri: resolveImageUrl(alarm.trackArtworkUrl)! }}
                            style={styles.trackArtwork}
                          />
                        ) : (
                          <View style={styles.trackArtworkPlaceholder}>
                            <Ionicons name="musical-note" size={20} color={colors.text.tertiary} />
                          </View>
                        )}
                        <View style={styles.trackInfo}>
                          <Text style={styles.trackTitle} numberOfLines={1}>
                            {alarm.trackTitle}
                          </Text>
                          <View style={styles.trackMetaRow}>
                            <Ionicons name="time-outline" size={12} color={colors.activity.alarm} />
                            <Text style={[styles.trackMeta, { color: colors.activity.alarm }]}>
                              {formatAlarmTime(alarm.baseDate)}
                            </Text>
                            {alarm.repeatType !== 'once' && (
                              <View style={[styles.repeatBadge, { borderColor: colors.activity.alarm }]}>
                                <Ionicons
                                  name={getRepeatIcon(alarm.repeatType)}
                                  size={12}
                                  color={colors.activity.alarm}
                                />
                                <Text style={[styles.repeatBadgeText, { color: colors.activity.alarm }]}>
                                  {getRepeatLabel(alarm.repeatType)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteAlarmButton}
                        onPress={() => handleDeleteAlarm(alarm.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        disabled={deleteAlarmMutation.isPending}
                        testID={`button-delete-alarm-${alarm.id}`}
                      >
                        {deleteAlarmMutation.isPending && deleteAlarmMutation.variables === alarm.id ? (
                          <ActivityIndicator size="small" color={colors.text.tertiary} />
                        ) : (
                          <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {!dayDetail?.data?.tracksCreated?.length &&
                !dayDetail?.data?.tracksListened?.length &&
                !activeScheduledTracks.length &&
                selectedDateAlarms.length === 0 && (
                  <View style={styles.emptyDay}>
                    <Ionicons name="calendar-outline" size={32} color={colors.text.tertiary} />
                    <Text style={styles.emptyDayText}>{t('activityCalendar.noActivity')}</Text>
                  </View>
                )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 24,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 48,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.secondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 48,
    },
    errorText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 24,
      paddingVertical: 10,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
    },
    retryButtonText: {
      color: colors.absolute.white,
      fontWeight: '600',
    },
    summaryCard: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      marginBottom: 16,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
      textAlign: 'center',
    },
    summaryStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 4,
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border.light,
    },
    legendContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 24,
      marginBottom: 16,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    calendarContainer: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 8,
      marginBottom: 16,
    },
    calendar: {
      borderRadius: BORDER_RADIUS.md,
    },
    dayDetailCard: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      marginBottom: 16,
    },
    dayDetailTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
    },
    dayLoading: {
      paddingVertical: 24,
    },
    daySection: {
      marginBottom: 16,
    },
    daySectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    daySectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    trackItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      gap: 12,
    },
    trackItemFlex: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    trackArtwork: {
      width: 44,
      height: 44,
      borderRadius: BORDER_RADIUS.sm,
    },
    trackArtworkPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    trackInfo: {
      flex: 1,
    },
    trackTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
    trackMeta: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    trackMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    moreText: {
      fontSize: 12,
      color: colors.text.tertiary,
      textAlign: 'center',
      paddingVertical: 8,
    },
    scheduledTrackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    repeatBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.social.gold + '26',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    repeatBadgeText: {
      fontSize: 10,
      color: colors.activity.scheduled,
      fontWeight: '500',
    },
    editScheduleButton: {
      padding: 8,
    },
    alarmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    alarmInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    deleteAlarmButton: {
      padding: 8,
    },
    emptyDay: {
      alignItems: 'center',
      paddingVertical: 24,
      gap: 8,
    },
    emptyDayText: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
    alarmsSection: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      marginBottom: 16,
    },
    alarmsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    alarmsSectionTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    alarmCount: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.brand.primary,
      backgroundColor: 'rgba(139, 92, 246, 0.15)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: 'hidden',
    },
    compactAlarmContainer: {
      backgroundColor: colors.background.surfaceLight,
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
    },
    compactAlarmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    compactAlarmRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    compactAlarmLeft: {
      flexDirection: 'column',
      gap: 4,
    },
    compactAlarmTime: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      letterSpacing: -0.5,
    },
    compactAlarmDays: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    compactDayDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.subtle,
    },
    compactDayDotActive: {
      backgroundColor: colors.brand.primary,
    },
    compactDayText: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    compactDayTextActive: {
      color: colors.absolute.white,
    },
    compactRepeatLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.brand.primary,
    },
    compactAlarmRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    compactTrackInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 120,
    },
    compactTrackArtwork: {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.xs,
    },
    compactTrackArtworkPlaceholder: {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.xs,
      backgroundColor: colors.background.darkCard,
      justifyContent: 'center',
      alignItems: 'center',
    },
    compactTrackTitle: {
      flex: 1,
      fontSize: 12,
      color: colors.text.secondary,
    },
    compactDeleteButton: {
      padding: 4,
    },
    lockedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingVertical: 48,
    },
    lockedIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.background.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    lockedTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 12,
    },
    lockedDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    upgradeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.brand.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },
    upgradeButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
