/**
 * AudioMetadata Value Object
 * Represents technical metadata about an audio file
 */

import { MusicError } from '../../../application/errors';

export enum AudioFormat {
  MP3 = 'mp3',
  FLAC = 'flac',
  WAV = 'wav',
  AAC = 'aac',
  OGG = 'ogg',
  M4A = 'm4a',
}

export enum AudioCodec {
  MP3 = 'mp3',
  FLAC = 'flac',
  PCM = 'pcm',
  AAC = 'aac',
  VORBIS = 'vorbis',
}

export interface AudioMetadataProps {
  format: AudioFormat;
  codec?: AudioCodec;
  bitrate: number; // in kbps
  sampleRate: number; // in Hz (e.g., 44100, 48000)
  channels: number; // 1 = mono, 2 = stereo, etc.
  duration: number; // in seconds
  fileSize?: number; // in bytes
  isLossless?: boolean;
}

export class AudioMetadata {
  private constructor(
    private readonly _format: AudioFormat,
    private readonly _codec: AudioCodec,
    private readonly _bitrate: number,
    private readonly _sampleRate: number,
    private readonly _channels: number,
    private readonly _duration: number,
    private readonly _fileSize: number | undefined,
    private readonly _isLossless: boolean
  ) {}

  static create(props: AudioMetadataProps): AudioMetadata {
    if (props.bitrate <= 0) {
      throw MusicError.validationError('bitrate', 'must be positive');
    }

    if (props.sampleRate <= 0) {
      throw MusicError.validationError('sampleRate', 'must be positive');
    }

    if (props.channels <= 0) {
      throw MusicError.validationError('channels', 'must be positive');
    }

    if (props.duration <= 0) {
      throw MusicError.invalidDuration('must be positive');
    }

    if (props.fileSize !== undefined && props.fileSize <= 0) {
      throw MusicError.validationError('fileSize', 'must be positive');
    }

    // Validate sample rate
    const validSampleRates = [8000, 11025, 16000, 22050, 44100, 48000, 88200, 96000, 176400, 192000];
    if (!validSampleRates.includes(props.sampleRate)) {
      throw MusicError.invalidData('format', `invalid sample rate. Valid rates: ${validSampleRates.join(', ')}`);
    }

    // Validate channel count
    if (props.channels > 8) {
      throw MusicError.validationError('channels', 'maximum 8 channels supported');
    }

    // Determine codec from format if not provided
    const codec = props.codec || this.getDefaultCodec(props.format);

    // Determine if lossless
    const isLossless = props.isLossless !== undefined ? props.isLossless : this.isFormatLossless(props.format);

    return new AudioMetadata(
      props.format,
      codec,
      props.bitrate,
      props.sampleRate,
      props.channels,
      props.duration,
      props.fileSize,
      isLossless
    );
  }

  private static getDefaultCodec(format: AudioFormat): AudioCodec {
    switch (format) {
      case AudioFormat.MP3:
        return AudioCodec.MP3;
      case AudioFormat.FLAC:
        return AudioCodec.FLAC;
      case AudioFormat.WAV:
        return AudioCodec.PCM;
      case AudioFormat.AAC:
        return AudioCodec.AAC;
      case AudioFormat.M4A:
        return AudioCodec.AAC;
      case AudioFormat.OGG:
        return AudioCodec.VORBIS;
      default:
        return AudioCodec.MP3;
    }
  }

  private static isFormatLossless(format: AudioFormat): boolean {
    return format === AudioFormat.FLAC || format === AudioFormat.WAV;
  }

  get format(): AudioFormat {
    return this._format;
  }

  get codec(): AudioCodec {
    return this._codec;
  }

  get bitrate(): number {
    return this._bitrate;
  }

  get sampleRate(): number {
    return this._sampleRate;
  }

  get channels(): number {
    return this._channels;
  }

  get duration(): number {
    return this._duration;
  }

  get fileSize(): number | undefined {
    return this._fileSize;
  }

  get isLossless(): boolean {
    return this._isLossless;
  }

  /**
   * Business logic: Get quality tier based on bitrate and format
   */
  getQualityTier(): 'low' | 'medium' | 'high' | 'lossless' {
    if (this._isLossless) return 'lossless';
    if (this._bitrate >= 320) return 'high';
    if (this._bitrate >= 192) return 'medium';
    return 'low';
  }

  /**
   * Business logic: Check if this is suitable for streaming
   */
  isSuitableForStreaming(): boolean {
    // Files over 50MB or lossless might not be suitable for streaming
    if (this._fileSize && this._fileSize > 50 * 1024 * 1024) return false;
    if (this._isLossless && this._bitrate > 1000) return false;
    return true;
  }

  /**
   * Business logic: Check if this is suitable for offline storage
   */
  isSuitableForOfflineStorage(): boolean {
    // Most files are suitable for offline storage, but very large files might not be
    if (this._fileSize && this._fileSize > 200 * 1024 * 1024) return false;
    return true;
  }

  /**
   * Business logic: Estimate storage requirements per hour of content
   */
  getStorageRequirementPerHour(): number {
    // Calculate MB per hour based on bitrate
    const bitsPerSecond = this._bitrate * 1000;
    const bytesPerSecond = bitsPerSecond / 8;
    const bytesPerHour = bytesPerSecond * 3600;
    return bytesPerHour / (1024 * 1024); // Convert to MB
  }

  /**
   * Business logic: Get channel configuration description
   */
  getChannelDescription(): string {
    switch (this._channels) {
      case 1:
        return 'Mono';
      case 2:
        return 'Stereo';
      case 6:
        return '5.1 Surround';
      case 8:
        return '7.1 Surround';
      default:
        return `${this._channels} Channel`;
    }
  }

  /**
   * Business logic: Check compatibility with target format
   */
  isCompatibleWith(targetFormat: AudioFormat): boolean {
    // All formats can be converted to MP3 or AAC
    if (targetFormat === AudioFormat.MP3 || targetFormat === AudioFormat.AAC) {
      return true;
    }

    // Lossless to lossless is always compatible
    if (this._isLossless && AudioMetadata.isFormatLossless(targetFormat)) {
      return true;
    }

    // Same format is compatible
    return this._format === targetFormat;
  }

  /**
   * Value Record<string, unknown> equality
   */
  equals(other: AudioMetadata): boolean {
    return (
      this._format === other._format &&
      this._codec === other._codec &&
      this._bitrate === other._bitrate &&
      this._sampleRate === other._sampleRate &&
      this._channels === other._channels &&
      Math.abs(this._duration - other._duration) < 0.1 &&
      this._fileSize === other._fileSize &&
      this._isLossless === other._isLossless
    );
  }

  toJSON(): AudioMetadataProps {
    return {
      format: this._format,
      codec: this._codec,
      bitrate: this._bitrate,
      sampleRate: this._sampleRate,
      channels: this._channels,
      duration: this._duration,
      fileSize: this._fileSize,
      isLossless: this._isLossless,
    };
  }
}
