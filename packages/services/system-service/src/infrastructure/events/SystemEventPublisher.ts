/**
 * System Event Publisher
 * Safely publishes system-related events via the event bus
 * Uses fire-and-forget pattern - errors are logged but don't affect main operations
 */

import {
  createEventBusClient,
  type IStandardizedEventBusClient,
  getServiceName,
  createEvent,
  generateCorrelationId,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('system-service-event-publisher');

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('system-service'));
  }
  return eventBusClient;
}

function safePublish(type: string, data: Record<string, unknown>, correlationId: string): void {
  try {
    const event = createEvent(type, 'system-service', data, { correlationId });
    getEventBusClient()
      .publish(event)
      .then(() => logger.debug('Published system event: {}', { data0: type, eventId: event.eventId }))
      .catch(error => {
        logger.warn('Failed to publish system event (non-blocking): {}', {
          data0: type,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    logger.warn('Failed to create system event (non-blocking): {}', {
      data0: type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const SystemEventPublisher = {
  alertRaised(
    alertId: string,
    severity: 'info' | 'warning' | 'error' | 'critical',
    service: string,
    title: string,
    message: string,
    correlationId: string = generateCorrelationId(),
    metadata?: Record<string, unknown>
  ): void {
    safePublish(
      'system.alert.raised',
      {
        alertId,
        severity,
        service,
        title,
        message,
        metadata,
      },
      correlationId
    );
  },

  alertResolved(
    alertId: string,
    service: string,
    correlationId: string = generateCorrelationId(),
    resolvedBy?: string,
    resolution?: string
  ): void {
    safePublish(
      'system.alert.resolved',
      {
        alertId,
        service,
        resolvedBy,
        resolution,
      },
      correlationId
    );
  },

  healthDegraded(
    service: string,
    previousStatus: string,
    currentStatus: string,
    reason: string,
    correlationId: string = generateCorrelationId(),
    component?: string,
    affectedEndpoints?: string[]
  ): void {
    safePublish(
      'system.health.degraded',
      {
        service,
        component,
        previousStatus,
        currentStatus,
        reason,
        affectedEndpoints,
      },
      correlationId
    );
  },

  healthRecovered(
    service: string,
    previousStatus: string,
    currentStatus: string,
    correlationId: string = generateCorrelationId(),
    component?: string,
    recoveryDuration?: number
  ): void {
    safePublish(
      'system.health.recovered',
      {
        service,
        component,
        previousStatus,
        currentStatus,
        recoveryDuration,
      },
      correlationId
    );
  },

  maintenanceScheduled(
    maintenanceId: string,
    scheduledStart: string,
    estimatedDuration: number,
    affectedServices: string[],
    description: string,
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      'system.maintenance.scheduled',
      {
        maintenanceId,
        scheduledStart,
        estimatedDuration,
        affectedServices,
        description,
      },
      correlationId
    );
  },

  maintenanceStarted(
    maintenanceId: string,
    affectedServices: string[],
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      'system.maintenance.started',
      {
        maintenanceId,
        affectedServices,
      },
      correlationId
    );
  },

  maintenanceCompleted(
    maintenanceId: string,
    actualDuration: number,
    outcome: 'success' | 'partial' | 'failed',
    correlationId: string = generateCorrelationId(),
    notes?: string
  ): void {
    safePublish(
      'system.maintenance.completed',
      {
        maintenanceId,
        actualDuration,
        outcome,
        notes,
      },
      correlationId
    );
  },
};
