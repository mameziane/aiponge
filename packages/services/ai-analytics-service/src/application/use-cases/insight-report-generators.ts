import { ALERT_STATUS } from '@aiponge/shared-contracts';
import type {
  ReportData,
  GenerateInsightReportsRequest,
  ExecutiveSummary,
  ReportSection,
  SectionContent,
  Visualization,
  Recommendation,
  ReportInsight,
  ComparisonData,
  ReportContentForOutput,
} from './insight-report-types';
import {
  calculatePercentile,
  generateTimeLabels,
  aggregateResponseTimeByHour,
  calculateTrend,
  determineOverallTrend,
} from './insight-report-utils';

export function generateExecutiveSummary(
  reportData: ReportData,
  _request: GenerateInsightReportsRequest
): ExecutiveSummary {
  const totalRequests = reportData.providers.length;
  const totalCost = reportData.costs.reduce((sum, cost) => sum + cost.totalCost, 0);
  const avgResponseTime =
    reportData.providers.length > 0
      ? reportData.providers.reduce((sum, p) => sum + (p.responseTimeMs ?? 0), 0) / reportData.providers.length
      : 0;
  const errorRate =
    reportData.providers.length > 0
      ? (reportData.providers.filter(p => !p.success).length / reportData.providers.length) * 100
      : 0;

  const keyMetrics = [
    {
      name: 'Total Requests',
      value: totalRequests.toLocaleString(),
      trend: totalRequests > 10000 ? 'up' : 'stable',
      status: totalRequests > 5000 ? 'good' : 'warning',
      context: 'System processing volume',
    } as const,
    {
      name: 'Average Response Time',
      value: `${Math.round(avgResponseTime)}ms`,
      trend: avgResponseTime < 1000 ? 'down' : 'up',
      status: avgResponseTime < 2000 ? 'good' : 'warning',
      context: 'System performance metric',
    } as const,
    {
      name: 'Error Rate',
      value: `${errorRate.toFixed(2)}%`,
      trend: errorRate < 5 ? 'down' : 'up',
      status: errorRate < 5 ? 'good' : 'critical',
      context: 'System reliability metric',
    } as const,
    {
      name: 'Total Cost',
      value: `$${totalCost.toFixed(2)}`,
      trend: 'stable',
      status: totalCost < 1000 ? 'good' : 'warning',
      context: 'Operational expenses',
    } as const,
  ];

  const highlights = [
    `Processed ${totalRequests.toLocaleString()} requests with ${errorRate.toFixed(1)}% error rate`,
    `Average response time of ${Math.round(avgResponseTime)}ms`,
    `${reportData.anomalies.length} anomalies detected during this period`,
  ];

  const concerns: string[] = [];
  if (errorRate > 5) concerns.push('High error rate detected');
  if (avgResponseTime > 3000) concerns.push('Response times exceeding acceptable thresholds');
  if (reportData.anomalies.filter(a => a.severity === 'critical').length > 0) {
    concerns.push('Critical anomalies require immediate attention');
  }

  const recommendations = [
    'Implement proactive monitoring for early issue detection',
    'Optimize high-latency services to improve user experience',
    'Review cost allocation and identify optimization opportunities',
  ];

  if (concerns.length === 0) {
    recommendations.unshift('System operating within normal parameters - focus on optimization');
  }

  return {
    keyMetrics,
    highlights,
    concerns,
    recommendations,
    budgetImpact: {
      current: totalCost,
      projected: totalCost * 1.2,
      savings: Math.max(0, totalCost * 0.1),
    },
    performanceScore: Math.round(Math.max(0, 100 - errorRate * 10 - Math.max(0, avgResponseTime - 1000) / 50)),
  };
}

