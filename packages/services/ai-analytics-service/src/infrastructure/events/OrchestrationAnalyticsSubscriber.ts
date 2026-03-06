/**
 * Orchestration Analytics Subscriber
 * Subscribes to orchestration flow events and records analytics.
 * Persists to aia_user_activity_logs with sourceContext = 'wellness-flow'.
 *
 * Events tracked:
 *   orchestration.flow.planned   → session planned (LLM interpretation completed)
 *   orchestration.flow.confirmed → user confirmed (triggers book + album pipeline)
 *   orchestration.flow.completed → entire flow finished (book + album generated)
 *   orchestration.flow.delivered → gift notification sent to recipient
 */

import { createEventSubscriber, type EventSubscriber, type StandardEvent, errorMessage } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { Pool } from 'pg';

const logger = getLogger('orchestration-analytics-subscriber');

let dbPool: Pool | null = null;

function getDbPool(): Pool | null {
  if (!dbPool && process.env.DATABASE_URL) {
    try {
      const connStr = process.env.DATABASE_URL;
      const disableSsl =
        process.env.DATABASE_SSL === 'false' ||
        connStr.includes('localhost') ||
        connStr.includes('127.0.0.1') ||
        connStr.includes('.railway.internal');

      dbPool = new Pool({
        connectionString: connStr,
        ssl: disableSsl ? false : { rejectUnauthorized: false },
        max: 3,
        idleTimeoutMillis: 30000,
      });
    } catch (error) {
      logger.warn('Failed to create orchestration analytics pool', { error: errorMessage(error) });
    }
  }
  return dbPool;
}

async function recordOrchestrationEvent(
  eventType: string,
  data: Record<string, unknown>,
  event: StandardEvent
): Promise<void> {
  const pool = getDbPool();
  if (!pool) {
    logger.debug('No DB pool, skipping orchestration analytics persistence');
    return;
  }

  try {
    await pool.query(
      `INSERT INTO aia_user_activity_logs (
        timestamp, user_id, user_type, session_id, action, resource,
        workflow_type, provider_id, cost, processing_time_ms, success,
        error_code, user_agent, ip_address, location, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        event.timestamp || new Date().toISOString(),
        data.creatorId || null,
        'user',
        data.sessionId || null,
        eventType,
        'orchestration_flow',
        data.flowType || 'wellness',
        null, // providerId
        0, // cost
        null, // processingTimeMs
        data.status !== 'failed',
        data.status === 'failed' ? 'ORCHESTRATION_FLOW_FAILED' : null,
        null, // user_agent
        null, // ip_address
        null, // location
        JSON.stringify({
          sourceContext: 'wellness-flow',
          correlationId: event.correlationId,
          source: event.source,
          recipientId: data.recipientId,
          recipientIsSelf: data.recipientIsSelf,
          outputs: data.outputs,
          errorMessage: data.errorMessage,
        }),
      ]
    );
  } catch (error) {
    logger.debug('Failed to persist orchestration analytics (non-blocking)', { error: errorMessage(error) });
  }
}

async function handleFlowPlanned(event: StandardEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  logger.debug('Recording orchestration.flow.planned', { sessionId: data.sessionId });
  await recordOrchestrationEvent('orchestration.flow.planned', data, event);
}

async function handleFlowConfirmed(event: StandardEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  logger.debug('Recording orchestration.flow.confirmed', { sessionId: data.sessionId });
  await recordOrchestrationEvent('orchestration.flow.confirmed', data, event);
}

async function handleFlowCompleted(event: StandardEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  logger.info('Recording orchestration.flow.completed', {
    sessionId: data.sessionId,
    status: data.status,
  });
  await recordOrchestrationEvent('orchestration.flow.completed', data, event);
}

async function handleFlowDelivered(event: StandardEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  logger.debug('Recording orchestration.flow.delivered', { sessionId: data.sessionId });
  await recordOrchestrationEvent('orchestration.flow.delivered', data, event);
}

let subscriberInstance: EventSubscriber | null = null;

export async function startOrchestrationAnalyticsSubscriber(): Promise<void> {
  if (subscriberInstance) return;

  subscriberInstance = createEventSubscriber('ai-analytics-service')
    .register({
      eventType: 'orchestration.flow.planned',
      handler: handleFlowPlanned,
      maxRetries: 2,
    })
    .register({
      eventType: 'orchestration.flow.confirmed',
      handler: handleFlowConfirmed,
      maxRetries: 2,
    })
    .register({
      eventType: 'orchestration.flow.completed',
      handler: handleFlowCompleted,
      maxRetries: 2,
    })
    .register({
      eventType: 'orchestration.flow.delivered',
      handler: handleFlowDelivered,
      maxRetries: 2,
    });

  await subscriberInstance.start();
  logger.info('Orchestration analytics subscriber started');
}

export async function stopOrchestrationAnalyticsSubscriber(): Promise<void> {
  if (subscriberInstance) {
    await subscriberInstance.shutdown();
    subscriberInstance = null;
  }
}
