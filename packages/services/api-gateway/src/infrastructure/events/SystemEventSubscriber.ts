/**
 * System Event Subscriber
 * Handles system.alert.* and system.health.* events from System Service
 * Replaces HTTP-based alert notification with event-driven updates
 */

import { createEventSubscriber, createLogger, type StandardEvent } from '@aiponge/platform-core';

const logger = createLogger('api-gateway-system-subscriber');

interface AlertRaisedData {
  alertId: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  service: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface AlertResolvedData {
  alertId: string;
  service: string;
  resolvedBy?: string;
  resolution?: string;
}

interface HealthChangeData {
  service: string;
  component?: string;
  previousStatus: string;
  currentStatus: string;
  reason?: string;
  affectedEndpoints?: string[];
  recoveryDuration?: number;
}

interface MaintenanceData {
  maintenanceId: string;
  scheduledStart?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  affectedServices: string[];
  description?: string;
  outcome?: 'success' | 'partial' | 'failed';
  notes?: string;
}

const activeAlerts = new Map<string, { severity: string; service: string; title: string; raisedAt: number }>();
const serviceHealth = new Map<string, { status: string; lastUpdate: number }>();

async function handleAlertRaised(_event: StandardEvent, data: AlertRaisedData): Promise<void> {
  logger.warn('Alert raised: {} - {} [{}] from {}', {
    data0: data.alertId,
    data1: data.title,
    data2: data.severity,
    data3: data.service,
  });

  activeAlerts.set(data.alertId, {
    severity: data.severity,
    service: data.service,
    title: data.title,
    raisedAt: Date.now(),
  });
}

async function handleAlertResolved(_event: StandardEvent, data: AlertResolvedData): Promise<void> {
  logger.info('Alert resolved: {} from {} by {}', {
    data0: data.alertId,
    data1: data.service,
    data2: data.resolvedBy || 'system',
  });

  activeAlerts.delete(data.alertId);
}

async function handleHealthDegraded(_event: StandardEvent, data: HealthChangeData): Promise<void> {
  logger.warn('Service health degraded: {} {} -> {} reason: {}', {
    data0: data.service,
    data1: data.previousStatus,
    data2: data.currentStatus,
    data3: data.reason || 'unknown',
  });

  serviceHealth.set(data.service, {
    status: data.currentStatus,
    lastUpdate: Date.now(),
  });
}

async function handleHealthRecovered(_event: StandardEvent, data: HealthChangeData): Promise<void> {
  logger.info('Service health recovered: {} {} -> {} (recovery took {}ms)', {
    data0: data.service,
    data1: data.previousStatus,
    data2: data.currentStatus,
    data3: String(data.recoveryDuration || 0),
  });

  serviceHealth.set(data.service, {
    status: data.currentStatus,
    lastUpdate: Date.now(),
  });
}

async function handleMaintenanceScheduled(_event: StandardEvent, data: MaintenanceData): Promise<void> {
  logger.info('Maintenance scheduled: {} at {} affecting {} services', {
    data0: data.maintenanceId,
    data1: data.scheduledStart || 'TBD',
    data2: String(data.affectedServices.length),
  });
}

async function handleMaintenanceStarted(_event: StandardEvent, data: MaintenanceData): Promise<void> {
  logger.info('Maintenance started: {} affecting {} services', {
    data0: data.maintenanceId,
    data1: data.affectedServices.join(', '),
  });
}

async function handleMaintenanceCompleted(_event: StandardEvent, data: MaintenanceData): Promise<void> {
  logger.info('Maintenance completed: {} outcome={} duration={}min', {
    data0: data.maintenanceId,
    data1: data.outcome || 'unknown',
    data2: String(Math.round((data.actualDuration || 0) / 60000)),
  });
}

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startSystemEventSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('api-gateway')
    .register({
      eventType: 'system.alert.raised',
      handler: handleAlertRaised as (event: StandardEvent, data: unknown) => Promise<void>,
    })
    .register({
      eventType: 'system.alert.resolved',
      handler: handleAlertResolved as (event: StandardEvent, data: unknown) => Promise<void>,
    })
    .register({
      eventType: 'system.health.degraded',
      handler: handleHealthDegraded as (event: StandardEvent, data: unknown) => Promise<void>,
    })
    .register({
      eventType: 'system.health.recovered',
      handler: handleHealthRecovered as (event: StandardEvent, data: unknown) => Promise<void>,
    })
    .register({
      eventType: 'system.maintenance.scheduled',
      handler: handleMaintenanceScheduled as (event: StandardEvent, data: unknown) => Promise<void>,
    })
    .register({
      eventType: 'system.maintenance.started',
      handler: handleMaintenanceStarted as (event: StandardEvent, data: unknown) => Promise<void>,
    })
    .register({
      eventType: 'system.maintenance.completed',
      handler: handleMaintenanceCompleted as (event: StandardEvent, data: unknown) => Promise<void>,
    });

  await subscriber.start();
  logger.debug('System event subscriber started for API Gateway');
}

export async function stopSystemEventSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}

export function getActiveAlerts(): Map<string, { severity: string; service: string; title: string; raisedAt: number }> {
  return activeAlerts;
}

export function getServiceHealth(): Map<string, { status: string; lastUpdate: number }> {
  return serviceHealth;
}
