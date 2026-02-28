/**
 * FileMetadata Value Object - Storage Service Domain Model
 * Represents immutable file metadata with business rules and validation
 */

import { StorageError } from '../../application/errors';

export class FileMetadata {
  readonly size: number;
  readonly mimeType: string;
  readonly uploadedAt: Date;
  readonly uploadedBy: string;
  readonly tags: string[];
  readonly description?: string;
  readonly isPublic: boolean;
  readonly lastModified?: Date;
  readonly encoding?: string;
  readonly language?: string;
  readonly customProperties: Record<string, unknown>;

  constructor(
    size: number,
    mimeType: string,
    uploadedAt: Date,
    uploadedBy: string,
    isPublic: boolean,
    options: {
      tags?: string[];
      description?: string;
      lastModified?: Date;
      encoding?: string;
      language?: string;
      customProperties?: Record<string, unknown>;
    } = {}
  ) {
    this.validateInputs(size, mimeType, uploadedAt, uploadedBy);

    this.size = size;
    this.mimeType = this.normalizeMimeType(mimeType);
    this.uploadedAt = uploadedAt;
    this.uploadedBy = uploadedBy;
    this.isPublic = isPublic;
    this.tags = this.normalizeTags(options.tags || []);
    this.description = options.description?.trim() || undefined;
    this.lastModified = options.lastModified;
    this.encoding = options.encoding?.toLowerCase();
    this.language = options.language?.toLowerCase();
    this.customProperties = options.customProperties || {};
  }

  private validateInputs(size: number, mimeType: string, uploadedAt: Date, uploadedBy: string): void {
    if (size < 0) {
      throw StorageError.invalidMetadata('size', 'cannot be negative');
    }

    if (size > this.getMaxFileSize()) {
      throw StorageError.invalidMetadata('size', `cannot exceed ${this.getHumanReadableSize(this.getMaxFileSize())}`);
    }

    if (!mimeType || mimeType.trim().length === 0) {
      throw StorageError.invalidMetadata('mimeType', 'cannot be empty');
    }

    if (!this.isValidMimeType(mimeType)) {
      throw StorageError.invalidMetadata('mimeType', `invalid format: ${mimeType}`);
    }

    if (!uploadedAt || uploadedAt > new Date()) {
      throw StorageError.invalidMetadata('uploadedAt', 'cannot be in the future');
    }

    if (!uploadedBy || uploadedBy.trim().length === 0) {
      throw StorageError.invalidMetadata('uploadedBy', 'cannot be empty');
    }
  }

  private isValidMimeType(mimeType: string): boolean {
    // Basic MIME type validation: type/subtype
    const mimeRegex = /^[a-zA-Z][a-zA-Z0-9][a-zA-Z0-9!#$&\-^]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^]*$/;
    return mimeRegex.test(mimeType);
  }

  private normalizeMimeType(mimeType: string): string {
    return mimeType.toLowerCase().trim();
  }

  private normalizeTags(tags: string[]): string[] {
    return tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0)
      .filter((tag, index, arr) => arr.indexOf(tag) === index) // Remove duplicates
      .slice(0, 50); // Limit to 50 tags
  }

  private getMaxFileSize(): number {
    // Different limits based on file type
    if (this.isImage()) {
      return 50 * 1024 * 1024; // 50MB for images
    }
    if (this.isVideo()) {
      return 5 * 1024 * 1024 * 1024; // 5GB for videos
    }
    if (this.isAudio()) {
      return 500 * 1024 * 1024; // 500MB for audio
    }
    if (this.isDocument()) {
      return 100 * 1024 * 1024; // 100MB for documents
    }
    return 1024 * 1024 * 1024; // 1GB for other files
  }

  /**
   * Get human-readable file size
   */
  getHumanReadableSize(bytes?: number): string {
    const targetBytes = bytes ?? this.size;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    if (targetBytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(targetBytes) / Math.log(1024));
    const size = (targetBytes / Math.pow(1024, i)).toFixed(2);

    return `${size} ${sizes[i]}`;
  }

