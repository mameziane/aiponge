import { TraceRepository, TraceWithSpans } from '@infrastructure/repositories/TraceRepository';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('get-request-trace-use-case');

export interface GetRequestTraceInput {
  correlationId: string;
}

export interface GetRequestTraceOutput {
  success: boolean;
  trace?: TraceWithSpans;
  error?: string;
}

export class GetRequestTraceUseCase {
  constructor(private traceRepository: TraceRepository) {}

  async execute(input: GetRequestTraceInput): Promise<GetRequestTraceOutput> {
    if (!input.correlationId) {
      return {
        success: false,
        error: 'Correlation ID is required',
      };
    }

    try {
      const trace = await this.traceRepository.getTraceByCorrelationId(input.correlationId);

      if (!trace) {
        return {
          success: false,
          error: `Trace not found for correlation ID: ${input.correlationId}`,
        };
      }

      return {
        success: true,
        trace,
      };
    } catch (error) {
      logger.error('Failed to retrieve request trace', {
        error: error instanceof Error ? error.message : String(error),
        correlationId: input.correlationId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve trace',
      };
    }
  }
}
