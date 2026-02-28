/**
 * Entry Repository Interface
 * Interface for entry and insight data access
 */

export interface EntryFilter {
  dateFrom?: Date;
  dateTo?: Date;
  isArchived?: boolean;
  status?: string;
  minConfidence?: number;
}

export interface EntryRecord {
  id: string;
  userId: string;
  chapterId: string | null;
  chapterSortOrder: number | null;
  content: string;
  type: string;
  moodContext: string | null;
  triggerSource: string | null;
  sentiment: string | null;
  emotionalIntensity: number | null;
  processingStatus: string | null;
  tags: string[] | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsightRecord {
  id: string;
  userId: string;
  entryId: string | null;
  type: string;
  title: string;
  content: string;
  confidence: string | null;
  category: string | null;
  themes: string[] | null;
  actionable: boolean | null;
  priority: number | null;
  aiProvider: string | null;
  aiModel: string | null;
  generatedAt: Date;
  validatedAt: Date | null;
  validatedBy: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface IEntryRepository {
  getEntriesByUser(userId: string, filter?: EntryFilter): Promise<EntryRecord[]>;
  getInsightsByUser(userId: string, filter?: EntryFilter): Promise<InsightRecord[]>;
}
