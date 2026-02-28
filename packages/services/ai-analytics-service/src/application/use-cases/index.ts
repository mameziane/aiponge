/**
 * AI Analytics Service - Use Cases Index
 * Centralized exports for all analytics and monitoring use cases
 */

// System Analytics & Health Monitoring
export * from './GetSystemHealthAnalyticsUseCase';
export * from './DetectAnomaliesUseCase';

// Provider Analytics & Performance
export * from './GetProviderAnalyticsUseCase';

// Reporting & Insights
export * from './GenerateInsightReportsUseCase';

// Event Management
// NOTE: ManageAlertRulesUseCase removed January 2026 - was never wired to database.
// Use system-service alerting infrastructure instead.
export * from './RecordEventUseCase';

// User Behavior Analytics (modular use cases)
export * from './behavior';

export * from './TrackUserBehaviorUseCase';

// Request Tracing & Visibility
export * from './tracing';
