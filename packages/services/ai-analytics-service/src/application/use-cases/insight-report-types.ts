import { ProviderAnalytics } from '../../domains/entities/ProviderAnalytics.js';
import { AnomalyDetectionResult } from '../../domains/entities/AnalyticsIntelligence.js';

export interface CostAnalyticsEntry {
  group: string;
  totalCost: number;
  requestCount: number;
  averageCost: number;
}

export interface InternalMetricEntry {
  serviceName: string;
  name: string;
  value: number;
  timestamp: Date;
}

export interface ReportData {
  metrics: Record<string, Record<string, InternalMetricEntry[]>>;
  providers: ProviderAnalytics[];
  costs: CostAnalyticsEntry[];
  anomalies: AnomalyDetectionResult[];
  dataPoints: number;
}

export interface ReportTemplate {
  sections: Array<{
    id: string;
    title: string;
    type: 'metrics' | 'analysis' | 'trends' | 'comparison';
  }>;
  visualizations: string[];
}

export interface SectionContent {
  summary: string;
  data: Record<string, unknown>;
  charts?: Visualization[];
  tables?: TableData[];
  insights?: string[];
}

export interface ProcessedWidget {
  id: string;
  title: string;
  data: Record<string, unknown>;
  visualization?: Record<string, string | number | boolean>;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

export interface ReportContentForOutput {
  reportId: string;
  reportType: string;
  title: string;
  executiveSummary?: ExecutiveSummary;
  sections: ReportSection[];
  visualizations?: Visualization[];
  recommendations?: Recommendation[];
  insights?: ReportInsight[];
  comparison?: ComparisonData;
}

export interface GenerateInsightReportsRequest {
  reportType: 'executive_summary' | 'operational_dashboard' | 'performance_analysis' | 'cost_analysis' | 'custom';
  startTime: Date;
  endTime: Date;
  compareWithPrevious?: boolean;
  serviceNames?: string[];
  providerIds?: string[];
  userSegments?: string[];
  includeExecutiveSummary?: boolean;
  includeDetailedMetrics?: boolean;
  includeVisualizations?: boolean;
  includeTrendAnalysis?: boolean;
  includeRecommendations?: boolean;
  includePredictiveInsights?: boolean;
  includeComparisons?: boolean;
  includeAnomalyAnalysis?: boolean;
  format: 'json' | 'html' | 'pdf' | 'csv' | 'excel';
  includeCharts?: boolean;
  includeRawData?: boolean;
  title?: string;
  description?: string;
  recipients?: string[];
  template?: string;
  branding?: {
    logoUrl?: string;
    companyName?: string;
    colors?: Record<string, string>;
  };
}

export interface DashboardRequest {
  dashboardType: 'overview' | 'providers' | 'costs' | 'health' | 'custom';
  timeRange: { start: Date; end: Date };
  filters?: Record<string, string | number | boolean>;
  refreshInterval?: number;
  widgets?: DashboardWidget[];
}

export interface CustomReportRequest {
  reportId: string;
  metrics: Array<{
    name: string;
    aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'percentile';
    percentile?: number;
    filters?: Record<string, string | number | boolean>;
    groupBy?: string[];
  }>;
  visualizations: Array<{
    type: 'line' | 'bar' | 'pie' | 'table' | 'heatmap' | 'gauge';
    title: string;
    metrics: string[];
    config?: Record<string, string | number | boolean>;
  }>;
  layout: {
    sections: Array<{
      title: string;
      widgets: string[];
      columns: number;
    }>;
  };
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'alert' | 'insight';
  title: string;
  config: Record<string, string | number | boolean>;
  dataSource: {
    metrics: string[];
    filters?: Record<string, string | number | boolean>;
    aggregation?: string;
  };
  visualization?: {
    type: string;
    options?: Record<string, string | number | boolean>;
  };
  size: {
    width: number;
    height: number;
  };
  position: {
    x: number;
    y: number;
  };
}

export interface GenerateInsightReportsResult {
  reportId: string;
  reportType: string;
  title: string;
  generatedAt: Date;
  timeRange: { start: Date; end: Date };
  format: string;
  executiveSummary?: ExecutiveSummary;
  sections: ReportSection[];
  visualizations?: Visualization[];
  recommendations?: Recommendation[];
  insights?: ReportInsight[];
  dataPoints: number;
  processingTimeMs: number;
  version: string;
  downloadUrl?: string;
  previewUrl?: string;
  size?: number;
  comparison?: ComparisonData;
  confidence: number;
  completeness: number;
  accuracy: number;
}

export interface ExecutiveSummary {
  keyMetrics: Array<{
    name: string;
    value: number | string;
    change?: number;
    trend: 'up' | 'down' | 'stable';
    status: 'good' | 'warning' | 'critical';
    context: string;
  }>;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  budgetImpact: {
    current: number;
    projected: number;
    savings: number;
  };
  performanceScore: number;
}

export interface ReportSection {
  id: string;
  title: string;
  description?: string;
  type: 'metrics' | 'analysis' | 'trends' | 'comparison' | 'custom';
  content: {
    summary: string;
    data: Record<string, unknown>;
    charts?: Visualization[];
    tables?: TableData[];
    insights?: string[];
  };
  priority: 'high' | 'medium' | 'low';
  completeness: number;
}

export interface Visualization {
  id: string;
  type: 'line_chart' | 'bar_chart' | 'pie_chart' | 'area_chart' | 'scatter_plot' | 'heatmap' | 'gauge' | 'table';
  title: string;
  description?: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      color?: string;
      metadata?: Record<string, string | number>;
    }>;
  };
  config: {
    xAxis?: { label: string; type?: 'time' | 'category' | 'linear' };
    yAxis?: { label: string; type?: 'linear' | 'logarithmic' };
    legend?: boolean;
    interactive?: boolean;
    responsive?: boolean;
    options?: Record<string, string | number | boolean>;
  };
  insights?: string[];
}

