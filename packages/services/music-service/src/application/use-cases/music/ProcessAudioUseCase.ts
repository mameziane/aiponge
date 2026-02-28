/**
 * ProcessAudioUseCase - Application use case for audio processing workflows
 * Handles various audio processing operations like normalization, mastering, effects, and format conversion
 */

import { AudioProcessingService, AudioProcessingResult } from '@domains/ai-music/services/AudioProcessingService';
import { DrizzleAudioProcessingJobRepository } from '@infrastructure/database/DrizzleAudioProcessingJobRepository';
import type { IAnalyticsServiceClient } from '@domains/music-catalog/ports/IAnalyticsServiceClient';
import { getLogger } from '@config/service-urls';
import { PipelineError } from '../../errors';

const logger = getLogger('music-service-processaudiousecase');

export interface ProcessAudioRequest {
  audioUrl: string;
  processingType: 'normalize' | 'master' | 'effects' | 'convert' | 'enhance';
  outputFormat?: 'mp3' | 'wav' | 'flac' | 'aac' | 'ogg';
  bitrate?: number;
  sampleRate?: number;
  channels?: 1 | 2;
  effects?: Array<{
    type: 'reverb' | 'delay' | 'chorus' | 'compressor' | 'equalizer' | 'limiter' | 'distortion';
    parameters: Record<string, unknown>;
    intensity: number;
  }>;
  userId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
}

export interface ProcessAudioResponse {
  success: boolean;
  jobId?: string;
  estimatedDuration?: number;
  status?: string;
  error?: string;
}

