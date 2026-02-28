/**
 * PlaybackPosition Value Object
 * Represents the current position in a track during playback
 */

import { MusicError } from '../../../application/errors';

export interface PlaybackPositionProps {
  timestamp: number; // Position in seconds
  percentage: number; // Position as percentage (0-100)
  duration?: number; // Total track duration in seconds
}

export class PlaybackPosition {
  private constructor(
    private readonly _timestamp: number,
    private readonly _percentage: number,
    private readonly _duration?: number
  ) {}

  static create(props: PlaybackPositionProps): PlaybackPosition {
    if (props.timestamp < 0) {
      throw MusicError.invalidPosition('timestamp cannot be negative');
    }

    if (props.percentage < 0 || props.percentage > 100) {
      throw MusicError.invalidPosition('percentage must be between 0 and 100');
    }

    if (props.duration !== undefined && props.duration <= 0) {
      throw MusicError.invalidDuration('must be positive');
    }

    if (props.duration !== undefined && props.timestamp > props.duration) {
      throw MusicError.invalidPosition('timestamp cannot exceed duration');
    }

    return new PlaybackPosition(props.timestamp, props.percentage, props.duration);
  }

  static fromTimestamp(timestamp: number, duration: number): PlaybackPosition {
    if (duration <= 0) {
      throw MusicError.invalidDuration('must be positive');
    }

    const percentage = Math.min(100, (timestamp / duration) * 100);

    return new PlaybackPosition(timestamp, percentage, duration);
  }

  static fromPercentage(percentage: number, duration: number): PlaybackPosition {
    if (duration <= 0) {
      throw MusicError.invalidDuration('must be positive');
    }

    const timestamp = (percentage / 100) * duration;

    return new PlaybackPosition(timestamp, percentage, duration);
  }

  static beginning(): PlaybackPosition {
    return new PlaybackPosition(0, 0);
  }

  static end(duration: number): PlaybackPosition {
    return new PlaybackPosition(duration, 100, duration);
  }

  get timestamp(): number {
    return this._timestamp;
  }

  get percentage(): number {
    return this._percentage;
  }

  get duration(): number | undefined {
    return this._duration;
  }

  /**
   * Business logic: Check if this is near the beginning of the track
   */
  isAtBeginning(): boolean {
    return this._percentage < 5; // First 5%
  }

  /**
   * Business logic: Check if this is near the end of the track
   */
  isNearEnd(): boolean {
    return this._percentage > 90; // Last 10%
  }

  /**
   * Business logic: Check if playback is past the halfway point
   */
  isPastHalfway(): boolean {
    return this._percentage > 50;
  }

  /**
   * Business logic: Get remaining time in seconds
   */
  getRemainingTime(): number | undefined {
    if (!this._duration) return undefined;
    return Math.max(0, this._duration - this._timestamp);
  }

  /**
   * Business logic: Get elapsed time formatted as MM:SS
   */
  getFormattedElapsedTime(): string {
    const minutes = Math.floor(this._timestamp / 60);
    const seconds = Math.floor(this._timestamp % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Business logic: Get remaining time formatted as MM:SS
   */
  getFormattedRemainingTime(): string | undefined {
    const remaining = this.getRemainingTime();
    if (remaining === undefined) return undefined;

    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Business logic: Advance position by seconds
   */
  advance(seconds: number): PlaybackPosition {
    const newTimestamp = this._timestamp + seconds;
    const maxTimestamp = this._duration || newTimestamp;
    const clampedTimestamp = Math.min(newTimestamp, maxTimestamp);

    if (this._duration) {
      return PlaybackPosition.fromTimestamp(clampedTimestamp, this._duration);
    }

    return new PlaybackPosition(clampedTimestamp, (clampedTimestamp / maxTimestamp) * 100);
  }

  /**
   * Business logic: Rewind position by seconds
   */
  rewind(seconds: number): PlaybackPosition {
    const newTimestamp = Math.max(0, this._timestamp - seconds);

    if (this._duration) {
      return PlaybackPosition.fromTimestamp(newTimestamp, this._duration);
    }

    return new PlaybackPosition(newTimestamp, this._percentage);
  }

  /**
   * Value Record<string, unknown> equality
   */
  equals(other: PlaybackPosition): boolean {
    return (
      Math.abs(this._timestamp - other._timestamp) < 0.1 && // Allow small floating point differences
      Math.abs(this._percentage - other._percentage) < 0.1 &&
      this._duration === other._duration
    );
  }

  toJSON(): PlaybackPositionProps {
    return {
      timestamp: this._timestamp,
      percentage: this._percentage,
      duration: this._duration,
    };
  }
}
