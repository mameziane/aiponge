import { Alert } from '../entities/Alert';
import { AlertRule } from '../entities/AlertRule';
import { NotificationChannel } from '../entities/NotificationChannel';

export interface CreateAlertRequest {
  serviceName: string;
  alertRuleId?: string;
  healthCheckId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  errorDetails?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAlertRuleRequest {
  serviceName: string;
  checkType: string;
  condition: 'response_time' | 'consecutive_failures' | 'success_rate' | 'availability';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldownMinutes?: number;
  escalationMinutes?: number;
  notificationChannels?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateNotificationChannelRequest {
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, unknown>;
  isEnabled?: boolean;
}

export interface UpdateAlertRequest {
  status?: 'active' | 'acknowledged' | 'resolved' | 'escalated';
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  escalatedAt?: Date;
}

export interface UpdateAlertRuleRequest {
  threshold?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  isEnabled?: boolean;
  cooldownMinutes?: number;
  escalationMinutes?: number;
  notificationChannels?: string[];
  metadata?: Record<string, unknown>;
}

export interface AlertMetrics {
  totalAlerts: number;
  activeAlerts: number;
  criticalAlerts: number;
  alertsByService: Record<string, number>;
  alertsBySeverity: Record<string, number>;
  averageResolutionTime: number;
  escalationRate: number;
}

export interface IAlertRepository {
  // Alert management
  createAlert(request: CreateAlertRequest): Promise<Alert>;
  findAlertById(id: string): Promise<Alert | null>;
  findActiveAlerts(): Promise<Alert[]>;
  findAlertsByService(serviceName: string): Promise<Alert[]>;
  findAlertsBySeverity(severity: string): Promise<Alert[]>;
  updateAlert(id: string, request: UpdateAlertRequest): Promise<Alert>;
  deleteAlert(id: string): Promise<void>;

  // Alert rules management
  createAlertRule(request: CreateAlertRuleRequest): Promise<AlertRule>;
  findAlertRuleById(id: string): Promise<AlertRule | null>;
  findAlertRulesByService(serviceName: string): Promise<AlertRule[]>;
  findEnabledAlertRules(): Promise<AlertRule[]>;
  updateAlertRule(id: string, request: UpdateAlertRuleRequest): Promise<AlertRule>;
  deleteAlertRule(id: string): Promise<void>;

  // Notification channels management
  createNotificationChannel(request: CreateNotificationChannelRequest): Promise<NotificationChannel>;
  findNotificationChannelById(id: string): Promise<NotificationChannel | null>;
  findAllNotificationChannels(): Promise<NotificationChannel[]>;
  findEnabledNotificationChannels(): Promise<NotificationChannel[]>;
  updateNotificationChannel(
    id: string,
    request: Partial<CreateNotificationChannelRequest>
  ): Promise<NotificationChannel>;
  deleteNotificationChannel(id: string): Promise<void>;

  // Alert metrics and analytics
  getAlertMetrics(timeWindow: 'hour' | 'day' | 'week' | 'month'): Promise<AlertMetrics>;
  getLastAlertTime(serviceName: string, ruleId: string): Promise<Date | null>;
  findAlertsForEscalation(): Promise<Alert[]>;

  // Alert history and cleanup
  findRecentAlerts(limit: number): Promise<Alert[]>;
  cleanupResolvedAlerts(olderThanDays: number): Promise<number>;
}