export interface AudioProcessingJob {
  id: string;
  musicResultId: string;
  jobType: string;
  userId: string;
  inputUrl: string;
  outputUrl?: string;
  processingType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  parameters: Record<string, unknown>;
  progressPercentage: number;
  processingTimeMs?: number;
  qualityScore?: number;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class ProcessAudioUseCase {
  constructor(
    private readonly audioProcessingService: AudioProcessingService,
    private readonly audioJobRepository: DrizzleAudioProcessingJobRepository,
    private readonly analyticsServiceClient: IAnalyticsServiceClient
    // private readonly storageServiceClient: StorageServiceClient // Unused for now
  ) {}

  async execute(request: ProcessAudioRequest): Promise<ProcessAudioResponse> {
    const startTime = Date.now();

    try {
      logger.info('🎧 Starting audio processing: {}', { data0: request.processingType });

      // 1. Validate request
      this.validateProcessingRequest(request);

      if (!request.audioUrl) {
        throw PipelineError.missingRequiredField('audioUrl');
      }
      const audioUrl = request.audioUrl;

      // 2. Create processing job
      const job = await this.createProcessingJob(request);
      logger.info('📝 Processing job created with ID: {}', { data0: job.id });

      // 3. Save job to database
      const savedJob = await this.audioJobRepository.save(job);

      // 4. Record analytics for processing start
      await this.recordAnalyticsEvent('audio_processing_started', {
        jobId: job.id,
        userId: request.userId,
        processingType: request.processingType,
        priority: request.priority,
        estimatedDuration: this.estimateProcessingDuration(request),
      });

      // 5. Start asynchronous processing workflow
      this.executeProcessingWorkflow(savedJob as AudioProcessingJob).catch(error => {
        logger.error('Processing workflow failed for job ${savedJob.id}:', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return {
        success: true,
        jobId: savedJob.id,
        estimatedDuration: this.estimateProcessingDuration(request),
        status: savedJob.status,
      };
    } catch (error) {
      logger.error('Audio processing failed:', { error: error instanceof Error ? error.message : String(error) });

      // Record failure analytics
      await this.recordAnalyticsEvent('audio_processing_failed', {
        userId: request.userId,
        processingType: request.processingType,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Audio processing failed',
      };
    }
  }

  /**
   * Get processing job status
   */
  async getJobStatus(jobId: string): Promise<{
    success: boolean;
    job?: AudioProcessingJob;
    progress?: { percentage: number; stage: string; estimatedTimeRemaining?: number };
    error?: string;
  }> {
    try {
      const job = await this.audioJobRepository.findById(jobId);
      if (!job) {
        return { success: false, error: 'Processing job not found' };
      }

      const progress = this.calculateProgress(job as AudioProcessingJob);

      return {
        success: true,
        job: job as AudioProcessingJob,
        progress,
      };
    } catch (error) {
      logger.error('Get job status failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job status',
      };
    }
  }

  /**
   * Cancel processing job
   */
  async cancelJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const job = await this.audioJobRepository.findById(jobId);
      if (!job) {
        return { success: false, error: 'Processing job not found' };
      }

      if (job.status === 'completed' || job.status === 'failed') {
        return { success: false, error: `Cannot cancel job in ${job.status} status` };
      }

      // Update job status
      const updatedJob = { ...job, status: 'failed' as const, errorMessage: 'Cancelled by user' };
      await this.audioJobRepository.update(updatedJob);

      // Record cancellation analytics
      await this.recordAnalyticsEvent('audio_processing_cancelled', {
        jobId,
        userId: (job as unknown as { userId?: string }).userId,
        processingType: job.processingType,
        cancelledAt: new Date(),
      });

      return { success: true };
    } catch (error) {
      logger.error('Cancel job failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel job',
      };
    }
  }

  /**
   * Execute the complete audio processing workflow asynchronously
   */
  private async executeProcessingWorkflow(job: AudioProcessingJob): Promise<void> {
    const workflowStartTime = Date.now();

    try {
      logger.info('Starting processing workflow for job: {}', { data0: job.id });

      // Update job status to processing
      const updatedJob = {
        ...job,
        status: 'processing' as const,
        startedAt: new Date(),
        progressPercentage: 10,
      };
      await this.audioJobRepository.update(updatedJob);

      // Process audio based on type
      let processingResult: AudioProcessingResult;

      switch (job.processingType) {
        case 'normalize':
          processingResult = await this.audioProcessingService.normalizeAudio(
            job.inputUrl,
            (job.parameters.targetLevel as number) || -14
          );
          break;

        case 'master':
          processingResult = await this.audioProcessingService.masterAudio(
            job.inputUrl,
            (job.parameters.masteringStyle as 'gentle' | 'standard' | 'aggressive') || 'standard'
          );
          break;

        case 'enhance':
          processingResult = await this.audioProcessingService.enhanceAudio(
            job.inputUrl,
            (job.parameters.enhancementLevel as 'light' | 'moderate' | 'aggressive') || 'moderate'
          );
          break;

        case 'convert':
          processingResult = await this.audioProcessingService.convertFormat(
            job.inputUrl,
            job.parameters.outputFormat as 'mp3' | 'wav' | 'flac' | 'aac' | 'ogg' | undefined,
            job.parameters as Partial<
              import('@domains/ai-music/services/AudioProcessingService').AudioProcessingOptions
            >
          );
          break;

        case 'effects':
          processingResult = await this.audioProcessingService.processAudio(job.inputUrl, {
            effects: job.parameters.effects as
              | import('@domains/ai-music/services/AudioProcessingService').AudioEffect[]
              | undefined,
            outputFormat: job.parameters.outputFormat as 'mp3' | 'wav' | 'flac' | 'aac' | 'ogg' | undefined,
            bitrate: job.parameters.bitrate as number | undefined,
            sampleRate: job.parameters.sampleRate as number | undefined,
            channels: job.parameters.channels as 1 | 2 | undefined,
          });
          break;

        default:
          throw PipelineError.validationFailed('processingType', `Unsupported type: ${job.processingType}`);
      }

      if (!processingResult.success) {
        throw PipelineError.generationFailed(processingResult.error || 'Audio processing failed');
      }

      // Update job with results
      const completedJob = {
        ...updatedJob,
        status: 'completed' as const,
        outputUrl: processingResult.outputUrl,
        progressPercentage: 100,
        processingTimeMs: processingResult.processingTimeMs,
        qualityScore: processingResult.qualityScore,
        completedAt: new Date(),
        metadata: {
          ...job.metadata,
          appliedEffects: processingResult.appliedEffects,
          processingMetadata: processingResult.metadata,
        },
      };

      await this.audioJobRepository.update(completedJob);

      // Record successful completion analytics
      const totalProcessingTime = Date.now() - workflowStartTime;
      await this.recordAnalyticsEvent('audio_processing_completed', {
        jobId: job.id,
        userId: job.userId,
        processingType: job.processingType,
        success: true,
        processingTime: totalProcessingTime,
        qualityScore: processingResult.qualityScore,
        outputFormat: processingResult.outputFormat,
        fileSize: processingResult.fileSize,
      });

      logger.info('Processing workflow completed for job: {}', { data0: job.id });
    } catch (error) {
      logger.error('Processing workflow failed for job ${job.id}:', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Update job status to failed
      const failedJob = {
        ...job,
        status: 'failed' as const,
        errorMessage: error instanceof Error ? error.message : 'Processing workflow failed',
        progressPercentage: 0,
        completedAt: new Date(),
        retryCount: job.retryCount + 1,
      };

      await this.audioJobRepository.update(failedJob);

      // Record failure analytics
      const totalProcessingTime = Date.now() - workflowStartTime;
      await this.recordAnalyticsEvent('audio_processing_workflow_failed', {
        jobId: job.id,
        userId: job.userId,
        processingType: job.processingType,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: totalProcessingTime,
        retryCount: failedJob.retryCount,
      });

      // Auto-retry if within retry limits
      if (failedJob.retryCount < failedJob.maxRetries) {
        logger.info('Auto-retrying job {} (attempt {}/{})', {
          data0: job.id,
          data1: failedJob.retryCount + 1,
          data2: failedJob.maxRetries,
        });
        setTimeout(() => {
          this.executeProcessingWorkflow(failedJob).catch(retryError => {
            logger.error('Retry failed for job ${job.id}:', {
              error: retryError instanceof Error ? retryError.message : String(retryError),
            });
          });
        }, this.calculateRetryDelay(failedJob.retryCount));
      }
    }
  }

  // Helper methods
  private validateProcessingRequest(request: ProcessAudioRequest): void {
    if (!request.audioUrl || typeof request.audioUrl !== 'string') {
      throw PipelineError.validationFailed('audioUrl', 'is required and must be a string');
    }

    if (!request.processingType) {
      throw PipelineError.missingRequiredField('processingType');
    }

    const validProcessingTypes = ['normalize', 'master', 'effects', 'convert', 'enhance'];
    if (!validProcessingTypes.includes(request.processingType)) {
      throw PipelineError.validationFailed('processingType', `Must be one of: ${validProcessingTypes.join(', ')}`);
    }

    if (request.effects && !Array.isArray(request.effects)) {
      throw PipelineError.validationFailed('effects', 'must be an array');
    }

    if (request.bitrate && (request.bitrate < 64 || request.bitrate > 1024)) {
      throw PipelineError.validationFailed('bitrate', 'must be between 64 and 1024 kbps');
    }

    if (request.sampleRate && ![22050, 44100, 48000, 96000].includes(request.sampleRate)) {
      throw PipelineError.validationFailed('sampleRate', 'must be one of: 22050, 44100, 48000, 96000');
    }

    if (request.channels && ![1, 2].includes(request.channels)) {
      throw PipelineError.validationFailed('channels', 'must be 1 (mono) or 2 (stereo)');
    }
  }

  private async createProcessingJob(request: ProcessAudioRequest): Promise<AudioProcessingJob> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const audioUrl = request.audioUrl;

    return {
      id: jobId,
      musicResultId: jobId, // Use same ID for music result association
      jobType: 'audio-processing',
      userId: request.userId || 'anonymous',
      inputUrl: audioUrl,
      processingType: request.processingType,
      status: 'pending',
      priority: request.priority || 'normal',
      parameters: {
        processingType: request.processingType,
        outputFormat: request.outputFormat,
        bitrate: request.bitrate,
        sampleRate: request.sampleRate,
        channels: request.channels,
        effects: request.effects,
        ...request.metadata,
      },
      progressPercentage: 0,
      retryCount: 0,
      maxRetries: request.priority === 'urgent' ? 3 : 2,
      metadata: {
        originalRequest: request,
        createdBy: 'ProcessAudioUseCase',
        ...request.metadata,
      },
      createdAt: new Date(),
    };
  }

  private estimateProcessingDuration(request: ProcessAudioRequest): number {
    let baseDuration = 15; // 15 seconds base

    // Processing type multipliers
    const typeMultipliers = {
      normalize: 0.5,
      master: 1.5,
      enhance: 2.0,
      convert: 0.8,
      effects: 1.2,
    };

    baseDuration *= typeMultipliers[request.processingType] || 1.0;

    // Effects complexity multiplier
    if (request.effects && request.effects.length > 0) {
      baseDuration *= 1 + request.effects.length * 0.3;
    }

    // Priority multiplier (higher priority = faster processing)
    if (request.priority === 'high' || request.priority === 'urgent') {
      baseDuration *= 0.8;
    }

    return Math.round(baseDuration);
  }

  private calculateProgress(job: AudioProcessingJob): {
    percentage: number;
    stage: string;
    estimatedTimeRemaining?: number;
  } {
    const stageMap = {
      pending: { percentage: 0, stage: 'Queued for processing' },
      processing: { percentage: job.progressPercentage || 50, stage: 'Processing audio' },
      completed: { percentage: 100, stage: 'Completed' },
      failed: { percentage: 0, stage: 'Failed' },
      cancelled: { percentage: 0, stage: 'Cancelled' },
    };

    const progress = stageMap[job.status] || { percentage: 0, stage: 'Unknown' };

    // Add estimated time remaining for processing jobs
    if (job.status === 'processing' && job.startedAt) {
      const elapsedTime = Date.now() - job.startedAt.getTime();
      const estimatedTotal =
        this.estimateProcessingDuration({
          processingType: job.processingType as ProcessAudioRequest['processingType'],
          audioUrl: job.inputUrl,
          ...job.parameters,
        }) * 1000; // Convert to milliseconds
      const estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsedTime);

      return {
        ...progress,
        estimatedTimeRemaining: Math.round(estimatedTimeRemaining / 1000), // Convert back to seconds
      };
    }

    return progress;
  }

  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff: 2^retryCount seconds, max 60 seconds
    return Math.min(Math.pow(2, retryCount) * 1000, 60000);
  }

  private async recordAnalyticsEvent(eventType: string, eventData: Record<string, unknown>): Promise<void> {
    try {
      await this.analyticsServiceClient.recordEvent({
        eventType,
        eventData,
        timestamp: new Date(),
        metadata: { service: 'music-service', component: 'audio-processing' },
      });
    } catch (error) {
      logger.warn('Failed to record analytics event:', { data: error });
      // Don't throw - analytics failures shouldn't break the workflow
    }
  }
}
