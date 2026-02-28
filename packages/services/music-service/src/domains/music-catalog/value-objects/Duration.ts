import { MusicError } from '../../../application/errors';

export class Duration {
  private static readonly MAX_DURATION_SECONDS = 3600;
  private static readonly MIN_DURATION_SECONDS = 1;

  private constructor(private readonly _seconds: number) {}

  static fromSeconds(seconds: number): Duration {
    if (seconds <= 0) {
      throw MusicError.invalidDuration('must be positive');
    }
    if (seconds > this.MAX_DURATION_SECONDS) {
      throw MusicError.invalidDuration(
        `cannot exceed ${this.MAX_DURATION_SECONDS} seconds (${this.MAX_DURATION_SECONDS / 60} minutes)`
      );
    }
    if (seconds < this.MIN_DURATION_SECONDS) {
      throw MusicError.invalidDuration(`must be at least ${this.MIN_DURATION_SECONDS} seconds`);
    }
    return new Duration(seconds);
  }

  get seconds(): number {
    return this._seconds;
  }

  add(other: Duration): Duration {
    return Duration.fromSeconds(this._seconds + other._seconds);
  }

  toJSON(): number {
    return this._seconds;
  }
}
