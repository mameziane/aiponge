/**
 * AudioProcessingController - HTTP controller for audio processing operations
 * Handles RESTful endpoints for audio processing, enhancement, and format conversion
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { DrizzleAudioProcessingJobRepository } from '../../infrastructure/database/DrizzleAudioProcessingJobRepository';
import { getLogger } from '../../config/service-urls';
import { serializeError, createControllerHelpers, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors, sendSuccess } = getResponseHelpers();
import {
  ProcessAudioUseCase,
  ProcessAudioRequest,
  ProcessAudioResponse,
} from '../../application/use-cases/music/ProcessAudioUseCase';

// Request validation schemas

const logger = getLogger('music-service-audioprocessingcontroller');

const { handleRequest } = createControllerHelpers('music-service', (res, error, msg, req) =>
  ServiceErrors.fromException(res, error, msg, req)
);

const processAudioSchema = z.object({
  inputUrl: z.string().url(),
  processingType: z.enum(['normalize', 'master', 'effects', 'convert', 'enhance']),
  outputFormat: z.enum(['mp3', 'wav', 'flac', 'aac', 'ogg']).optional(),
  bitrate: z.number().min(64).max(320).optional(),
  sampleRate: z.number().min(8000).max(192000).optional(),
  channels: z.union([z.literal(1), z.literal(2)]).optional(),
  effects: z
    .array(
      z.object({
        type: z.enum(['reverb', 'delay', 'chorus', 'compressor', 'equalizer', 'limiter', 'distortion']),
        parameters: z.record(z.unknown()),
        intensity: z.number().min(0).max(1),
      })
    )
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

const batchProcessSchema = z.object({
  jobs: z.array(processAudioSchema).min(1).max(10),
  batchName: z.string().optional(),
});

export class AudioProcessingController {
  constructor(
    private readonly processAudioUseCase: ProcessAudioUseCase,
    private readonly audioJobRepository: DrizzleAudioProcessingJobRepository
  ) {}

  /**
   * Process audio file
   * POST /api/music/audio/process
   */
  async processAudio(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = processAudioSchema.parse(req.body);

      logger.info('Processing audio: {}', { data0: validatedData.processingType });

      const result = await this.processAudioUseCase.execute({
        ...validatedData,
        audioUrl: validatedData.inputUrl,
      });

      if (result.success) {
        sendSuccess(
          res,
          {
            jobId: result.jobId,
            processingType: validatedData.processingType,
            estimatedDuration: result.estimatedDuration,
            status: result.status,
            priority: validatedData.priority || 'normal',
          },
          202
        );
      } else {
        ServiceErrors.internal(res, result.error || 'Audio processing failed', undefined, req);
      }
    } catch (error) {
      logger.error('Process audio error:', { error: serializeError(error) });

      if (error instanceof z.ZodError) {
        ServiceErrors.badRequest(res, 'Invalid request data', req, {
          fields: error.errors,
        });
      } else {
        logger.error('Process audio error', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Internal server error', req);
        return;
      }
    }
  }

  /**
   * Get audio processing job status
   * GET /api/music/audio/jobs/:id
   */
  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };

      if (!id) {
        ServiceErrors.badRequest(res, 'Job ID is required', req);
        return;
      }

      const job = await this.audioJobRepository.findById(id);
      if (!job) {
        ServiceErrors.notFound(res, 'Audio processing job', req);
        return;
      }

      sendSuccess(res, {
        id: job.id,
        jobType: job.jobType,
        processingType: job.processingType,
        status: job.status,
        priority: job.priority,
        inputUrl: job.inputUrl,
        outputUrl: job.outputUrl,
        inputFormat: job.inputFormat,
        outputFormat: job.outputFormat,
        progressPercentage: job.progressPercentage,
        processingTimeMs: job.processingTimeMs,
        qualityScore: job.qualityScore,
        errorMessage: job.errorMessage,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      });
    } catch (error) {
      logger.error('Get job status error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Internal server error', req);
      return;
    }
  }

  /**
   * Get processing jobs by status
   * GET /api/music/audio/jobs
   */
  async getJobs(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get processing jobs',
      handler: async () => {
        const querySchema = z.object({
          status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
          jobType: z.string().optional(),
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
        });

        const { status, jobType, limit, offset } = querySchema.parse(req.query);

        logger.info('Getting processing jobs');

        let jobs;
        if (status) {
          jobs = await this.audioJobRepository.findByStatus(status, {
            ...(limit && { limit }),
            ...(offset && { offset }),
          });
        } else {
          jobs = await this.audioJobRepository.findByStatus('pending', {
            ...(limit && { limit }),
            ...(offset && { offset }),
          });
        }

        return {
          jobs: jobs.map(job => ({
            id: job.id,
            jobType: job.jobType,
            processingType: job.processingType,
            status: job.status,
            priority: job.priority,
            progressPercentage: job.progressPercentage,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
          })),
          filters: { status, jobType },
          pagination: { limit, offset, total: jobs.length },
        };
      },
    });
  }

  /**
   * Cancel processing job
   * POST /api/music/audio/jobs/:id/cancel
   */
  async cancelJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };

      if (!id) {
        ServiceErrors.badRequest(res, 'Job ID is required', req);
        return;
      }

      const job = await this.audioJobRepository.findById(id);
      if (!job) {
        ServiceErrors.notFound(res, 'Audio processing job', req);
        return;
      }

      if (job.status === 'completed' || job.status === 'failed') {
        ServiceErrors.badRequest(res, `Cannot cancel job in ${job.status} status`, req);
        return;
      }

      // Update job status (implementation depends on domain entity)
      job.status = 'cancelled';
      await this.audioJobRepository.update(job);

      sendSuccess(res, {
        jobId: job.id,
        status: job.status,
        cancelledAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Cancel job error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Internal server error', req);
      return;
    }
  }

  /**
   * Batch process multiple audio files
   * POST /api/music/audio/batch-process
   */
  async batchProcess(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = batchProcessSchema.parse(req.body);

      logger.info('Batch processing {} audio files', { data0: validatedData.jobs.length });

      const results = [];
      for (const jobData of validatedData.jobs) {
        try {
          const result = await this.processAudioUseCase.execute({
            ...jobData,
            audioUrl: jobData.inputUrl,
          });
          results.push({
            inputUrl: jobData.inputUrl,
            processingType: jobData.processingType,
            success: result.success,
            jobId: result.jobId,
            error: result.error,
          });
        } catch (error) {
          results.push({
            inputUrl: jobData.inputUrl,
            processingType: jobData.processingType,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      if (successCount > 0) {
        sendSuccess(
          res,
          {
            batchName: validatedData.batchName,
            totalJobs: results.length,
            successfulJobs: successCount,
            failedJobs: failCount,
            results,
          },
          202
        );
      } else {
        ServiceErrors.internal(res, `Batch processing failed: ${failCount} jobs failed`, undefined, req);
      }
    } catch (error) {
      logger.error('Batch process error:', { error: serializeError(error) });

      if (error instanceof z.ZodError) {
        ServiceErrors.badRequest(res, 'Invalid batch request data', req, {
          fields: error.errors,
        });
      } else {
        logger.error('Batch process error', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Internal server error', req);
        return;
      }
    }
  }

  /**
   * Get supported audio processing capabilities
   * GET /api/music/audio/capabilities
   */
  async getCapabilities(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get capabilities',
      handler: async () => ({
        supportedProcessingTypes: ['normalize', 'master', 'effects', 'convert', 'enhance'],
        supportedFormats: {
          input: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
          output: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
        },
        supportedEffects: [
          { type: 'reverb', description: 'Add reverberation to audio' },
          { type: 'delay', description: 'Add echo/delay effects' },
          { type: 'chorus', description: 'Add chorus modulation' },
          { type: 'compressor', description: 'Dynamic range compression' },
          { type: 'equalizer', description: 'Frequency equalization' },
          { type: 'limiter', description: 'Peak limiting' },
          { type: 'distortion', description: 'Harmonic distortion' },
        ],
        priorityLevels: ['low', 'normal', 'high', 'urgent'],
        limits: {
          maxFileSize: 100 * 1024 * 1024,
          maxDuration: 600,
          maxBatchSize: 10,
          supportedBitrates: [64, 128, 192, 256, 320],
          supportedSampleRates: [8000, 16000, 22050, 44100, 48000, 96000, 192000],
        },
      }),
    });
  }
}
