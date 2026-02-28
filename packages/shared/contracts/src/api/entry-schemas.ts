import { z } from 'zod';
import { ServiceResponseSchema } from '../common/index.js';
import type { ServiceResponse } from '../common/index.js';

export const EntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  content: z.string(),
  title: z.string().optional(),
  mood: z.string().optional(),
  themes: z.array(z.string()).optional(),
  sentiment: z.string().optional(),
  chapterId: z.string().optional(),
  isArchived: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Entry = z.infer<typeof EntrySchema>;

export type EntriesListResponse = ServiceResponse<{ entries: Entry[]; total?: number }>;

export const EntriesListResponseSchema = ServiceResponseSchema(
  z.object({
    entries: z.array(EntrySchema),
    total: z.number().optional(),
  })
);
