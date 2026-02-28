import { z } from 'zod';

export enum ServiceName {
  USER_SERVICE = 'user-service',
  MUSIC_SERVICE = 'music-service',
  AI_CONTENT_SERVICE = 'ai-content-service',
  ANALYTICS_SERVICE = 'analytics-service',
  STORAGE_SERVICE = 'storage-service',
}

export enum OperationType {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export const ReferenceValidationRequestSchema = z.object({
  referenceType: z.string(),
  referenceId: z.string().uuid(),
  sourceService: z.nativeEnum(ServiceName),
  operation: z.nativeEnum(OperationType),
});

export type ReferenceValidationRequest = z.infer<typeof ReferenceValidationRequestSchema>;

export const ReferenceValidationResponseSchema = z.object({
  valid: z.boolean(),
  exists: z.boolean(),
  referenceType: z.string(),
  referenceId: z.string(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ReferenceValidationResponse = z.infer<typeof ReferenceValidationResponseSchema>;

export const BatchValidationRequestSchema = z.object({
  references: z.array(ReferenceValidationRequestSchema),
});

export type BatchValidationRequest = z.infer<typeof BatchValidationRequestSchema>;

export const BatchValidationResponseSchema = z.object({
  results: z.array(ReferenceValidationResponseSchema),
  allValid: z.boolean(),
  failedCount: z.number(),
});

export type BatchValidationResponse = z.infer<typeof BatchValidationResponseSchema>;

export const IntegrityViolationSchema = z.object({
  id: z.string().uuid(),
  sourceService: z.nativeEnum(ServiceName),
  sourceTable: z.string(),
  sourceId: z.string(),
  targetService: z.nativeEnum(ServiceName),
  targetTable: z.string(),
  targetId: z.string(),
  referenceType: z.string(),
  violationType: z.enum(['ORPHAN', 'MISSING_REFERENCE', 'STALE_REFERENCE']),
  detectedAt: z.date(),
  resolvedAt: z.date().optional(),
  resolutionAction: z.string().optional(),
});

export type IntegrityViolation = z.infer<typeof IntegrityViolationSchema>;

export const IntegrityScanResultSchema = z.object({
  service: z.nativeEnum(ServiceName),
  scannedAt: z.date(),
  tablesScanned: z.number(),
  recordsScanned: z.number(),
  violationsFound: z.number(),
  violations: z.array(IntegrityViolationSchema),
  dryRun: z.boolean(),
  cleanedCount: z.number(),
});

export type IntegrityScanResult = z.infer<typeof IntegrityScanResultSchema>;

export interface CrossServiceReference {
  sourceTable: string;
  sourceColumn: string;
  targetService: ServiceName;
  targetTable: string;
  targetColumn: string;
  referenceType: string;
  requiredForCreate: boolean;
  requiredForUpdate: boolean;
  cascadeOnDelete: boolean;
}

export interface ServiceClient {
  verifyReference(referenceType: string, referenceId: string): Promise<ReferenceValidationResponse>;
  batchVerifyReferences(
    references: Array<{ referenceType: string; referenceId: string }>
  ): Promise<BatchValidationResponse>;
}

export interface IntegrityGuardConfig {
  currentService: ServiceName;
  serviceClients: Map<ServiceName, ServiceClient>;
  strictMode: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  onViolation?: (violation: IntegrityGuardViolation) => void;
}

export interface IntegrityGuardViolation {
  sourceService: ServiceName;
  sourceTable: string;
  targetService: ServiceName;
  referenceType: string;
  referenceId: string;
  operation: OperationType;
  error: string;
}
