export class NotificationPreferenceEntity {
  constructor(
    public id: string,
    public userId: string,
    public type: string,
    public channel: string,
    public isEnabled: boolean,
    public settings: Record<string, unknown>,
    public createdAt: Date,
    public updatedAt: Date
  ) {}

  // Business logic methods
  enable(): void {
    this.isEnabled = true;
    this.updatedAt = new Date();
  }

  disable(): void {
    this.isEnabled = false;
    this.updatedAt = new Date();
  }

  updateSettings(newSettings: Record<string, unknown>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.updatedAt = new Date();
  }

  getSetting(key: string): unknown {
    return this.settings[key];
  }

  setSetting(key: string, value: unknown): void {
    this.settings[key] = value;
    this.updatedAt = new Date();
  }

  removeSetting(key: string): void {
    delete this.settings[key];
    this.updatedAt = new Date();
  }

  shouldReceiveNotification(notificationType: string, channel: string): boolean {
    return this.isEnabled && this.type === notificationType && this.channel === channel;
  }
}
