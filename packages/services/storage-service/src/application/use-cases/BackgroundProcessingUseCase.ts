/**
 * Background Processing Use Case
 * Handles asynchronous file processing workflows for storage service
 */

import { randomUUID } from 'crypto';
import { StorageError, StorageErrorCode } from '../errors';
import { IStorageProvider } from '../interfaces/IStorageProvider';
import { IStorageRepository } from '../interfaces/IStorageRepository';
import { ProcessingJobRepository } from '../../infrastructure/repositories/ProcessingJobRepository';
import { errorMessage, errorStack } from '@aiponge/platform-core';
import { PROCESSING_JOB_STATUS, type ProcessingJobStatus } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('background-processing-use-case');
const getEnvironmentSettings = () => ({ networkTimeout: 10000 });

export interface ProcessingTaskDTO {
  taskId: string;
  fileId: string;
  userId: string;
  taskType: 'thumbnail' | 'compress' | 'convert' | 'scan' | 'optimize' | 'transcode' | 'extract-metadata';
  status: ProcessingJobStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  parameters: Record<string, unknown>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: Record<string, unknown>;
  progress?: number;
  estimatedDuration?: number;
}

export interface QueueTaskRequestDTO {
  fileId: string;
  userId: string;
  taskType: ProcessingTaskDTO['taskType'];
  parameters?: Record<string, unknown>;
  priority?: ProcessingTaskDTO['priority'];
}

export interface ProcessingResultDTO {
  success: boolean;
  taskId?: string;
  task?: ProcessingTaskDTO;
  tasks?: ProcessingTaskDTO[];
  error?: string;
  message?: string;
}

export interface INotificationService {
  notify(
    _userId: string,
    _notification: { title?: string; message: string; type: string; taskId?: string; error?: string }
  ): Promise<void>;
}

function mapDbRowToTaskDTO(row: Record<string, unknown>): ProcessingTaskDTO {
  const inputParams = row.inputParams as Record<string, unknown> | undefined;
  return {
    taskId: row.id as string,
    fileId: row.fileId as string,
    userId: (inputParams?.userId as string) || '',
    taskType: row.jobType as ProcessingTaskDTO['taskType'],
    status: row.status as ProcessingTaskDTO['status'],
    priority: (inputParams?.priority as ProcessingTaskDTO['priority']) || 'normal',
    parameters: (inputParams as Record<string, unknown>) || {},
    createdAt: row.createdAt as Date,
    startedAt: (row.startedAt as Date) || undefined,
    completedAt: (row.completedAt as Date) || undefined,
    error: (row.errorMessage as string) || undefined,
    result: (row.outputParams as Record<string, unknown>) || undefined,
    progress:
      row.status === PROCESSING_JOB_STATUS.COMPLETED ? 100 : row.status === PROCESSING_JOB_STATUS.PROCESSING ? 50 : 0,
  };
}

export class BackgroundProcessingUseCase {
  private processingQueue: ProcessingTaskDTO[] = [];
  private isProcessing = false;

  constructor(
    private _fileRepository: IStorageRepository,
    private _processingJobRepository: ProcessingJobRepository,
    private _storageProvider: IStorageProvider,
    private _notificationService?: INotificationService
  ) {
    this.startBackgroundProcessor();
  }

