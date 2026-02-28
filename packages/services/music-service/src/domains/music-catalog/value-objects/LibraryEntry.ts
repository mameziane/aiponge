/**
 * LibraryEntry Value Object
 * Represents a track entry in a user's library with metadata'
 */

import { MusicError } from '../../../application/errors';

export interface LibraryEntryProps {
  trackId: string;
  addedDate: Date;
  tags: string[];
  isFavorite?: boolean;
  playCount?: number;
  lastPlayedAt?: Date;
}

export class LibraryEntry {
  private constructor(
    private readonly _trackId: string,
    private readonly _addedDate: Date,
    private readonly _tags: string[],
    private readonly _isFavorite: boolean,
    private readonly _playCount: number,
    private readonly _lastPlayedAt?: Date
  ) {}

  static create(props: LibraryEntryProps): LibraryEntry {
    if (!props.trackId || props.trackId.trim().length === 0) {
      throw MusicError.validationError('trackId', 'cannot be empty');
    }

    if (props.addedDate > new Date()) {
      throw MusicError.validationError('addedDate', 'cannot be in the future');
    }

    if (props.playCount !== undefined && props.playCount < 0) {
      throw MusicError.validationError('playCount', 'cannot be negative');
    }

    if (props.lastPlayedAt && props.lastPlayedAt > new Date()) {
      throw MusicError.validationError('lastPlayedAt', 'cannot be in the future');
    }

    // Validate and clean tags
    const cleanedTags = props.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0)
      .filter((tag, index, arr) => arr.indexOf(tag) === index); // Remove duplicates

    return new LibraryEntry(
      props.trackId.trim(),
      props.addedDate,
      cleanedTags,
      props.isFavorite || false,
      props.playCount || 0,
      props.lastPlayedAt
    );
  }

  get trackId(): string {
    return this._trackId;
  }

  get addedDate(): Date {
    return this._addedDate;
  }

  get tags(): string[] {
    return [...this._tags]; // Return copy to maintain immutability
  }

  get isFavorite(): boolean {
    return this._isFavorite;
  }

  get playCount(): number {
    return this._playCount;
  }

  get lastPlayedAt(): Date | undefined {
    return this._lastPlayedAt;
  }

  /**
   * Business logic: Check if this is a recently added track
   */
  isRecentlyAdded(): boolean {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return this._addedDate > oneWeekAgo;
  }

  /**
   * Business logic: Check if this is a frequently played track
   */
  isFrequentlyPlayed(): boolean {
    return this._playCount >= 10;
  }

  /**
   * Business logic: Check if track has been played recently
   */
  isRecentlyPlayed(): boolean {
    if (!this._lastPlayedAt) return false;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return this._lastPlayedAt > oneDayAgo;
  }

  /**
   * Business logic: Check if entry has specific tag
   */
  hasTag(_tag: string): boolean {
    return this._tags.includes(_tag.trim().toLowerCase());
  }

  /**
   * Business logic: Create a version with new tags
   */
  withTags(tags: string[]): LibraryEntry {
    return LibraryEntry.create({
      trackId: this._trackId,
      addedDate: this._addedDate,
      tags: tags,
      isFavorite: this._isFavorite,
      playCount: this._playCount,
      lastPlayedAt: this._lastPlayedAt,
    });
  }

  /**
   * Business logic: Create a favorited version
   */
  markAsFavorite(): LibraryEntry {
    return LibraryEntry.create({
      trackId: this._trackId,
      addedDate: this._addedDate,
      tags: this._tags,
      isFavorite: true,
      playCount: this._playCount,
      lastPlayedAt: this._lastPlayedAt,
    });
  }

  /**
   * Value Record<string, unknown> equality based on trackId (main identifier)
   */
  equals(other: LibraryEntry): boolean {
    return this._trackId === other._trackId;
  }

  toJSON(): LibraryEntryProps {
    return {
      trackId: this._trackId,
      addedDate: this._addedDate,
      tags: [...this._tags],
      isFavorite: this._isFavorite,
      playCount: this._playCount,
      lastPlayedAt: this._lastPlayedAt,
    };
  }
}
