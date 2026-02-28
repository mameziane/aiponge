export interface Reminder {
  id: string;
  userId: string;
  reminderType: string;
  title: string;
  enabled: boolean;
  timezone: string;
  timeOfDay: string;
  repeatType: string;
  daysOfWeek: number[] | null;
  dayOfMonth: number | null;
  baseDate: Date | null;
  notifyEnabled: boolean;
  autoPlayEnabled: boolean;
  prompt: string | null;
  bookId: string | null;
  trackId: string | null;
  userTrackId: string | null;
  trackTitle: string | null;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertReminder {
  userId: string;
  reminderType: string;
  title: string;
  enabled?: boolean;
  timezone?: string;
  timeOfDay: string;
  repeatType?: string;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  baseDate?: Date | null;
  notifyEnabled?: boolean;
  autoPlayEnabled?: boolean;
  prompt?: string | null;
  bookId?: string | null;
  trackId?: string | null;
  userTrackId?: string | null;
  trackTitle?: string | null;
}

export interface UpdateReminder {
  reminderType?: string;
  title?: string;
  enabled?: boolean;
  timezone?: string;
  timeOfDay?: string;
  repeatType?: string;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  baseDate?: Date | null;
  notifyEnabled?: boolean;
  autoPlayEnabled?: boolean;
  prompt?: string | null;
  bookId?: string | null;
  trackId?: string | null;
  userTrackId?: string | null;
  trackTitle?: string | null;
}

export interface ExpoPushToken {
  id: string;
  userId: string;
  token: string;
  deviceId: string | null;
  platform: string | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertExpoPushToken {
  userId: string;
  token: string;
  deviceId?: string | null;
  platform?: string | null;
  isActive?: boolean;
}
