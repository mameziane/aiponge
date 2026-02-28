/**
 * System Service - Types and Exports Index
 * Central export for system service components
 */

// Discovery exports
export { ServiceDiscoveryManager } from './application/use-cases/discovery/ServiceDiscoveryManager';
// Import from platform-core via project reference
import { ServiceRegistrationClient, getServicePort } from '@aiponge/platform-core';
export { ServiceRegistrationClient };

// Monitoring exports
export { MonitoringOrchestrator } from './application/use-cases/monitoring/MonitoringOrchestrator';

// Notification exports
export { NotificationApplicationService } from './application/use-cases/notification/NotificationApplicationService';
export { EmailNotificationProvider } from './infrastructure/notification/providers/EmailNotificationProvider';
export { InAppNotificationProvider } from './infrastructure/notification/providers/InAppNotificationProvider';
export { PushNotificationProvider } from './infrastructure/notification/providers/PushNotificationProvider';
export { getServicePort };

// Types
export interface SystemServiceConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  database: {
    url: string;
  };
  services: {
    discovery: boolean;
    monitoring: boolean;
    notifications: boolean;
  };
}

export interface ServiceRegistration {
  name: string;
  host: string;
  port: number;
  healthEndpoint?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationConfig {
  email?: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
  };
  sms?: {
    provider: 'twilio';
    config: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
    };
  };
  push?: {
    vapidKeys: {
      publicKey: string;
      privateKey: string;
    };
  };
}
