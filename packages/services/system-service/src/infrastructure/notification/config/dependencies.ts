/**
 * Dependency Configuration for System Notification Service
 */

import { NotificationApplicationService } from '../../../application/use-cases/notification/NotificationApplicationService';
import { EmailNotificationProvider } from '../providers/EmailNotificationProvider';
import { PushNotificationProvider } from '../providers/PushNotificationProvider';
import { InAppNotificationProvider } from '../providers/InAppNotificationProvider';
import { INotificationProvider } from '../../../application/use-cases/notification/INotificationProvider';

export interface Dependencies {
  notificationApplicationService: NotificationApplicationService;
}

export function configureDependencies(): Dependencies {
  const notificationProviders = new Map<string, INotificationProvider>();
  notificationProviders.set('email', new EmailNotificationProvider());
  notificationProviders.set('push', new PushNotificationProvider());
  notificationProviders.set('in-app', new InAppNotificationProvider());

  const notificationApplicationService = new NotificationApplicationService();

  return {
    notificationApplicationService,
  };
}
