export interface BookDisplayEntry {
  id: string;
  text: string;
  reference?: string; // maps from LibEntry.attribution (backend field name)
  musicHints?: Record<string, unknown>;
  sortOrder: number;
}

export interface BookDisplayChapter {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  entryCount?: number;
  entries: BookDisplayEntry[];
}

export interface BookDisplay {
  id: string;
  title: string;
  subtitle?: string;
  coverIllustrationUrl?: string;
  author?: string;
  era?: string;
  tradition?: string;
  category: string;
  description?: string;
  status?: string;
  chapters: BookDisplayChapter[];
}

export interface ManageChapterData {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  entryCount?: number;
}

export interface ManageBookData {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverIllustrationUrl?: string;
  author?: string;
  category?: string;
  era?: string;
  tradition?: string;
  status?: string;
  chapterCount?: number;
  entryCount?: number;
  metadata?: Record<string, unknown>;
}
