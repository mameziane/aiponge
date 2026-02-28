/**
 * Alert Rule Entity
 * Domain entity for alert rule management
 */

import { ALERT_STATUS, type AlertSeverityValue, type AlertStatusValue } from '@aiponge/shared-contracts';

export type AlertSeverity = AlertSeverityValue;
export type AlertCondition = 'response_time' | 'consecutive_failures' | 'success_rate' | 'availability';

export interface AlertRule {
  id: string;
  serviceName: string;
  checkType: string;
  condition: AlertCondition;
  threshold: number;
  severity: AlertSeverity;
  isEnabled: boolean;
  cooldownMinutes: number;
  escalationMinutes: number | null;
  notificationChannels: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  id: string;
  serviceName: string;
  healthCheckId: string;
  severity: AlertSeverity;
  status: AlertStatusValue;
  title: string;
  message: string;
  errorDetails?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  escalatedAt?: Date;
}

export class AlertRuleEntity {
  constructor(private rule: AlertRule) {}

  get id(): string {
    return this.rule.id;
  }

  get serviceName(): string {
    return this.rule.serviceName;
  }

  get condition(): AlertCondition {
    return this.rule.condition;
  }

  get threshold(): number {
    return this.rule.threshold;
  }

  get severity(): AlertSeverity {
    return this.rule.severity;
  }

  get cooldownMinutes(): number {
    return this.rule.cooldownMinutes;
  }

  get escalationMinutes(): number | null {
    return this.rule.escalationMinutes;
  }

  get notificationChannels(): string[] {
    return this.rule.notificationChannels;
  }

  isEnabled(): boolean {
    return this.rule.isEnabled;
  }

  shouldTrigger(value: number, lastAlertTime?: Date): boolean {
    if (!this.isEnabled()) {
      return false;
    }

    // Check if we're in cooldown period
    if (lastAlertTime && this.isInCooldown(lastAlertTime)) {
      return false;
    }

    // Check threshold based on condition
    switch (this.rule.condition) {
      case 'response_time':
        return value > this.threshold;
      case 'consecutive_failures':
        return value >= this.threshold;
      case 'success_rate':
        return value < this.threshold;
      case 'availability':
        return value < this.threshold;
      default:
        return false;
    }
  }

  private isInCooldown(lastAlertTime: Date): boolean {
    const now = new Date();
    const timeSinceLastAlert = now.getTime() - lastAlertTime.getTime();
    const cooldownThreshold = this.cooldownMinutes * 60 * 1000;

    return timeSinceLastAlert < cooldownThreshold;
  }

  generateAlert(healthCheckId: string, value: number, context?: Record<string, unknown>): Alert {
    const title = this.generateAlertTitle(value);
    const message = this.generateAlertMessage(value, context);

    return {
      id: '', // Will be set by repository
      serviceName: this.serviceName,
      healthCheckId,
      severity: this.severity,
      status: ALERT_STATUS.ACTIVE,
      title,
      message,
      errorDetails: context?.errorMessage as string | undefined,
      metadata: {
        ruleId: this.id,
        alertRuleId: this.id,
        condition: this.condition,
        threshold: this.threshold,
        actualValue: value,
        healthCheckId,
        ...context,
      },
      createdAt: new Date(),
    };
  }

  private generateAlertTitle(value: number): string {
    const conditionText = this.getConditionText();
    return `${this.severity.toUpperCase()}: ${this.serviceName} ${conditionText}`;
  }

  private generateAlertMessage(value: number, context?: Record<string, unknown>): string {
    const conditionText = this.getConditionText();
    const unit = this.getValueUnit();

    let message = `Service "${this.serviceName}" ${conditionText}. `;
    message += `Current value: ${value}${unit}, Threshold: ${this.threshold}${unit}`;

    if (context?.endpoint) {
      message += ` (Endpoint: ${context.endpoint})`;
    }

    return message;
  }

  private getConditionText(): string {
    switch (this.condition) {
      case 'response_time':
        return 'response time is too high';
      case 'consecutive_failures':
        return 'has consecutive failures';
      case 'success_rate':
        return 'success rate is below threshold';
      case 'availability':
        return 'availability is below threshold';
      default:
        return 'has an issue';
    }
  }

  private getValueUnit(): string {
    switch (this.condition) {
      case 'response_time':
        return 'ms';
      case 'consecutive_failures':
        return '';
      case 'success_rate':
      case 'availability':
        return '%';
      default:
        return '';
    }
  }
}
