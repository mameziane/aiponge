/**
 * Album Value Object
 * Represents album metadata as descriptive data (unless tracking album-specific metrics)
 */

import { MusicError } from '../../../application/errors';
import { Genre } from './Genre';
import { Duration } from './Duration';

export interface AlbumProps {
  title: string;
  displayName: string;
  genre: Genre[];
  releaseDate?: Date;
  totalDuration?: Duration;
  trackCount?: number;
  artworkUrl?: string;
  recordLabel?: string;
  catalogNumber?: string;
  isCompilation?: boolean;
}

export class Album {
  private constructor(
    private readonly _title: string,
    private readonly _displayName: string,
    private readonly _genre: Genre[],
    private readonly _releaseDate?: Date,
    private readonly _totalDuration?: Duration,
    private readonly _trackCount?: number,
    private readonly _artworkUrl?: string,
    private readonly _recordLabel?: string,
    private readonly _catalogNumber?: string,
    private readonly _isCompilation?: boolean
  ) {}

  static create(props: AlbumProps): Album {
    if (!props.title || props.title.trim().length === 0) {
      throw MusicError.validationError('title', 'cannot be empty');
    }

    if (!props.displayName || props.displayName.trim().length === 0) {
      throw MusicError.validationError('displayName', 'cannot be empty');
    }

    if (props.genre.length === 0) {
      throw MusicError.validationError('genre', 'must have at least one genre');
    }

    if (props.releaseDate && props.releaseDate > new Date()) {
      throw MusicError.validationError('releaseDate', 'cannot be in the future');
    }

    if (props.trackCount !== undefined && props.trackCount <= 0) {
      throw MusicError.validationError('trackCount', 'must be positive');
    }

    if (props.trackCount !== undefined && props.trackCount > 100) {
      throw MusicError.validationError('trackCount', 'cannot exceed 100 tracks');
    }

    return new Album(
      props.title.trim(),
      props.displayName.trim(),
      props.genre,
      props.releaseDate,
      props.totalDuration,
      props.trackCount,
      props.artworkUrl?.trim(),
      props.recordLabel?.trim(),
      props.catalogNumber?.trim(),
      props.isCompilation || false
    );
  }

  get title(): string {
    return this._title;
  }

  get displayName(): string {
    return this._displayName;
  }

  get genre(): Genre[] {
    return [...this._genre]; // Return copy to maintain immutability
  }

  get releaseDate(): Date | undefined {
    return this._releaseDate;
  }

  get totalDuration(): Duration | undefined {
    return this._totalDuration;
  }

  get trackCount(): number | undefined {
    return this._trackCount;
  }

  get artworkUrl(): string | undefined {
    return this._artworkUrl;
  }

  get recordLabel(): string | undefined {
    return this._recordLabel;
  }

  get catalogNumber(): string | undefined {
    return this._catalogNumber;
  }

  get isCompilation(): boolean {
    return this._isCompilation || false;
  }

  /**
   * Business logic: Check if this is a recent release
   */
  isRecentRelease(): boolean {
    if (!this._releaseDate) return false;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return this._releaseDate > sixMonthsAgo;
  }

  /**
   * Business logic: Check if this is a classic album (over 20 years old)
   */
  isClassic(): boolean {
    if (!this._releaseDate) return false;

    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    return this._releaseDate < twentyYearsAgo;
  }

  /**
   * Business logic: Check if this is a full album vs EP
   */
  isFullAlbum(): boolean {
    if (!this._trackCount) return true; // Assume full album if unknown
    return this._trackCount >= 8; // 8+ tracks typically considered full album
  }

  /**
   * Business logic: Check if this is an EP
   */
  isEP(): boolean {
    if (!this._trackCount) return false;
    return this._trackCount >= 3 && this._trackCount <= 7;
  }

  /**
   * Business logic: Check if this is a single
   */
  isSingle(): boolean {
    if (!this._trackCount) return false;
    return this._trackCount <= 2;
  }

  /**
   * Business logic: Get primary genre
   */
  getPrimaryGenre(): Genre {
    return this._genre[0];
  }

  /**
   * Business logic: Check if album contains specific genre
   */
  hasGenre(genre: Genre): boolean {
    return this._genre.some(g => g.equals(genre));
  }

  /**
   * Business logic: Get release year
   */
  getReleaseYear(): number | undefined {
    return this._releaseDate?.getFullYear();
  }

  /**
   * Business logic: Get release decade
   */
  getReleaseDecade(): string | undefined {
    const year = this.getReleaseYear();
    if (!year) return undefined;

    const decade = Math.floor(year / 10) * 10;
    return `${decade}s`;
  }

  /**
   * Business logic: Get estimated average track duration
   */
  getAverageTrackDuration(): Duration | undefined {
    if (!this._totalDuration || !this._trackCount) return undefined;

    const avgSeconds = this._totalDuration.seconds / this._trackCount;
    return Duration.fromSeconds(avgSeconds);
  }

  /**
   * Business logic: Check if album title/displayName match search criteria
   */
  matchesSearchQuery(query: string): boolean {
    const searchTerm = query.toLowerCase().trim();
    return (
      this._title.toLowerCase().includes(searchTerm) ||
      this._displayName.toLowerCase().includes(searchTerm) ||
      this._recordLabel?.toLowerCase().includes(searchTerm) ||
      false
    );
  }

  /**
   * Value Record<string, unknown> equality - albums are equal if title and displayName match
   */
  equals(other: Album): boolean {
    return (
      this._title.toLowerCase() === other._title.toLowerCase() &&
      this._displayName.toLowerCase() === other._displayName.toLowerCase()
    );
  }

  toJSON(): AlbumProps {
    return {
      title: this._title,
      displayName: this._displayName,
      genre: this._genre,
      releaseDate: this._releaseDate,
      totalDuration: this._totalDuration,
      trackCount: this._trackCount,
      artworkUrl: this._artworkUrl,
      recordLabel: this._recordLabel,
      catalogNumber: this._catalogNumber,
      isCompilation: this._isCompilation,
    };
  }
}
