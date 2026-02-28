import { AnalysisRepository } from '@infrastructure/repositories';
import { AnalyticsError } from '@application/errors';

export interface TrackContentViewRequest {
  userId: string;
  contentId: string;
  contentType: string;
  sessionId?: string;
  viewDuration?: number;
  fromSearch?: boolean;
  searchQuery?: string;
}

export interface TrackContentViewResponse {
  success: boolean;
  message: string;
}

export class TrackContentViewUseCase {
  constructor(private repository: AnalysisRepository) {}

  async execute(request: TrackContentViewRequest): Promise<TrackContentViewResponse> {
    try {
      // Validate request
      if (!request.userId?.trim()) {
        throw AnalyticsError.userIdRequired();
      }

      if (!request.contentId?.trim()) {
        throw AnalyticsError.contentIdRequired();
      }

      if (!request.contentType?.trim()) {
        throw AnalyticsError.contentTypeRequired();
      }

      // Track content view analytics
      const eventData = {
        contentId: request.contentId,
        contentType: request.contentType,
        viewDuration: request.viewDuration,
        sessionId: request.sessionId,
        fromSearch: request.fromSearch,
        searchQuery: request.searchQuery,
        timestamp: new Date().toISOString(),
      };

      await this.repository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'content_viewed',
        eventData,
        sessionId: request.sessionId,
        metadata: {
          contentType: request.contentType,
          fromSearch: request.fromSearch || false,
        },
      });

      // If view came from search, record search click analytics
      if (request.fromSearch && request.searchQuery) {
        await this.repository.recordAnalyticsEvent({
          userId: request.userId,
          eventType: 'search_result_clicked',
          eventData: {
            searchQuery: request.searchQuery,
            contentId: request.contentId,
            contentType: request.contentType,
            timestamp: new Date().toISOString(),
          },
          sessionId: request.sessionId,
        });
      }

      // Track engagement metrics
      if (request.viewDuration && request.viewDuration > 5000) {
        // 5+ seconds considered engagement
        await this.repository.recordAnalyticsEvent({
          userId: request.userId,
          eventType: 'content_engaged',
          eventData: {
            contentId: request.contentId,
            contentType: request.contentType,
            viewDuration: request.viewDuration,
            engagementLevel: this.calculateEngagementLevel(request.viewDuration),
            timestamp: new Date().toISOString(),
          },
          sessionId: request.sessionId,
        });
      }

      return {
        success: true,
        message: 'Content view tracked successfully',
      };
    } catch (error) {
      if (error instanceof AnalyticsError) {
        throw error;
      }
      throw AnalyticsError.internalError('Failed to track content view', error instanceof Error ? error : undefined);
    }
  }

  private calculateEngagementLevel(viewDuration: number): string {
    if (viewDuration < 5000) return 'low';
    if (viewDuration < 30000) return 'medium';
    if (viewDuration < 120000) return 'high';
    return 'very_high';
  }
}
