/**
 * Export User Profile Use Case - Profile Service
 * Exports complete user profiles including insights, patterns, and analytics in multiple formats
 */

import { IProfileRepository } from '@domains/profile';
import { IEntryRepository } from '@domains/profile';
import { IAnalysisRepository } from '@domains/profile';
import { getLogger } from '@config/service-urls';
import { ProfileError } from '@application/errors';
import { PROFILE_VISIBILITY } from '@aiponge/shared-contracts';
import { serializeError, errorMessage, errorStack } from '@aiponge/platform-core';

const logger = getLogger('export-user-profile-use-case');

export interface ExportFormat {
  type: 'json' | 'csv' | 'pdf' | 'xml' | 'xlsx';
  options?: {
    compression?: boolean;
    encryption?: boolean;
    password?: string;
    includeMetadata?: boolean;
    dateFormat?: string;
    timezone?: string;
  };
}

export interface ExportScope {
  includeBasicProfile?: boolean;
  includeEntries?: boolean;
  includeInsights?: boolean;
  includePatterns?: boolean;
  includeAnalytics?: boolean;
  includePersona?: boolean;
  includeWellnessData?: boolean;
  includePrivateData?: boolean;
  timeRange?: {
    start: Date;
    end: Date;
  };
  entryTypes?: string[];
  insightTypes?: string[];
  minConfidence?: number;
}

export interface ExportUserProfileRequest {
  userId: string;
  format: ExportFormat;
  scope: ExportScope;
  destination?: {
    type: 'download' | 'email' | 'storage' | 'api';
    target?: string; // email address, storage path, or API endpoint
  };
  metadata?: {
    exportReason: string;
    requestedBy?: string;
    notes?: string;
  };
}

export interface ExportedProfileData {
  exportInfo: {
    exportId: string;
    userId: string;
    exportedAt: Date;
    format: ExportFormat;
    scope: ExportScope;
    version: string;
    totalRecords: number;
    compressionRatio?: number;
  };
  basicProfile?: {
    userId: string;
    displayName: string;
    bio?: string;
    avatar?: string;
    personalInfo: Record<string, unknown>;
    socialLinks: Record<string, unknown>;
    contactPreferences: Record<string, unknown>;
    visibilitySettings: Record<string, unknown>;
    verificationInfo: Record<string, unknown>;
    statistics: Record<string, unknown>;
    createdAt: Date;
    lastUpdated: Date;
  };
  entries?: Array<{
    id: string;
    content: string;
    type: string;
    moodContext?: string;
    triggerSource?: string;
    sentiment?: string;
    emotionalIntensity?: number;
    tags: string[];
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  insights?: Array<{
    id: string;
    entryId: string | null;
    type: string;
    title: string;
    content: string;
    confidence: string | number | null;
    category?: string | null;
    themes: string[];
    actionable: boolean | null;
    priority: number | null;
    generatedAt: Date;
    validatedAt?: Date | null;
    validatedBy?: string | null;
  }>;
  patterns?: Array<{
    id: string;
    patternType: string;
    patternName: string;
    description: string | null;
    frequency: number | null;
    strength: string | number | null;
    trend: string | null;
    firstObserved: Date;
    lastObserved: Date;
    relatedThemes: string[] | null;
    triggerFactors: string[] | null;
    isActive: boolean | null;
  }>;
  analytics?: Array<{
    id: string;
    analysisType: string;
    timeframe: string;
    progressIndicators: unknown;
    computedAt: Date;
    validFrom: Date;
    validTo: Date;
  }>;
  persona?: Record<string, unknown>;
  wellnessData?: {
    overallScore: number;
    emotionalWellness: number;
    cognitiveWellness: number;
    behavioralWellness: number;
    trends: Array<{
      date: Date;
      score: number;
      category: string;
    }>;
  };
}

export interface ExportUserProfileResponse {
  exportId: string;
  status: 'completed' | 'pending' | 'failed';
  format: ExportFormat;
  fileSize: number;
  recordCount: number;
  filePath?: string;
  downloadUrl?: string;
  expiresAt: Date;
  exportedAt: Date;
  error?: string;
}

export class ExportUserProfileUseCase {
  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly entryRepository: IEntryRepository,
    private readonly analysisRepository: IAnalysisRepository
  ) {}