  /**
   * Check if file is an image
   */
  isImage(): boolean {
    return this.mimeType.startsWith('image/');
  }

  /**
   * Check if file is a video
   */
  isVideo(): boolean {
    return this.mimeType.startsWith('video/');
  }

  /**
   * Check if file is audio
   */
  isAudio(): boolean {
    return this.mimeType.startsWith('audio/');
  }

  /**
   * Check if file is a document
   */
  isDocument(): boolean {
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    return docTypes.some(type => this.mimeType.includes(type));
  }

  /**
   * Check if file is an archive
   */
  isArchive(): boolean {
    const archiveTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed',
    ];
    return archiveTypes.includes(this.mimeType);
  }

  /**
   * Check if file is executable or potentially dangerous
   */
  isPotentiallyDangerous(): boolean {
    const dangerousTypes = [
      'application/x-executable',
      'application/x-msdos-program',
      'application/x-msdownload',
      'application/x-sh',
      'text/x-script',
      'application/javascript',
      'text/javascript',
    ];

    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.com', '.pif'];
    const hasExtension = dangerousExtensions.some(ext =>
      (this.customProperties.filename as string | undefined)?.toLowerCase().endsWith(ext)
    );

    return dangerousTypes.includes(this.mimeType) || hasExtension;
  }

  /**
   * Check if file has specific tag
   */
  hasTag(tag: string): boolean {
    return this.tags.includes(tag.toLowerCase().trim());
  }

  /**
   * Get age of file in days
   */
  getAgeInDays(): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.uploadedAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if file is recently uploaded (within last 24 hours)
   */
  isRecentlyUploaded(): boolean {
    return this.getAgeInDays() <= 1;
  }

  /**
   * Check if file is old (older than specified days)
   */
  isOld(days: number = 365): boolean {
    return this.getAgeInDays() > days;
  }

  /**
   * Get file category based on MIME type
   */
  getCategory(): 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'other' {
    if (this.isImage()) return 'image';
    if (this.isVideo()) return 'video';
    if (this.isAudio()) return 'audio';
    if (this.isDocument()) return 'document';
    if (this.isArchive()) return 'archive';

    const codeTypes = [
      'text/x-python',
      'text/x-java-source',
      'text/x-c',
      'text/x-c++',
      'application/json',
      'text/xml',
      'text/html',
      'text/css',
    ];
    if (codeTypes.includes(this.mimeType)) return 'code';

    return 'other';
  }

  /**
   * Check if file meets quality standards
   */
  meetsQualityStandards(): {
    passes: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for empty files
    if (this.size === 0) {
      issues.push('File is empty');
    }

    // Check for suspiciously large files
    if (this.size > this.getMaxFileSize()) {
      issues.push('File exceeds maximum size limit');
    }

    // Check for potentially dangerous files
    if (this.isPotentiallyDangerous()) {
      issues.push('File type may pose security risks');
    }

    // Check MIME type validity
    if (!this.isValidMimeType(this.mimeType)) {
      issues.push('Invalid MIME type format');
    }

    // Check for reasonable description length
    if (this.description && this.description.length > 1000) {
      issues.push('Description is excessively long');
    }

    // Check for reasonable number of tags
    if (this.tags.length > 50) {
      issues.push('Too many tags assigned');
    }

    return {
      passes: issues.length === 0,
      issues,
    };
  }

  /**
   * Add custom property
   */
  withCustomProperty(key: string, value: unknown): FileMetadata {
    const newCustomProperties = { ...this.customProperties, [key]: value };

    return new FileMetadata(this.size, this.mimeType, this.uploadedAt, this.uploadedBy, this.isPublic, {
      tags: this.tags,
      description: this.description,
      lastModified: this.lastModified,
      encoding: this.encoding,
      language: this.language,
      customProperties: newCustomProperties,
    });
  }

  /**
   * Add tag
   */
  withTag(tag: string): FileMetadata {
    const normalizedTag = tag.trim().toLowerCase();
    if (this.hasTag(normalizedTag)) {
      return this; // Already has tag
    }

    const newTags = [...this.tags, normalizedTag].slice(0, 50);

    return new FileMetadata(this.size, this.mimeType, this.uploadedAt, this.uploadedBy, this.isPublic, {
      tags: newTags,
      description: this.description,
      lastModified: this.lastModified,
      encoding: this.encoding,
      language: this.language,
      customProperties: this.customProperties,
    });
  }

  /**
   * Remove tag
   */
  withoutTag(tag: string): FileMetadata {
    const normalizedTag = tag.trim().toLowerCase();
    const newTags = this.tags.filter(t => t !== normalizedTag);

    return new FileMetadata(this.size, this.mimeType, this.uploadedAt, this.uploadedBy, this.isPublic, {
      tags: newTags,
      description: this.description,
      lastModified: this.lastModified,
      encoding: this.encoding,
      language: this.language,
      customProperties: this.customProperties,
    });
  }

  /**
   * Change visibility
   */
  withVisibility(isPublic: boolean): FileMetadata {
    return new FileMetadata(this.size, this.mimeType, this.uploadedAt, this.uploadedBy, isPublic, {
      tags: this.tags,
      description: this.description,
      lastModified: this.lastModified,
      encoding: this.encoding,
      language: this.language,
      customProperties: this.customProperties,
    });
  }

  /**
   * Update description
   */
  withDescription(description: string): FileMetadata {
    return new FileMetadata(this.size, this.mimeType, this.uploadedAt, this.uploadedBy, this.isPublic, {
      tags: this.tags,
      description: description.trim() || undefined,
      lastModified: this.lastModified,
      encoding: this.encoding,
      language: this.language,
      customProperties: this.customProperties,
    });
  }

  /**
   * Static factory methods
   */
  static create(
    size: number,
    mimeType: string,
    uploadedBy: string,
    isPublic: boolean = false,
    options: {
      tags?: string[];
      description?: string;
      encoding?: string;
      language?: string;
      customProperties?: Record<string, unknown>;
    } = {}
  ): FileMetadata {
    return new FileMetadata(size, mimeType, new Date(), uploadedBy, isPublic, options);
  }

  /**
   * Equality comparison
   */
  equals(other: FileMetadata): boolean {
    return (
      this.size === other.size &&
      this.mimeType === other.mimeType &&
      this.uploadedAt.getTime() === other.uploadedAt.getTime() &&
      this.uploadedBy === other.uploadedBy &&
      this.isPublic === other.isPublic &&
      JSON.stringify(this.tags.sort()) === JSON.stringify(other.tags.sort()) &&
      this.description === other.description
    );
  }

  /**
   * Convert to plain object
   */
  toPlainObject(): {
    size: number;
    mimeType: string;
    uploadedAt: string;
    uploadedBy: string;
    tags: string[];
    description?: string;
    isPublic: boolean;
    lastModified?: string;
    encoding?: string;
    language?: string;
    customProperties: Record<string, unknown>;
  } {
    return {
      size: this.size,
      mimeType: this.mimeType,
      uploadedAt: this.uploadedAt.toISOString(),
      uploadedBy: this.uploadedBy,
      tags: [...this.tags],
      description: this.description,
      isPublic: this.isPublic,
      lastModified: this.lastModified?.toISOString(),
      encoding: this.encoding,
      language: this.language,
      customProperties: { ...this.customProperties },
    };
  }

  /**
   * Create from plain object
   */
  static fromPlainObject(obj: Record<string, unknown>): FileMetadata {
    return new FileMetadata(
      obj.size as number,
      obj.mimeType as string,
      new Date(obj.uploadedAt as string),
      obj.uploadedBy as string,
      obj.isPublic as boolean,
      {
        tags: (obj.tags as string[]) || [],
        description: obj.description as string | undefined,
        lastModified: obj.lastModified ? new Date(obj.lastModified as string) : undefined,
        encoding: obj.encoding as string | undefined,
        language: obj.language as string | undefined,
        customProperties: (obj.customProperties as Record<string, unknown>) || {},
      }
    );
  }
}