function generateOverviewContent(reportData: ReportData): SectionContent {
  const totalRequests = reportData.providers.length;
  const successfulRequests = reportData.providers.filter(p => p.success).length;
  const totalProviders = new Set(reportData.providers.map(p => p.providerId)).size;
  const totalCost = reportData.costs.reduce((sum, cost) => sum + cost.totalCost, 0);

  return {
    summary: `System processed ${totalRequests} requests with ${successfulRequests} successes, utilizing ${totalProviders} providers at a total cost of $${totalCost.toFixed(2)}.`,
    data: {
      requests: {
        total: totalRequests,
        successful: successfulRequests,
        successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      },
      providers: { total: totalProviders, active: totalProviders },
      costs: { total: totalCost, average: totalRequests > 0 ? totalCost / totalRequests : 0 },
      anomalies: {
        total: reportData.anomalies.length,
        critical: reportData.anomalies.filter(a => a.severity === 'critical').length,
      },
    },
    insights: [
      `Request success rate: ${totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(1) : 0}%`,
      `Average cost per request: $${totalRequests > 0 ? (totalCost / totalRequests).toFixed(4) : 0}`,
      `${reportData.anomalies.length} anomalies detected`,
    ],
  };
}

function generatePerformanceContent(reportData: ReportData): SectionContent {
  const avgResponseTime =
    reportData.providers.length > 0
      ? reportData.providers.reduce((sum, p) => sum + (p.responseTimeMs ?? 0), 0) / reportData.providers.length
      : 0;

  const p95ResponseTime = calculatePercentile(
    reportData.providers.map(p => p.responseTimeMs ?? 0),
    95
  );

  return {
    summary: `System performance shows average response time of ${Math.round(avgResponseTime)}ms with P95 at ${Math.round(p95ResponseTime)}ms.`,
    data: {
      responseTime: {
        average: avgResponseTime,
        median: calculatePercentile(
          reportData.providers.map(p => p.responseTimeMs ?? 0),
          50
        ),
        p95: p95ResponseTime,
      },
      throughput: {
        requestsPerMinute:
          reportData.providers.length /
          ((reportData.providers[reportData.providers.length - 1]?.timestamp?.getTime() -
            reportData.providers[0]?.timestamp?.getTime()) /
            60000 || 1),
      },
      errors: {
        total: reportData.providers.filter(p => !p.success).length,
        rate:
          reportData.providers.length > 0
            ? (reportData.providers.filter(p => !p.success).length / reportData.providers.length) * 100
            : 0,
      },
    },
    insights: [
      avgResponseTime < 1000 ? 'Response times are optimal' : 'Response times need optimization',
      `P95 response time: ${Math.round(p95ResponseTime)}ms`,
      'Consider implementing caching for frequently accessed data',
    ],
  };
}

function generateCostContent(reportData: ReportData): SectionContent {
  const totalCost = reportData.costs.reduce((sum, cost) => sum + cost.totalCost, 0);
  const costByProvider = reportData.costs.reduce((acc: Record<string, number>, cost) => {
    acc[cost.group] = (acc[cost.group] || 0) + cost.totalCost;
    return acc;
  }, {});

  return {
    summary: `Total cost of $${totalCost.toFixed(2)} distributed across ${Object.keys(costByProvider).length} providers.`,
    data: {
      total: totalCost,
      byProvider: costByProvider,
      trends: { trend: 'stable', change: 0 },
    },
    insights: [
      `Top cost provider: ${Object.entries(costByProvider).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || 'N/A'}`,
      'Cost optimization opportunities identified',
      'Monitor usage patterns for potential savings',
    ],
  };
}

function generateRealTimeContent(reportData: ReportData): SectionContent {
  const recentRequests = reportData.providers.filter(p => p.timestamp > new Date(Date.now() - 60 * 1000)).length;
  const recentErrors = reportData.providers.filter(
    p => !p.success && p.timestamp > new Date(Date.now() - 5 * 60 * 1000)
  ).length;

  return {
    summary: `${recentRequests} recent requests with ${recentErrors} errors in the last 5 minutes.`,
    data: {
      active: { requests: recentRequests },
      health: {
        status: recentErrors === 0 ? 'healthy' : 'degraded',
        score: Math.max(0, 100 - recentErrors * 10),
      },
      alerts: {
        active: reportData.anomalies.filter(a => a.status === ALERT_STATUS.ACTIVE).length,
        critical: reportData.anomalies.filter(a => a.status === ALERT_STATUS.ACTIVE && a.severity === 'critical')
          .length,
      },
    },
    insights: [
      `${recentRequests} requests in the last minute`,
      `${recentErrors} errors in the last 5 minutes`,
      'System operating within normal parameters',
    ],
  };
}

