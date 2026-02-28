/**
 * Storage Service - Main service for file operations
 * Integrates use cases with storage providers and repositories
 */

import { LocalStorageProvider } from './providers/LocalStorageProvider';
import { SimpleStorageRepository } from './repositories/SimpleStorageRepository';
import {
  UploadFileUseCase,
  DownloadFileUseCase,
  DownloadExternalFileUseCase,
  DeleteFileUseCase,
  ListFilesUseCase,
  GetFileMetadataUseCase,
} from '../application/use-cases';

export class StorageService {
  private uploadUseCase: UploadFileUseCase;
  private downloadUseCase: DownloadFileUseCase;
  private downloadExternalUseCase: DownloadExternalFileUseCase;
  private deleteUseCase: DeleteFileUseCase;
  private listUseCase: ListFilesUseCase;
  private metadataUseCase: GetFileMetadataUseCase;

  constructor() {
    // Initialize storage provider (using local for generated songs)
    const storageProvider = new LocalStorageProvider('./public');
    const repository = new SimpleStorageRepository();

    // Initialize use cases
    this.uploadUseCase = new UploadFileUseCase(storageProvider, repository);
    this.downloadUseCase = new DownloadFileUseCase(storageProvider, repository);
    this.downloadExternalUseCase = new DownloadExternalFileUseCase(storageProvider, repository);
    this.deleteUseCase = new DeleteFileUseCase(storageProvider, repository);
    this.listUseCase = new ListFilesUseCase(repository);
    this.metadataUseCase = new GetFileMetadataUseCase(repository);

    // Initialize provider
    void storageProvider.initialize();
  }

  // Upload file
  async uploadFile(
    request: Parameters<typeof this.uploadUseCase.execute>[0]
  ): Promise<ReturnType<typeof this.uploadUseCase.execute>> {
    return await this.uploadUseCase.execute(request);
  }

  // Download file by ID or path
  async downloadFile(
    request: Parameters<typeof this.downloadUseCase.execute>[0]
  ): Promise<ReturnType<typeof this.downloadUseCase.execute>> {
    return await this.downloadUseCase.execute(request);
  }

  // Download external file (from MusicAPI.ai etc)
  async downloadExternalFile(
    request: Parameters<typeof this.downloadExternalUseCase.execute>[0]
  ): Promise<ReturnType<typeof this.downloadExternalUseCase.execute>> {
    return await this.downloadExternalUseCase.execute(request);
  }

  // Delete file
  async deleteFile(
    request: Parameters<typeof this.deleteUseCase.execute>[0]
  ): Promise<ReturnType<typeof this.deleteUseCase.execute>> {
    return await this.deleteUseCase.execute(request);
  }

  // List files
  async listFiles(
    request: Parameters<typeof this.listUseCase.execute>[0]
  ): Promise<ReturnType<typeof this.listUseCase.execute>> {
    return await this.listUseCase.execute(request);
  }

  // Get file metadata
  async getFileMetadata(
    request: Parameters<typeof this.metadataUseCase.execute>[0]
  ): Promise<ReturnType<typeof this.metadataUseCase.execute>> {
    return await this.metadataUseCase.execute(request);
  }

  // Helper method for generated songs directory
  async listGeneratedSongs(): Promise<ReturnType<typeof this.listUseCase.execute>> {
    return await this.listUseCase.execute({
      limit: 100,
    } as { limit: number });
  }
}

export const storageService = new StorageService();
