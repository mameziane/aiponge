import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const REMINDER_QUERY_KEYS = [
  '/api/v1/app/activity/calendar',
  '/api/v1/app/activity/alarms',
  '/api/v1/app/library/private',
];

/**
 * Reminder CRUD operations using the /api/app/library/schedules API.
 *
 * Supports:
 * - Create: POST /api/app/library/schedules
 * - Update: PATCH /api/app/library/schedules/:id (atomic update, preserves ID)
 * - Delete: DELETE /api/app/library/schedules/:id
 */

export interface ReminderData {
  id?: string;
  trackId: string;
  baseDate: string;
  repeatType: RepeatType;
  notifyEnabled?: boolean;
  autoPlayEnabled?: boolean;
}

interface CreateReminderParams {
  userTrackId: string;
  baseDate: string;
  repeatType: RepeatType;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timezone: string;
  notifyEnabled?: boolean;
  autoPlayEnabled?: boolean;
}

export function useCreateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateReminderParams) => {
      const response = await apiClient.post<ServiceResponse<{ id: string }>>('/api/v1/app/library/schedules', params);

      if (response?.success === false || response?.error) {
        throw new Error(response?.error?.message || 'Failed to create reminder');
      }

      return response;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'REMINDER_UPDATED' });
      logger.debug('[useReminders] Reminder created successfully');
    },
    onError: error => {
      logger.error('[useReminders] Failed to create reminder', error);
    },
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reminderId,
      ...params
    }: { reminderId: string } & Partial<Omit<CreateReminderParams, 'userTrackId'>>) => {
      const response = await apiClient.patch<ServiceResponse<{ id: string }>>(
        `/api/v1/app/library/schedules/${reminderId}`,
        params
      );

      if (response?.success === false || response?.error) {
        throw new Error(response?.error?.message || 'Failed to update reminder');
      }

      return response;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'REMINDER_UPDATED' });
      logger.debug('[useReminders] Reminder updated successfully');
    },
    onError: error => {
      logger.error('[useReminders] Failed to update reminder', error);
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reminderId: string) => {
      await apiClient.delete(`/api/v1/app/library/schedules/${reminderId}`);
      return reminderId;
    },
    onSuccess: reminderId => {
      invalidateOnEvent(queryClient, { type: 'REMINDER_UPDATED' });
      logger.debug('[useReminders] Reminder deleted', { reminderId });
    },
    onError: (error: unknown) => {
      if ((error as { statusCode?: number })?.statusCode !== 404) {
        logger.error('[useReminders] Failed to delete reminder', error);
      }
    },
  });
}

export function buildReminderParams(
  trackId: string,
  date: Date,
  time: Date,
  repeatType: RepeatType,
  options?: { notifyEnabled?: boolean; autoPlayEnabled?: boolean }
): CreateReminderParams {
  const combinedDateTime = new Date(date);
  combinedDateTime.setHours(time.getHours(), time.getMinutes(), 0, 0);

  return {
    userTrackId: trackId,
    baseDate: combinedDateTime.toISOString(),
    repeatType,
    dayOfWeek: repeatType === 'weekly' ? combinedDateTime.getDay() : null,
    dayOfMonth: repeatType === 'monthly' ? combinedDateTime.getDate() : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    notifyEnabled: options?.notifyEnabled ?? true,
    autoPlayEnabled: options?.autoPlayEnabled ?? false,
  };
}