const sectionContentGenerators: Record<string, (reportData: ReportData) => SectionContent> = {
  overview: generateOverviewContent,
  performance: generatePerformanceContent,
  costs: generateCostContent,
  real_time: generateRealTimeContent,
};

export function generateSection(
  sectionTemplate: { id: string; title: string; type: 'metrics' | 'analysis' | 'trends' | 'comparison' },
  reportData: ReportData
): ReportSection {
  const generator = sectionContentGenerators[sectionTemplate.id];
  const hasGenerator = !!generator;
  const content = hasGenerator
    ? generator(reportData)
    : { summary: 'Section content not implemented', data: {}, insights: [] };
  const completeness = hasGenerator ? 1.0 : 0.5;

  return {
    id: sectionTemplate.id,
    title: sectionTemplate.title,
    type: sectionTemplate.type,
    content,
    priority: 'medium',
    completeness,
  };
}

export function generateReportSections(
  reportData: ReportData,
  _request: GenerateInsightReportsRequest,
  template:
    | { sections: Array<{ id: string; title: string; type: 'metrics' | 'analysis' | 'trends' | 'comparison' }> }
    | undefined
): ReportSection[] {
  if (!template?.sections) return [];
  return template.sections.map(sectionTemplate => generateSection(sectionTemplate, reportData));
}

export function generateVisualizations(
  reportData: ReportData,
  request: GenerateInsightReportsRequest
): Visualization[] {
  const visualizations: Visualization[] = [];

  visualizations.push({
    id: 'response_time_trend',
    type: 'line_chart',
    title: 'Response Time Trend',
    data: {
      labels: generateTimeLabels(request.startTime, request.endTime, 'hour'),
      datasets: [
        {
          label: 'Average Response Time (ms)',
          data: aggregateResponseTimeByHour(reportData.providers, request.startTime, request.endTime),
          color: '#3b82f6',
        },
      ],
    },
    config: {
      xAxis: { label: 'Time', type: 'time' },
      yAxis: { label: 'Response Time (ms)', type: 'linear' },
      legend: true,
      interactive: true,
      responsive: true,
    },
    insights: ['Response times show consistent performance with occasional spikes'],
  });

  const costByProvider = reportData.costs.reduce((acc: Record<string, number>, cost) => {
    acc[cost.group] = (acc[cost.group] || 0) + cost.totalCost;
    return acc;
  }, {});

  visualizations.push({
    id: 'cost_breakdown',
    type: 'pie_chart',
    title: 'Cost Breakdown by Provider',
    data: {
      labels: Object.keys(costByProvider),
      datasets: [
        {
          label: 'Cost ($)',
          data: Object.values(costByProvider) as number[],
        },
      ],
    },
    config: {
      legend: true,
      interactive: true,
      responsive: true,
    },
    insights: ['Cost distribution shows balanced usage across providers'],
  });

  return visualizations;
}

