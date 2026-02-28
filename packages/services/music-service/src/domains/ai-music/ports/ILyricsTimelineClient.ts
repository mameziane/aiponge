export interface MusicApiAlignedWord {
  word: string;
  start_s: number;
  end_s: number;
  p_align: number;
  success: boolean;
}

export interface AlignmentStats {
  minConfidence: number;
  maxConfidence: number;
  avgConfidence: number;
  totalWords: number;
  successfulWords: number;
  timelineGaps: Array<{ gapStart: number; gapEnd: number; durationMs: number }>;
}

export interface LyricsTimelineResult {
  success: boolean;
  clipId: string;
  rawAlignment?: MusicApiAlignedWord[];
  syncedLines?: Array<{
    startTime: number;
    endTime: number;
    text: string;
    type?: string;
    words?: Array<{
      word: string;
      startTime: number;
      endTime: number;
      confidence: number;
    }>;
  }>;
  alignmentStats?: AlignmentStats;
  error?: string;
  processingTimeMs?: number;
  fromCache?: boolean;
}

export interface ILyricsTimelineClient {
  fetchLyricsTimeline(clipId: string, forceRefresh?: boolean): Promise<LyricsTimelineResult>;
}