export interface TableData {
  id: string;
  title: string;
  headers: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'percentage' | 'currency';
    format?: string;
  }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  totals?: Record<string, string | number>;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
  };
  sortable?: boolean;
  filterable?: boolean;
}

export interface Recommendation {
  id: string;
  category: 'performance' | 'cost' | 'reliability' | 'security' | 'user_experience';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: {
    type: 'positive' | 'negative' | 'neutral';
    magnitude: 'low' | 'medium' | 'high';
    metrics: string[];
    estimatedValue?: number;
  };
  implementation: {
    effort: 'low' | 'medium' | 'high';
    timeline: string;
    steps: string[];
    prerequisites?: string[];
    risks?: string[];
  };
  evidence: {
    dataPoints: number;
    confidence: number;
    sources: string[];
    trends?: string[];
  };
  relatedInsights?: string[];
}

export interface ReportInsight {
  id: string;
  type: 'trend' | 'anomaly' | 'correlation' | 'prediction' | 'comparison';
  title: string;
  description: string;
  significance: 'high' | 'medium' | 'low';
  confidence: number;
  metrics: string[];
  timeframe: string;
  context: {
    background: string;
    implications: string[];
    relatedEvents?: string[];
  };
  actionable: boolean;
  recommendedActions?: string[];
}

export interface ComparisonData {
  period: string;
  metrics: Array<{
    name: string;
    current: number;
    previous: number;
    change: number;
    changeType: 'improvement' | 'degradation' | 'neutral';
  }>;
  summary: {
    overallTrend: 'improving' | 'declining' | 'stable';
    significantChanges: string[];
    keyFindings: string[];
  };
}

export interface DashboardResult {
  dashboardId: string;
  type: string;
  title: string;
  lastUpdated: Date;
  nextUpdate: Date;
  widgets: Array<{
    id: string;
    title: string;
    data: Record<string, unknown>;
    visualization?: Record<string, string | number | boolean>;
    status: 'loading' | 'ready' | 'error';
    error?: string;
  }>;
  filters: Record<string, string | number | boolean>;
  metadata: {
    dataFreshness: number;
    completeness: number;
    performanceScore: number;
  };
}