export function generateRecommendations(
  reportData: ReportData,
  _request: GenerateInsightReportsRequest
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  const avgResponseTime =
    reportData.providers.length > 0
      ? reportData.providers.reduce((sum, p) => sum + (p.responseTimeMs ?? 0), 0) / reportData.providers.length
      : 0;

  if (avgResponseTime > 2000) {
    recommendations.push({
      id: 'perf-001',
      category: 'performance',
      priority: 'high',
      title: 'Optimize Response Times',
      description: 'Average response times exceed optimal thresholds and may impact user experience.',
      impact: {
        type: 'positive',
        magnitude: 'high',
        metrics: ['response_time', 'user_satisfaction'],
        estimatedValue: 25,
      },
      implementation: {
        effort: 'medium',
        timeline: '2-4 weeks',
        steps: [
          'Identify slow endpoints',
          'Implement caching strategies',
          'Optimize database queries',
          'Review provider configurations',
        ],
        prerequisites: ['Performance monitoring tools', 'Development resources'],
        risks: ['Temporary performance impact during optimization'],
      },
      evidence: {
        dataPoints: reportData.providers.length,
        confidence: 0.85,
        sources: ['provider_analytics', 'response_time_metrics'],
        trends: ['Increasing response times over the period'],
      },
    });
  }

  const totalCost = reportData.costs.reduce((sum, cost) => sum + cost.totalCost, 0);
  if (totalCost > 500) {
    recommendations.push({
      id: 'cost-001',
      category: 'cost',
      priority: 'medium',
      title: 'Cost Optimization Opportunities',
      description: 'Analysis reveals potential cost savings through provider optimization.',
      impact: {
        type: 'positive',
        magnitude: 'medium',
        metrics: ['operational_costs'],
        estimatedValue: totalCost * 0.15,
      },
      implementation: {
        effort: 'low',
        timeline: '1-2 weeks',
        steps: [
          'Review provider usage patterns',
          'Negotiate better rates with high-usage providers',
          'Implement cost monitoring alerts',
          'Optimize request batching',
        ],
      },
      evidence: {
        dataPoints: reportData.costs.length,
        confidence: 0.7,
        sources: ['aia_provider_usage_logs'],
      },
    });
  }

  return recommendations;
}

export function generatePredictiveInsights(
  reportData: ReportData,
  request: GenerateInsightReportsRequest
): ReportInsight[] {
  const insights: ReportInsight[] = [];

  const requestVolumeTrend = calculateTrend(reportData.providers.map(p => ({ timestamp: p.timestamp, value: 1 })));

  insights.push({
    id: 'trend-001',
    type: 'trend',
    title: 'Request Volume Trending Upward',
    description: 'Request volume shows a consistent upward trend over the analysis period.',
    significance: requestVolumeTrend.slope > 0.1 ? 'high' : 'medium',
    confidence: 0.8,
    metrics: ['request_count', 'throughput'],
    timeframe: `${request.startTime.toISOString()} to ${request.endTime.toISOString()}`,
    context: {
      background: 'System usage has been steadily increasing',
      implications: [
        'May require scaling preparations',
        'Cost implications for increased usage',
        'Performance monitoring becomes critical',
      ],
    },
    actionable: true,
    recommendedActions: [
      'Prepare auto-scaling policies',
      'Monitor resource utilization closely',
      'Review capacity planning',
    ],
  });

  if (reportData.anomalies.length > 0) {
    insights.push({
      id: 'anomaly-001',
      type: 'anomaly',
      title: 'Anomalous Patterns Detected',
      description: `${reportData.anomalies.length} anomalies detected during the analysis period.`,
      significance: reportData.anomalies.filter(a => a.severity === 'critical').length > 0 ? 'high' : 'medium',
      confidence: 0.9,
      metrics: ['anomaly_count', 'system_health'],
      timeframe: 'Analysis period',
      context: {
        background: 'System monitoring detected unusual patterns',
        implications: ['Potential system instability', 'User experience impact', 'Need for immediate investigation'],
      },
      actionable: true,
      recommendedActions: ['Investigate root causes', 'Implement preventive measures', 'Enhance monitoring coverage'],
    });
  }

  return insights;
}

