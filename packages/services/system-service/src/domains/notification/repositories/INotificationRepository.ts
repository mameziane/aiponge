import { Notification as NotificationEntity } from '../entities/Notification';
import { NotificationTemplateEntity } from '../entities/NotificationTemplate';
import { NotificationPreferenceEntity } from '../entities/NotificationPreference';

export interface INotificationRepository {
  // Notification operations
  createNotification(notificationData: Partial<NotificationEntity>): Promise<NotificationEntity>;
  getNotificationById(id: string): Promise<NotificationEntity | null>;
  getNotificationsByUser(
    userId: string,
    options?: { status?: string; limit?: number; offset?: number }
  ): Promise<NotificationEntity[]>;
  updateNotification(id: string, updates: Partial<NotificationEntity>): Promise<NotificationEntity | null>;
  deleteNotification(id: string): Promise<boolean>;
  markAsRead(id: string): Promise<boolean>;
  markAllAsReadForUser(userId: string): Promise<number>;
  getPendingNotifications(limit?: number): Promise<NotificationEntity[]>;
  getFailedNotifications(retryLimit: number): Promise<NotificationEntity[]>;

  // Template operations
  createTemplate(templateData: Partial<NotificationTemplateEntity>): Promise<NotificationTemplateEntity>;
  getTemplateById(id: string): Promise<NotificationTemplateEntity | null>;
  getTemplateByTypeAndChannel(type: string, channel: string): Promise<NotificationTemplateEntity | null>;
  getAllTemplates(): Promise<NotificationTemplateEntity[]>;
  updateTemplate(id: string, updates: Partial<NotificationTemplateEntity>): Promise<NotificationTemplateEntity | null>;
  deleteTemplate(id: string): Promise<boolean>;

  // Preference operations
  createPreference(preferenceData: Partial<NotificationPreferenceEntity>): Promise<NotificationPreferenceEntity>;
  getPreferencesByUser(userId: string): Promise<NotificationPreferenceEntity[]>;
  updatePreference(
    id: string,
    updates: Partial<NotificationPreferenceEntity>
  ): Promise<NotificationPreferenceEntity | null>;
}
