/**
 * Record Event Use Case - Core event logging for analytics
 * Handles metrics recording, provider usage, and system events
 * with comprehensive validation, batching, and real-time processing
 */

import { v4 as uuidv4 } from 'uuid';
import { errorMessage } from '@aiponge/platform-core';
import { IAnalyticsRepository } from '../../domains/repositories/IAnalyticsRepository';
import { MetricEntry } from '../../domains/entities/MetricEntry.js';
import { ProviderAnalytics, ProviderHealthMetrics } from '../../domains/entities/ProviderAnalytics.js';
import { AnomalyDetectionResult } from '../../domains/entities/AnalyticsIntelligence.js';
import { getLogger } from '../../config/service-urls';
import { AnalyticsError } from '../errors';
import { VALID_ROLES, type UserRole } from '@aiponge/shared-contracts';

// ===== REQUEST INTERFACES =====

const logger = getLogger('ai-analytics-service-recordeventusecase');

export interface RecordEventRequest {
  eventType: 'metric' | 'provider' | 'user' | 'system' | 'anomaly';
  timestamp?: Date;
  metadata?: Record<string, unknown>;

  // Event-specific data (only one should be provided)
  metricData?: MetricEventData;
  providerData?: ProviderEventData;
  userEventData?: UserEventData;
  systemEventData?: SystemEventData;
  anomalyData?: AnomalyEventData;
}

export interface MetricEventData {
  name: string;
  value: number;
  serviceName: string;
  source: string;
  metricType: 'counter' | 'gauge' | 'histogram' | 'summary';
  unit?: string;
  tags?: Record<string, string>;
}

export interface ProviderEventData {
  action: 'usage' | 'health_check' | 'error' | 'rate_limit';
  providerId: string;
  providerType: 'llm' | 'music' | 'image' | 'audio';
  operation?: string;
  requestId?: string;
  userId?: string;
  responseTimeMs?: number;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  success?: boolean;
  errorType?: string;
  errorCode?: string;
  httpStatusCode?: number;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  uptime?: number;
  errorRate?: number;
  throughput?: number;
  circuitBreakerStatus?: 'closed' | 'open' | 'half-open';
  rateLimitData?: {
    remaining: number;
    limit: number;
    resetTime: Date;
  };
}

export interface UserEventData {
  userId: string;
  userType: UserRole;
  action: 'login' | 'logout' | 'feature_used' | 'error_encountered';
  feature?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  success?: boolean;
  errorMessage?: string;
}

export interface SystemEventData {
  component: string;
  action: 'started' | 'stopped' | 'error' | 'health_check' | 'resource_alert';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  resourceMetrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    activeConnections?: number;
  };
}

export interface AnomalyEventData {
  anomalyType: 'threshold_breach' | 'statistical_anomaly' | 'pattern_deviation' | 'cost_spike';
  severity: 'low' | 'medium' | 'high' | 'critical';
  serviceName?: string;
  providerId?: string;
  metricName: string;
  expectedValue?: number;
  actualValue: number;
  deviationScore: number;
  description: string;
}

// ===== BATCH INTERFACES =====

export interface BatchRecordEventRequest {
  events: RecordEventRequest[];
  batchId?: string;
  processingMode: 'strict' | 'best_effort'; // strict = fail all on any error, best_effort = process what you can
}

// ===== RESPONSE INTERFACES =====

export interface RecordEventResult {
  success: boolean;
  eventId?: string;
  timestamp: Date;
  processingTimeMs: number;
  eventType: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metrics?: {
    bufferSize: number;
    realTimeProcessing: boolean;
    aggregationUpdated: boolean;
  };
}

export interface BatchRecordEventResult {
  success: boolean;
  batchId: string;
  totalEvents: number;
  processedEvents: number;
  failedEvents: number;
  processingTimeMs: number;
  results: RecordEventResult[];
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  summary: {
    metricEvents: number;
    providerEvents: number;
    userEvents: number;
    systemEvents: number;
    anomalyEvents: number;
  };
}

// ===== USE CASE IMPLEMENTATION =====

