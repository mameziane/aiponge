/**
 * Metrics Middleware
 * Infrastructure layer metrics collection
 */

import { type Request, type Response, type NextFunction } from 'express';

interface RequestMetrics {
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
}

class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: RequestMetrics[] = [];

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  addMetric(metric: RequestMetrics): void {
    this.metrics.push(metric);

    // Keep only last 500 metrics (optimized for MVP)
    if (this.metrics.length > 500) {
      this.metrics = this.metrics.slice(-500);
    }
  }

  getMetrics(): RequestMetrics[] {
    return [...this.metrics];
  }

  getAggregatedMetrics(): {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    statusCodes: Record<number, number>;
  } {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const recentMetrics = this.metrics.filter(m => now - m.timestamp.getTime() < oneHour);

    return {
      totalRequests: recentMetrics.length,
      averageResponseTime:
        recentMetrics.length > 0 ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length : 0,
      errorRate:
        recentMetrics.length > 0 ? recentMetrics.filter(m => m.statusCode >= 400).length / recentMetrics.length : 0,
      statusCodes: recentMetrics.reduce(
        (acc, m) => {
          acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
          return acc;
        },
        {} as Record<number, number>
      ),
    };
  }
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  const originalSend = res.send;
  res.send = function (body: unknown): Response {
    const duration = Date.now() - startTime;

    MetricsCollector.getInstance().addMetric({
      path: req.path,
      method: req.method,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date(),
    });

    return originalSend.call(this, body);
  };

  next();
}

export { MetricsCollector };
