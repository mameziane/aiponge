/**
 * Storage Repository Interface
 * Domain layer abstraction for file persistence
 */

import { FileEntity } from '../../domains/entities/FileEntity';

export interface IStorageRepository {
  save(_file: FileEntity): Promise<void>;
  findById(_id: string): Promise<FileEntity | null>;
  findByPath(_path: string): Promise<FileEntity | null>;
  findByUserId(_userId: string): Promise<FileEntity[]>;
  delete(_id: string): Promise<boolean>;
  exists(_id: string): Promise<boolean>;
  updateMetadata(_id: string, _metadata: Partial<FileEntity['metadata']>): Promise<boolean>;
  findExpired(): Promise<FileEntity[]>;
  markFileAsOrphaned(_storagePath: string): Promise<boolean>;
  search(_filters: {
    userId?: string;
    contentType?: string;
    tags?: string[];
    isPublic?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<FileEntity[]>;
}
