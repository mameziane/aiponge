-- Monitoring Service Database Setup
-- This script creates the necessary tables for the monitoring microservice

-- Create UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Health Checks table
CREATE TABLE IF NOT EXISTS health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    check_type VARCHAR(50) NOT NULL,
    endpoint TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 30,
    timeout_ms INTEGER NOT NULL DEFAULT 5000,
    retry_count INTEGER NOT NULL DEFAULT 2,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Health Check Results table (time-series data)
CREATE TABLE IF NOT EXISTS health_check_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    health_check_id UUID NOT NULL REFERENCES health_checks(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    response_time_ms INTEGER NOT NULL,
    error_message TEXT,
    metadata JSONB,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Health Check Execution Tracking
CREATE TABLE IF NOT EXISTS health_check_executions (
    health_check_id UUID PRIMARY KEY REFERENCES health_checks(id) ON DELETE CASCADE,
    last_executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    next_execution_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_status VARCHAR(20),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    health_check_id UUID NOT NULL REFERENCES health_checks(id),
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    error_details TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    escalated_at TIMESTAMP WITH TIME ZONE
);

-- Alert Rules table
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    check_type VARCHAR(50) NOT NULL,
    condition VARCHAR(50) NOT NULL,
    threshold INTEGER NOT NULL,
    severity VARCHAR(20) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    cooldown_minutes INTEGER NOT NULL DEFAULT 5,
    escalation_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Metrics aggregation table for performance
CREATE TABLE IF NOT EXISTS metrics_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    check_type VARCHAR(50) NOT NULL,
    time_window VARCHAR(20) NOT NULL, -- '1min', '5min', '1hour'
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    avg_response_time INTEGER,
    p50_response_time INTEGER,
    p95_response_time INTEGER,
    p99_response_time INTEGER,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    total_checks INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance

-- Health Checks indexes
CREATE INDEX IF NOT EXISTS idx_health_checks_service ON health_checks(service_name);
CREATE INDEX IF NOT EXISTS idx_health_checks_enabled ON health_checks(is_enabled);
CREATE INDEX IF NOT EXISTS idx_health_checks_type ON health_checks(check_type);

-- Health Check Results indexes
CREATE INDEX IF NOT EXISTS idx_health_results_check_id ON health_check_results(health_check_id);
CREATE INDEX IF NOT EXISTS idx_health_results_timestamp ON health_check_results(timestamp);
CREATE INDEX IF NOT EXISTS idx_health_results_status ON health_check_results(status);
CREATE INDEX IF NOT EXISTS idx_health_results_check_time ON health_check_results(health_check_id, timestamp);

-- Health Check Executions indexes
CREATE INDEX IF NOT EXISTS idx_executions_next_execution ON health_check_executions(next_execution_at);
CREATE INDEX IF NOT EXISTS idx_executions_consecutive_failures ON health_check_executions(consecutive_failures);

-- Alerts indexes
CREATE INDEX IF NOT EXISTS idx_alerts_service ON alerts(service_name);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(status, created_at);

-- Alert Rules indexes
CREATE INDEX IF NOT EXISTS idx_alert_rules_service ON alert_rules(service_name);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(is_enabled);

-- Metrics Aggregates indexes
CREATE INDEX IF NOT EXISTS idx_metrics_service_window ON metrics_aggregates(service_name, time_window, window_start);
CREATE INDEX IF NOT EXISTS idx_metrics_window_start ON metrics_aggregates(window_start);

-- NOTE: Seed data (health checks and alert rules) is now managed by TypeScript seeder
-- Run: tsx packages/services/system-service/scripts/seed-monitoring-data.ts
-- This eliminates hardcoded ports and derives all configuration from @aiponge/shared-config