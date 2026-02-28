/**
 * Generate Insight Reports Use Case
 * Thin orchestrator that coordinates report generation, dashboards, and custom reports
 */

import { v4 as uuidv4 } from 'uuid';
import { errorMessage } from '@aiponge/platform-core';
import { IAnalyticsRepository } from '../../domains/repositories/IAnalyticsRepository';
import { MetricFilter } from '../../domains/entities/MetricEntry.js';
import { getLogger } from '../../config/service-urls';
import { AnalyticsError } from '../errors';

import type {
  ReportData,
  ReportTemplate,
  GenerateInsightReportsRequest,
  GenerateInsightReportsResult,
  DashboardRequest,
  DashboardResult,
  DashboardWidget,
  CustomReportRequest,
  ProcessedWidget,
  ReportSection,
  Visualization,
  InternalMetricEntry,
} from './insight-report-types';

import {
  generateExecutiveSummary,
  generateReportSections,
  generateVisualizations,
  generateRecommendations,
  generatePredictiveInsights,
  generateComparisonData,
  calculateQualityMetrics,
  generateReportOutput,
} from './insight-report-generators';

import {
  processMetricsData,
  generateReportTitle,
  generateDashboardTitle,
} from './insight-report-utils';

// Re-export all types for backward compatibility
export type {
  GenerateInsightReportsRequest,
  GenerateInsightReportsResult,
  DashboardRequest,
  DashboardResult,
  DashboardWidget,
  CustomReportRequest,
} from './insight-report-types';

export type {
  ExecutiveSummary,
  ReportSection,
  Visualization,
  TableData,
  Recommendation,
  ReportInsight,
  ComparisonData,
} from './insight-report-types';

const logger = getLogger('ai-analytics-service-generateinsightreportsusecase');

export class GenerateInsightReportsUseCase {
  private readonly reportTemplates = new Map<string, ReportTemplate>();

  constructor(private readonly repository: IAnalyticsRepository) {
    this.initializeReportTemplates();
    logger.info('Initialized insight reports service');
  }

