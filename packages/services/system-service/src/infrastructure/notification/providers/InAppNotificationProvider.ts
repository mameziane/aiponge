/**
 * In-App Notification Provider
 * Mock implementation for in-app notifications
 */

import {
  INotificationProvider,
  NotificationDeliveryRequest,
  NotificationDeliveryResponse,
} from '../../../application/use-cases/notification/INotificationProvider';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('system-service-inappnotificationprovider');

export class InAppNotificationProvider implements INotificationProvider {
  getType(): string {
    return 'in-app';
  }

  isAvailable(): boolean {
    return true;
  }

  async send(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResponse> {
    try {
      logger.info(`🔔 [IN-APP] Sending to: ${request.to}`, {
        module: 'system_service_inapp_notification_provider',
        operation: 'send',
        recipient: request.to,
        title: request.title,
        body: request.body,
        phase: 'inapp_notification_sending',
      });

      // In-app notifications are always instant
      const deliveryId = `inapp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      return {
        success: true,
        deliveryId,
      };
    } catch (error) {
      logger.error('[InAppNotificationProvider] Failed:', {
        module: 'system_service_inapp_notification_provider',
        operation: 'send',
        error: error instanceof Error ? error.message : String(error),
        phase: 'inapp_notification_failed',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'In-app notification delivery failed',
      };
    }
  }
}
