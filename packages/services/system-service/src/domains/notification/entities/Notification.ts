import { NOTIFICATION_STATUS, type NotificationStatus } from '@aiponge/shared-contracts';

export class Notification {
  constructor(
    public id: string,
    public userId: string,
    public type: string,
    public title: string,
    public message: string,
    public channel: string,
    public status: NotificationStatus,
    public priority: string,
    public data: Record<string, unknown>,
    public scheduledFor?: Date,
    public expiresAt?: Date,
    public readAt?: Date,
    public sentAt?: Date,
    public failedAt?: Date,
    public errorMessage?: string,
    public retryCount: number = 0,
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  // Business logic methods
  isRead(): boolean {
    return this.readAt !== undefined;
  }

  isExpired(): boolean {
    return this.expiresAt !== undefined && this.expiresAt < new Date();
  }

  isPending(): boolean {
    return this.status === NOTIFICATION_STATUS.PENDING;
  }

  isScheduled(): boolean {
    return this.scheduledFor !== undefined && this.scheduledFor > new Date();
  }

  canBeSent(): boolean {
    return this.status === NOTIFICATION_STATUS.PENDING && !this.isExpired() && !this.isScheduled();
  }

  markAsRead(): void {
    this.status = NOTIFICATION_STATUS.READ;
    this.readAt = new Date();
    this.updatedAt = new Date();
  }

  markAsSent(): void {
    this.status = NOTIFICATION_STATUS.SENT;
    this.sentAt = new Date();
    this.updatedAt = new Date();
  }

  markAsDelivered(): void {
    this.status = NOTIFICATION_STATUS.DELIVERED;
    this.updatedAt = new Date();
  }

  markAsFailed(errorMessage: string): void {
    this.status = NOTIFICATION_STATUS.FAILED;
    this.failedAt = new Date();
    this.errorMessage = errorMessage;
    this.retryCount++;
    this.updatedAt = new Date();
  }

  canRetry(maxRetries: number = 3): boolean {
    return this.status === NOTIFICATION_STATUS.FAILED && this.retryCount < maxRetries;
  }

  resetForRetry(): void {
    this.status = NOTIFICATION_STATUS.PENDING;
    this.failedAt = undefined;
    this.errorMessage = undefined;
    this.updatedAt = new Date();
  }
}
