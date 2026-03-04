import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Reminder CRUD operations using the unified /api/v1/app/reminders API (user-service).
 *
 * Previously pointed at /api/v1/app/library/schedules (music-service) which
 * had no POST/PATCH/DELETE handlers — all create/update/delete calls would 404.
 *
 * Now uses the user-service reminders system which has full CRUD and appears
 * in the Reminders management screen (Settings → Reminders).
 *
 * Supports:
 * - Create: POST /api/v1/app/reminders
 * - Update: PATCH /api/v1/app/reminders/:id
 * - Delete: DELETE /api/v1/app/reminders/:id
 */

export interface ReminderData {
  id?: string;
  trackId: string;
  repeatType: RepeatType;
  notifyEnabled?: boolean;
  autoPlayEnabled?: boolean;
}

/**
 * Matches the CreateReminderSchema validated at the API gateway:
 * - type: required ('listening' for track reminders)
 * - title: required (non-empty string, max 255)
 * - time: required (HH:MM format)
 * - repeatType, daysOfWeek, timezone, etc.: optional
 */
interface CreateReminderParams {
  type: 'listening';
  title: string;
  time: string; // HH:MM format
  repeatType: RepeatType;
  daysOfWeek?: number[];
  timezone: string;
  userTrackId: string;
  trackTitle: string;
  notifyEnabled?: boolean;
  autoPlayEnabled?: boolean;
}

export function useCreateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateReminderParams) => {
      const response = await apiClient.post<ServiceResponse<{ id: string }>>('/api/v1/app/reminders', params);

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
    }: { reminderId: string } & Partial<Omit<CreateReminderParams, 'type' | 'userTrackId'>>) => {
      const response = await apiClient.patch<ServiceResponse<{ id: string }>>(
        `/api/v1/app/reminders/${reminderId}`,
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
      await apiClient.delete(`/api/v1/app/reminders/${reminderId}`);
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

/**
 * Build the payload for creating a track-based listening reminder.
 *
 * Produces a shape that passes the CreateReminderSchema validation:
 * - type: 'listening' (track reminders are always listening type)
 * - title: the track title (shown in the Reminders list)
 * - time: HH:MM format (extracted from the Date object)
 * - daysOfWeek: computed from repeatType and date
 * - userTrackId + trackTitle: link the reminder to the track
 */
export function buildReminderParams(
  trackId: string,
  trackTitle: string,
  date: Date,
  time: Date,
  repeatType: RepeatType,
  options?: { notifyEnabled?: boolean; autoPlayEnabled?: boolean }
): CreateReminderParams {
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Compute daysOfWeek based on repeat type
  let daysOfWeek: number[] | undefined;
  if (repeatType === 'daily') {
    daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  } else if (repeatType === 'weekly') {
    daysOfWeek = [date.getDay()];
  }
  // For 'once', 'monthly', 'yearly' — omit daysOfWeek (backend handles via baseDate)

  return {
    type: 'listening',
    title: trackTitle,
    time: timeStr,
    repeatType,
    daysOfWeek,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userTrackId: trackId,
    trackTitle,
    notifyEnabled: options?.notifyEnabled ?? true,
    autoPlayEnabled: options?.autoPlayEnabled ?? false,
  };
}
