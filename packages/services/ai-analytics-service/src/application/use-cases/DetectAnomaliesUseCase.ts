/**
 * Detect Anomalies Use Case
 * Real-time anomaly detection, pattern analysis, threshold monitoring,
 * and intelligent alerting with advanced statistical analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { errorMessage } from '@aiponge/platform-core';
import { IAnalyticsRepository, IIntelligenceRepository } from '../../domains/repositories/IAnalyticsRepository';
import { AnomalyDetectionResult, AnomalyType } from '../../domains/entities/AnalyticsIntelligence';
import { MetricEntry } from '../../domains/entities/MetricEntry';
import { getLogger } from '../../config/service-urls';
import { AnalyticsError } from '../errors';

// ===== REQUEST INTERFACES =====

const logger = getLogger('ai-analytics-service-detectanomaliesusecase');

export interface DetectAnomaliesRequest {
  // Detection scope
  metricNames?: string[];
  serviceNames?: string[];
  providerIds?: string[];

  // Time range
  startTime?: Date;
  endTime?: Date;
  timeRange?: 'last_5m' | 'last_hour' | 'last_24h' | 'last_7d' | 'last_30d';

  // Detection configuration
  algorithms?: ('statistical' | 'threshold' | 'seasonal' | 'ml_based' | 'pattern_matching')[];
  sensitivity?: 'low' | 'medium' | 'high';

  // Threshold settings
  thresholds?: {
    upper?: number;
    lower?: number;
    percentage?: boolean; // if true, thresholds are percentage-based
    baseline?: 'historical_average' | 'rolling_average' | 'fixed_value';
  };

  // Statistical settings
  statisticalSettings?: {
    confidenceLevel?: number; // 0.95, 0.99, etc.
    windowSize?: number; // number of data points for analysis
    seasonalityPeriod?: number; // hours, days, weeks
    outlierMethod?: 'zscore' | 'iqr' | 'isolation_forest';
  };

  // Real-time settings
  realTimeMode?: boolean;
  bufferSize?: number;

  // Output options
  includeContext?: boolean;
  includeRecommendations?: boolean;
  includePredictions?: boolean;
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AnomalyPatternAnalysisRequest {
  anomalyIds: string[];
  analysisType: 'correlation' | 'causation' | 'clustering' | 'trend_analysis';
  lookbackDays: number;
  includeExternalFactors?: boolean;
}

export interface ConfigureAnomalyDetectionRequest {
  metricName: string;
  serviceName?: string;
  providerId?: string;

  // Detection rules
  rules: Array<{
    ruleId: string;
    ruleName: string;
    algorithm: 'statistical' | 'threshold' | 'seasonal' | 'ml_based';
    parameters: Record<string, unknown>;
    severity: 'low' | 'medium' | 'high' | 'critical';
    enabled: boolean;
  }>;

  // Alert configuration
  alerting: {
    enabled: boolean;
    channels: string[];
    escalationRules?: Array<{
      timeMinutes: number;
      severity: 'high' | 'critical';
      additionalChannels: string[];
    }>;
    suppressionRules?: {
      duplicateWindow: number; // minutes
      maxAlertsPerHour: number;
    };
  };
}

// ===== RESPONSE INTERFACES =====

export interface DetectAnomaliesResult {
  anomalies: AnomalyDetection[];
  summary: AnomalySummary;
  patterns?: AnomalyPattern[];
  predictions?: AnomalyPrediction[];
  recommendations?: AnomalyRecommendation[];
  processingStats: {
    dataPointsAnalyzed: number;
    algorithmsUsed: string[];
    processingTimeMs: number;
    confidence: number;
  };
  lastAnalyzed: Date;
  nextAnalysis?: Date;
}

export interface AnomalyDetection {
  id: string;
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Metric information
  metricName: string;
  serviceName?: string;
  providerId?: string;

  // Detection details
  detectedAt: Date;
  detectionAlgorithm: string;
  confidence: number; // 0-1

  // Values
  actualValue: number;
  expectedValue?: number;
  threshold?: {
    upper?: number;
    lower?: number;
    type: 'static' | 'dynamic' | 'seasonal';
  };
  deviation: {
    absolute: number;
    percentage: number;
    zScore?: number;
  };

  // Context
  context: {
    timeWindow: string;
    seasonality?: 'hourly' | 'daily' | 'weekly' | 'monthly';
    historicalRange: { min: number; max: number; avg: number };
    recentTrend: 'increasing' | 'decreasing' | 'stable';
    correlatedMetrics?: Array<{
      metricName: string;
      correlation: number;
      anomalousAtSameTime: boolean;
    }>;
  };

  // Status
  status: 'active' | 'acknowledged' | 'resolved' | 'false_positive';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  resolution?: string;

  // Impact assessment
  impact: {
    scope: 'local' | 'service' | 'system_wide';
    affectedUsers?: number;
    estimatedCost?: number;
    businessImpact: 'low' | 'medium' | 'high';
    downstreamEffects?: string[];
  };

  // Metadata
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AnomalySummary {
  totalAnomalies: number;
  newAnomalies: number;
  resolvedAnomalies: number;

  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  byType: Record<AnomalyType, number>;

  byService: Record<
    string,
    {
      count: number;
      criticalCount: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    }
  >;

  trends: {
    anomalyRate: number; // anomalies per hour
    averageSeverity: number; // 0-4 scale
    resolutionTime: number; // average minutes to resolution
    falsePositiveRate: number; // percentage
  };

  insights: string[];
}

export interface AnomalyPattern {
  id: string;
  patternType: 'recurring' | 'cascade' | 'correlation' | 'temporal';
  description: string;
  confidence: number;

  // Pattern details
  frequency?: {
    interval: number;
    unit: 'minutes' | 'hours' | 'days';
    occurrences: number;
  };

  involved: {
    services: string[];
    metrics: string[];
    providers?: string[];
  };

  correlation: {
    strength: number; // -1 to 1
    lag: number; // milliseconds
    description: string;
  };

  impact: {
    predictability: number; // 0-1, how predictable future occurrences are
    severity: 'low' | 'medium' | 'high';
    businessRelevance: number; // 0-1
  };

  recommendations: string[];
}

export interface AnomalyPrediction {
  id: string;
  type: 'threshold_breach' | 'pattern_recurrence' | 'cascade_effect' | 'seasonal_anomaly';

  // Prediction details
  predictedAt: Date;
  predictionHorizon: number; // hours into the future
  probability: number; // 0-1
  confidence: number; // 0-1

  // Target information
  targetMetric: string;
  targetService?: string;
  expectedTime: Date;
  expectedValue: number;
  expectedSeverity: 'low' | 'medium' | 'high' | 'critical';

  // Supporting evidence
  basedOn: {
    historicalPatterns: number;
    correlationAnalysis: boolean;
    seasonalTrends: boolean;
    externalFactors?: string[];
  };

  // Prevention
  preventionMeasures?: Array<{
    action: string;
    effectiveness: number; // 0-1
    effort: 'low' | 'medium' | 'high';
    timeline: string;
  }>;

  monitoringRecommendations: string[];
}

export interface AnomalyRecommendation {
  id: string;
  category: 'immediate_action' | 'monitoring' | 'threshold_adjustment' | 'process_improvement';
  priority: 'low' | 'medium' | 'high' | 'urgent';

  title: string;
  description: string;
  reasoning: string;

  // Action details
  suggestedAction: string;
  expectedOutcome: string;
  effort: 'low' | 'medium' | 'high';
  timeline: string;

  // Impact
  riskReduction: number; // 0-1
  costImpact?: number;
  implementationComplexity: 'simple' | 'moderate' | 'complex';

  // Dependencies
  prerequisites?: string[];
  affectedSystems: string[];

  // Tracking
  success_metrics: string[];
  reviewDate?: Date;
}

export interface AnomalyPatternAnalysisResult {
  analysisId: string;
  analysisType: string;
  analyzedAnomalies: number;

  patterns: AnomalyPattern[];

  correlations: Array<{
    anomalyPair: [string, string];
    correlation: number;
    timeShift: number; // milliseconds
    significance: 'low' | 'medium' | 'high';
    description: string;
  }>;

  clusters: Array<{
    clusterId: string;
    anomalies: string[];
    centerPoint: {
      time: Date;
      characteristics: Record<string, number>;
    };
    radius: number;
    cohesion: number; // 0-1
  }>;

  trends: Array<{
    metric: string;
    trendType: 'linear' | 'exponential' | 'seasonal' | 'random';
    strength: number; // 0-1
    direction: 'increasing' | 'decreasing' | 'oscillating';
    prediction: {
      nextOccurrence?: Date;
      confidence: number;
    };
  }>;

  insights: string[];
  recommendations: string[];
}

// ===== USE CASE IMPLEMENTATION =====

const MAX_DETECTION_KEYS = 500;

export class DetectAnomaliesUseCase {
  private detectionBuffer: Map<string, MetricEntry[]> = new Map();
  private lastAnalysis: Map<string, Date> = new Map();

  constructor(
    private readonly repository: IAnalyticsRepository,
    private readonly intelligenceRepository: IIntelligenceRepository
  ) {
    logger.info('🔍 Initialized anomaly detection service');
  }

  /**
   * Detect anomalies in metrics data
   */
  async execute(request: DetectAnomaliesRequest): Promise<DetectAnomaliesResult> {
    try {
      const startTime = Date.now();

      // Resolve time range
      const timeRange = this.resolveTimeRange(request);

      // Get metrics data for analysis
      const metricsData = await this.getMetricsForAnalysis(timeRange, request);

      // Detect anomalies using configured algorithms
      const anomalies = await this.detectAnomalies(metricsData, request);

      // Generate summary
      const summary = this.generateAnomalySummary(anomalies);

      // Analyze patterns if requested
      let patterns: AnomalyPattern[] | undefined;
      if (request.includeContext) {
        patterns = await this.analyzeAnomalyPatterns(anomalies, timeRange);
      }

      // Generate predictions if requested
      let predictions: AnomalyPrediction[] | undefined;
      if (request.includePredictions) {
        predictions = await this.generateAnomalyPredictions(anomalies, patterns, timeRange);
      }

      // Generate recommendations if requested
      let recommendations: AnomalyRecommendation[] | undefined;
      if (request.includeRecommendations) {
        recommendations = await this.generateAnomalyRecommendations(anomalies, patterns);
      }

      // Store detected anomalies
      await this.storeDetectedAnomalies(anomalies);

      const processingTime = Date.now() - startTime;

      // Record detection analytics
      await this.recordDetectionAnalytics(request, anomalies.length, processingTime);

      logger.info('🔍 Detected {} anomalies in {}ms', { data0: anomalies.length, data1: processingTime });

      return {
        anomalies,
        summary,
        patterns,
        predictions,
        recommendations,
        processingStats: {
          dataPointsAnalyzed: metricsData.length,
          algorithmsUsed: request.algorithms || ['statistical', 'threshold'],
          processingTimeMs: processingTime,
          confidence: this.calculateOverallConfidence(anomalies),
        },
        lastAnalyzed: new Date(),
        nextAnalysis: new Date(Date.now() + (request.realTimeMode ? 5 * 60 * 1000 : 60 * 60 * 1000)),
      };
    } catch (error) {
      logger.error('Failed to detect anomalies:', { error: error instanceof Error ? error.message : String(error) });
      throw AnalyticsError.internalError(
        `Failed to detect anomalies: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Analyze patterns in existing anomalies
   */
  async analyzePatterns(request: AnomalyPatternAnalysisRequest): Promise<AnomalyPatternAnalysisResult> {
    try {
      const analysisId = uuidv4();

      // Get anomalies for analysis
      const allAnomalies = await this.intelligenceRepository.getAnomalies({
        limit: 1000,
      });
      const anomalies = allAnomalies.filter(anomaly => anomaly.id && request.anomalyIds.includes(anomaly.id));

      // Perform pattern analysis
      const patterns = await this.performPatternAnalysis(anomalies, request);

      // Find correlations
      const correlations = await this.findAnomalyCorrelations(anomalies, request);

      // Perform clustering
      const clusters = await this.clusterAnomalies(anomalies, request);

      // Analyze trends
      const trends = await this.analyzeTrends(anomalies, request);

      // Generate insights
      const insights = this.generatePatternInsights(patterns, correlations, clusters, trends);

      // Generate recommendations
      const recommendations = this.generatePatternRecommendations(patterns, correlations);

      return {
        analysisId,
        analysisType: request.analysisType,
        analyzedAnomalies: anomalies.length,
        patterns,
        correlations,
        clusters,
        trends,
        insights,
        recommendations,
      };
    } catch (error) {
      logger.error('Failed to analyze patterns:', { error: error instanceof Error ? error.message : String(error) });
      throw AnalyticsError.aggregationFailed(
        'analyzePatterns',
        `Failed to analyze anomaly patterns: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Configure anomaly detection for specific metrics
   */
  async configureDetection(request: ConfigureAnomalyDetectionRequest): Promise<{
    success: boolean;
    configurationId: string;
    rulesConfigured: number;
    alertingEnabled: boolean;
  }> {
    try {
      const configId = uuidv4();

      // Validate configuration
      this.validateDetectionConfiguration(request);

      // Store detection configuration
      await this.storeDetectionConfiguration(configId, request);

      // Set up alerting if enabled
      if (request.alerting.enabled) {
        await this.configureAlerting(configId, request.alerting);
      }

      logger.info('🔧 Configured detection for {} with {} rules', {
        data0: request.metricName,
        data1: request.rules.length,
      });

      return {
        success: true,
        configurationId: configId,
        rulesConfigured: request.rules.filter(r => r.enabled).length,
        alertingEnabled: request.alerting.enabled,
      };
    } catch (error) {
      logger.error('Failed to configure detection:', { error: error instanceof Error ? error.message : String(error) });
      throw AnalyticsError.internalError(
        `Failed to configure anomaly detection: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Real-time anomaly detection for streaming data
   */
  async detectRealTime(metricEntry: MetricEntry): Promise<AnomalyDetection | null> {
    try {
      const key = `${metricEntry.serviceName}:${metricEntry.name}`;

      if (!this.detectionBuffer.has(key)) {
        while (this.detectionBuffer.size >= MAX_DETECTION_KEYS) {
          const lruKey = this.detectionBuffer.keys().next().value;
          if (lruKey === undefined) break;
          this.detectionBuffer.delete(lruKey);
          this.lastAnalysis.delete(lruKey);
          logger.info('LRU eviction in detection buffer (max {} keys)', { data0: String(MAX_DETECTION_KEYS) });
        }
        this.detectionBuffer.set(key, []);
      }

      const buffer = this.detectionBuffer.get(key)!;
      buffer.push(metricEntry);

      this.detectionBuffer.delete(key);
      this.detectionBuffer.set(key, buffer);

      const maxBufferSize = 1000;
      if (buffer.length > maxBufferSize) {
        buffer.splice(0, buffer.length - maxBufferSize);
      }

      // Check if we have enough data for analysis
      if (buffer.length < 10) {
        return null;
      }

      // Perform real-time anomaly detection
      const anomaly = await this.detectSingleAnomaly(metricEntry, buffer);

      if (anomaly) {
        // Store anomaly
        await this.intelligenceRepository.recordAnomaly({
          id: anomaly.id,
          detectedAt: anomaly.detectedAt,
          anomalyType: anomaly.type,
          severity: anomaly.severity,
          serviceName: anomaly.serviceName,
          providerId: anomaly.providerId,
          metricName: anomaly.metricName,
          expectedValue: anomaly.expectedValue,
          actualValue: anomaly.actualValue,
          deviationScore: anomaly.deviation.percentage,
          description: `Real-time anomaly detected: ${anomaly.type}`,
          status: 'active',
          metadata: anomaly.context,
        });

        logger.info('🚨 Real-time anomaly detected: {} = {} (expected: {})', {
          data0: anomaly.metricName,
          data1: anomaly.actualValue,
          data2: anomaly.expectedValue,
        });
      }

      return anomaly;
    } catch (error) {
      logger.error('Real-time detection failed:', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  // ===== PRIVATE METHODS =====

  private resolveTimeRange(request: DetectAnomaliesRequest): { start: Date; end: Date } {
    const now = new Date();
    const end = request.endTime || now;

    if (request.startTime) {
      return { start: request.startTime, end };
    }

    let start: Date;
    switch (request.timeRange) {
      case 'last_5m':
        start = new Date(now.getTime() - 5 * 60 * 1000);
        break;
      case 'last_hour':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'last_24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last_7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 60 * 60 * 1000); // Default to last hour
    }

    return { start, end };
  }

  private async getMetricsForAnalysis(
    timeRange: { start: Date; end: Date },
    request: DetectAnomaliesRequest
  ): Promise<MetricEntry[]> {
    return await this.repository.getMetrics({
      metricName: request.metricNames?.join(','),
      serviceName: request.serviceNames?.join(','),
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: 50000, // Large limit for comprehensive analysis
    });
  }

  private async detectAnomalies(
    metricsData: MetricEntry[],
    request: DetectAnomaliesRequest
  ): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const algorithms = request.algorithms || ['statistical', 'threshold'];

    // Group metrics by service and name for analysis
    const groupedMetrics = this.groupMetrics(metricsData);

    for (const [key, metrics] of groupedMetrics.entries()) {
      const [serviceName, metricName] = key.split(':');

      // Skip if we don't have enough data
      if (metrics.length < 5) continue;

      // Apply each algorithm
      for (const algorithm of algorithms) {
        try {
          const algorithmAnomalies = await this.applyAnomalyDetectionAlgorithm(
            algorithm,
            metrics,
            serviceName,
            metricName,
            request
          );
          anomalies.push(...algorithmAnomalies);
        } catch (error) {
          logger.warn('Failed to apply ${algorithm} algorithm to ${key}:', { data: error });
        }
      }
    }

    // Remove duplicates and apply severity filter
    return this.filterAndDeduplicateAnomalies(anomalies, request.minSeverity);
  }

  private groupMetrics(metrics: MetricEntry[]): Map<string, MetricEntry[]> {
    const grouped = new Map<string, MetricEntry[]>();

    metrics.forEach(metric => {
      const key = `${metric.serviceName}:${metric.name}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(metric);
    });

    return grouped;
  }

  private async applyAnomalyDetectionAlgorithm(
    algorithm: string,
    metrics: MetricEntry[],
    serviceName: string,
    metricName: string,
    request: DetectAnomaliesRequest
  ): Promise<AnomalyDetection[]> {
    const sortedMetrics = metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    switch (algorithm) {
      case 'statistical':
        return await this.detectStatisticalAnomalies(sortedMetrics, serviceName, metricName, request);

      case 'threshold':
        return await this.detectThresholdAnomalies(sortedMetrics, serviceName, metricName, request);

      case 'seasonal':
        return await this.detectSeasonalAnomalies(sortedMetrics, serviceName, metricName, request);

      case 'pattern_matching':
        return await this.detectPatternAnomalies(sortedMetrics, serviceName, metricName, request);

      case 'ml_based':
        return await this.detectMLAnomalies(sortedMetrics, serviceName, metricName, request);

      default:
        logger.warn('Unknown algorithm: {}', { data0: algorithm });
        return [];
    }
  }

  private async detectStatisticalAnomalies(
    metrics: MetricEntry[],
    serviceName: string,
    metricName: string,
    request: DetectAnomaliesRequest
  ): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const values = metrics.map(m => m.value);
    const windowSize = request.statisticalSettings?.windowSize || 20;
    const confidenceLevel = request.statisticalSettings?.confidenceLevel || 0.95;
    const zThreshold = this.getZScoreThreshold(confidenceLevel);

    // Calculate rolling statistics
    for (let i = windowSize; i < values.length; i++) {
      const window = values.slice(i - windowSize, i);
      const mean = window.reduce((sum, val) => sum + val, 0) / window.length;
      const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
      const stdDev = Math.sqrt(variance);

      const currentValue = values[i];
      const zScore = stdDev > 0 ? Math.abs(currentValue - mean) / stdDev : 0;

      if (zScore > zThreshold) {
        const severity = this.calculateSeverityFromZScore(zScore, request.sensitivity);
        const anomaly = this.createAnomalyDetection(
          'statistical_anomaly',
          severity,
          metrics[i],
          serviceName,
          metricName,
          {
            actualValue: currentValue,
            expectedValue: mean,
            zScore,
            deviation: {
              absolute: Math.abs(currentValue - mean),
              percentage: Math.abs((currentValue - mean) / mean) * 100,
              zScore,
            },
            detectionAlgorithm: 'statistical',
          }
        );
        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  private async detectThresholdAnomalies(
    metrics: MetricEntry[],
    serviceName: string,
    metricName: string,
    request: DetectAnomaliesRequest
  ): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const thresholds = request.thresholds;

    if (!thresholds) return anomalies;

    // Calculate baseline for percentage thresholds
    let baseline = 0;
    if (thresholds.percentage && thresholds.baseline) {
      const values = metrics.map(m => m.value);
      switch (thresholds.baseline) {
        case 'historical_average':
          baseline = values.reduce((sum, val) => sum + val, 0) / values.length;
          break;
        case 'rolling_average':
          const windowSize = 10;
          baseline = values.slice(-windowSize).reduce((sum, val) => sum + val, 0) / windowSize;
          break;
        case 'fixed_value':
          baseline = 1; // Would be configured
          break;
      }
    }

    metrics.forEach(metric => {
      const value = metric.value;
      let upperThreshold = thresholds.upper;
      let lowerThreshold = thresholds.lower;

      if (thresholds.percentage) {
        upperThreshold = upperThreshold ? baseline * (1 + upperThreshold / 100) : undefined;
        lowerThreshold = lowerThreshold ? baseline * (1 - lowerThreshold / 100) : undefined;
      }

      if (upperThreshold && value > upperThreshold) {
        const severity = this.calculateSeverityFromThreshold(value, upperThreshold, request.sensitivity);
        const anomaly = this.createAnomalyDetection('threshold_breach', severity, metric, serviceName, metricName, {
          actualValue: value,
          expectedValue: baseline || upperThreshold,
          deviation: {
            absolute: value - upperThreshold,
            percentage: ((value - upperThreshold) / upperThreshold) * 100,
          },
          threshold: { upper: upperThreshold, type: 'static' },
          detectionAlgorithm: 'threshold',
        });
        anomalies.push(anomaly);
      }

      if (lowerThreshold && value < lowerThreshold) {
        const severity = this.calculateSeverityFromThreshold(value, lowerThreshold, request.sensitivity, true);
        const anomaly = this.createAnomalyDetection('threshold_breach', severity, metric, serviceName, metricName, {
          actualValue: value,
          expectedValue: baseline || lowerThreshold,
          deviation: {
            absolute: lowerThreshold - value,
            percentage: ((lowerThreshold - value) / lowerThreshold) * 100,
          },
          threshold: { lower: lowerThreshold, type: 'static' },
          detectionAlgorithm: 'threshold',
        });
        anomalies.push(anomaly);
      }
    });

    return anomalies;
  }

  private async detectSeasonalAnomalies(
    metrics: MetricEntry[],
    serviceName: string,
    metricName: string,
    request: DetectAnomaliesRequest
  ): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    const period = request.statisticalSettings?.seasonalityPeriod || 24; // hours

    // Group by seasonal period (simplified)
    const seasonalGroups = new Map<number, number[]>();

    metrics.forEach(metric => {
      const seasonalKey = metric.timestamp.getHours(); // Hourly seasonality
      if (!seasonalGroups.has(seasonalKey)) {
        seasonalGroups.set(seasonalKey, []);
      }
      seasonalGroups.get(seasonalKey)!.push(metric.value);
    });

    // Calculate seasonal baselines
    const seasonalBaselines = new Map<number, { mean: number; stdDev: number }>();
    seasonalGroups.forEach((values, key) => {
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      seasonalBaselines.set(key, { mean, stdDev });
    });

    // Detect anomalies
    metrics.forEach(metric => {
      const seasonalKey = metric.timestamp.getHours();
      const baseline = seasonalBaselines.get(seasonalKey);

      if (baseline && baseline.stdDev > 0) {
        const zScore = Math.abs(metric.value - baseline.mean) / baseline.stdDev;
        const threshold = this.getZScoreThreshold(0.95);

        if (zScore > threshold) {
          const severity = this.calculateSeverityFromZScore(zScore, request.sensitivity);
          const anomaly = this.createAnomalyDetection('pattern_deviation', severity, metric, serviceName, metricName, {
            actualValue: metric.value,
            expectedValue: baseline.mean,
            deviation: {
              absolute: Math.abs(metric.value - baseline.mean),
              percentage: Math.abs((metric.value - baseline.mean) / baseline.mean) * 100,
              zScore,
            },
            detectionAlgorithm: 'seasonal',
          });
          anomalies.push(anomaly);
        }
      }
    });

    return anomalies;
  }

  private async detectPatternAnomalies(
    _metrics: MetricEntry[],
    _serviceName: string,
    _metricName: string,
    _request: DetectAnomaliesRequest
  ): Promise<AnomalyDetection[]> {
    return [];
  }

  private async detectMLAnomalies(
    _metrics: MetricEntry[],
    _serviceName: string,
    _metricName: string,
    _request: DetectAnomaliesRequest
  ): Promise<AnomalyDetection[]> {
    return [];
  }

  private async detectSingleAnomaly(metricEntry: MetricEntry, buffer: MetricEntry[]): Promise<AnomalyDetection | null> {
    // Simplified real-time detection
    const recentValues = buffer.slice(-20).map(m => m.value);
    const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const variance = recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null;

    const zScore = Math.abs(metricEntry.value - mean) / stdDev;
    const threshold = 2.5; // 99% confidence level

    if (zScore > threshold) {
      return this.createAnomalyDetection(
        'statistical_anomaly',
        zScore > 4 ? 'critical' : zScore > 3 ? 'high' : 'medium',
        metricEntry,
        metricEntry.serviceName,
        metricEntry.name,
        {
          actualValue: metricEntry.value,
          expectedValue: mean,
          deviation: {
            absolute: Math.abs(metricEntry.value - mean),
            percentage: Math.abs((metricEntry.value - mean) / mean) * 100,
            zScore,
          },
          detectionAlgorithm: 'real_time_statistical',
        }
      );
    }

    return null;
  }

  private createAnomalyDetection(
    type: AnomalyType,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metric: MetricEntry,
    serviceName: string,
    metricName: string,
    details: {
      detectionAlgorithm: string;
      zScore?: number;
      actualValue: number;
      expectedValue: number;
      threshold?: { upper?: number; lower?: number; type: 'static' | 'dynamic' | 'seasonal' };
      deviation: { absolute: number; percentage: number; zScore?: number };
    }
  ): AnomalyDetection {
    const id = uuidv4();

    return {
      id,
      type,
      severity,
      metricName,
      serviceName,
      providerId: metric.tags?.providerId,
      detectedAt: new Date(),
      detectionAlgorithm: details.detectionAlgorithm,
      confidence: this.calculateConfidence(details.zScore ?? 0, severity),
      actualValue: details.actualValue,
      expectedValue: details.expectedValue,
      threshold: details.threshold,
      deviation: details.deviation,
      context: {
        timeWindow: '1h',
        historicalRange: { min: 0, max: 100, avg: 50 }, // Would calculate actual range
        recentTrend: 'stable', // Would analyze actual trend
        seasonality: 'hourly',
      },
      status: 'active',
      impact: {
        scope: 'local',
        businessImpact: severity === 'critical' ? 'high' : severity === 'high' ? 'medium' : 'low',
      },
      tags: metric.tags,
    };
  }

  private filterAndDeduplicateAnomalies(
    anomalies: AnomalyDetection[],
    minSeverity?: 'low' | 'medium' | 'high' | 'critical'
  ): AnomalyDetection[] {
    const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    const minSeverityLevel = minSeverity ? severityOrder[minSeverity] : 0;

    // Filter by severity
    const filtered = anomalies.filter(anomaly => severityOrder[anomaly.severity] >= minSeverityLevel);

    // Deduplicate by metric and time window
    const deduped = new Map<string, AnomalyDetection>();
    filtered.forEach(anomaly => {
      const key = `${anomaly.serviceName}:${anomaly.metricName}:${Math.floor(anomaly.detectedAt.getTime() / 300000)}`; // 5-minute windows
      if (!deduped.has(key) || deduped.get(key)!.severity < anomaly.severity) {
        deduped.set(key, anomaly);
      }
    });

    return Array.from(deduped.values()).sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  }

  private generateAnomalySummary(anomalies: AnomalyDetection[]): AnomalySummary {
    const total = anomalies.length;
    const bySeverity = {
      critical: anomalies.filter(a => a.severity === 'critical').length,
      high: anomalies.filter(a => a.severity === 'high').length,
      medium: anomalies.filter(a => a.severity === 'medium').length,
      low: anomalies.filter(a => a.severity === 'low').length,
    };

    const byType = anomalies.reduce(
      (acc, anomaly) => {
        acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
        return acc;
      },
      {} as Record<AnomalyType, number>
    );

    const byService = anomalies.reduce(
      (acc, anomaly) => {
        const service = anomaly.serviceName || 'unknown';
        if (!acc[service]) {
          acc[service] = { count: 0, criticalCount: 0, trend: 'stable' as const };
        }
        acc[service].count++;
        if (anomaly.severity === 'critical') acc[service].criticalCount++;
        return acc;
      },
      {} as Record<string, { count: number; criticalCount: number; trend: 'stable' }>
    );

    return {
      totalAnomalies: total,
      newAnomalies: total, // Would track actual new anomalies
      resolvedAnomalies: 0, // Would track resolved anomalies
      bySeverity,
      byType,
      byService,
      trends: {
        anomalyRate: total / 24, // per hour (simplified)
        averageSeverity:
          (bySeverity.critical * 4 + bySeverity.high * 3 + bySeverity.medium * 2 + bySeverity.low) / Math.max(total, 1),
        resolutionTime: 45, // minutes (would track actual)
        falsePositiveRate: 5, // percentage (would calculate actual)
      },
      insights: this.generateSummaryInsights(anomalies),
    };
  }

  private generateSummaryInsights(anomalies: AnomalyDetection[]): string[] {
    const insights: string[] = [];

    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    if (criticalCount > 0) {
      insights.push(`${criticalCount} critical anomalies require immediate attention`);
    }

    const serviceGroups = new Map<string, number>();
    anomalies.forEach(a => {
      const service = a.serviceName || 'unknown';
      serviceGroups.set(service, (serviceGroups.get(service) || 0) + 1);
    });

    const topService = Array.from(serviceGroups.entries()).sort(([, a], [, b]) => b - a)[0];
    if (topService && topService[1] > anomalies.length * 0.3) {
      insights.push(`${topService[0]} service shows unusually high anomaly rate`);
    }

    const typeGroups = new Map<string, number>();
    anomalies.forEach(a => {
      typeGroups.set(a.type, (typeGroups.get(a.type) || 0) + 1);
    });

    const topType = Array.from(typeGroups.entries()).sort(([, a], [, b]) => b - a)[0];
    if (topType) {
      insights.push(`Most common anomaly type: ${topType[0]} (${topType[1]} occurrences)`);
    }

    return insights;
  }

  // Helper methods for pattern analysis and other complex operations
  private async analyzeAnomalyPatterns(
    _anomalies: AnomalyDetection[],
    _timeRange: { start: Date; end: Date }
  ): Promise<AnomalyPattern[]> {
    return [];
  }

  private async generateAnomalyPredictions(
    _anomalies: AnomalyDetection[],
    _patterns?: AnomalyPattern[],
    _timeRange?: { start: Date; end: Date }
  ): Promise<AnomalyPrediction[]> {
    return [];
  }

  private async generateAnomalyRecommendations(
    anomalies: AnomalyDetection[],
    _patterns?: AnomalyPattern[]
  ): Promise<AnomalyRecommendation[]> {
    const recommendations: AnomalyRecommendation[] = [];

    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      recommendations.push({
        id: 'critical-response',
        category: 'immediate_action',
        priority: 'urgent',
        title: 'Address Critical Anomalies',
        description: `${criticalAnomalies.length} critical anomalies detected requiring immediate investigation.`,
        reasoning: 'Critical anomalies may indicate system failures or security issues.',
        suggestedAction: 'Investigate root causes and implement immediate fixes',
        expectedOutcome: 'System stability restored',
        effort: 'high',
        timeline: '1-4 hours',
        riskReduction: 0.9,
        implementationComplexity: 'complex',
        affectedSystems: [...new Set(criticalAnomalies.map(a => a.serviceName || 'unknown'))],
        success_metrics: ['Anomalies resolved', 'System metrics normalized'],
      });
    }

    return recommendations;
  }

  private async storeDetectedAnomalies(anomalies: AnomalyDetection[]): Promise<void> {
    for (const anomaly of anomalies) {
      await this.intelligenceRepository.recordAnomaly({
        id: anomaly.id,
        detectedAt: anomaly.detectedAt,
        anomalyType: anomaly.type,
        severity: anomaly.severity,
        serviceName: anomaly.serviceName,
        providerId: anomaly.providerId,
        metricName: anomaly.metricName,
        expectedValue: anomaly.expectedValue,
        actualValue: anomaly.actualValue,
        deviationScore: anomaly.deviation.percentage,
        description: `Anomaly detected using ${anomaly.detectionAlgorithm}`,
        status: anomaly.status,
        metadata: anomaly.context,
      });
    }
  }

  private async recordDetectionAnalytics(
    request: DetectAnomaliesRequest,
    anomaliesCount: number,
    processingTime: number
  ): Promise<void> {
    try {
      await this.repository.recordMetric({
        name: 'anomaly_detection.executed',
        value: 1,
        timestamp: new Date(),
        tags: {
          algorithms: (request.algorithms || []).join(','),
          sensitivity: request.sensitivity || 'medium',
          anomalies_detected: anomaliesCount.toString(),
          processing_time_ms: processingTime.toString(),
        },
        serviceName: 'ai-analytics-service',
        source: 'anomaly-detector',
        metricType: 'counter',
        unit: 'detections',
      });
    } catch (error) {
      logger.warn('Failed to record detection analytics (non-blocking):', { data: error });
    }
  }

  // Helper calculation methods
  private getZScoreThreshold(confidenceLevel: number): number {
    const thresholds: Record<number, number> = {
      0.95: 1.96,
      0.99: 2.58,
      0.999: 3.29,
    };
    return thresholds[confidenceLevel] || 2.58;
  }

  private calculateSeverityFromZScore(zScore: number, sensitivity?: string): 'low' | 'medium' | 'high' | 'critical' {
    const multiplier = sensitivity === 'high' ? 0.8 : sensitivity === 'low' ? 1.2 : 1.0;
    const adjusted = zScore / multiplier;

    if (adjusted > 4) return 'critical';
    if (adjusted > 3) return 'high';
    if (adjusted > 2) return 'medium';
    return 'low';
  }

  private calculateSeverityFromThreshold(
    value: number,
    threshold: number,
    sensitivity?: string,
    isLowerBreach = false
  ): 'low' | 'medium' | 'high' | 'critical' {
    const diff = isLowerBreach ? threshold - value : value - threshold;
    const percentage = Math.abs(diff / threshold) * 100;

    const multiplier = sensitivity === 'high' ? 0.8 : sensitivity === 'low' ? 1.2 : 1.0;
    const adjustedPercentage = percentage / multiplier;

    if (adjustedPercentage > 100) return 'critical';
    if (adjustedPercentage > 50) return 'high';
    if (adjustedPercentage > 25) return 'medium';
    return 'low';
  }

  private calculateConfidence(zScore?: number, severity?: string): number {
    if (zScore) {
      return Math.min(0.99, Math.max(0.5, 1 - Math.exp(-zScore)));
    }

    const severityConfidence: Record<string, number> = {
      low: 0.6,
      medium: 0.75,
      high: 0.85,
      critical: 0.95,
    };

    return severityConfidence[severity || 'medium'] || 0.75;
  }

  private calculateOverallConfidence(anomalies: AnomalyDetection[]): number {
    if (anomalies.length === 0) return 1.0;

    const totalConfidence = anomalies.reduce((sum, anomaly) => sum + anomaly.confidence, 0);
    return totalConfidence / anomalies.length;
  }

  // Placeholder methods for complex analysis operations
  private validateDetectionConfiguration(request: ConfigureAnomalyDetectionRequest): void {
    if (!request.metricName) {
      throw AnalyticsError.validationError('metricName', 'Metric name is required');
    }

    if (request.rules.length === 0) {
      throw AnalyticsError.validationError('rules', 'At least one detection rule is required');
    }

    request.rules.forEach((rule, index) => {
      if (!rule.algorithm) {
        throw AnalyticsError.validationError(`rules[${index}].algorithm`, `Rule ${index} is missing algorithm`);
      }
    });
  }

  private async storeDetectionConfiguration(
    configId: string,
    request: ConfigureAnomalyDetectionRequest
  ): Promise<void> {
    // Would store configuration in repository
    logger.info('Storing detection configuration {} for {}', { data0: configId, data1: request.metricName });
  }

  private async configureAlerting(_configId: string, _alerting: unknown): Promise<void> {}

  // Pattern analysis placeholder methods
  private async performPatternAnalysis(
    _anomalies: AnomalyDetectionResult[],
    _request: AnomalyPatternAnalysisRequest
  ): Promise<AnomalyPattern[]> {
    return [];
  }

  private async findAnomalyCorrelations(
    _anomalies: AnomalyDetectionResult[],
    _request: AnomalyPatternAnalysisRequest
  ): Promise<AnomalyPatternAnalysisResult['correlations']> {
    return [];
  }

  private async clusterAnomalies(
    _anomalies: AnomalyDetectionResult[],
    _request: AnomalyPatternAnalysisRequest
  ): Promise<AnomalyPatternAnalysisResult['clusters']> {
    return [];
  }

  private async analyzeTrends(
    _anomalies: AnomalyDetectionResult[],
    _request: AnomalyPatternAnalysisRequest
  ): Promise<AnomalyPatternAnalysisResult['trends']> {
    return [];
  }

  private generatePatternInsights(
    _patterns: AnomalyPattern[],
    _correlations: AnomalyPatternAnalysisResult['correlations'],
    _clusters: AnomalyPatternAnalysisResult['clusters'],
    _trends: AnomalyPatternAnalysisResult['trends']
  ): string[] {
    return [];
  }

  private generatePatternRecommendations(
    _patterns: AnomalyPattern[],
    _correlations: AnomalyPatternAnalysisResult['correlations']
  ): string[] {
    return [];
  }
}
