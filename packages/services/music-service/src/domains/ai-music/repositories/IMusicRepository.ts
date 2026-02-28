/**
 * Music Repository Interfaces
 * Define the contracts for music data persistence
 */

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface AudioProcessingJob {
  id: string;
  musicResultId: string;
  jobType: string;
  processingType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  inputUrl: string;
  outputUrl?: string;
  inputFormat?: string;
  outputFormat?: string;
  parameters: Record<string, unknown>;
  progressPercentage: number;
  processingTimeMs?: number;
  fileSize?: number;
  qualityScore?: number;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface IMusicAnalyticsRepository {
  recordEvent(event: MusicAnalyticsEvent): Promise<void>;
  findUserAnalytics(userId: string, dateRange?: DateRange): Promise<MusicAnalyticsEvent[]>;
  findMusicAnalytics(musicResultId: string, dateRange?: DateRange): Promise<MusicAnalyticsEvent[]>;
  getPopularMusic(limit?: number, dateRange?: DateRange): Promise<PopularMusicItem[]>;
  getUserStats(userId: string, dateRange?: DateRange): Promise<UserMusicStats>;
  getSystemStats(dateRange?: DateRange): Promise<SystemMusicStats>;
}

export interface MusicAnalyticsEvent {
  id?: string;
  userId: string;
  musicResultId?: string;
  eventType: string;
  eventData: Record<string, unknown>;
  sessionId?: string;
  deviceType?: string;
  location?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface PopularMusicItem {
  musicResultId: string;
  title: string;
  displayName: string;
  playCount: number;
  downloadCount: number;
  likeCount: number;
  score: number;
}

export interface UserMusicStats {
  userId: string;
  totalGenerations: number;
  totalPlays: number;
  totalDownloads: number;
  averageQuality: number;
  totalCost: number;
}

export interface SystemMusicStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageProcessingTime: number;
  totalUsersServed: number;
  popularGenres: { genre: string; count: number }[];
  systemLoad: number;
}
