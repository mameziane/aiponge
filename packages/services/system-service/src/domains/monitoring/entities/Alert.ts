/**
 * Alert Entity
 * Core domain entity for alert management
 */

import {
  ALERT_STATUS,
  ALERT_SEVERITY,
  type AlertStatusValue,
  type AlertSeverityValue,
} from '@aiponge/shared-contracts';

export type AlertSeverity = AlertSeverityValue;
export type AlertStatus = AlertStatusValue;

export interface Alert {
  id: string;
  serviceName: string;
  healthCheckId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  errorDetails?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  escalatedAt?: Date;
}

export class AlertEntity {
  constructor(private alert: Alert) {}

  get id(): string {
    return this.alert.id;
  }

  get serviceName(): string {
    return this.alert.serviceName;
  }

  get severity(): AlertSeverity {
    return this.alert.severity;
  }

  get status(): AlertStatus {
    return this.alert.status;
  }

  get title(): string {
    return this.alert.title;
  }

  get message(): string {
    return this.alert.message;
  }

  get createdAt(): Date {
    return this.alert.createdAt;
  }

  isActive(): boolean {
    return this.alert.status === ALERT_STATUS.ACTIVE;
  }

  isCritical(): boolean {
    return this.alert.severity === ALERT_SEVERITY.CRITICAL;
  }

  shouldEscalate(escalationMinutes: number): boolean {
    if (this.alert.status !== ALERT_STATUS.ACTIVE || this.alert.escalatedAt) {
      return false;
    }

    const now = new Date();
    const timeSinceCreated = now.getTime() - this.alert.createdAt.getTime();
    const escalationThreshold = escalationMinutes * 60 * 1000;

    return timeSinceCreated >= escalationThreshold;
  }

  acknowledge(): Alert {
    return {
      ...this.alert,
      status: ALERT_STATUS.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
    };
  }

  resolve(): Alert {
    return {
      ...this.alert,
      status: ALERT_STATUS.RESOLVED,
      resolvedAt: new Date(),
    };
  }

  escalate(): Alert {
    return {
      ...this.alert,
      status: ALERT_STATUS.ESCALATED,
      escalatedAt: new Date(),
    };
  }
}

// AlertRuleEntity moved to separate file for better granularity
