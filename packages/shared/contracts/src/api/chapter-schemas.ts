import { z } from 'zod';
import type { ServiceResponse } from '../common/index.js';

export const ChapterSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  sortOrder: z.number().optional(),
  createdAt: z.string().optional(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export type ChaptersListResponse = ServiceResponse<{ chapters: Chapter[] }>;
