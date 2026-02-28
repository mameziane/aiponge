-- TimescaleDB Setup for AI Analytics Service
-- This script creates hypertables, compression policies, and retention policies
-- for optimal time-series analytics performance

-- Create TimescaleDB extension if not exists
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ================================
-- HYPERTABLE CREATION
-- ================================

-- Convert workflow_executions to hypertable partitioned by start_time
-- Chunk interval: 1 day for optimal performance
SELECT create_hypertable(
  'trk_workflow_executions', 
  'start_time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Convert workflow_stage_executions to hypertable
SELECT create_hypertable(
  'trk_workflow_stage_executions', 
  'start_time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Convert provider_usage_logs to hypertable partitioned by timestamp
-- Chunk interval: 4 hours for high-frequency data
SELECT create_hypertable(
  'trk_provider_usage_logs', 
  'timestamp',
  chunk_time_interval => INTERVAL '4 hours',
  if_not_exists => TRUE
);

-- Convert provider_health_logs to hypertable
SELECT create_hypertable(
  'trk_provider_health_logs', 
  'timestamp',
  chunk_time_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Convert system_metrics to hypertable
-- Chunk interval: 2 hours for very high-frequency metrics
SELECT create_hypertable(
  'trk_system_metrics', 
  'timestamp',
  chunk_time_interval => INTERVAL '2 hours',
  if_not_exists => TRUE
);

-- Convert cost_analytics to hypertable
SELECT create_hypertable(
  'trk_cost_analytics', 
  'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Convert anomalies to hypertable
SELECT create_hypertable(
  'trk_anomalies', 
  'detected_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ================================
-- COMPRESSION POLICIES
-- ================================

-- Enable compression on workflow data older than 7 days
SELECT add_compression_policy(
  'trk_workflow_executions', 
  INTERVAL '7 days',
  if_not_exists => TRUE
);

SELECT add_compression_policy(
  'trk_workflow_stage_executions', 
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Enable compression on provider usage data older than 3 days
SELECT add_compression_policy(
  'trk_provider_usage_logs', 
  INTERVAL '3 days',
  if_not_exists => TRUE
);

-- Enable compression on provider health data older than 1 day
SELECT add_compression_policy(
  'trk_provider_health_logs', 
  INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Enable compression on system metrics older than 2 days
SELECT add_compression_policy(
  'trk_system_metrics', 
  INTERVAL '2 days',
  if_not_exists => TRUE
);

-- Enable compression on cost analytics older than 14 days
SELECT add_compression_policy(
  'trk_cost_analytics', 
  INTERVAL '14 days',
  if_not_exists => TRUE
);

-- Enable compression on anomalies older than 30 days
SELECT add_compression_policy(
  'trk_anomalies', 
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- ================================
-- RETENTION POLICIES
-- ================================

-- Retain workflow data for 90 days
SELECT add_retention_policy(
  'trk_workflow_executions', 
  INTERVAL '90 days',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'trk_workflow_stage_executions', 
  INTERVAL '90 days',
  if_not_exists => TRUE
);

-- Retain provider usage logs for 60 days
SELECT add_retention_policy(
  'trk_provider_usage_logs', 
  INTERVAL '60 days',
  if_not_exists => TRUE
);

-- Retain provider health logs for 30 days
SELECT add_retention_policy(
  'trk_provider_health_logs', 
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Retain detailed system metrics for 30 days
SELECT add_retention_policy(
  'trk_system_metrics', 
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Retain cost analytics for 1 year
SELECT add_retention_policy(
  'trk_cost_analytics', 
  INTERVAL '365 days',
  if_not_exists => TRUE
);

-- Retain anomalies for 180 days
SELECT add_retention_policy(
  'trk_anomalies', 
  INTERVAL '180 days',
  if_not_exists => TRUE
);

-- ================================
-- CONTINUOUS AGGREGATES
-- ================================

-- Create continuous aggregate for hourly workflow metrics
DROP MATERIALIZED VIEW IF EXISTS workflow_metrics_hourly CASCADE;
CREATE MATERIALIZED VIEW workflow_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', start_time) AS hour,
  workflow_type,
  COUNT(*) as execution_count,
  AVG(processing_time_ms) as avg_processing_time,
  MAX(processing_time_ms) as max_processing_time,
  SUM(total_cost) as total_cost,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  AVG(retry_attempts) as avg_retry_attempts
FROM trk_workflow_executions
GROUP BY hour, workflow_type;

-- Add policy to refresh continuous aggregate
SELECT add_continuous_aggregate_policy(
  'workflow_metrics_hourly',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);

-- Create continuous aggregate for provider performance metrics
DROP MATERIALIZED VIEW IF EXISTS provider_metrics_hourly CASCADE;
CREATE MATERIALIZED VIEW provider_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', timestamp) AS hour,
  provider_id,
  provider_type,
  operation,
  COUNT(*) as request_count,
  AVG(response_time_ms) as avg_response_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time,
  SUM(cost) as total_cost,
  COUNT(*) FILTER (WHERE success = true) as successful_requests,
  COUNT(*) FILTER (WHERE success = false) as failed_requests,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens
FROM trk_provider_usage_logs
GROUP BY hour, provider_id, provider_type, operation;

-- Add policy to refresh provider metrics
SELECT add_continuous_aggregate_policy(
  'provider_metrics_hourly',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- Create continuous aggregate for system health metrics
DROP MATERIALIZED VIEW IF EXISTS system_health_hourly CASCADE;
CREATE MATERIALIZED VIEW system_health_hourly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', timestamp) AS hour,
  service_name,
  metric_name,
  AVG(metric_value) as avg_value,
  MIN(metric_value) as min_value,
  MAX(metric_value) as max_value,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value,
  COUNT(*) as sample_count
FROM trk_system_metrics
WHERE metric_type IN ('gauge', 'histogram')
GROUP BY hour, service_name, metric_name;

-- Add policy to refresh system health metrics
SELECT add_continuous_aggregate_policy(
  'system_health_hourly',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '10 minutes',
  if_not_exists => TRUE
);

-- ================================
-- CUSTOM INDEXES FOR PERFORMANCE
-- ================================

-- Workflow execution indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_executions_type_status 
ON trk_workflow_executions (workflow_type, status) WHERE status IN ('running', 'pending');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_executions_user_type 
ON trk_workflow_executions (user_id, start_time DESC) WHERE user_id IS NOT NULL;

-- Provider usage indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_provider_usage_provider_operation 
ON trk_provider_usage_logs (provider_id, operation, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_provider_usage_cost 
ON trk_provider_usage_logs (timestamp DESC, cost DESC) WHERE cost > 0;

-- System metrics indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_service_metric 
ON trk_system_metrics (service_name, metric_name, timestamp DESC);

-- ================================
-- USER-DEFINED FUNCTIONS
-- ================================

-- Function to calculate workflow success rate
CREATE OR REPLACE FUNCTION calculate_workflow_success_rate(
  p_workflow_type TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
) RETURNS DECIMAL(5,4) AS $$
DECLARE
  total_count INTEGER;
  success_count INTEGER;
BEGIN
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_count, success_count
  FROM trk_workflow_executions
  WHERE workflow_type = p_workflow_type
    AND start_time >= p_start_time
    AND start_time < p_end_time;
  
  IF total_count = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN success_count::DECIMAL / total_count::DECIMAL;
END;
$$ LANGUAGE plpgsql;

-- Function to get provider health score
CREATE OR REPLACE FUNCTION calculate_provider_health_score(
  p_provider_id TEXT,
  p_hours_back INTEGER DEFAULT 24
) RETURNS DECIMAL(3,2) AS $$
DECLARE
  health_score DECIMAL(3,2);
  start_time TIMESTAMPTZ;
BEGIN
  start_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE AVG(
        CASE 
          WHEN success THEN 1.0
          ELSE 0.0
        END
      )
    END
  INTO health_score
  FROM trk_provider_usage_logs
  WHERE provider_id = p_provider_id
    AND timestamp >= start_time;
  
  RETURN COALESCE(health_score, 0);
END;
$$ LANGUAGE plpgsql;

-- ================================
-- PERFORMANCE OPTIMIZATION
-- ================================

-- Update table statistics for better query planning
ANALYZE trk_workflow_executions;
ANALYZE trk_workflow_stage_executions;
ANALYZE trk_provider_usage_logs;
ANALYZE trk_provider_health_logs;
ANALYZE trk_system_metrics;
ANALYZE trk_cost_analytics;
ANALYZE trk_anomalies;

-- ================================
-- MONITORING VIEWS
-- ================================

-- View for chunk information and health
CREATE OR REPLACE VIEW timescale_chunk_health AS
SELECT 
  hypertable_name,
  chunk_name,
  range_start,
  range_end,
  is_compressed,
  compressed_chunk_size,
  uncompressed_chunk_size,
  compression_status
FROM timescaledb_information.chunks
ORDER BY hypertable_name, range_start DESC;

-- View for compression statistics
CREATE OR REPLACE VIEW timescale_compression_stats AS
SELECT 
  hypertable_name,
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE is_compressed) as compressed_chunks,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE is_compressed) / COUNT(*),
    2
  ) as compression_percentage,
  pg_size_pretty(SUM(uncompressed_chunk_size)) as total_uncompressed_size,
  pg_size_pretty(SUM(compressed_chunk_size)) as total_compressed_size,
  ROUND(
    100.0 * (1 - SUM(compressed_chunk_size)::DECIMAL / NULLIF(SUM(uncompressed_chunk_size), 0)),
    2
  ) as space_saved_percentage
FROM timescaledb_information.chunks
GROUP BY hypertable_name;

-- View for policy information
CREATE OR REPLACE VIEW timescale_policies AS
SELECT 
  application_name,
  hypertable_name,
  policy_name,
  schedule_interval,
  config,
  stats
FROM timescaledb_information.jobs j
JOIN timescaledb_information.hypertables h ON j.hypertable_id = h.hypertable_id
WHERE job_type IN ('compression', 'retention', 'continuous_aggregate')
ORDER BY hypertable_name, policy_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'TimescaleDB setup completed successfully!';
  RAISE NOTICE 'Hypertables created: workflow_executions, workflow_stage_executions, provider_usage_logs, provider_health_logs, system_metrics, cost_analytics, anomalies';
  RAISE NOTICE 'Compression policies enabled for optimal storage';
  RAISE NOTICE 'Retention policies configured for data lifecycle management';
  RAISE NOTICE 'Continuous aggregates created for fast analytics queries';
  RAISE NOTICE 'Performance indexes and functions installed';
END $$;