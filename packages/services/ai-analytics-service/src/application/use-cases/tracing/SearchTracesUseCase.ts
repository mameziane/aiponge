import { TraceRepository, TraceSearchParams } from '@infrastructure/repositories/TraceRepository';
import { RequestTrace } from '@schema/analytics-schema';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('search-traces-use-case');

export interface SearchTracesInput {
  userId?: string;
  service?: string;
  operation?: string;
  status?: 'success' | 'error' | 'in_progress';
  minDuration?: number;
  maxDuration?: number;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface TraceSearchResult {
  correlationId: string;
  userId: string | null;
  startTime: string;
  totalDuration: number | null;
  status: string;
  httpMethod: string | null;
  httpPath: string | null;
  httpStatusCode: number | null;
  spanCount: number | null;
}

export interface SearchTracesOutput {
  success: boolean;
  traces?: TraceSearchResult[];
  total?: number;
  error?: string;
}

export class SearchTracesUseCase {
  constructor(private traceRepository: TraceRepository) {}

  async execute(input: SearchTracesInput): Promise<SearchTracesOutput> {
    try {
      const params: TraceSearchParams = {
        userId: input.userId,
        service: input.service,
        operation: input.operation,
        status: input.status,
        minDuration: input.minDuration,
        maxDuration: input.maxDuration,
        limit: Math.min(input.limit || 50, 100),
        offset: input.offset || 0,
      };

      if (input.since) {
        params.since = this.parseTimeRange(input.since);
      }
      if (input.until) {
        params.until = new Date(input.until);
      }

      const traces = await this.traceRepository.searchTraces(params);

      return {
        success: true,
        traces: traces.map((t: RequestTrace) => ({
          correlationId: t.correlationId,
          userId: t.userId,
          startTime: t.startTime.toISOString(),
          totalDuration: t.totalDuration,
          status: t.status,
          httpMethod: t.httpMethod,
          httpPath: t.httpPath,
          httpStatusCode: t.httpStatusCode,
          spanCount: t.spanCount,
        })),
        total: traces.length,
      };
    } catch (error) {
      logger.error('Failed to search traces', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search traces',
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
}
