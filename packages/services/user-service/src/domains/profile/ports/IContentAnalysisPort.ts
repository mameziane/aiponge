export interface IContentAnalysisPort {
  analyzeEntry(
    entryData: { content: string; userId?: string; entryId?: string },
    correlationId?: string
  ): Promise<{
    analysis: { sentiment: string; themes: string[]; emotions?: string[]; insights?: string[] };
    error?: string;
  }>;
}