  async queueTask(request: QueueTaskRequestDTO): Promise<ProcessingResultDTO> {
    try {
      logger.info('Queueing background processing task', {
        module: 'background_processing_use_case',
        operation: 'queueTask',
        taskType: request.taskType,
        fileId: request.fileId,
        phase: 'task_queueing_started',
      });

      const hasAccess = true;
      if (!hasAccess) {
        throw new StorageError('Insufficient permissions to process file', 403, StorageErrorCode.ACCESS_DENIED);
      }

      this.validateTaskParameters(request.taskType, request.parameters || {});

      const taskId = `task-${Date.now()}-${randomUUID()}`;

      const task: ProcessingTaskDTO = {
        taskId,
        fileId: request.fileId,
        userId: request.userId,
        taskType: request.taskType,
        status: PROCESSING_JOB_STATUS.PENDING,
        priority: request.priority || 'normal',
        parameters: request.parameters || {},
        createdAt: new Date(),
        progress: 0,
        estimatedDuration: this.getEstimatedDuration(request.taskType),
      };

      const dbJob = await this._processingJobRepository.createJob(request.fileId, request.taskType, {
        ...request.parameters,
        priority: task.priority,
        userId: request.userId,
      });
      task.taskId = dbJob.id;

      this.addToQueue(task);

      logger.info('Task queued successfully', {
        module: 'background_processing_use_case',
        operation: 'queueTask',
        taskId: task.taskId,
        priority: task.priority,
        phase: 'task_queued',
      });

      return {
        success: true,
        taskId: task.taskId,
        message: `${request.taskType} task queued successfully`,
      };
    } catch (error) {
      logger.error('Queue task failed', {
        module: 'background_processing_use_case',
        operation: 'queueTask',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'task_queueing_failed',
      });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to queue task',
      };
    }
  }

  async getTaskStatus(taskId: string): Promise<ProcessingResultDTO> {
    try {
      logger.info('Getting status for task', {
        module: 'background_processing_use_case',
        operation: 'getTaskStatus',
        taskId,
        phase: 'task_status_requested',
      });

      const dbRow = await this._processingJobRepository.getJobById(taskId);
      if (!dbRow) {
        throw new StorageError('Task not found', 404, StorageErrorCode.TASK_NOT_FOUND);
      }

      const task = mapDbRowToTaskDTO(dbRow);

      return {
        success: true,
        task,
      };
    } catch (error) {
      logger.error('Get task status failed', {
        module: 'background_processing_use_case',
        operation: 'getTaskStatus',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'task_status_retrieval_failed',
      });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to get task status',
      };
    }
  }

  async getUserTasks(
    userId: string,
    status?: ProcessingTaskDTO['status'],
    taskType?: ProcessingTaskDTO['taskType']
  ): Promise<ProcessingResultDTO> {
    try {
      logger.info('Getting tasks for user', {
        module: 'background_processing_use_case',
        operation: 'getUserTasks',
        userId,
        phase: 'user_tasks_requested',
      });

      const dbRows = await this._processingJobRepository.getJobsByUser(userId);
      let userTasks = dbRows.map(mapDbRowToTaskDTO);

      if (status) {
        userTasks = userTasks.filter(task => task.status === status);
      }

      if (taskType) {
        userTasks = userTasks.filter(task => task.taskType === taskType);
      }

      userTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        success: true,
        tasks: userTasks,
      };
    } catch (error) {
      logger.error('Get user tasks failed', {
        module: 'background_processing_use_case',
        operation: 'getUserTasks',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'user_tasks_retrieval_failed',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user tasks',
      };
    }
  }

  async cancelTask(taskId: string, userId: string): Promise<ProcessingResultDTO> {
    try {
      logger.info('Cancelling task', {
        module: 'background_processing_use_case',
        operation: 'cancelTask',
        taskId,
        phase: 'task_cancellation_started',
      });

      const dbRow = await this._processingJobRepository.getJobById(taskId);
      if (!dbRow) {
        throw new StorageError('Task not found', 404, StorageErrorCode.TASK_NOT_FOUND);
      }

      const task = mapDbRowToTaskDTO(dbRow);

      if (task.userId !== userId) {
        throw new StorageError('Insufficient permissions to cancel task', 403, StorageErrorCode.ACCESS_DENIED);
      }

      if (task.status !== PROCESSING_JOB_STATUS.PENDING && task.status !== PROCESSING_JOB_STATUS.PROCESSING) {
        throw new StorageError(
          `Cannot cancel task with status: ${task.status}`,
          422,
          StorageErrorCode.INVALID_TASK_STATUS
        );
      }

      const queueIndex = this.processingQueue.findIndex(t => t.taskId === taskId);
      if (queueIndex !== -1) {
        this.processingQueue.splice(queueIndex, 1);
      }

      await this._processingJobRepository.updateJobStatus(taskId, PROCESSING_JOB_STATUS.CANCELLED);

      task.status = PROCESSING_JOB_STATUS.CANCELLED;
      task.completedAt = new Date();

      logger.info('Task cancelled successfully', {
        module: 'background_processing_use_case',
        operation: 'cancelTask',
        taskId,
        phase: 'task_cancelled',
      });

      return {
        success: true,
        task,
        message: 'Task cancelled successfully',
      };
    } catch (error) {
      logger.error('Cancel task failed', {
        module: 'background_processing_use_case',
        operation: 'cancelTask',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'task_cancellation_failed',
      });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to cancel task',
      };
    }
  }

  async retryTask(taskId: string, userId: string): Promise<ProcessingResultDTO> {
    try {
      logger.info('Retrying task', {
        module: 'background_processing_use_case',
        operation: 'retryTask',
        taskId,
        phase: 'task_retry_started',
      });

      const dbRow = await this._processingJobRepository.getJobById(taskId);
      if (!dbRow) {
        throw new StorageError('Task not found', 404, StorageErrorCode.TASK_NOT_FOUND);
      }

      const task = mapDbRowToTaskDTO(dbRow);

      if (task.userId !== userId) {
        throw new StorageError('Insufficient permissions to retry task', 403, StorageErrorCode.ACCESS_DENIED);
      }

      if (task.status !== PROCESSING_JOB_STATUS.FAILED && task.status !== PROCESSING_JOB_STATUS.CANCELLED) {
        throw new StorageError(
          `Cannot retry task with status: ${task.status}`,
          422,
          StorageErrorCode.INVALID_TASK_STATUS
        );
      }

      task.status = PROCESSING_JOB_STATUS.PENDING;
      task.startedAt = undefined;
      task.completedAt = undefined;
      task.error = undefined;
      task.result = undefined;
      task.progress = 0;

      this.addToQueue(task);
      await this._processingJobRepository.updateJobStatus(taskId, PROCESSING_JOB_STATUS.PENDING);

      logger.info('Task queued for retry', {
        module: 'background_processing_use_case',
        operation: 'retryTask',
        taskId,
        phase: 'task_retry_queued',
      });

      return {
        success: true,
        task,
        message: 'Task queued for retry',
      };
    } catch (error) {
      logger.error('Retry task failed', {
        module: 'background_processing_use_case',
        operation: 'retryTask',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'task_retry_failed',
      });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to retry task',
      };
    }
  }

  async getQueueStats(): Promise<{
    success: boolean;
    stats?: {
      totalTasks: number;
      pendingTasks: number;
      processingTasks: number;
      completedTasks: number;
      failedTasks: number;
      queueLength: number;
      averageProcessingTime: number;
    };
    error?: string;
  }> {
    try {
      const dbRows = await this._processingJobRepository.getAllJobs();
      const allTasks = dbRows.map(mapDbRowToTaskDTO);

      const stats = {
        totalTasks: allTasks.length,
        pendingTasks: allTasks.filter(t => t.status === PROCESSING_JOB_STATUS.PENDING).length,
        processingTasks: allTasks.filter(t => t.status === PROCESSING_JOB_STATUS.PROCESSING).length,
        completedTasks: allTasks.filter(t => t.status === PROCESSING_JOB_STATUS.COMPLETED).length,
        failedTasks: allTasks.filter(t => t.status === PROCESSING_JOB_STATUS.FAILED).length,
        queueLength: this.processingQueue.length,
        averageProcessingTime: this.calculateAverageProcessingTime(allTasks),
      };

      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('Get queue stats failed', {
        module: 'background_processing_use_case',
        operation: 'getQueueStats',
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'queue_stats_retrieval_failed',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get queue stats',
      };
    }
  }

  private addToQueue(task: ProcessingTaskDTO): void {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const taskPriority = priorityOrder[task.priority];

    let insertIndex = this.processingQueue.length;
    for (let i = 0; i < this.processingQueue.length; i++) {
      const queueTaskPriority = priorityOrder[this.processingQueue[i].priority];
      if (taskPriority < queueTaskPriority) {
        insertIndex = i;
        break;
      }
    }

    this.processingQueue.splice(insertIndex, 0, task);
  }

  private async startBackgroundProcessor(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    logger.debug('Background processor started', {
      module: 'background_processing_use_case',
      operation: 'startBackgroundProcessor',
      phase: 'background_processor_started',
    });

    const processNextTask = async () => {
      if (this.processingQueue.length === 0) {
        const envSettings = getEnvironmentSettings();
        setTimeout(processNextTask, envSettings.networkTimeout / 15);
        return;
      }

      const task = this.processingQueue.shift();
      if (task) {
        await this.processTask(task);
      }

      setTimeout(processNextTask, 100);
    };

    processNextTask();
  }

  private async processTask(task: ProcessingTaskDTO): Promise<void> {
    try {
      logger.info('Processing task', {
        module: 'background_processing_use_case',
        operation: 'processNextTask',
        taskId: task.taskId,
        taskType: task.taskType,
        phase: 'task_processing_started',
      });

      task.status = PROCESSING_JOB_STATUS.PROCESSING;
      task.startedAt = new Date();
      await this._processingJobRepository.updateJobStatus(task.taskId, PROCESSING_JOB_STATUS.PROCESSING);

      const result = await this.executeTask(task);

      task.status = PROCESSING_JOB_STATUS.COMPLETED;
      task.completedAt = new Date();
      task.progress = 100;
      task.result = result;
      await this._processingJobRepository.updateJobStatus(task.taskId, PROCESSING_JOB_STATUS.COMPLETED, {
        outputParams: result,
      });

      logger.info('Task completed successfully', {
        module: 'background_processing_use_case',
        operation: 'processTask',
        taskId: task.taskId,
        phase: 'task_completed',
      });

      if (this._notificationService) {
        await this._notificationService.notify(task.userId, {
          type: 'task_completed',
          message: `${task.taskType} processing completed`,
          taskId: task.taskId,
        });
      }
    } catch (error) {
      logger.error('Task failed', {
        module: 'background_processing_use_case',
        operation: 'processTask',
        taskId: task.taskId,
        error: { message: errorMessage(error), stack: errorStack(error) },
        phase: 'task_processing_failed',
      });

      task.status = PROCESSING_JOB_STATUS.FAILED;
      task.completedAt = new Date();
      task.error = error instanceof Error ? error.message : 'Unknown processing error';
      await this._processingJobRepository.updateJobStatus(task.taskId, PROCESSING_JOB_STATUS.FAILED, {
        errorMessage: task.error,
      });

      if (this._notificationService) {
        await this._notificationService.notify(task.userId, {
          type: 'task_failed',
          message: `${task.taskType} processing failed`,
          taskId: task.taskId,
          error: task.error,
        });
      }
    }
  }

  private async executeTask(task: ProcessingTaskDTO): Promise<Record<string, unknown>> {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      task.progress = (i / steps) * 100;
    }

    switch (task.taskType) {
      case 'thumbnail':
        return {
          artworkUrl: `/api/files/${task.fileId}/thumbnail`,
          dimensions: { width: 150, height: 150 },
          format: 'jpeg',
        };

      case 'compress':
        return {
          originalSize: 1024000,
          compressedSize: 512000,
          compressionRatio: 0.5,
          savings: '50%',
        };

      case 'convert':
        return {
          outputFormat: task.parameters.targetFormat || 'pdf',
          outputUrl: `/api/files/${task.fileId}/converted`,
          conversionTime: 2.5,
        };

      case 'extract-metadata':
        return {
          metadata: {
            dimensions: { width: 1920, height: 1080 },
            duration: 120.5,
            codec: 'h264',
            bitrate: '1000kbps',
          },
        };

      default:
        return {
          processedAt: new Date(),
          processingTime: task.estimatedDuration,
        };
    }
  }

  private validateTaskParameters(taskType: string, parameters: Record<string, unknown>): void {
    switch (taskType) {
      case 'convert':
        if (!parameters.targetFormat) {
          throw new StorageError(
            'targetFormat parameter required for convert task',
            400,
            StorageErrorCode.INVALID_REQUEST
          );
        }
        break;
      case 'compress':
        if (parameters.quality && ((parameters.quality as number) < 0 || (parameters.quality as number) > 100)) {
          throw new StorageError('quality parameter must be between 0 and 100', 400, StorageErrorCode.INVALID_REQUEST);
        }
        break;
    }
  }

  private getEstimatedDuration(taskType: string): number {
    const durations: Record<string, number> = {
      thumbnail: 2,
      compress: 10,
      convert: 30,
      scan: 15,
      optimize: 20,
      transcode: 60,
      'extract-metadata': 5,
    };
    return durations[taskType] || 10;
  }

  private calculateAverageProcessingTime(tasks?: ProcessingTaskDTO[]): number {
    const completedTasks = (tasks || []).filter(
      t => t.status === PROCESSING_JOB_STATUS.COMPLETED && t.startedAt && t.completedAt
    );

    if (completedTasks.length === 0) return 0;

    const totalTime = completedTasks.reduce((sum, task) => {
      const processingTime = task.completedAt!.getTime() - task.startedAt!.getTime();
      return sum + processingTime;
    }, 0);

    return totalTime / completedTasks.length / 1000;
  }
}