export class RecordEventUseCase {
  constructor(
    private readonly repository: IAnalyticsRepository,
    private readonly enableRealTimeProcessing = true,
    private readonly enableValidation = true
  ) {
    logger.info('Initialized with real-time processing and validation enabled');
  }

  /**
   * Record a single analytics event
   */
  async execute(request: RecordEventRequest): Promise<RecordEventResult> {
    const startTime = Date.now();
    const eventId = uuidv4();
    const timestamp = request.timestamp || new Date();

    try {
      // Validate request
      if (this.enableValidation) {
        this.validateRequest(request);
      }

      // Process event based on type
      await this.processEvent(request, eventId, timestamp);

      const processingTimeMs = Date.now() - startTime;

      // Record success metric
      await this.recordProcessingMetric('event_recorded', 1, 'success', request.eventType, processingTimeMs);

      return {
        success: true,
        eventId,
        timestamp,
        processingTimeMs,
        eventType: request.eventType,
        metrics: {
          bufferSize: 0, // Would be provided by metrics collector
          realTimeProcessing: this.enableRealTimeProcessing,
          aggregationUpdated: true,
        },
      };
    } catch (error) {
      return this.handleEventError(
        error instanceof Error ? error : new Error(errorMessage(error)),
        eventId,
        timestamp,
        startTime,
        request.eventType
      );
    }
  }

