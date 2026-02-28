/**
 * Entry Use Cases
 * Barrel export for entry-related use cases
 */

// CRUD Operations
export {
  CreateEntryUseCase,
  createEntryInputSchema,
  type CreateEntryInput,
  type CreateEntryResult,
  type CreateEntryDependencies,
} from './CreateEntryUseCase';
export { GetEntryUseCase, type GetEntryResult } from './GetEntryUseCase';
export {
  UpdateEntryUseCase,
  updateEntryInputSchema,
  type UpdateEntryInput,
  type UpdateEntryResult,
  type UpdateEntryDependencies,
} from './UpdateEntryUseCase';
export { DeleteEntryUseCase, type DeleteEntryResult, type DeleteEntryDependencies } from './DeleteEntryUseCase';
export {
  ListEntriesUseCase,
  type ListEntriesFilter,
  type EntryWithIllustrations,
  type ListEntriesResult,
} from './ListEntriesUseCase';

// Entry Operations
export * from './ArchiveEntryUseCase';
export * from './EntryImagesUseCase';
export * from './PromoteEntryUseCase';
export * from './UnpromoteEntryUseCase';

// Entry Analysis
export * from './AnalyzeEntryUseCase';
export * from './BatchAnalyzeEntriesUseCase';
export * from './DetectEntryPatternsUseCase';
