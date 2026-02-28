export const MetricType = {
  COUNTER: 'counter',
  HISTOGRAM: 'histogram',
  GAUGE: 'gauge',
  SUMMARY: 'summary',
} as const;

export type MetricTypeValue = (typeof MetricType)[keyof typeof MetricType];

export interface MetricData {
  name: string;
  value: number;
  type: MetricTypeValue;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface HistogramStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsConfig {
  serviceName: string;
  maxMetricsPerName?: number;
  cleanupIntervalMs?: number;
  enableDetailedStats?: boolean;
}

export const STANDARD_METRICS = {
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_seconds',
  HTTP_ERRORS_TOTAL: 'http_errors_total',
  HTTP_ACTIVE_CONNECTIONS: 'http_active_connections',
  DB_QUERY_DURATION: 'db_query_duration_seconds',
  DB_CONNECTIONS_ACTIVE: 'db_connections_active',
  CACHE_HITS: 'cache_hits_total',
  CACHE_MISSES: 'cache_misses_total',
  EXTERNAL_API_REQUESTS: 'external_api_requests_total',
  EXTERNAL_API_DURATION: 'external_api_duration_seconds',
  EVENT_BUS_PUBLISHED: 'event_bus_events_published_total',
  EVENT_BUS_RECEIVED: 'event_bus_events_received_total',
  EVENT_BUS_PUBLISH_ERRORS: 'event_bus_publish_errors_total',
  EVENT_BUS_SUBSCRIBE_ERRORS: 'event_bus_subscribe_errors_total',
  EVENT_BUS_CONNECTION_STATUS: 'event_bus_connection_status',
  DLQ_ITEMS_TOTAL: 'dlq_items_total',
  DLQ_PUBLISHED_TOTAL: 'dlq_published_total',
  DLQ_ITEMS_CLEANED: 'dlq_items_cleaned_total',
  DLQ_DEPTH_CURRENT: 'dlq_depth_current',
  ANALYTICS_EVENTS_QUEUED: 'analytics_events_queued_total',
  ANALYTICS_EVENTS_PUBLISHED: 'analytics_events_published_total',
  ANALYTICS_METRICS_PUBLISHED: 'analytics_metrics_published_total',
  CONFIG_CACHE_INVALIDATIONS: 'config_cache_invalidations_total',
} as const;

export interface EventBusMetricsData {
  eventsPublished: number;
  eventsReceived: number;
  publishErrors: number;
  subscribeErrors: number;
  connected: boolean;
  redisEnabled: boolean;
  pendingEvents: number;
  reconnectAttempts: number;
  dlqPublished: number;
  avgPublishLatencyMs: number | null;
}