  /**
   * Record multiple events in batch
   */
  async executeBatch(request: BatchRecordEventRequest): Promise<BatchRecordEventResult> {
    const startTime = Date.now();
    const batchId = request.batchId || uuidv4();
    const results: RecordEventResult[] = [];

    let processedCount = 0;
    let failedCount = 0;

    const summary = {
      metricEvents: 0,
      providerEvents: 0,
      userEvents: 0,
      systemEvents: 0,
      anomalyEvents: 0,
    };

    try {
      logger.info('Processing batch {} with {} events', { data0: batchId, data1: request.events.length });

      for (const event of request.events) {
        try {
          const result = await this.execute(event);
          results.push(result);

          if (result.success) {
            processedCount++;
            this.updateSummary(summary, event.eventType);
          } else {
            failedCount++;
            if (request.processingMode === 'strict') {
              throw AnalyticsError.internalError(`Batch processing failed on event: ${result.error?.message}`);
            }
          }
        } catch (error) {
          failedCount++;
          results.push({
            success: false,
            timestamp: new Date(),
            processingTimeMs: 0,
            eventType: event.eventType,
            error: {
              code: 'EVENT_PROCESSING_FAILED',
              message: errorMessage(error),
            },
          });

          if (request.processingMode === 'strict') {
            throw error;
          }
        }
      }

      const processingTimeMs = Date.now() - startTime;

      // Record batch processing metrics
      await this.recordProcessingMetric('batch_processed', request.events.length, 'success', 'batch', processingTimeMs);

      return {
        success: true,
        batchId,
        totalEvents: request.events.length,
        processedEvents: processedCount,
        failedEvents: failedCount,
        processingTimeMs,
        results,
        summary,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      await this.recordProcessingMetric('batch_failed', request.events.length, 'error', 'batch', processingTimeMs);

      return {
        success: false,
        batchId,
        totalEvents: request.events.length,
        processedEvents: processedCount,
        failedEvents: failedCount,
        processingTimeMs,
        results,
        summary,
        error: {
          code: 'BATCH_PROCESSING_FAILED',
          message: errorMessage(error),
          details: { processingMode: request.processingMode },
        },
      };
    }
  }

  // ===== PRIVATE METHODS =====

  private validateRequest(request: RecordEventRequest): void {
    if (!request.eventType) {
      throw AnalyticsError.validationError('eventType', 'Event type is required');
    }

    const validEventTypes = ['metric', 'provider', 'user', 'system', 'anomaly'];
    if (!validEventTypes.includes(request.eventType)) {
      throw AnalyticsError.validationError('eventType', `Invalid event type: ${request.eventType}`);
    }

    // Validate that appropriate data is provided for event type
    switch (request.eventType) {
      case 'metric':
        if (!request.metricData) {
          throw AnalyticsError.validationError('metricData', 'Metric data is required for metric events');
        }
        this.validateMetricData(request.metricData);
        break;

      case 'provider':
        if (!request.providerData) {
          throw AnalyticsError.validationError('providerData', 'Provider data is required for provider events');
        }
        this.validateProviderData(request.providerData);
        break;

      case 'user':
        if (!request.userEventData) {
          throw AnalyticsError.validationError('userEventData', 'User event data is required for user events');
        }
        this.validateUserEventData(request.userEventData);
        break;

      case 'system':
        if (!request.systemEventData) {
          throw AnalyticsError.validationError('systemEventData', 'System event data is required for system events');
        }
        this.validateSystemEventData(request.systemEventData);
        break;

      case 'anomaly':
        if (!request.anomalyData) {
          throw AnalyticsError.validationError('anomalyData', 'Anomaly data is required for anomaly events');
        }
        this.validateAnomalyData(request.anomalyData);
        break;
    }
  }

  private validateMetricData(data: MetricEventData): void {
    if (!data.name?.trim()) {
      throw AnalyticsError.validationError('metricData.name', 'Metric name is required');
    }
    if (typeof data.value !== 'number' || isNaN(data.value)) {
      throw AnalyticsError.invalidMetricData('Metric value must be a valid number');
    }
    if (!data.serviceName?.trim()) {
      throw AnalyticsError.validationError('metricData.serviceName', 'Service name is required for metrics');
    }
    if (!data.source?.trim()) {
      throw AnalyticsError.validationError('metricData.source', 'Source is required for metrics');
    }
    if (!['counter', 'gauge', 'histogram', 'summary'].includes(data.metricType)) {
      throw AnalyticsError.invalidMetricData('Invalid metric type');
    }
  }

  private validateProviderData(data: ProviderEventData): void {
    if (!data.providerId?.trim()) {
      throw AnalyticsError.validationError('providerData.providerId', 'Provider ID is required');
    }
    if (!['llm', 'music', 'image', 'audio'].includes(data.providerType)) {
      throw AnalyticsError.validationError('providerData.providerType', 'Invalid provider type');
    }
    if (!['usage', 'health_check', 'error', 'rate_limit'].includes(data.action)) {
      throw AnalyticsError.validationError('providerData.action', 'Invalid provider action');
    }
  }

  private validateUserEventData(data: UserEventData): void {
    if (!data.userId?.trim()) {
      throw AnalyticsError.validationError('userEventData.userId', 'User ID is required');
    }
    if (!VALID_ROLES.includes(data.userType)) {
      throw AnalyticsError.validationError('userEventData.userType', 'Invalid user type');
    }
  }

  private validateSystemEventData(data: SystemEventData): void {
    if (!data.component?.trim()) {
      throw AnalyticsError.validationError('systemEventData.component', 'System component is required');
    }
    if (!data.message?.trim()) {
      throw AnalyticsError.validationError('systemEventData.message', 'System message is required');
    }
    if (!['info', 'warning', 'error', 'critical'].includes(data.severity)) {
      throw AnalyticsError.validationError('systemEventData.severity', 'Invalid severity level');
    }
  }

  private validateAnomalyData(data: AnomalyEventData): void {
    if (!data.metricName?.trim()) {
      throw AnalyticsError.validationError('anomalyData.metricName', 'Metric name is required for anomalies');
    }
    if (typeof data.actualValue !== 'number') {
      throw AnalyticsError.invalidMetricData('Actual value must be a number');
    }
    if (typeof data.deviationScore !== 'number') {
      throw AnalyticsError.invalidMetricData('Deviation score must be a number');
    }
  }

  private async processEvent(request: RecordEventRequest, eventId: string, timestamp: Date): Promise<void> {
    switch (request.eventType) {
      case 'metric':
        await this.processMetricEvent(request.metricData!, eventId, timestamp, request.metadata);
        break;

      case 'provider':
        await this.processProviderEvent(request.providerData!, eventId, timestamp, request.metadata);
        break;

      case 'user':
        await this.processUserEvent(request.userEventData!, eventId, timestamp, request.metadata);
        break;

      case 'system':
        await this.processSystemEvent(request.systemEventData!, eventId, timestamp, request.metadata);
        break;

      case 'anomaly':
        await this.processAnomalyEvent(request.anomalyData!, eventId, timestamp, request.metadata);
        break;
    }
  }

  private async processMetricEvent(
    data: MetricEventData,
    eventId: string,
    timestamp: Date,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const metricEntry: MetricEntry = {
      name: data.name,
      value: data.value,
      timestamp,
      tags: data.tags,
      serviceName: data.serviceName,
      source: data.source,
      metricType: data.metricType,
      unit: data.unit,
    };

    await this.repository.recordMetric(metricEntry);
    logger.info('Recorded metric: {} = {} ({})', { data0: data.name, data1: data.value, data2: data.serviceName });
  }

  private async processProviderEvent(
    data: ProviderEventData,
    eventId: string,
    timestamp: Date,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    switch (data.action) {
      case 'usage':
        if (data.operation && data.responseTimeMs !== undefined && data.success !== undefined) {
          const providerRecord: ProviderAnalytics = {
            timestamp,
            providerId: data.providerId,
            providerType: data.providerType,
            operation: data.operation,
            requestId: data.requestId,
            userId: data.userId,
            responseTimeMs: data.responseTimeMs,
            cost: data.cost || 0,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
            success: data.success,
            errorType: data.errorType,
            errorCode: data.errorCode,
            httpStatusCode: data.httpStatusCode,
            circuitBreakerStatus: data.circuitBreakerStatus,
            metadata,
          };
          await this.repository.recordProviderUsage(providerRecord);
        }
        break;

      case 'health_check':
        if (data.healthStatus && data.uptime !== undefined) {
          const healthRecord: ProviderHealthMetrics = {
            providerId: data.providerId,
            timestamp,
            healthStatus: data.healthStatus,
            responseTimeMs: data.responseTimeMs,
            uptime: data.uptime,
            errorRate: data.errorRate || 0,
            throughput: data.throughput || 0,
            circuitBreakerStatus: data.circuitBreakerStatus || 'closed',
            lastError: data.errorCode || data.errorType,
            rateLimitStatus: data.rateLimitData
              ? {
                  remaining: data.rateLimitData.remaining,
                  limit: data.rateLimitData.limit,
                  resetTime: data.rateLimitData.resetTime,
                }
              : undefined,
            metadata,
          };
          await this.repository.recordProviderHealth(healthRecord);
        }
        break;
    }

    logger.info('🔌 Processed provider event: {} for {}', { data0: data.action, data1: data.providerId });
  }

  private async processUserEvent(
    data: UserEventData,
    eventId: string,
    timestamp: Date,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.repository.recordMetric({
      name: `user.${data.action}`,
      value: 1,
      timestamp,
      tags: {
        userId: data.userId,
        userType: data.userType,
        feature: data.feature || 'unknown',
        success: (data.success !== false).toString(),
      },
      serviceName: 'user-service',
      source: 'user-analytics',
      metricType: 'counter',
      unit: 'events',
    });

    await this.repository.recordUserActivity({
      timestamp,
      userId: data.userId,
      userType: data.userType,
      sessionId: data.sessionId || null,
      action: data.action,
      resource: data.feature || null,
      success: data.success !== false,
      errorCode: data.errorMessage || null,
      userAgent: data.userAgent || null,
      ipAddress: data.ip || null,
      processingTime: data.duration || null,
      metadata: metadata || null,
    });

    logger.info('Processed user event: {} for user {}', { data0: data.action, data1: data.userId });
  }

  private async processSystemEvent(
    data: SystemEventData,
    eventId: string,
    timestamp: Date,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Record system event metric
    await this.repository.recordMetric({
      name: `system.${data.action}`,
      value: 1,
      timestamp,
      tags: {
        component: data.component,
        severity: data.severity,
      },
      serviceName: 'system-service',
      source: 'system-monitoring',
      metricType: 'counter',
      unit: 'events',
    });

    // Record resource metrics if provided
    if (data.resourceMetrics) {
      const resourceTags = { component: data.component };

      if (data.resourceMetrics.cpuUsage !== undefined) {
        await this.repository.recordMetric({
          name: 'system.resource.cpu_usage',
          value: data.resourceMetrics.cpuUsage,
          timestamp,
          tags: resourceTags,
          serviceName: 'system-service',
          source: 'resource-monitor',
          metricType: 'gauge',
          unit: 'percentage',
        });
      }

      if (data.resourceMetrics.memoryUsage !== undefined) {
        await this.repository.recordMetric({
          name: 'system.resource.memory_usage',
          value: data.resourceMetrics.memoryUsage,
          timestamp,
          tags: resourceTags,
          serviceName: 'system-service',
          source: 'resource-monitor',
          metricType: 'gauge',
          unit: 'percentage',
        });
      }
    }

    logger.info('⚙️ Processed system event: {} for {} ({})', {
      data0: data.action,
      data1: data.component,
      data2: data.severity,
    });
  }

  private async processAnomalyEvent(
    data: AnomalyEventData,
    eventId: string,
    timestamp: Date,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const anomalyRecord: AnomalyDetectionResult = {
      id: eventId,
      detectedAt: timestamp,
      anomalyType: data.anomalyType,
      severity: data.severity,
      serviceName: data.serviceName,
      providerId: data.providerId,
      metricName: data.metricName,
      expectedValue: data.expectedValue,
      actualValue: data.actualValue,
      deviationScore: data.deviationScore,
      description: data.description,
      status: 'active',
      metadata,
    };

    await this.repository.recordAnomaly(anomalyRecord);
    logger.info('🚨 Recorded anomaly: {} on {} ({})', {
      data0: data.anomalyType,
      data1: data.metricName,
      data2: data.severity,
    });
  }

  private async recordProcessingMetric(
    metricName: string,
    value: number,
    status: string,
    eventType: string,
    processingTimeMs: number
  ): Promise<void> {
    try {
      await this.repository.recordMetric({
        name: `analytics.${metricName}`,
        value,
        timestamp: new Date(),
        tags: {
          status,
          eventType,
          processingTimeMs: processingTimeMs.toString(),
        },
        serviceName: 'ai-analytics-service',
        source: 'record-event-use-case',
        metricType: 'counter',
        unit: 'events',
      });
    } catch (error) {
      logger.warn('Failed to record processing metric (non-blocking):', { data: error });
    }
  }

  private updateSummary(summary: BatchRecordEventResult['summary'], eventType: string): void {
    switch (eventType) {
      case 'metric':
        summary.metricEvents++;
        break;
      case 'provider':
        summary.providerEvents++;
        break;
      case 'user':
        summary.userEvents++;
        break;
      case 'system':
        summary.systemEvents++;
        break;
      case 'anomaly':
        summary.anomalyEvents++;
        break;
    }
  }

  private handleEventError(
    error: Error,
    eventId: string,
    timestamp: Date,
    startTime: number,
    eventType: string
  ): RecordEventResult {
    const processingTimeMs = Date.now() - startTime;

    // Record error metric (safe call - log failures but don't throw)
    this.recordProcessingMetric('event_failed', 1, 'error', eventType, processingTimeMs).catch(metricError => {
      logger.debug('Failed to record error metric (non-critical)', { eventId, error: metricError?.message });
    });

    logger.error('Failed to record ${eventType} event ${eventId}:', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      eventId,
      timestamp,
      processingTimeMs,
      eventType,
      error: {
        code: 'EVENT_RECORDING_FAILED',
        message: error.message,
        details: {
          eventId,
          eventType,
        },
      },
      metrics: {
        bufferSize: 0,
        realTimeProcessing: this.enableRealTimeProcessing,
        aggregationUpdated: false,
      },
    };
  }
}
