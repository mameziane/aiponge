import { TraceRepository, SlowRequest } from '@infrastructure/repositories/TraceRepository';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('get-slow-requests-use-case');

export interface GetSlowRequestsInput {
  threshold?: number;
  since?: string;
  limit?: number;
}

export interface GetSlowRequestsOutput {
  success: boolean;
  requests?: SlowRequest[];
  stats?: {
    totalSlowRequests: number;
    avgDuration: number;
    maxDuration: number;
    topSlowServices: { service: string; avgDuration: number; count: number }[];
  };
  error?: string;
}

export class GetSlowRequestsUseCase {
  private static readonly DEFAULT_THRESHOLD_MS = 2000;
  private static readonly DEFAULT_SINCE = '1h';

  constructor(private traceRepository: TraceRepository) {}

  async execute(input: GetSlowRequestsInput): Promise<GetSlowRequestsOutput> {
    try {
      const threshold = input.threshold || GetSlowRequestsUseCase.DEFAULT_THRESHOLD_MS;
      const since = this.parseTimeRange(input.since || GetSlowRequestsUseCase.DEFAULT_SINCE);

      const slowRequests = await this.traceRepository.getSlowRequests(threshold, since);

      const limitedRequests = slowRequests.slice(0, input.limit || 50);

      const stats = {
        totalSlowRequests: slowRequests.length,
        avgDuration: slowRequests.length
          ? Math.round(slowRequests.reduce((sum, r) => sum + r.totalDuration, 0) / slowRequests.length)
          : 0,
        maxDuration: slowRequests.length ? Math.max(...slowRequests.map(r => r.totalDuration)) : 0,
        topSlowServices: this.aggregateSlowServices(slowRequests),
      };

      return {
        success: true,
        requests: limitedRequests,
        stats,
      };
    } catch (error) {
      logger.error('Failed to retrieve slow requests', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve slow requests',
      };
    }
  }

  private parseTimeRange(timeRange: string): Date {
    const now = new Date();
    const match = timeRange.match(/^(\d+)(m|h|d)$/);

    if (!match) {
      return new Date(timeRange);
    }

    const [, value, unit] = match;
    const amount = parseInt(value, 10);

    switch (unit) {
      case 'm':
        return new Date(now.getTime() - amount * 60 * 1000);
      case 'h':
        return new Date(now.getTime() - amount * 60 * 60 * 1000);
      case 'd':
        return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
      default:
        return now;
    }
  }

  private aggregateSlowServices(requests: SlowRequest[]): { service: string; avgDuration: number; count: number }[] {
    const serviceMap = new Map<string, { totalDuration: number; count: number }>();

    for (const req of requests) {
      if (req.slowestSpan) {
        const existing = serviceMap.get(req.slowestSpan.service) || { totalDuration: 0, count: 0 };
        existing.totalDuration += req.slowestSpan.duration;
        existing.count += 1;
        serviceMap.set(req.slowestSpan.service, existing);
      }
    }

    return Array.from(serviceMap.entries())
      .map(([service, data]) => ({
        service,
        avgDuration: Math.round(data.totalDuration / data.count),
        count: data.count,
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);
  }
}
