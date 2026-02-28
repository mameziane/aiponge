import { eq, and, desc, sql, gte } from 'drizzle-orm';
import {
  alertRules,
  alerts,
  type AlertRule,
  type NewAlertRule,
  type Alert,
  type NewAlert,
} from '../../../schema/system-schema';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('alert-rule-service');

export interface CreateAlertRuleParams {
  name: string;
  description?: string;
  conditionType: string;
  conditionConfig: Record<string, unknown>;
  severity: string;
  isEnabled?: boolean;
  notificationChannels?: unknown[];
  cooldownMinutes?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateAlertRuleParams {
  name?: string;
  description?: string;
  conditionType?: string;
  conditionConfig?: Record<string, unknown>;
  severity?: string;
  isEnabled?: boolean;
  notificationChannels?: unknown[];
  cooldownMinutes?: number;
  metadata?: Record<string, unknown>;
}

export interface EvaluationContext {
  serviceName: string;
  metricName: string;
  currentValue: number;
  metadata?: Record<string, unknown>;
}

export class AlertRuleService {
  constructor(private readonly db: import('drizzle-orm/node-postgres').NodePgDatabase<Record<string, unknown>>) {}

  async createRule(params: CreateAlertRuleParams): Promise<AlertRule> {
    const [rule] = await this.db
      .insert(alertRules)
      .values({
        name: params.name,
        description: params.description || null,
        conditionType: params.conditionType,
        conditionConfig: params.conditionConfig,
        severity: params.severity,
        isEnabled: params.isEnabled !== false,
        notificationChannels: params.notificationChannels || [],
        cooldownMinutes: params.cooldownMinutes || 5,
        metadata: params.metadata || {},
      })
      .returning();

    logger.info('Alert rule created', { ruleId: rule.id, name: params.name });
    return rule;
  }

  async getRule(id: string): Promise<AlertRule | null> {
    const [rule] = await this.db.select().from(alertRules).where(eq(alertRules.id, id));
    return rule || null;
  }

  async listRules(enabledOnly: boolean = false): Promise<AlertRule[]> {
    if (enabledOnly) {
      return this.db
        .select()
        .from(alertRules)
        .where(eq(alertRules.isEnabled, true))
        .orderBy(desc(alertRules.createdAt));
    }
    return this.db.select().from(alertRules).orderBy(desc(alertRules.createdAt));
  }

  async updateRule(id: string, params: UpdateAlertRuleParams): Promise<AlertRule | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.conditionType !== undefined) updates.conditionType = params.conditionType;
    if (params.conditionConfig !== undefined) updates.conditionConfig = params.conditionConfig;
    if (params.severity !== undefined) updates.severity = params.severity;
    if (params.isEnabled !== undefined) updates.isEnabled = params.isEnabled;
    if (params.notificationChannels !== undefined) updates.notificationChannels = params.notificationChannels;
    if (params.cooldownMinutes !== undefined) updates.cooldownMinutes = params.cooldownMinutes;
    if (params.metadata !== undefined) updates.metadata = params.metadata;

    const [rule] = await this.db.update(alertRules).set(updates).where(eq(alertRules.id, id)).returning();
    if (rule) {
      logger.info('Alert rule updated', { ruleId: id });
    }
    return rule || null;
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await this.db.delete(alertRules).where(eq(alertRules.id, id)).returning({ id: alertRules.id });
    if (result.length > 0) {
      logger.info('Alert rule deleted', { ruleId: id });
      return true;
    }
    return false;
  }

  async evaluateRules(context: EvaluationContext): Promise<Alert[]> {
    const enabledRules = await this.db.select().from(alertRules).where(eq(alertRules.isEnabled, true));
    const triggeredAlerts: Alert[] = [];

    for (const rule of enabledRules) {
      const config = rule.conditionConfig as Record<string, unknown>;
      const ruleMetricName = config.metricName as string;
      const ruleServiceName = config.serviceName as string;
      const threshold = config.threshold as number;
      const operator = (config.operator as string) || 'gt';

      if (ruleMetricName && ruleMetricName !== context.metricName) continue;
      if (ruleServiceName && ruleServiceName !== context.serviceName) continue;
      if (threshold === undefined) continue;

      const lastAlert = await this.getLastAlertForRule(rule.id);
      if (lastAlert && rule.cooldownMinutes) {
        const cooldownMs = (rule.cooldownMinutes || 5) * 60 * 1000;
        if (Date.now() - new Date(lastAlert.triggeredAt).getTime() < cooldownMs) {
          continue;
        }
      }

      let shouldTrigger = false;
      switch (operator) {
        case 'gt':
          shouldTrigger = context.currentValue > threshold;
          break;
        case 'gte':
          shouldTrigger = context.currentValue >= threshold;
          break;
        case 'lt':
          shouldTrigger = context.currentValue < threshold;
          break;
        case 'lte':
          shouldTrigger = context.currentValue <= threshold;
          break;
        case 'eq':
          shouldTrigger = context.currentValue === threshold;
          break;
        default:
          shouldTrigger = context.currentValue > threshold;
      }

      if (shouldTrigger) {
        const [alert] = await this.db
          .insert(alerts)
          .values({
            alertRuleId: rule.id,
            serviceName: context.serviceName,
            severity: rule.severity,
            status: 'active',
            title: `${rule.severity.toUpperCase()}: ${rule.name} - ${context.serviceName}`,
            message: `Metric "${context.metricName}" value ${context.currentValue} ${operator} threshold ${threshold}`,
            metadata: {
              ruleId: rule.id,
              ruleName: rule.name,
              metricName: context.metricName,
              currentValue: context.currentValue,
              threshold,
              operator,
              ...context.metadata,
            },
          })
          .returning();

        triggeredAlerts.push(alert);
        logger.warn('Alert triggered', {
          ruleId: rule.id,
          alertId: alert.id,
          serviceName: context.serviceName,
          metricName: context.metricName,
          value: context.currentValue,
          threshold,
        });
      }
    }

    return triggeredAlerts;
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<Alert | null> {
    const [alert] = await this.db
      .update(alerts)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: acknowledgedBy || null,
      })
      .where(and(eq(alerts.id, alertId), eq(alerts.status, 'active')))
      .returning();
    return alert || null;
  }

  async resolveAlert(alertId: string): Promise<Alert | null> {
    const [alert] = await this.db
      .update(alerts)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
      })
      .where(eq(alerts.id, alertId))
      .returning();
    return alert || null;
  }

  private async getLastAlertForRule(ruleId: string): Promise<Alert | null> {
    const [alert] = await this.db
      .select()
      .from(alerts)
      .where(eq(alerts.alertRuleId, ruleId))
      .orderBy(desc(alerts.triggeredAt))
      .limit(1);
    return alert || null;
  }
}
