/**
 * Import User Profile Use Case - Profile Service
 * Imports user profile data, validates and merges imported data, handles data migration scenarios
 */

import { IProfileRepository } from '@domains/profile';
import { IEntryRepository } from '@domains/profile';
import { IAnalysisRepository } from '@domains/profile';
import { getLogger } from '@config/service-urls';
import { ImportedDataRecord, ImportedEntry, ImportedInsight } from './highlight-types';
import { ProfileError } from '@application/errors';
import { serializeError, errorMessage, errorStack } from '@aiponge/platform-core';

const logger = getLogger('import-user-profile-use-case');

const BACKUP_TTL_HOURS = 24;

export interface IBookRepository {
  getBooksByUser(userId: string): Promise<unknown[]>;
}

export interface IChapterRepository {
  findChaptersByUserId(userId: string, bookId?: string): Promise<unknown[]>;
}

export interface ImportDataSource {
  type: 'file' | 'api' | 'database' | 'manual';
  format: 'json' | 'csv' | 'xml' | 'xlsx';
  source: string; // file path, API endpoint, or database connection
  credentials?: {
    apiKey?: string;
    username?: string;
    password?: string;
    token?: string;
  };
}

export interface ImportOptions {
  mergeStrategy: 'overwrite' | 'merge' | 'skip_duplicates' | 'create_new';
  conflictResolution: 'source_priority' | 'destination_priority' | 'manual_review' | 'timestamp_priority';
  validateData: boolean;
  preserveIds: boolean;
  createBackup: boolean;
  batchSize?: number;
  dryRun?: boolean;
}

export interface ImportUserProfileRequest {
  userId: string;
  dataSource: ImportDataSource;
  options: ImportOptions;
  scope: {
    includeBasicProfile?: boolean;
    includeEntries?: boolean;
    includeInsights?: boolean;
    includePatterns?: boolean;
    includeAnalytics?: boolean;
    includePersona?: boolean;
    dateRange?: {
      start: Date;
      end: Date;
    };
  };
  metadata?: {
    importReason: string;
    sourceDescription?: string;
    importedBy?: string;
    migrationVersion?: string;
  };
}

export interface ImportValidationResult {
  isValid: boolean;
  errors: Array<{
    type: 'error' | 'warning';
    field: string;
    message: string;
    recordIndex?: number;
    suggestedFix?: string;
  }>;
  warnings: Array<{
    type: 'data_quality' | 'compatibility' | 'performance';
    message: string;
    impact: 'low' | 'medium' | 'high';
  }>;
  statistics: {
    totalRecords: number;
    validRecords: number;
    duplicateRecords: number;
    invalidRecords: number;
    recordsByType: Record<string, number>;
  };
}

export interface ImportConflict {
  id: string;
  type: 'duplicate' | 'field_conflict' | 'reference_missing' | 'schema_mismatch';
  existingRecord: Record<string, unknown>;
  importedRecord: Record<string, unknown>;
  conflictingFields: string[];
  recommendedResolution: string;
  autoResolvable: boolean;
}

export interface ImportUserProfileResponse {
  importId: string;
  status: 'completed' | 'partial' | 'failed' | 'review_required';
  summary: {
    totalRecords: number;
    successfulImports: number;
    failedImports: number;
    skippedRecords: number;
    conflictsDetected: number;
  };
  validation: ImportValidationResult;
  conflicts: ImportConflict[];
  backupId?: string;
  importedData: {
    basicProfile?: Record<string, unknown>;
    entries: number;
    insights: number;
    patterns: number;
    analytics: number;
  };
  processingTime: number;
  importedAt: Date;
  nextSteps?: string[];
}

export interface BackupData {
  profile: unknown;
  entries: unknown[];
  insights: unknown[];
  books: unknown[];
  chapters: unknown[];
}

export interface IImportBackupRepository {
  createBackup(id: string, userId: string, data: BackupData, expiresAt: Date): Promise<void>;
  getBackup(id: string): Promise<{ id: string; userId: string; backupData: BackupData; status: string } | null>;
  deleteBackup(id: string): Promise<boolean>;
  cleanupExpiredBackups(): Promise<number>;
}

