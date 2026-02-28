/**
 * Notification Channel Entity
 * Domain entity for notification channel management
 */

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationChannelEntity {
  constructor(private channel: NotificationChannel) {}

  get id(): string {
    return this.channel.id;
  }

  get name(): string {
    return this.channel.name;
  }

  get type(): 'email' | 'slack' | 'webhook' | 'sms' {
    return this.channel.type;
  }

  get config(): Record<string, unknown> {
    return { ...this.channel.config };
  }

  get isEnabled(): boolean {
    return this.channel.isEnabled;
  }

  get createdAt(): Date {
    return this.channel.createdAt;
  }

  get updatedAt(): Date {
    return this.channel.updatedAt;
  }

  canSendNotification(): boolean {
    return this.isEnabled && this.hasValidConfig();
  }

  private hasValidConfig(): boolean {
    switch (this.channel.type) {
      case 'email':
        return !!(this.channel.config.recipients && Array.isArray(this.channel.config.recipients));
      case 'slack':
        return !!(this.channel.config.webhook_url || this.channel.config.channel);
      case 'webhook':
        return !!this.channel.config.url;
      case 'sms':
        return !!(this.channel.config.phone_numbers && Array.isArray(this.channel.config.phone_numbers));
      default:
        return false;
    }
  }

  updateConfig(config: Record<string, unknown>): NotificationChannel {
    return {
      ...this.channel,
      config: { ...this.channel.config, ...config },
      updatedAt: new Date(),
    };
  }

  enable(): NotificationChannel {
    return {
      ...this.channel,
      isEnabled: true,
      updatedAt: new Date(),
    };
  }

  disable(): NotificationChannel {
    return {
      ...this.channel,
      isEnabled: false,
      updatedAt: new Date(),
    };
  }
}
