/**
 * Storage Service - Types and Exports Index
 * Main exports for the storage service package
 */

// Domain exports
export type { StorageLocation } from './domains/value-objects/StorageLocation';
export type { StorageProvider, StorageProviderType } from './domains/value-objects/StorageProvider';
export type { FileEntity, FileMetadata } from './domains/entities/FileEntity';

// Application exports
export type { IStorageRepository } from './application/interfaces/IStorageRepository';
export type {
  IStorageProvider,
  IFileStorageProvider,
  UploadOptions,
  UploadResult,
  DownloadResult,
  FileMetadata as StorageProviderFileMetadata,
} from './application/interfaces/IStorageProvider';

export { StorageService } from './application/services/StorageService';
export { StorageError } from './application/errors';

// Use case exports
export { UploadFileUseCase } from './application/use-cases/UploadFileUseCase';
export type { UploadFileRequest, UploadFileResponse } from './application/use-cases/UploadFileUseCase';

export { DownloadFileUseCase } from './application/use-cases/DownloadFileUseCase';
export type { DownloadFileRequest, DownloadFileResponse } from './application/use-cases/DownloadFileUseCase';

export { DeleteFileUseCase } from './application/use-cases/DeleteFileUseCase';
export type { DeleteFileRequest, DeleteFileResponse } from './application/use-cases/DeleteFileUseCase';

export { GenerateSignedUrlUseCase } from './application/use-cases/GenerateSignedUrlUseCase';
export type {
  GenerateSignedUrlRequest,
  GenerateSignedUrlResponse,
} from './application/use-cases/GenerateSignedUrlUseCase';

export { ListFilesUseCase } from './application/use-cases/ListFilesUseCase';
export type { ListFilesRequest, ListFilesResponse } from './application/use-cases/ListFilesUseCase';

export { GetFileMetadataUseCase } from './application/use-cases/GetFileMetadataUseCase';
export type { GetFileMetadataRequest, GetFileMetadataResponse } from './application/use-cases/GetFileMetadataUseCase';

export { FileSearchUseCase } from './application/use-cases/FileSearchUseCase';
// Note: FileSearchRequest and FileSearchResponse are not exported from FileSearchUseCase

export { FileAnalyticsUseCase } from './application/use-cases/FileAnalyticsUseCase';
export type { FileAnalyticsRequest, FileAnalyticsResponse } from './application/use-cases/FileAnalyticsUseCase';

export { BackgroundProcessingUseCase } from './application/use-cases/BackgroundProcessingUseCase';

// Infrastructure exports
export { LocalStorageProvider } from './infrastructure/providers/LocalStorageProvider';
export { SimpleStorageRepository } from './infrastructure/repositories/SimpleStorageRepository';
export { StorageProviderFactory } from './infrastructure/providers/StorageProviderFactory';
export type { StorageConfiguration } from './infrastructure/providers/StorageProviderFactory';

// Utility function to create a complete storage service
export async function createStorageService(
  config?: import('./infrastructure/providers/StorageProviderFactory').StorageConfiguration
): Promise<import('./application/services/StorageService').StorageService> {
  // Use direct imports since we removed problematic providers
  const { StorageProviderFactory } = await import('./infrastructure/providers/StorageProviderFactory');
  const { SimpleStorageRepository } = await import('./infrastructure/repositories/SimpleStorageRepository');
  const { StorageService } = await import('./application/services/StorageService');

  const factory = StorageProviderFactory.getInstance();
  const provider = await factory.createAndInitializeProvider(config);
  const repository = new SimpleStorageRepository();

  return new StorageService(provider, repository);
}