export class ImportUserProfileUseCase {
  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository,
    private readonly analysisRepository: IAnalysisRepository,
    private readonly backupRepository?: IImportBackupRepository,
    private readonly bookRepository?: IBookRepository,
    private readonly chapterRepository?: IChapterRepository
  ) {}

  async execute(request: ImportUserProfileRequest): Promise<ImportUserProfileResponse> {
    const startTime = Date.now();
    const importId = this.generateImportId(request.userId);

    try {
      logger.info('Starting profile import for user', {
        module: 'import_user_profile_use_case',
        operation: 'execute',
        userId: request.userId,
        phase: 'import_started',
      });

      // Validate request
      this.validateRequest(request);

      // Create backup if requested
      let backupId: string | undefined;
      if (request.options.createBackup) {
        backupId = await this.createBackup(request.userId);
      }

      // Load and parse import data
      const importData = await this.loadImportData(request.dataSource);

      // Validate imported data
      const validation = await this.validateImportData(importData, request.scope);

      if (!validation.isValid && !request.options.dryRun) {
        throw ProfileError.validationError(
          'importData',
          `Import validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        );
      }

      // Detect conflicts
      const conflicts = await this.detectConflicts(request.userId, importData, request.options);

      // If dry run, return results without importing
      if (request.options.dryRun) {
        return this.createDryRunResponse(importId, validation, conflicts, importData, startTime);
      }

      // Process import with conflict resolution
      const importResults = await this.processImport(
        request.userId,
        importData,
        request.options,
        request.scope,
        conflicts
      );

      // Record import event
      await this.recordImportEvent(request, importResults, importId);

      const processingTime = Date.now() - startTime;

      logger.info('Successfully imported profile data for user', {
        module: 'import_user_profile_use_case',
        operation: 'execute',
        userId: request.userId,
        totalRecords: importResults.summary.totalRecords,
        successfulImports: importResults.summary.successfulImports,
        phase: 'import_completed',
      });

      return {
        importId,
        status: conflicts.length > 0 ? 'partial' : 'completed',
        summary: importResults.summary,
        validation,
        conflicts: conflicts.filter(c => !c.autoResolvable),
        backupId,
        importedData: importResults.importedData,
        processingTime,
        importedAt: new Date(),
        nextSteps: this.generateNextSteps(importResults, conflicts),
      };
    } catch (error) {
      logger.error('Failed to import user profile', {
        module: 'import_user_profile_use_case',
        operation: 'execute',
        userId: request.userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'import_failed',
      });

      // Record failed import
      await this.recordImportEvent(
        request,
        {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        importId
      );

      return {
        importId,
        status: 'failed',
        summary: {
          totalRecords: 0,
          successfulImports: 0,
          failedImports: 1,
          skippedRecords: 0,
          conflictsDetected: 0,
        },
        validation: {
          isValid: false,
          errors: [
            { type: 'error', field: 'general', message: error instanceof Error ? error.message : 'Unknown error' },
          ],
          warnings: [],
          statistics: {
            totalRecords: 0,
            validRecords: 0,
            duplicateRecords: 0,
            invalidRecords: 0,
            recordsByType: {},
          },
        },
        conflicts: [],
        importedData: {
          entries: 0,
          insights: 0,
          patterns: 0,
          analytics: 0,
        },
        processingTime: Date.now() - startTime,
        importedAt: new Date(),
      };
    }
  }

  private validateRequest(request: ImportUserProfileRequest): void {
    if (!request.userId?.trim()) {
      throw ProfileError.userIdRequired();
    }

    if (!request.dataSource?.type) {
      throw ProfileError.validationError('dataSource.type', 'Data source type is required');
    }

    if (!request.dataSource?.format) {
      throw ProfileError.validationError('dataSource.format', 'Data format is required');
    }

    if (!request.options?.mergeStrategy) {
      throw ProfileError.validationError('options.mergeStrategy', 'Merge strategy is required');
    }

    const validFormats = ['json', 'csv', 'xml', 'xlsx'];
    if (!validFormats.includes(request.dataSource.format)) {
      throw ProfileError.invalidFormat(request.dataSource.format);
    }

    const validMergeStrategies = ['overwrite', 'merge', 'skip_duplicates', 'create_new'];
    if (!validMergeStrategies.includes(request.options.mergeStrategy)) {
      throw ProfileError.validationError('mergeStrategy', `Invalid merge strategy: ${request.options.mergeStrategy}`);
    }
  }

  private generateImportId(userId: string): string {
    const { randomUUID } = require('crypto');
    return `import_${userId}_${Date.now()}_${randomUUID()}`;
  }

  private async createBackup(userId: string): Promise<string> {
    const backupId = `backup_${userId}_${Date.now()}`;

    try {
      // Get existing data
      const existingProfile = await this.profileRepository.getProfile(userId);
      const existingEntries = await this.entryRepository.getEntriesByUser(userId);
      const existingInsights = await this.entryRepository.getInsightsByUser(userId);

      // Get books and chapters if repositories are available
      const existingBooks = this.bookRepository ? await this.bookRepository.getBooksByUser(userId) : [];
      const existingChapters = this.chapterRepository ? await this.chapterRepository.findChaptersByUserId(userId) : [];

      const backupData: BackupData = {
        profile: existingProfile,
        entries: existingEntries,
        insights: existingInsights,
        books: existingBooks,
        chapters: existingChapters,
      };

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + BACKUP_TTL_HOURS * 60 * 60 * 1000);

      // Store backup in database if repository is available
      if (this.backupRepository) {
        await this.backupRepository.createBackup(backupId, userId, backupData, expiresAt);
      } else {
        logger.warn('Backup repository not configured - backup will not be persisted', {
          module: 'import_user_profile_use_case',
          operation: 'createBackup',
          backupId,
        });
      }

      logger.info('Created backup for user', {
        module: 'import_user_profile_use_case',
        operation: 'createBackup',
        userId,
        backupId,
        entryCount: existingEntries.length,
        insightCount: existingInsights.length,
        bookCount: existingBooks.length,
        chapterCount: existingChapters.length,
        expiresAt: expiresAt.toISOString(),
        phase: 'backup_created',
      });

      return backupId;
    } catch (error) {
      logger.error('Failed to create backup', {
        module: 'import_user_profile_use_case',
        operation: 'createBackup',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'backup_creation_failed',
      });
      throw ProfileError.internalError('Failed to create backup before import');
    }
  }

  async getBackup(backupId: string): Promise<BackupData | null> {
    if (!this.backupRepository) {
      logger.warn('Backup repository not configured');
      return null;
    }
    const backup = await this.backupRepository.getBackup(backupId);
    return backup?.backupData ?? null;
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    if (!this.backupRepository) {
      return false;
    }
    return this.backupRepository.deleteBackup(backupId);
  }

  async cleanupExpiredBackups(): Promise<number> {
    if (!this.backupRepository) {
      return 0;
    }
    return this.backupRepository.cleanupExpiredBackups();
  }

  private async loadImportData(dataSource: ImportDataSource): Promise<ImportedDataRecord> {
    try {
      switch (dataSource.type) {
        case 'file':
          return this.loadFromFile(dataSource);
        case 'api':
          return this.loadFromAPI(dataSource);
        case 'database':
          return this.loadFromDatabase(dataSource);
        case 'manual':
          return this.loadManualData(dataSource);
        default:
          throw ProfileError.validationError('dataSource.type', `Unsupported data source type: ${dataSource.type}`);
      }
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      throw ProfileError.internalError('Failed to load import data', error instanceof Error ? error : undefined);
    }
  }

  private async loadFromFile(dataSource: ImportDataSource): Promise<ImportedDataRecord> {
    // Would implement file loading based on format
    logger.info('Loading from file', {
      module: 'import_user_profile_use_case',
      operation: 'loadData',
      sourceType: 'file',
      source: dataSource.source,
      phase: 'file_loading_started',
    });

    // Mock data structure
    return {
      basicProfile: {
        userId: 'user123',
        displayName: 'Imported User',
        bio: 'Imported profile',
      },
      entries: [
        {
          content: 'Imported entry 1',
          type: 'text',
          createdAt: new Date().toISOString(),
        },
        {
          content: 'Imported entry 2',
          type: 'text',
          createdAt: new Date().toISOString(),
        },
      ],
      insights: [
        {
          entryId: 'entry1',
          type: 'sentiment',
          content: { sentiment: 'positive', confidence: 0.8 },
          confidence: 0.8,
        },
      ],
      patterns: [],
      analytics: [],
    };
  }

  private async loadFromAPI(dataSource: ImportDataSource): Promise<ImportedDataRecord> {
    logger.info('Loading from API', {
      module: 'import_user_profile_use_case',
      operation: 'loadData',
      sourceType: 'api',
      source: dataSource.source,
      phase: 'api_loading_started',
    });
    // Would make HTTP request with credentials
    return {} as ImportedDataRecord;
  }

  private async loadFromDatabase(dataSource: ImportDataSource): Promise<ImportedDataRecord> {
    logger.info('Loading from database', {
      module: 'import_user_profile_use_case',
      operation: 'loadData',
      sourceType: 'database',
      source: dataSource.source,
      phase: 'database_loading_started',
    });
    // Would connect to external database
    return { entries: [], insights: [], patterns: [], analytics: [] };
  }

  private async loadManualData(dataSource: ImportDataSource): Promise<ImportedDataRecord> {
    logger.info('Processing manual data input', {
      module: 'import_user_profile_use_case',
      operation: 'loadData',
      sourceType: 'manual',
      phase: 'manual_processing_started',
    });
    // Would parse manually provided data
    return JSON.parse(dataSource.source);
  }

  private async validateImportData(
    importData: ImportedDataRecord,
    scope: ImportUserProfileRequest['scope']
  ): Promise<ImportValidationResult> {
    const errors: ImportValidationResult['errors'] = [];
    const warnings: ImportValidationResult['warnings'] = [];
    let totalRecords = 0;
    let validRecords = 0;
    const recordsByType: Record<string, number> = {};

    try {
      // Validate basic profile
      if (scope.includeBasicProfile && importData.basicProfile) {
        totalRecords += 1;
        recordsByType.basicProfile = 1;

        if (!importData.basicProfile.userId) {
          errors.push({
            type: 'error',
            field: 'basicProfile.userId',
            message: 'User ID is required in basic profile',
          });
        } else {
          validRecords += 1;
        }
      }

      // Validate entries
      if (scope.includeEntries && importData.entries) {
        const entries = Array.isArray(importData.entries) ? importData.entries : [];
        totalRecords += entries.length;
        recordsByType.entries = entries.length;

        entries.forEach((entry: ImportedEntry, index: number) => {
          if (!entry.content) {
            errors.push({
              type: 'error',
              field: 'entries.content',
              message: 'Entry content is required',
              recordIndex: index,
            });
          } else if (entry.content.length < 3) {
            warnings.push({
              type: 'data_quality',
              message: `Entry ${index} has very short content`,
              impact: 'low',
            });
          } else {
            validRecords += 1;
          }
        });
      }

      // Validate insights
      if (scope.includeInsights && importData.insights) {
        const insights = Array.isArray(importData.insights) ? importData.insights : [];
        totalRecords += insights.length;
        recordsByType.insights = insights.length;

        insights.forEach((insight: ImportedInsight, index: number) => {
          if (!insight.type) {
            errors.push({
              type: 'error',
              field: 'insights.type',
              message: 'Insight type is required',
              recordIndex: index,
            });
          } else if (!insight.content) {
            errors.push({
              type: 'error',
              field: 'insights.content',
              message: 'Insight content is required',
              recordIndex: index,
            });
          } else {
            validRecords += 1;
          }
        });
      }

      // Check for data quality issues
      if (totalRecords > 10000) {
        warnings.push({
          type: 'performance',
          message: 'Large import detected - consider batch processing',
          impact: 'medium',
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        statistics: {
          totalRecords,
          validRecords,
          duplicateRecords: 0, // Would implement duplicate detection
          invalidRecords: totalRecords - validRecords,
          recordsByType,
        },
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            type: 'error',
            field: 'general',
            message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        warnings: [],
        statistics: {
          totalRecords: 0,
          validRecords: 0,
          duplicateRecords: 0,
          invalidRecords: 0,
          recordsByType: {},
        },
      };
    }
  }

  private async detectConflicts(
    userId: string,
    importData: ImportedDataRecord,
    options: ImportOptions
  ): Promise<ImportConflict[]> {
    const conflicts: ImportConflict[] = [];

    try {
      // Get existing data
      const existingProfile = await this.profileRepository.getProfile(userId);
      const existingEntries = await this.entryRepository.getEntriesByUser(userId);

      // Check for basic profile conflicts
      if (importData.basicProfile && existingProfile) {
        conflicts.push({
          id: `profile_${userId}`,
          type: 'duplicate',
          existingRecord: existingProfile as unknown as Record<string, unknown>,
          importedRecord: importData.basicProfile,
          conflictingFields: ['displayName', 'bio'],
          recommendedResolution: 'Merge non-conflicting fields',
          autoResolvable: options.conflictResolution !== 'manual_review',
        });
      }

      // Check for entry conflicts (simplified - would check by content similarity)
      if (importData.entries && existingEntries.length > 0) {
        importData.entries.forEach((importEntry: ImportedEntry, index: number) => {
          const similarEntry = existingEntries.find(t =>
            t.content.toLowerCase().includes(importEntry.content.toLowerCase().substring(0, 50))
          );

          if (similarEntry) {
            conflicts.push({
              id: `entry_${index}`,
              type: 'duplicate',
              existingRecord: similarEntry as unknown as Record<string, unknown>,
              importedRecord: importEntry as unknown as Record<string, unknown>,
              conflictingFields: ['content'],
              recommendedResolution: 'Skip duplicate or merge metadata',
              autoResolvable: options.mergeStrategy === 'skip_duplicates',
            });
          }
        });
      }

      return conflicts;
    } catch (error) {
      logger.error('Error detecting conflicts', {
        module: 'import_user_profile_use_case',
        operation: 'detectConflicts',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'conflict_detection_failed',
      });
      return [];
    }
  }

  private async processImport(
    userId: string,
    importData: ImportedDataRecord,
    options: ImportOptions,
    scope: ImportUserProfileRequest['scope'],
    conflicts: ImportConflict[]
  ): Promise<{
    summary: ImportUserProfileResponse['summary'];
    importedData: { entries: number; insights: number; patterns: number; analytics: number };
  }> {
    let successfulImports = 0;
    let failedImports = 0;
    let skippedRecords = 0;
    const importedData = { entries: 0, insights: 0, patterns: 0, analytics: 0 };

    try {
      // Process basic profile
      if (scope.includeBasicProfile && importData.basicProfile) {
        try {
          const conflict = conflicts.find(c => c.id.startsWith('profile_'));
          if (conflict && !conflict.autoResolvable) {
            skippedRecords += 1;
          } else {
            await this.importBasicProfile(userId, importData.basicProfile, options);
            successfulImports += 1;
          }
        } catch (error) {
          failedImports += 1;
          logger.error('Failed to import basic profile', {
            module: 'import_user_profile_use_case',
            operation: 'importData',
            userId,
            error: { message: errorMessage(error), stack: errorStack(error) },
            phase: 'basic_profile_import_failed',
          });
        }
      }

      // Process entries
      if (scope.includeEntries && importData.entries) {
        const batchSize = options.batchSize || 50;
        const entries = Array.isArray(importData.entries) ? importData.entries : [];

        for (let i = 0; i < entries.length; i += batchSize) {
          const batch = entries.slice(i, i + batchSize);

          for (const [index, entryData] of batch.entries()) {
            try {
              const batchIndex = i + index;
              const conflict = conflicts.find(c => c.id === `entry_${batchIndex}`);

              if (conflict && !conflict.autoResolvable) {
                skippedRecords += 1;
                continue;
              }

              await this.importEntry(userId, entryData, options);
              successfulImports += 1;
              importedData.entries += 1;
            } catch (error) {
              failedImports += 1;
              logger.error('Failed to import entry', {
                module: 'import_user_profile_use_case',
                operation: 'importData',
                entryData: entryData,
                error: { message: errorMessage(error), stack: errorStack(error) },
                phase: 'entry_import_failed',
              });
            }
          }
        }
      }

      // Process insights
      if (scope.includeInsights && importData.insights) {
        const insights = Array.isArray(importData.insights) ? importData.insights : [];

        for (const insightData of insights) {
          try {
            await this.importInsight(userId, insightData, options);
            successfulImports += 1;
            importedData.insights += 1;
          } catch (error) {
            failedImports += 1;
            logger.error('Failed to import insight', {
              module: 'import_user_profile_use_case',
              operation: 'importData',
              insightData: insightData,
              error: { message: errorMessage(error), stack: errorStack(error) },
              phase: 'insight_import_failed',
            });
          }
        }
      }

      // Process patterns and analytics would follow similar pattern

      return {
        summary: {
          totalRecords: successfulImports + failedImports + skippedRecords,
          successfulImports,
          failedImports,
          skippedRecords,
          conflictsDetected: conflicts.length,
        },
        importedData,
      };
    } catch (error) {
      logger.error('Error processing import', {
        module: 'import_user_profile_use_case',
        operation: 'importData',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'import_processing_failed',
      });
      throw error;
    }
  }

  private async importBasicProfile(
    userId: string,
    profileData: Record<string, unknown>,
    options: ImportOptions
  ): Promise<void> {
    // Would implement profile merge logic based on options.mergeStrategy
    logger.info('Importing basic profile for user', {
      module: 'import_user_profile_use_case',
      operation: 'importBasicProfile',
      userId,
      phase: 'basic_profile_import_started',
    });
  }

  private async importEntry(userId: string, entryData: ImportedEntry, _options: ImportOptions): Promise<void> {
    try {
      const entryToCreate = {
        userId,
        content: entryData.content,
        type: entryData.type || 'text',
        moodContext: entryData.moodContext,
        triggerSource: entryData.triggerSource,
        tags: entryData.tags || [],
        metadata: entryData.metadata || {},
        sentiment: entryData.sentiment,
        emotionalIntensity: entryData.emotionalIntensity,
      };

      // Use create method if available, otherwise log and skip
      if ('create' in this.entryRepository) {
        await (this.entryRepository as unknown as { create: (data: unknown) => Promise<unknown> }).create(
          entryToCreate
        );
      } else {
        logger.info('Entry import not yet implemented - createEntry method not available', {
          module: 'import_user_profile_use_case',
          operation: 'importEntry',
          userId,
        });
      }
    } catch (error) {
      logger.error('Error importing entry', {
        module: 'import_user_profile_use_case',
        operation: 'importEntry',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'entry_import_error',
      });
      throw error;
    }
  }

  private async importInsight(userId: string, _insightData: ImportedInsight, _options: ImportOptions): Promise<void> {
    // NOTE: Insight import is not implemented - insight repository doesn't have create method yet.
    // This is a known limitation. When insights need to be imported, the insight repository
    // needs to be extended with a create method.
    logger.warn('Insight import skipped - not implemented', {
      module: 'import_user_profile_use_case',
      operation: 'importInsight',
      userId,
      phase: 'insight_import_skipped',
      reason: 'Insight repository does not have create method',
    });
    // Don't throw - just skip the import and log the warning
  }

  private createDryRunResponse(
    importId: string,
    validation: ImportValidationResult,
    conflicts: ImportConflict[],
    _importData: ImportedDataRecord,
    startTime: number
  ): ImportUserProfileResponse {
    return {
      importId,
      status: 'review_required',
      summary: {
        totalRecords: validation.statistics.totalRecords,
        successfulImports: 0,
        failedImports: 0,
        skippedRecords: 0,
        conflictsDetected: conflicts.length,
      },
      validation,
      conflicts,
      importedData: {
        entries: 0,
        insights: 0,
        patterns: 0,
        analytics: 0,
      },
      processingTime: Date.now() - startTime,
      importedAt: new Date(),
      nextSteps: ['Review validation results', 'Resolve conflicts if any', 'Run import without dry_run flag'],
    };
  }

  private generateNextSteps(
    importResults: { summary: ImportUserProfileResponse['summary'] },
    conflicts: ImportConflict[]
  ): string[] {
    const steps: string[] = [];

    if (importResults.summary.failedImports > 0) {
      steps.push('Review failed imports and fix data issues');
    }

    if (conflicts.some((c: ImportConflict) => !c.autoResolvable)) {
      steps.push('Manually resolve remaining conflicts');
    }

    if (importResults.summary.successfulImports > 0) {
      steps.push('Verify imported data quality');
      steps.push('Update user profile analytics');
    }

    return steps;
  }

  private async recordImportEvent(
    request: ImportUserProfileRequest,
    result: Partial<ImportUserProfileResponse> & { status?: string; error?: string },
    importId: string
  ): Promise<void> {
    try {
      await this.analysisRepository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'profile_imported',
        eventData: {
          importId,
          dataSourceType: request.dataSource.type,
          dataSourceFormat: request.dataSource.format,
          mergeStrategy: request.options.mergeStrategy,
          status: result.status || 'unknown',
          recordsProcessed: result.summary?.totalRecords || 0,
          successfulImports: result.summary?.successfulImports || 0,
          failedImports: result.summary?.failedImports || 0,
          conflictsDetected: result.summary?.conflictsDetected || 0,
          error: result.error || undefined,
        },
      });
    } catch (error) {
      logger.error('Failed to record import event', {
        module: 'import_user_profile_use_case',
        operation: 'recordImportEvent',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'import_event_recording_failed',
      });
    }
  }
}
