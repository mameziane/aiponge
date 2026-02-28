export interface AnalyticsEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  deviceType?: string;
  location?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface IAnalyticsServiceClient {
  recordEvent(event: AnalyticsEvent): Promise<{ success: boolean; error?: string }>;

  recordEvents(events: AnalyticsEvent[]): Promise<{ success: boolean; error?: string }>;

  getMusicAnalytics(params?: { userId?: string; startDate?: Date; endDate?: Date; metrics?: string[] }): Promise<{
    success: boolean;
    analytics?: import('../../../infrastructure/clients/AnalyticsServiceClient').MusicAnalyticsMetrics;
    error?: string;
  }>;

  getSystemAnalytics(dateRange?: { startDate: Date; endDate: Date }): Promise<{
    success: boolean;
    analytics?: import('../../../infrastructure/clients/AnalyticsServiceClient').SystemAnalytics;
    error?: string;
  }>;

  getPopularMusic(params?: {
    timeframe?: 'daily' | 'weekly' | 'monthly';
    limit?: number;
    musicType?: string;
    genre?: string;
    style?: string;
  }): Promise<{
    success: boolean;
    popularMusic?: import('../../../infrastructure/clients/AnalyticsServiceClient').PopularMusicItem[];
    error?: string;
  }>;

  getMusicTrends(timeframe?: 'daily' | 'weekly' | 'monthly' | 'yearly'): Promise<{
    success: boolean;
    trends?: import('../../../infrastructure/clients/AnalyticsServiceClient').MusicTrends;
    error?: string;
  }>;

  createReport(reportConfig: {
    name: string;
    type: 'user_activity' | 'system_performance' | 'music_trends' | 'provider_analytics';
    parameters: Record<string, unknown>;
    format: 'json' | 'csv' | 'pdf';
    schedule?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      recipients: string[];
    };
  }): Promise<{
    success: boolean;
    reportId?: string;
    downloadUrl?: string;
    error?: string;
  }>;

  isHealthy(): Promise<boolean>;

  flushEvents(): Promise<void>;

  shutdown(): Promise<void>;
}
