import { useState, useMemo, useCallback, type ComponentProps } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { getApiGatewayUrl } from '../../lib/apiConfig';
import { EditTrackModal } from '../../components/music/EditTrackModal';
import { useAuthStore, selectUser } from '../../auth/store';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { LoadingState } from '../../components/shared';
import { LiquidGlassCard } from '../../components/ui';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { logger } from '../../lib/logger';

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

interface TrackForEdit {
  id: string;
  title: string;
  displayName?: string;
}

export function ActivityCalendarScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);
  const displayName = user?.name || 'You';
  const { tierConfig } = useSubscriptionData();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<TrackForEdit | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Paid tier feature gate
  if (!tierConfig.canAccessActivityCalendar) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} testID="button-back">
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('activityCalendar.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.lockedContainer}>
          <View style={styles.lockedIconContainer}>
            <Ionicons name="lock-closed" size={48} color={colors.text.tertiary} />
          </View>
          <Text style={styles.lockedTitle}>{t('activityCalendar.premiumRequired')}</Text>
          <Text style={styles.lockedDescription}>{t('activityCalendar.premiumDescription')}</Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push('/paywall')}
            testID="button-upgrade"
          >
            <Ionicons name="star" size={20} color={colors.text.primary} />
            <Text style={styles.upgradeButtonText}>{t('common.upgrade')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const {
    data: activityData,
    isLoading,
    isError,
    refetch,
  } = useQuery<CalendarActivityResponse>({
    queryKey: queryKeys.activity.calendar(),
    queryFn: async (): Promise<CalendarActivityResponse> => {
      const response = await apiClient.get<Record<string, unknown>>('/api/v1/app/activity/calendar');
      logger.debug('[ActivityCalendar] Raw API response', {
        data: JSON.stringify(response.data),
      });
      const rawData = response.data as Record<string, unknown>;
      if (rawData.data) {
        return rawData as unknown as CalendarActivityResponse;
      }
      return { success: true, data: rawData } as CalendarActivityResponse;
    },
    staleTime: QUERY_STALE_TIME.long,
  });

  const {
    data: dayDetail,
    isLoading: isDayLoading,
    isError: isDayError,
  } = useQuery<DayDetailResponse>({
    queryKey: queryKeys.activity.day(selectedDate ?? undefined),
    enabled: !!selectedDate,
    queryFn: async (): Promise<DayDetailResponse> => {
      logger.debug('[ActivityCalendar] Fetching day details', { selectedDate });
      const response = await apiClient.get<Record<string, unknown>>(`/api/v1/app/activity/day/${selectedDate}`);
      logger.debug('[ActivityCalendar] Day detail raw response', {
        data: JSON.stringify(response.data),
      });
      const rawData = response.data as Record<string, unknown>;
      if (rawData.data) {
        return rawData as unknown as DayDetailResponse;
      }
      return { success: true, data: rawData } as DayDetailResponse;
    },
  });

  const markedDates = useMemo(() => {
    if (!activityData?.data?.activities) {
      logger.debug('[ActivityCalendar] No activities data');
      return {};
    }

    logger.debug('[ActivityCalendar] Processing activities', {
      count: activityData.data.activities.length,
    });

    const marks: Record<
      string,
      { dots?: Array<{ key: string; color: string }>; selected: boolean; selectedColor: string }
    > = {};

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
        logger.debug('[ActivityCalendar] Scheduled date found', {
          date: activity.date,
          tracksScheduled: activity.tracksScheduled,
        });
      }

      marks[activity.date] = {
        dots,
        selected: activity.date === selectedDate,
        selectedColor: colors.overlay.purple[40],
      };
    });

    if (selectedDate && !marks[selectedDate]) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: colors.overlay.purple[40],
      };
    }

    logger.debug('[ActivityCalendar] Marked dates count', {
      count: Object.keys(marks).length,
    });
    logger.debug('[ActivityCalendar] Sample marks', {
      samples: JSON.stringify(Object.entries(marks).slice(0, 3)),
    });

    return marks;
  }, [activityData, selectedDate]);

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

  const getRepeatIcon = (repeatType?: string): string => {
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
    (track: { id: string; title: string }) => {
      setEditingTrack({
        id: track.id,
        title: track.title,
        displayName: displayName,
      });
      setShowEditModal(true);
    },
    [displayName]
  );

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingTrack(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    invalidateOnEvent(queryClient, { type: 'ACTIVITY_CALENDAR_UPDATED', date: selectedDate || undefined });
  }, [queryClient, selectedDate]);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <LoadingState fullScreen={false} message={t('activityCalendar.loading')} />
        ) : isError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.semantic.error} />
            <Text style={styles.errorText}>{t('activityCalendar.loadError')}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()} testID="button-retry">
              <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <LiquidGlassCard intensity="medium" padding={20} style={styles.summaryCard}>
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
            </LiquidGlassCard>

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
            </View>

            <LiquidGlassCard intensity="light" padding={12} style={styles.calendarContainer}>
              {Calendar ? (
                <Calendar
                  markingType="multi-dot"
                  markedDates={markedDates}
                  onDayPress={handleDayPress}
                  theme={{
                    backgroundColor: 'transparent',
                    calendarBackground: 'transparent',
                    textSectionTitleColor: colors.text.secondary,
                    selectedDayBackgroundColor: colors.brand.primary,
                    selectedDayTextColor: colors.absolute.white,
                    todayTextColor: colors.semantic.success,
                    todayBackgroundColor: colors.semantic.successLight,
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
                <Text style={{ color: colors.text.secondary, textAlign: 'center', padding: 20 }}>
                  Calendar not available
                </Text>
              )}
            </LiquidGlassCard>

            {selectedDate && (
              <LiquidGlassCard intensity="medium" padding={20} style={styles.dayDetailCard}>
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
                            onPress={() => {
                              const trackData = {
                                id: track.id,
                                title: track.title,
                                artworkUrl: track.artworkUrl,
                                fileUrl: track.fileUrl,
                                duration: track.durationSeconds,
                                lyricsId: track.lyricsId,
                                displayName: displayName,
                              };
                              router.push(
                                `/private-track-detail?track=${encodeURIComponent(JSON.stringify(trackData))}`
                              );
                            }}
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
                            onPress={() => {
                              const trackData = {
                                id: track.trackId,
                                title: track.title,
                                artworkUrl: track.artworkUrl,
                                fileUrl: track.fileUrl,
                                lyricsId: track.lyricsId,
                                displayName: displayName,
                              };
                              router.push(
                                `/private-track-detail?track=${encodeURIComponent(JSON.stringify(trackData))}`
                              );
                            }}
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

                    {dayDetail?.data?.tracksScheduled && dayDetail.data.tracksScheduled.length > 0 && (
                      <View style={styles.daySection}>
                        <View style={styles.daySectionHeader}>
                          <Ionicons name="time" size={18} color={colors.activity.scheduled} />
                          <Text style={styles.daySectionTitle}>
                            {t('activityCalendar.scheduledTracks')} ({dayDetail.data.tracksScheduled.length})
                          </Text>
                        </View>
                        {dayDetail.data.tracksScheduled.map((track, index) => (
                          <View key={track.scheduleId || `${track.id}-${index}`} style={styles.scheduledTrackRow}>
                            <TouchableOpacity
                              style={styles.trackItemFlex}
                              onPress={() => {
                                const trackData = {
                                  id: track.id,
                                  title: track.title,
                                  artworkUrl: track.artworkUrl,
                                  fileUrl: track.fileUrl,
                                  duration: track.durationSeconds,
                                  lyricsId: track.lyricsId,
                                  displayName: displayName,
                                };
                                router.push(
                                  `/private-track-detail?track=${encodeURIComponent(JSON.stringify(trackData))}`
                                );
                              }}
                              testID={`track-scheduled-${track.id}`}
                            >
                              {resolveImageUrl(track.artworkUrl) ? (
                                <Image
                                  source={{ uri: resolveImageUrl(track.artworkUrl)! }}
                                  style={styles.trackArtwork}
                                />
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
                                        name={
                                          getRepeatIcon(track.repeatType) as ComponentProps<typeof Ionicons>['name']
                                        }
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

                    {!dayDetail?.data?.tracksCreated?.length &&
                      !dayDetail?.data?.tracksListened?.length &&
                      !dayDetail?.data?.tracksScheduled?.length && (
                        <View style={styles.emptyDay}>
                          <Ionicons name="calendar-outline" size={32} color={colors.text.tertiary} />
                          <Text style={styles.emptyDayText}>{t('activityCalendar.noActivity')}</Text>
                        </View>
                      )}
                  </>
                )}
              </LiquidGlassCard>
            )}
          </>
        )}
      </ScrollView>

      {editingTrack && (
        <EditTrackModal
          visible={showEditModal}
          onClose={handleCloseEditModal}
          track={editingTrack}
          onSave={handleSaveEdit}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    scrollView: commonStyles.flexOne,
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    errorText: {
      marginTop: 12,
      color: colors.text.secondary,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
    },
    retryButtonText: {
      color: colors.text.primary,
      fontWeight: '600',
      fontSize: 14,
    },
    summaryCard: {
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
      flex: 1,
    },
    statValue: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.brand.primary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 4,
      textAlign: 'center',
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border.primary,
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
      gap: 8,
    },
    legendDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    legendText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    calendarContainer: {
      marginBottom: 16,
    },
    calendar: {
      borderRadius: BORDER_RADIUS.md,
    },
    dayDetailCard: {},
    dayDetailTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
    },
    dayLoading: {
      paddingVertical: 20,
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
      backgroundColor: colors.overlay.black[20],
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    scheduledTrackRow: {
      backgroundColor: colors.overlay.black[20],
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    trackItemFlex: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    editScheduleButton: {
      padding: 8,
      marginLeft: 8,
    },
    trackArtwork: {
      width: 44,
      height: 44,
      borderRadius: 6,
      marginRight: 12,
    },
    trackArtworkPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 6,
      marginRight: 12,
      backgroundColor: colors.background.secondary,
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
      marginBottom: 4,
    },
    trackMeta: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    trackMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    repeatBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.semantic.warningLight,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      gap: 4,
    },
    repeatBadgeText: {
      fontSize: 10,
      color: colors.activity.scheduled,
      fontWeight: '500',
    },
    moreText: {
      fontSize: 12,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 4,
    },
    emptyDay: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    emptyDayText: {
      marginTop: 8,
      fontSize: 14,
      color: colors.text.tertiary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    lockedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
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
