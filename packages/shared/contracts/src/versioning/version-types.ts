import { z } from 'zod';

export const CURRENT_CONTRACT_VERSION = '1.0.0';

export const ContractVersionSchema = z.object({
  major: z.number().int().min(0),
  minor: z.number().int().min(0),
  patch: z.number().int().min(0),
});
export type ContractVersion = z.infer<typeof ContractVersionSchema>;

export const VersionedContractMetadataSchema = z.object({
  version: z.string(),
  deprecated: z.boolean().optional(),
  deprecatedAt: z.string().optional(),
  replacedBy: z.string().optional(),
  minCompatibleVersion: z.string().optional(),
});
export type VersionedContractMetadata = z.infer<typeof VersionedContractMetadataSchema>;

export interface ContractRegistryEntry {
  name: string;
  version: string;
  deprecated: boolean;
  deprecatedAt?: string;
  replacedBy?: string;
  minCompatibleVersion?: string;
}

export const API_VERSION_PREFIX = '/api/v1';

export function createVersionedResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        type: z.string(),
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
        correlationId: z.string().optional(),
      })
      .optional(),
    timestamp: z.string().optional(),
    _contract: z
      .object({
        version: z.string(),
        deprecated: z.boolean().optional(),
      })
      .optional(),
  });
}

export type VersionedServiceResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    type: string;
    code: string;
    message: string;
    details?: unknown;
    correlationId?: string;
  };
  timestamp?: string;
  _contract?: {
    version: string;
    deprecated?: boolean;
  };
};
