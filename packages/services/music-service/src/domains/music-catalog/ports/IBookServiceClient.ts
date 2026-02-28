export interface ChapterValidationResult {
  exists: boolean;
  chapterId: string;
  bookId?: string;
  title?: string;
}

export interface IBookServiceClient {
  validateChapterExists(chapterId: string): Promise<ChapterValidationResult>;

  clearCache(): void;
}