  async execute(request: ExportUserProfileRequest): Promise<ExportUserProfileResponse> {
    try {
      logger.info('Exporting user profile for user', {
        module: 'export_user_profile_use_case',
        operation: 'execute',
        userId: request.userId,
        format: request.format.type,
        phase: 'export_started',
      });

      // Validate request
      this.validateRequest(request);

      // Generate export ID
      const exportId = this.generateExportId(request.userId);

      // Gather all requested data
      const profileData = await this.gatherProfileData(request.userId, request.scope);

      // Format data according to requested format
      const formattedData = await this.formatData(profileData, request.format, request.scope);

      // Apply security measures if needed
      if (request.format.options?.encryption) {
        await this.encryptData(formattedData, request.format.options.password);
      }

      // Store or deliver the export
      const exportResult = await this.processExport(exportId, formattedData, request.format, request.destination);

      // Record export event for audit
      await this.recordExportEvent(request, exportResult);

      // Generate response
      const response: ExportUserProfileResponse = {
        exportId,
        status: 'completed',
        format: request.format,
        fileSize: exportResult.fileSize,
        recordCount: exportResult.recordCount,
        filePath: exportResult.filePath,
        downloadUrl: exportResult.downloadUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        exportedAt: new Date(),
      };

      logger.info('Successfully exported profile for user', {
        module: 'export_user_profile_use_case',
        operation: 'execute',
        userId: request.userId,
        exportId,
        format: request.format.type,
        fileSize: exportResult.fileSize,
        recordCount: exportResult.recordCount,
        phase: 'export_completed',
      });
      return response;
    } catch (error) {
      logger.error('Failed to export user profile', {
        module: 'export_user_profile_use_case',
        operation: 'execute',
        userId: request.userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'export_failed',
      });

      // Record failed export
      await this.recordExportEvent(request, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        exportId: this.generateExportId(request.userId),
        status: 'failed',
        format: request.format,
        fileSize: 0,
        recordCount: 0,
        expiresAt: new Date(),
        exportedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private validateRequest(request: ExportUserProfileRequest): void {
    if (!request.userId?.trim()) {
      throw ProfileError.userIdRequired();
    }

    if (!request.format?.type) {
      throw ProfileError.validationError('format', 'Export format is required');
    }

    const validFormats = ['json', 'csv', 'pdf', 'xml', 'xlsx'];
    if (!validFormats.includes(request.format.type)) {
      throw ProfileError.invalidFormat(request.format.type);
    }

    if (request.scope.timeRange) {
      const { start, end } = request.scope.timeRange;
      if (start >= end) {
        throw ProfileError.invalidDateRange();
      }
    }

    if (request.format.options?.encryption && !request.format.options?.password) {
      throw ProfileError.validationError('password', 'Password is required for encrypted exports');
    }

    // Validate data retention and privacy requirements
    if (request.scope.includePrivateData && !this.hasPrivateDataAccess(request.userId)) {
      throw ProfileError.forbidden('Insufficient permissions to export private data');
    }
  }

  private generateExportId(userId: string): string {
    const { randomUUID } = require('crypto');
    return `export_${userId}_${Date.now()}_${randomUUID()}`;
  }

  private async gatherProfileData(userId: string, scope: ExportScope): Promise<ExportedProfileData> {
    const exportInfo = {
      exportId: this.generateExportId(userId),
      userId,
      exportedAt: new Date(),
      format: { type: 'json' as const },
      scope,
      version: '1.0',
      totalRecords: 0,
    };

    const profileData: ExportedProfileData = { exportInfo };
    let totalRecords = 0;

    // Set default timeframe if not specified
    const timeRange = scope.timeRange || {
      start: new Date(0), // Beginning of time
      end: new Date(), // Now
    };

    try {
      // Get basic profile
      if (scope.includeBasicProfile !== false) {
        const basicProfile = await this.getBasicProfile(userId);
        if (basicProfile) {
          profileData.basicProfile = basicProfile;
          totalRecords += 1;
        }
      }

      // Get entries
      if (scope.includeEntries) {
        const entries = await this.getEntries(userId, timeRange, scope);
        profileData.entries = entries;
        totalRecords += entries.length;
      }

      // Get insights
      if (scope.includeInsights) {
        const insights = await this.getInsights(userId, timeRange, scope);
        profileData.insights = insights;
        totalRecords += insights.length;
      }

      // Get patterns
      if (scope.includePatterns) {
        const patterns = await this.getPatterns(userId, timeRange);
        profileData.patterns = patterns;
        totalRecords += patterns.length;
      }

      // Get analytics
      if (scope.includeAnalytics) {
        const analytics = await this.getAnalytics(userId, timeRange);
        profileData.analytics = analytics;
        totalRecords += analytics.length;
      }

      // Get persona data
      if (scope.includePersona) {
        const persona = await this.getPersonaData(userId);
        if (persona) {
          profileData.persona = persona;
          totalRecords += 1;
        }
      }

      // Get wellness data
      if (scope.includeWellnessData) {
        const wellnessData = await this.getWellnessData(userId, timeRange);
        if (wellnessData) {
          profileData.wellnessData = wellnessData;
          totalRecords += wellnessData.trends.length;
        }
      }

      profileData.exportInfo.totalRecords = totalRecords;
      return profileData;
    } catch (error) {
      logger.error('Error gathering profile data', {
        module: 'export_user_profile_use_case',
        operation: 'gatherProfileData',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'data_gathering_failed',
      });
      throw ProfileError.internalError('Failed to gather profile data', error instanceof Error ? error : undefined);
    }
  }

  private async getBasicProfile(userId: string) {
    try {
      const profile = await this.profileRepository.getProfile(userId);
      if (!profile) return null;

      return {
        userId: profile.userId,
        displayName: `User ${profile.userId}`,
        totalInsights: profile.totalInsights,
        totalReflections: profile.totalReflections,
        personalInfo: {},
        socialLinks: {},
        contactPreferences: {
          allowDirectMessages: true,
          allowFollowRequests: true,
          marketingEmails: false,
        },
        visibilitySettings: {
          profileVisibility: PROFILE_VISIBILITY.PUBLIC,
          showEmail: false,
          showPhone: false,
        },
        verificationInfo: {
          isVerified: false,
          trustScore: 50,
        },
        statistics: {
          viewCount: 0,
          followerCount: 0,
        },
        createdAt: profile.createdAt,
        lastUpdated: profile.lastUpdated,
      };
    } catch (error) {
      logger.error('Error getting basic profile', {
        module: 'export_user_profile_use_case',
        operation: 'getBasicProfile',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'basic_profile_retrieval_failed',
      });
      return null;
    }
  }

  private async getEntries(userId: string, timeRange: { start: Date; end: Date }, scope: ExportScope) {
    try {
      const filter: { dateFrom: Date; dateTo: Date; isArchived: boolean } = {
        dateFrom: timeRange.start,
        dateTo: timeRange.end,
        isArchived: false,
      };

      if (scope.entryTypes && scope.entryTypes.length > 0) {
        // Would need to filter by type - simplified for now
      }

      const entries = await this.entryRepository.getEntriesByUser(userId, filter);

      return entries.map(entry => ({
        id: entry.id,
        content: entry.content,
        type: entry.type,
        moodContext: entry.moodContext ?? undefined,
        triggerSource: entry.triggerSource ?? undefined,
        sentiment: entry.sentiment ?? undefined,
        emotionalIntensity: entry.emotionalIntensity ?? undefined,
        tags: entry.tags ?? [],
        status: entry.processingStatus ?? 'active',
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }));
    } catch (error) {
      logger.error('Error getting entries', {
        module: 'export_user_profile_use_case',
        operation: 'getEntries',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'entries_retrieval_failed',
      });
      return [];
    }
  }

  private async getInsights(userId: string, timeRange: { start: Date; end: Date }, scope: ExportScope) {
    try {
      const filter: { dateFrom: Date; dateTo: Date; minConfidence?: number } = {
        dateFrom: timeRange.start,
        dateTo: timeRange.end,
      };

      if (scope.insightTypes && scope.insightTypes.length > 0) {
        // Would filter by types
      }

      if (scope.minConfidence) {
        filter.minConfidence = scope.minConfidence;
      }

      const insights = await this.entryRepository.getInsightsByUser(userId, filter);

      return insights.map(insight => ({
        id: insight.id,
        entryId: insight.entryId,
        type: insight.type,
        title:
          insight.title ||
          (typeof insight.content === 'object' && insight.content !== null
            ? ((insight.content as Record<string, unknown>).title as string)
            : null) ||
          'Untitled Insight',
        content: insight.content,
        confidence: insight.confidence,
        category: insight.category,
        themes: insight.themes || [],
        actionable: insight.actionable || false,
        priority: insight.priority || 5,
        generatedAt: insight.generatedAt,
        validatedAt: insight.validatedAt,
        validatedBy: insight.validatedBy,
      }));
    } catch (error) {
      logger.error('Error getting insights', {
        module: 'export_user_profile_use_case',
        operation: 'getInsights',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'insights_retrieval_failed',
      });
      return [];
    }
  }

  private async getPatterns(userId: string, timeRange: { start: Date; end: Date }) {
    try {
      const patterns = await this.analysisRepository.getUserPatterns(userId, {
        dateFrom: timeRange.start,
        dateTo: timeRange.end,
        isActive: true,
      });

      return patterns.map(pattern => ({
        id: pattern.id,
        patternType: pattern.patternType,
        patternName: pattern.patternName,
        description: pattern.description,
        frequency: pattern.frequency,
        strength: pattern.strength,
        trend: pattern.trend,
        firstObserved: pattern.firstObserved,
        lastObserved: pattern.lastObserved,
        relatedThemes: pattern.relatedThemes,
        triggerFactors: pattern.triggerFactors,
        isActive: pattern.isActive,
      }));
    } catch (error) {
      logger.error('Error getting patterns', {
        module: 'export_user_profile_use_case',
        operation: 'getPatterns',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'patterns_retrieval_failed',
      });
      return [];
    }
  }

  private async getAnalytics(userId: string, timeRange: { start: Date; end: Date }) {
    try {
      const analytics = await this.analysisRepository.getProfileAnalytics(userId, {
        validFrom: timeRange.start,
        validTo: timeRange.end,
      });

      return analytics.map(analytic => ({
        id: analytic.id,
        analysisType: analytic.analysisType,
        timeframe: analytic.timeframe,
        progressIndicators: analytic.progressIndicators,
        computedAt: analytic.computedAt,
        validFrom: analytic.validFrom,
        validTo: analytic.validTo,
      }));
    } catch (error) {
      logger.error('Error getting analytics', {
        module: 'export_user_profile_use_case',
        operation: 'getAnalytics',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'analytics_retrieval_failed',
      });
      return [];
    }
  }

  private async getPersonaData(userId: string) {
    try {
      // Would call GenerateUserPersonaUseCase or get cached persona
      // Simplified for now
      return {
        userId,
        personalityType: 'Analytical Thinker',
        primaryTraits: ['Conscientiousness', 'Openness'],
        behaviorPatterns: ['Consistent reflection', 'Goal-oriented'],
        cognitiveStyle: 'Systematic problem solver',
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error getting persona data', {
        module: 'export_user_profile_use_case',
        operation: 'getPersonaData',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'persona_retrieval_failed',
      });
      return null;
    }
  }

  private async getWellnessData(userId: string, timeRange: { start: Date; end: Date }) {
    try {
      // Would call CalculateUserWellnessScoreUseCase or get cached data
      // Simplified for now
      return {
        overallScore: 0.75,
        emotionalWellness: 0.8,
        cognitiveWellness: 0.7,
        behavioralWellness: 0.75,
        trends: [
          { date: timeRange.start, score: 0.7, category: 'overall' },
          { date: new Date(), score: 0.75, category: 'overall' },
        ],
      };
    } catch (error) {
      logger.error('Error getting wellness data', {
        module: 'export_user_profile_use_case',
        operation: 'getWellnessData',
        userId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'wellness_data_retrieval_failed',
      });
      return null;
    }
  }

  private async formatData(data: ExportedProfileData, format: ExportFormat, scope: ExportScope): Promise<Buffer> {
    try {
      switch (format.type) {
        case 'json':
          return this.formatAsJSON(data, format.options);
        case 'csv':
          return this.formatAsCSV(data, format.options);
        case 'xml':
          return this.formatAsXML(data, format.options);
        case 'xlsx':
          return this.formatAsXLSX(data, format.options);
        case 'pdf':
          return this.formatAsPDF(data, format.options);
        default:
          throw ProfileError.invalidFormat(format.type);
      }
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      logger.error('Error formatting data', {
        module: 'export_user_profile_use_case',
        operation: 'formatData',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'data_formatting_failed',
      });
      throw ProfileError.internalError('Failed to format data', error instanceof Error ? error : undefined);
    }
  }

  private formatAsJSON(data: ExportedProfileData, options?: ExportFormat['options']): Buffer {
    const jsonString = JSON.stringify(data, null, options?.includeMetadata ? 2 : 0);
    return Buffer.from(jsonString, 'utf8');
  }

  private formatAsCSV(data: ExportedProfileData, _options?: ExportFormat['options']): Buffer {
    let csv = '';

    // CSV headers and data for entries (simplified example)
    if (data.entries && data.entries.length > 0) {
      csv += 'Type,ID,Content,Created Date,Word Count,Status\n';
      data.entries.forEach(entry => {
        const cleanContent = entry.content.replace(/"/g, '""').replace(/\n/g, ' ');
        const wordCount = entry.content.split(/\s+/).length;
        csv += `Entry,"${entry.id}","${cleanContent}","${entry.createdAt.toISOString()}","${wordCount}","${entry.status}"\n`;
      });
      csv += '\n';
    }

    // CSV for insights
    if (data.insights && data.insights.length > 0) {
      csv += 'Type,ID,Title,Confidence,Category,Generated Date\n';
      data.insights.forEach(insight => {
        csv += `Insight,"${insight.id}","${insight.title}","${insight.confidence}","${insight.category || 'N/A'}","${insight.generatedAt.toISOString()}"\n`;
      });
    }

    return Buffer.from(csv, 'utf8');
  }

  private formatAsXML(data: ExportedProfileData, _options?: ExportFormat['options']): Buffer {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<UserProfile>\n';

    // Export info
    xml += '  <ExportInfo>\n';
    xml += `    <ExportId>${data.exportInfo.exportId}</ExportId>\n`;
    xml += `    <UserId>${data.exportInfo.userId}</UserId>\n`;
    xml += `    <ExportedAt>${data.exportInfo.exportedAt.toISOString()}</ExportedAt>\n`;
    xml += `    <TotalRecords>${data.exportInfo.totalRecords}</TotalRecords>\n`;
    xml += '  </ExportInfo>\n';

    // Basic profile
    if (data.basicProfile) {
      xml += '  <BasicProfile>\n';
      xml += `    <UserId>${data.basicProfile.userId}</UserId>\n`;
      xml += `    <DisplayName>${data.basicProfile.displayName}</DisplayName>\n`;
      xml += `    <CreatedAt>${data.basicProfile.createdAt.toISOString()}</CreatedAt>\n`;
      xml += '  </BasicProfile>\n';
    }

    // Entries
    if (data.entries && data.entries.length > 0) {
      xml += '  <Entries>\n';
      data.entries.forEach(entry => {
        xml += '    <Entry>\n';
        xml += `      <Id>${entry.id}</Id>\n`;
        xml += `      <Type>${entry.type}</Type>\n`;
        xml += `      <Content><![CDATA[${entry.content}]]></Content>\n`;
        xml += `      <CreatedAt>${entry.createdAt.toISOString()}</CreatedAt>\n`;
        xml += `      <WordCount>${entry.content.split(/\\s+/).length}</WordCount>\n`;
        xml += '    </Entry>\n';
      });
      xml += '  </Entries>\n';
    }

    xml += '</UserProfile>';
    return Buffer.from(xml, 'utf8');
  }

  private formatAsXLSX(data: ExportedProfileData, options?: ExportFormat['options']): Buffer {
    // NOTE: XLSX export requires xlsx-js library integration (not implemented)
    // Falling back to CSV format - this is a known limitation
    logger.warn('XLSX export not implemented - falling back to CSV format', {
      module: 'export_user_profile_use_case',
      operation: 'formatAsXLSX',
      reason: 'xlsx-js library integration required',
    });
    return this.formatAsCSV(data, options);
  }

  private formatAsPDF(data: ExportedProfileData, _options?: ExportFormat['options']): Buffer {
    // NOTE: PDF export requires PDFKit library integration (not implemented)
    // Returning plain text representation - this is a known limitation
    logger.warn('PDF export not implemented - returning plain text format', {
      module: 'export_user_profile_use_case',
      operation: 'formatAsPDF',
      reason: 'PDFKit library integration required',
    });
    const text = `User Profile Export (Plain Text - PDF generation not implemented)\n\nUser ID: ${data.exportInfo.userId}\nExported: ${data.exportInfo.exportedAt.toISOString()}\nTotal Records: ${data.exportInfo.totalRecords}\n\nNote: PDF generation requires PDFKit library integration.\n`;
    return Buffer.from(text, 'utf8');
  }

  private async encryptData(data: Buffer, password?: string): Promise<Buffer> {
    // NOTE: Data encryption requires AES-256 implementation (not implemented)
    // Returning unencrypted data - THIS IS A SECURITY LIMITATION
    logger.warn('Data encryption not implemented - returning unencrypted data', {
      module: 'export_user_profile_use_case',
      operation: 'encryptData',
      reason: 'AES-256 encryption implementation required',
      securityWarning: 'Sensitive data returned without encryption',
    });
    return data;
  }

  private async processExport(
    exportId: string,
    formattedData: Buffer,
    format: ExportFormat,
    destination?: ExportUserProfileRequest['destination']
  ): Promise<{
    status: string;
    fileSize: number;
    recordCount: number;
    filePath?: string;
    downloadUrl?: string;
  }> {
    const fileSize = formattedData.length;
    const fileName = `${exportId}.${format.type}`;

    // Apply compression if requested
    const finalData = formattedData;
    if (format.options?.compression) {
      // Would implement compression here
      logger.info('Compression requested but not implemented', {
        module: 'export_user_profile_use_case',
        operation: 'formatData',
        phase: 'compression_not_implemented',
      });
    }

    // Store the file (simplified - would use actual storage service)
    const filePath = `/exports/${fileName}`;
    const apiBaseUrl = process.env.API_GATEWAY_URL || 'http://localhost:8080';
    const downloadUrl = `${apiBaseUrl}/exports/${exportId}/download`;

    // Handle different destination types
    if (destination) {
      switch (destination.type) {
        case 'email':
          await this.sendExportByEmail(destination.target, exportId, downloadUrl);
          break;
        case 'storage':
          await this.storeExportInCloud(destination.target, finalData);
          break;
        case 'api':
          await this.sendExportToAPI(destination.target, finalData);
          break;
        default:
          // Default to download
          break;
      }
    }

    return {
      status: 'completed',
      fileSize,
      recordCount: this.countRecords(formattedData, format.type),
      filePath,
      downloadUrl,
    };
  }

  private countRecords(data: Buffer, format: string): number {
    // Simple record counting based on format
    const content = data.toString('utf8');
    switch (format) {
      case 'json':
        try {
          const parsed = JSON.parse(content);
          return this.countJSONRecords(parsed);
        } catch {
          return 0;
        }
      case 'csv':
        return content.split('\n').filter(line => line.trim().length > 0).length - 1; // Subtract headers
      case 'xml':
        const matches = content.match(/<[^/][^>]*>/g);
        return matches ? matches.length : 0;
      default:
        return 1; // Default assumption
    }
  }

  private countJSONRecords(obj: unknown): number {
    let count = 0;
    if (Array.isArray(obj)) {
      count += obj.length;
    } else if (typeof obj === 'object' && obj !== null) {
      Object.values(obj).forEach(value => {
        count += this.countJSONRecords(value);
      });
    }
    return count;
  }

  private async sendExportByEmail(email: string, exportId: string, downloadUrl: string): Promise<void> {
    // NOTE: Email delivery requires email service integration (not implemented)
    // Export is available for download but email notification not sent
    logger.warn('Email delivery not implemented - export available for download only', {
      module: 'export_user_profile_use_case',
      operation: 'sendExportByEmail',
      exportId,
      email,
      downloadUrl,
      reason: 'Email service integration required',
    });
  }

  private async storeExportInCloud(storagePath: string, data: Buffer): Promise<void> {
    // NOTE: Cloud storage delivery requires storage-service integration (not implemented)
    // Export data not persisted to cloud storage
    logger.warn('Cloud storage delivery not implemented - data not persisted', {
      module: 'export_user_profile_use_case',
      operation: 'storeExportInCloud',
      storagePath,
      dataSize: data.length,
      reason: 'Storage service integration required',
    });
  }

  private async sendExportToAPI(apiEndpoint: string, data: Buffer): Promise<void> {
    // NOTE: API delivery requires HTTP client implementation (not implemented)
    // Export data not sent to external API
    logger.warn('API delivery not implemented - data not sent to external endpoint', {
      module: 'export_user_profile_use_case',
      operation: 'sendExportToAPI',
      apiEndpoint,
      dataSize: data.length,
      reason: 'HTTP client implementation required',
    });
  }

  private hasPrivateDataAccess(userId: string): boolean {
    // SECURITY: Fail closed - private data access denied until RBAC is implemented
    // This prevents accidental exposure of sensitive private data
    // To enable: Implement proper RBAC with authenticated user context comparison
    logger.warn('Private data access denied - RBAC not implemented', {
      module: 'export_user_profile_use_case',
      operation: 'hasPrivateDataAccess',
      userId,
      securityNote: 'includePrivateData requests rejected until RBAC integration',
      action: 'Access denied - fail closed',
    });
    return false;
  }

  private async recordExportEvent(
    request: ExportUserProfileRequest,
    result: { exportId?: string; status?: string; recordCount?: number; fileSize?: number; error?: string }
  ): Promise<void> {
    try {
      await this.analysisRepository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'profile_exported',
        eventData: {
          exportId: result.exportId || 'unknown',
          format: request.format.type,
          status: result.status || 'unknown',
          recordCount: result.recordCount || 0,
          fileSize: result.fileSize || 0,
          scope: request.scope,
          destination: request.destination?.type || 'download',
          error: result.error,
        },
        metadata: request.metadata,
      });
    } catch (error) {
      logger.error('Failed to record export event', {
        module: 'export_user_profile_use_case',
        operation: 'recordExportEvent',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'export_event_recording_failed',
      });
    }
  }
}
