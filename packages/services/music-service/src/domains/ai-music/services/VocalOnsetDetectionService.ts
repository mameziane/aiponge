/**
 * VocalOnsetDetectionService - Automatic vocal start detection for lyrics synchronization
 *
 * Uses ffmpeg audio analysis to detect when vocals/audio energy starts in a track.
 * This offset is used to calibrate lyrics display timing per-track.
 *
 * Detection method:
 * 1. Analyze audio energy/volume levels using ffmpeg
 * 2. Find the first moment where energy exceeds the vocal threshold
 * 3. Return offset in milliseconds from track start to vocal start
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getLogger } from '@config/service-urls';
import { PipelineError } from '../../../application/errors';
import { serializeError } from '@aiponge/platform-core';

const execAsync = promisify(exec);
const logger = getLogger('vocal-onset-detection');

export interface VocalOnsetResult {
  success: boolean;
  vocalStartMs: number;
  confidence: number;
  analysisMethod: 'energy-threshold' | 'silence-detection' | 'fallback';
  metadata?: {
    totalDurationMs: number;
    averageEnergy: number;
    peakEnergy: number;
    silenceEndMs?: number;
  };
  error?: string;
}

interface SilenceInterval {
  start: number;
  end: number;
  duration: number;
}

export class VocalOnsetDetectionService {
  private readonly ENERGY_THRESHOLD_DB = -30;
  private readonly SILENCE_THRESHOLD_DB = -40;
  private readonly MIN_SILENCE_DURATION = 0.1;
  private readonly MAX_INTRO_SCAN_SECONDS = 30;

  constructor() {
    logger.info('VocalOnsetDetectionService initialized');
  }

  /**
   * Detect when vocals/audio content starts in an audio file
   * @param audioFilePath - Full path to the audio file (MP3)
   * @returns VocalOnsetResult with vocal start time in milliseconds
   */
  async detectVocalOnset(audioFilePath: string): Promise<VocalOnsetResult> {
    const startTime = Date.now();

    try {
      if (!fs.existsSync(audioFilePath)) {
        throw PipelineError.contentFetchFailed(`Audio file not found: ${audioFilePath}`);
      }

      logger.info('Starting vocal onset detection', { audioFilePath });

      const result = await this.detectUsingSilenceEnd(audioFilePath);

      if (result.success) {
        const processingTime = Date.now() - startTime;
        logger.info('Vocal onset detected', {
          vocalStartMs: result.vocalStartMs,
          confidence: result.confidence,
          method: result.analysisMethod,
          processingTimeMs: processingTime,
        });
        return result;
      }

      const energyResult = await this.detectUsingEnergyAnalysis(audioFilePath);
      if (energyResult.success) {
        return energyResult;
      }

      logger.warn('All detection methods failed, using fallback');
      return {
        success: true,
        vocalStartMs: 0,
        confidence: 0.3,
        analysisMethod: 'fallback',
      };
    } catch (error) {
      logger.error('Vocal onset detection failed', {
        error: serializeError(error),
        audioFilePath,
      });

      return {
        success: false,
        vocalStartMs: 0,
        confidence: 0,
        analysisMethod: 'fallback',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Detect vocal onset using ffmpeg silencedetect filter
   * Finds where the initial silence ends (when audio content begins)
   */
  private async detectUsingSilenceEnd(audioFilePath: string): Promise<VocalOnsetResult> {
    try {
      const ffmpegCmd = `ffmpeg -i "${audioFilePath}" -af "silencedetect=noise=${this.SILENCE_THRESHOLD_DB}dB:d=${this.MIN_SILENCE_DURATION}" -t ${this.MAX_INTRO_SCAN_SECONDS} -f null - 2>&1`;

      const { stdout, stderr } = await execAsync(ffmpegCmd, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = stdout + stderr;

      const silenceEnds: number[] = [];
      const silenceEndRegex = /silence_end:\s*([\d.]+)/g;
      let match: RegExpExecArray | null;

      while ((match = silenceEndRegex.exec(output)) !== null) {
        silenceEnds.push(parseFloat(match[1]));
      }

      if (silenceEnds.length > 0) {
        const firstSilenceEnd = silenceEnds[0];
        const vocalStartMs = Math.round(firstSilenceEnd * 1000);

        const confidence = vocalStartMs < 5000 ? 0.9 : vocalStartMs < 10000 ? 0.7 : 0.5;

        return {
          success: true,
          vocalStartMs,
          confidence,
          analysisMethod: 'silence-detection',
          metadata: {
            totalDurationMs: 0,
            averageEnergy: 0,
            peakEnergy: 0,
            silenceEndMs: vocalStartMs,
          },
        };
      }

      return {
        success: true,
        vocalStartMs: 0,
        confidence: 0.8,
        analysisMethod: 'silence-detection',
      };
    } catch (error) {
      logger.warn('Silence detection failed', {
        error: serializeError(error),
      });

      return {
        success: false,
        vocalStartMs: 0,
        confidence: 0,
        analysisMethod: 'silence-detection',
        error: error instanceof Error ? error.message : 'Silence detection failed',
      };
    }
  }

  /**
   * Alternative detection using volume/energy analysis
   * Finds the first moment where audio energy exceeds threshold
   */
  private async detectUsingEnergyAnalysis(audioFilePath: string): Promise<VocalOnsetResult> {
    try {
      const ffmpegCmd = `ffmpeg -i "${audioFilePath}" -af "volumedetect" -t ${this.MAX_INTRO_SCAN_SECONDS} -f null - 2>&1`;

      const { stdout, stderr } = await execAsync(ffmpegCmd, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = stdout + stderr;

      const meanVolumeMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);
      const maxVolumeMatch = output.match(/max_volume:\s*([-\d.]+)\s*dB/);

      const meanVolume = meanVolumeMatch ? parseFloat(meanVolumeMatch[1]) : -30;
      const maxVolume = maxVolumeMatch ? parseFloat(maxVolumeMatch[1]) : -10;

      if (meanVolume > this.ENERGY_THRESHOLD_DB) {
        return {
          success: true,
          vocalStartMs: 0,
          confidence: 0.7,
          analysisMethod: 'energy-threshold',
          metadata: {
            totalDurationMs: 0,
            averageEnergy: meanVolume,
            peakEnergy: maxVolume,
          },
        };
      }

      return {
        success: false,
        vocalStartMs: 0,
        confidence: 0,
        analysisMethod: 'energy-threshold',
      };
    } catch (error) {
      logger.warn('Energy analysis failed', {
        error: serializeError(error),
      });

      return {
        success: false,
        vocalStartMs: 0,
        confidence: 0,
        analysisMethod: 'energy-threshold',
        error: error instanceof Error ? error.message : 'Energy analysis failed',
      };
    }
  }

  /**
   * Get the full local path for an audio file from a relative URL
   */
  getLocalAudioPath(fileUrl: string): string {
    if (fileUrl.startsWith('/uploads/')) {
      return path.join(process.cwd(), fileUrl);
    }

    if (fileUrl.startsWith('uploads/')) {
      return path.join(process.cwd(), fileUrl);
    }

    return fileUrl;
  }
}
