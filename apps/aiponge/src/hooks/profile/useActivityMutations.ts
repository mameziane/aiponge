import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/axiosApiClient';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { logger } from '../../lib/logger';

export interface AlarmData {
  id: string;
  userTrackId: string;
  baseDate: string;
  repeatType: 'once' | 'weekly' | 'monthly' | 'yearly';
  dayOfWeek?: number;
  trackTitle: string;
  trackArtworkUrl?: string;
}

interface DeleteAlarmContext {
  previousAlarms: AlarmData[] | undefined;
}

const DELETION_GUARD_TTL_MS = 30000;

export interface ScheduleData {
  id: string;
  userTrackId: string;
  baseDate: string;
  repeatType: 'once' | 'weekly' | 'monthly' | 'yearly';
  dayOfWeek?: number;
  trackId?: string;
  trackTitle?: string;
}

interface DeleteScheduleContext {
  previousDayData: Map<string, unknown>;
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  const deletedIdsRef = useRef<Map<string, number>>(new Map());

  const cleanupExpiredIds = () => {
    const now = Date.now();
    for (const [id, timestamp] of deletedIdsRef.current.entries()) {
      if (now - timestamp > DELETION_GUARD_TTL_MS) {
        deletedIdsRef.current.delete(id);
      }
    }
  };

  return useMutation<void, Error, string, DeleteScheduleContext>({
    mutationFn: async (scheduleId: string) => {
      cleanupExpiredIds();

      if (deletedIdsRef.current.has(scheduleId)) {
        return;
      }

      deletedIdsRef.current.set(scheduleId, Date.now());
      await apiClient.delete(`/api/v1/app/library/schedules/${scheduleId}`);
    },
    onMutate: async scheduleId => {
      // Cancel any day queries to prevent overwriting optimistic update
      const activityDayBase = queryKeys.activity.all[0];
      await queryClient.cancelQueries({
        predicate: query => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === activityDayBase && key[1] === 'day';
        },
      });

      // Snapshot all day caches for rollback
      const previousDayData = new Map<string, unknown>();
      queryClient
        .getQueriesData({
          predicate: query => {
            const key = query.queryKey;
            return Array.isArray(key) && key[0] === activityDayBase && key[1] === 'day';
          },
        })
        .forEach(([key, data]) => {
          previousDayData.set(JSON.stringify(key), data);
        });

      // Optimistically remove schedule from all day caches
      queryClient.setQueriesData(
        {
          predicate: query => {
            const key = query.queryKey;
            return Array.isArray(key) && key[0] === activityDayBase && key[1] === 'day';
          },
        },
        (old: { data?: { tracksScheduled?: Array<{ scheduleId: string }> } } | undefined) => {
          if (!old?.data?.tracksScheduled) return old;
          return {
            ...old,
            data: {
              ...old.data,
              tracksScheduled: old.data.tracksScheduled.filter(track => track.scheduleId !== scheduleId),
            },
          };
        }
      );

      return { previousDayData };
    },
    onError: (err, scheduleId, context) => {
      const is404 = err.message?.includes('404') || (err as { statusCode?: number }).statusCode === 404;

      if (is404) {
        return;
      }

      deletedIdsRef.current.delete(scheduleId);

      // Rollback all day caches
      if (context?.previousDayData) {
        context.previousDayData.forEach((data, keyStr) => {
          try {
            const key = JSON.parse(keyStr);
            queryClient.setQueryData(key, data);
          } catch (e) {
            logger.warn('[ActivityMutations] Failed to parse cache key for rollback', { keyStr, error: e });
          }
        });
      }
    },
    onSuccess: async () => {
      invalidateOnEvent(queryClient, { type: 'ACTIVITY_SCHEDULE_DELETED' });
    },
  });
}

export function useDeleteAlarm() {
  const queryClient = useQueryClient();
  const deletedIdsRef = useRef<Map<string, number>>(new Map());

  const cleanupExpiredIds = () => {
    const now = Date.now();
    for (const [id, timestamp] of deletedIdsRef.current.entries()) {
      if (now - timestamp > DELETION_GUARD_TTL_MS) {
        deletedIdsRef.current.delete(id);
      }
    }
  };

  return useMutation<void, Error, string, DeleteAlarmContext>({
    mutationFn: async (alarmId: string) => {
      cleanupExpiredIds();

      if (deletedIdsRef.current.has(alarmId)) {
        return;
      }

      deletedIdsRef.current.set(alarmId, Date.now());
      await apiClient.delete(`/api/v1/app/activity/alarms/${alarmId}`);
    },
    onMutate: async alarmId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.activity.alarms() });

      const previousAlarms = queryClient.getQueryData<AlarmData[]>(queryKeys.activity.alarms());

      queryClient.setQueryData<AlarmData[]>(
        queryKeys.activity.alarms(),
        old => old?.filter(alarm => alarm.id !== alarmId) ?? []
      );

      return { previousAlarms };
    },
    onError: (err, alarmId, context) => {
      const is404 = err.message?.includes('404') || (err as { statusCode?: number }).statusCode === 404;

      if (is404) {
        return;
      }

      deletedIdsRef.current.delete(alarmId);

      if (context?.previousAlarms) {
        queryClient.setQueryData(queryKeys.activity.alarms(), context.previousAlarms);
      }
    },
    onSuccess: async () => {
      invalidateOnEvent(queryClient, { type: 'ACTIVITY_ALARM_DELETED' });
    },
  });
}
