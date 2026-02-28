import { z } from 'zod';
import { ServiceResponseSchema } from '../common/index.js';
import type { ServiceResponse } from '../common/index.js';

export const ContentGenerationResultSchema = z.object({
  content: z.string(),
  contentType: z.string().optional(),
  templateId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ContentGenerationResult = z.infer<typeof ContentGenerationResultSchema>;

export type ContentGenerationResponse = ServiceResponse<ContentGenerationResult>;

export const ContentGenerationResponseSchema = ServiceResponseSchema(ContentGenerationResultSchema);
