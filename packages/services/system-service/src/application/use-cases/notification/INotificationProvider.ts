/**
 * Notification Provider Interface
 * Abstracts different notification delivery mechanisms
 */

export interface NotificationDeliveryRequest {
  to: string;
  title: string;
  body: string;
  actionUrl?: string;
  artworkUrl?: string;
  data?: Record<string, unknown>;
}

export interface NotificationDeliveryResponse {
  success: boolean;
  deliveryId?: string;
  error?: string;
}

export interface INotificationProvider {
  send(request: NotificationDeliveryRequest): Promise<NotificationDeliveryResponse>;
  getType(): string;
  isAvailable(): boolean;
}