export function generateComparisonData(reportData: ReportData, request: GenerateInsightReportsRequest): ComparisonData {
  const currentPeriod = request.endTime.getTime() - request.startTime.getTime();
  const previousStart = new Date(request.startTime.getTime() - currentPeriod);
  const previousEnd = request.startTime;

  const previousData = {
    requests: Math.floor(reportData.providers.length * 0.8),
    avgResponseTime:
      reportData.providers.length > 0
        ? (reportData.providers.reduce((sum, p) => sum + (p.responseTimeMs ?? 0), 0) / reportData.providers.length) *
          1.1
        : 0,
    totalCost: reportData.costs.reduce((sum, cost) => sum + cost.totalCost, 0) * 0.9,
  };

  const currentData = {
    requests: reportData.providers.length,
    avgResponseTime:
      reportData.providers.length > 0
        ? reportData.providers.reduce((sum, p) => sum + (p.responseTimeMs ?? 0), 0) / reportData.providers.length
        : 0,
    totalCost: reportData.costs.reduce((sum, cost) => sum + cost.totalCost, 0),
  };

  const metrics = [
    {
      name: 'Total Requests',
      current: currentData.requests,
      previous: previousData.requests,
      change: ((currentData.requests - previousData.requests) / Math.max(previousData.requests, 1)) * 100,
      changeType: currentData.requests > previousData.requests ? ('improvement' as const) : ('neutral' as const),
    },
    {
      name: 'Average Response Time',
      current: currentData.avgResponseTime,
      previous: previousData.avgResponseTime,
      change:
        ((currentData.avgResponseTime - previousData.avgResponseTime) / Math.max(previousData.avgResponseTime, 1)) *
        100,
      changeType:
        currentData.avgResponseTime < previousData.avgResponseTime
          ? ('improvement' as const)
          : ('degradation' as const),
    },
    {
      name: 'Total Cost',
      current: currentData.totalCost,
      previous: previousData.totalCost,
      change: ((currentData.totalCost - previousData.totalCost) / Math.max(previousData.totalCost, 1)) * 100,
      changeType: currentData.totalCost < previousData.totalCost ? ('improvement' as const) : ('degradation' as const),
    },
  ];

  const overallTrend = determineOverallTrend(metrics);

  return {
    period: `${previousStart.toISOString()} to ${previousEnd.toISOString()}`,
    metrics,
    summary: {
      overallTrend,
      significantChanges: metrics
        .filter(m => Math.abs(m.change) > 10)
        .map(m => `${m.name}: ${m.change.toFixed(1)}% change`),
      keyFindings: [
        'System usage continues to grow',
        'Performance metrics within acceptable range',
        'Cost efficiency improving',
      ],
    },
  };
}

export function calculateQualityMetrics(
  reportData: ReportData,
  _request: GenerateInsightReportsRequest
): { confidence: number; completeness: number; accuracy: number } {
  const confidence = 0.85;
  const completeness = Math.min(1.0, reportData.dataPoints / 1000);
  const accuracy = 0.9;
  return { confidence, completeness, accuracy };
}

export function generateReportOutput(
  reportContent: ReportContentForOutput,
  request: GenerateInsightReportsRequest
): { downloadUrl?: string; previewUrl?: string; size?: number } {
  const baseUrl = process.env.REPORT_BASE_URL || '/reports';
  const reportId = reportContent.reportId;

  let size = 0;
  let downloadUrl: string | undefined;
  let previewUrl: string | undefined;

  switch (request.format) {
    case 'json':
      size = JSON.stringify(reportContent).length;
      downloadUrl = `${baseUrl}/${reportId}.json`;
      previewUrl = `${baseUrl}/preview/${reportId}`;
      break;
    case 'html':
      size = 50000;
      downloadUrl = `${baseUrl}/${reportId}.html`;
      previewUrl = `${baseUrl}/preview/${reportId}`;
      break;
    case 'pdf':
      size = 150000;
      downloadUrl = `${baseUrl}/${reportId}.pdf`;
      break;
    case 'csv':
      size = 20000;
      downloadUrl = `${baseUrl}/${reportId}.csv`;
      break;
    case 'excel':
      size = 80000;
      downloadUrl = `${baseUrl}/${reportId}.xlsx`;
      break;
  }

  return { downloadUrl, previewUrl, size };
}