  async execute(request: GenerateInsightReportsRequest): Promise<GenerateInsightReportsResult> {
    try {
      const startTime = Date.now();
      const reportId = uuidv4();

      logger.info('Generating {} report for {}', { data0: request.reportType, data1: request.format });

      this.validateReportRequest(request);

      const template = this.reportTemplates.get(request.reportType) || this.reportTemplates.get('custom');
      const reportData = await this.gatherReportData(request);

      const executiveSummary =
        request.includeExecutiveSummary && request.reportType !== 'operational_dashboard'
          ? generateExecutiveSummary(reportData, request)
          : undefined;

      const sections = generateReportSections(reportData, request, template);

      const [visualizations, recommendations, insights, comparison] = await Promise.all([
        request.includeVisualizations ? Promise.resolve(generateVisualizations(reportData, request)) : Promise.resolve(undefined),
        request.includeRecommendations ? Promise.resolve(generateRecommendations(reportData, request)) : Promise.resolve(undefined),
        request.includePredictiveInsights ? Promise.resolve(generatePredictiveInsights(reportData, request)) : Promise.resolve(undefined),
        request.compareWithPrevious ? Promise.resolve(generateComparisonData(reportData, request)) : Promise.resolve(undefined),
      ]);

      const { confidence, completeness, accuracy } = calculateQualityMetrics(reportData, request);
      const title = request.title || generateReportTitle(request.reportType, request.startTime);

      const { downloadUrl, previewUrl, size } = generateReportOutput(
        {
          reportId,
          reportType: request.reportType,
          title,
          executiveSummary,
          sections,
          visualizations,
          recommendations,
          insights,
          comparison,
        },
        request
      );

      const processingTime = Date.now() - startTime;

      await this.recordReportAnalytics(request, reportId, processingTime, reportData.dataPoints);

      logger.info('Generated report {} in {}ms', { data0: reportId, data1: processingTime });

      return {
        reportId,
        reportType: request.reportType,
        title,
        generatedAt: new Date(),
        timeRange: { start: request.startTime, end: request.endTime },
        format: request.format,
        executiveSummary,
        sections,
        visualizations,
        recommendations,
        insights,
        dataPoints: reportData.dataPoints,
        processingTimeMs: processingTime,
        version: '1.0.0',
        downloadUrl,
        previewUrl,
        size,
        comparison,
        confidence,
        completeness,
        accuracy,
      };
    } catch (error) {
      logger.error('Failed to generate insight report:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw AnalyticsError.internalError(
        `Failed to generate insight report: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async generateDashboard(request: DashboardRequest): Promise<DashboardResult> {
    try {
      const dashboardId = uuidv4();
      const startTime = Date.now();

      const dashboardType = request.dashboardType === 'custom' ? 'overview' : request.dashboardType;
      const dashboardData = await this.repository.getDashboardData(dashboardType, request.timeRange, request.filters);

      const widgets = await this.generateDashboardWidgets(
        request.widgets || this.getDefaultWidgets(request.dashboardType),
        dashboardData,
      );

      const processingTime = Date.now() - startTime;

      return {
        dashboardId,
        type: request.dashboardType,
        title: generateDashboardTitle(request.dashboardType),
        lastUpdated: new Date(),
        nextUpdate: new Date(Date.now() + (request.refreshInterval || 5) * 60 * 1000),
        widgets,
        filters: request.filters || {},
        metadata: {
          dataFreshness: 1,
          completeness: 0.95,
          performanceScore: Math.max(0, 100 - processingTime / 10),
        },
      };
    } catch (error) {
      logger.error('Failed to generate dashboard:', { error: error instanceof Error ? error.message : String(error) });
      throw AnalyticsError.internalError(
        `Failed to generate dashboard: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async generateCustomReport(request: CustomReportRequest): Promise<GenerateInsightReportsResult> {
    try {
      const sections: ReportSection[] = request.layout.sections.map(section => ({
        id: section.title.toLowerCase().replace(/\s+/g, '_'),
        title: section.title,
        type: 'custom',
        content: { summary: `Custom section: ${section.title}`, data: {} },
        priority: 'medium',
        completeness: 1.0,
      }));

      const vizTypeMap: Record<string, Visualization['type']> = {
        line: 'line_chart', bar: 'bar_chart', pie: 'pie_chart',
        table: 'table', heatmap: 'heatmap', gauge: 'gauge',
      };

      const visualizations: Visualization[] = request.visualizations.map(viz => ({
        id: viz.title.toLowerCase().replace(/\s+/g, '_'),
        type: vizTypeMap[viz.type] || 'bar_chart',
        title: viz.title,
        data: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4'],
          datasets: [{ label: 'Sample Data', data: [10, 20, 30, 40] }],
        },
        config: { responsive: true },
      }));

      return {
        reportId: request.reportId,
        reportType: 'custom',
        title: `Custom Report - ${request.reportId}`,
        generatedAt: new Date(),
        timeRange: { start: new Date(), end: new Date() },
        format: 'json',
        sections,
        visualizations,
        dataPoints: 1000,
        processingTimeMs: Date.now(),
        version: '1.0.0',
        confidence: 0.9,
        completeness: 0.95,
        accuracy: 0.9,
      };
    } catch (error) {
      logger.error('Failed to generate custom report:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw AnalyticsError.internalError(
        `Failed to generate custom report: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private initializeReportTemplates(): void {
    this.reportTemplates.set('executive_summary', {
      sections: [
        { id: 'overview', title: 'System Overview', type: 'metrics' },
        { id: 'performance', title: 'Performance Highlights', type: 'analysis' },
        { id: 'costs', title: 'Cost Analysis', type: 'analysis' },
        { id: 'recommendations', title: 'Strategic Recommendations', type: 'analysis' },
      ],
      visualizations: ['system_health_gauge', 'cost_trends', 'performance_timeline'],
    });

    this.reportTemplates.set('operational_dashboard', {
      sections: [
        { id: 'real_time', title: 'Real-time Metrics', type: 'metrics' },
        { id: 'services', title: 'Service Health', type: 'metrics' },
        { id: 'providers', title: 'Provider Status', type: 'metrics' },
        { id: 'alerts', title: 'Active Alerts', type: 'metrics' },
      ],
      visualizations: ['service_status_grid', 'response_time_chart', 'error_rate_chart'],
    });

    this.reportTemplates.set('performance_analysis', {
      sections: [
        { id: 'trends', title: 'Performance Trends', type: 'trends' },
        { id: 'bottlenecks', title: 'Bottleneck Analysis', type: 'analysis' },
        { id: 'optimization', title: 'Optimization Opportunities', type: 'analysis' },
        { id: 'comparison', title: 'Historical Comparison', type: 'comparison' },
      ],
      visualizations: ['performance_timeline', 'bottleneck_heatmap', 'comparison_charts'],
    });

    this.reportTemplates.set('cost_analysis', {
      sections: [
        { id: 'spending', title: 'Spending Overview', type: 'metrics' },
        { id: 'trends', title: 'Cost Trends', type: 'trends' },
        { id: 'breakdown', title: 'Cost Breakdown', type: 'analysis' },
        { id: 'optimization', title: 'Cost Optimization', type: 'analysis' },
      ],
      visualizations: ['cost_pie_chart', 'trend_lines', 'provider_comparison'],
    });
  }

  private validateReportRequest(request: GenerateInsightReportsRequest): void {
    if (!request.startTime || !request.endTime) {
      throw AnalyticsError.invalidDateRange('Start time and end time are required');
    }
    if (request.startTime >= request.endTime) {
      throw AnalyticsError.invalidDateRange('Start time must be before end time');
    }
    const maxTimeRange = 90 * 24 * 60 * 60 * 1000;
    if (request.endTime.getTime() - request.startTime.getTime() > maxTimeRange) {
      throw AnalyticsError.invalidDateRange('Time range cannot exceed 90 days');
    }
    if (!['json', 'html', 'pdf', 'csv', 'excel'].includes(request.format)) {
      throw AnalyticsError.validationError('format', 'Invalid format specified');
    }
  }

  private async gatherReportData(request: GenerateInsightReportsRequest): Promise<ReportData> {
    const filter: MetricFilter = {
      startTime: request.startTime,
      endTime: request.endTime,
      serviceName: request.serviceNames?.join(','),
    };

    const [metrics, providers, costs, anomalies] = await Promise.all([
      this.repository.getMetrics(filter),
      this.repository.getProviderUsage({
        startTime: request.startTime,
        endTime: request.endTime,
        limit: 10000,
      }),
      this.repository.getProviderCostAnalytics(request.startTime, request.endTime, 'provider'),
      this.repository.getAnomalies({
        startTime: request.startTime,
        endTime: request.endTime,
      }),
    ]);

    return {
      metrics: processMetricsData(metrics as InternalMetricEntry[]),
      providers,
      costs,
      anomalies,
      dataPoints: (metrics as InternalMetricEntry[]).length + providers.length + anomalies.length,
    };
  }

  private async recordReportAnalytics(
    request: GenerateInsightReportsRequest,
    reportId: string,
    processingTime: number,
    dataPoints: number
  ): Promise<void> {
    try {
      await this.repository.recordMetric({
        name: 'report.generated',
        value: 1,
        timestamp: new Date(),
        tags: {
          reportType: request.reportType,
          format: request.format,
          reportId,
          processingTime: processingTime.toString(),
          dataPoints: dataPoints.toString(),
        },
        serviceName: 'ai-analytics-service',
        source: 'report-generator',
        metricType: 'counter',
        unit: 'reports',
      });
    } catch (error) {
      logger.warn('Failed to record report analytics:', { data: error });
    }
  }

  private async generateDashboardWidgets(
    widgets: DashboardWidget[],
    dashboardData: Record<string, unknown>,
  ): Promise<ProcessedWidget[]> {
    const processedWidgets: ProcessedWidget[] = [];

    for (const widget of widgets) {
      try {
        logger.warn('processWidgetData not implemented - returning placeholder data', {
          widgetId: widget.id,
          widgetType: widget.type,
          method: 'processWidgetData',
          reason: 'TimescaleDB analytics integration required',
        });

        const widgetData = {
          value: 0,
          change: 0,
          trend: 'stable',
          timestamp: new Date(),
          status: 'not_implemented',
          dataAvailable: false,
        };

        const flatVisualization: Record<string, string | number | boolean> | undefined = widget.visualization
          ? { type: widget.visualization.type, ...widget.visualization.options }
          : undefined;

        processedWidgets.push({
          id: widget.id,
          title: widget.title,
          data: widgetData,
          visualization: flatVisualization,
          status: 'ready',
        });
      } catch (error) {
        processedWidgets.push({
          id: widget.id,
          title: widget.title,
          data: {},
          status: 'error',
          error: errorMessage(error),
        });
      }
    }

    return processedWidgets;
  }

  private getDefaultWidgets(dashboardType: string): DashboardWidget[] {
    const defaultWidgets: Record<string, DashboardWidget[]> = {
      overview: [
        {
          id: 'system-health',
          type: 'metric',
          title: 'System Health',
          config: {},
          dataSource: { metrics: ['health_score'] },
          size: { width: 4, height: 2 },
          position: { x: 0, y: 0 },
        },
      ],
    };
    return defaultWidgets[dashboardType] || [];
  }
}
