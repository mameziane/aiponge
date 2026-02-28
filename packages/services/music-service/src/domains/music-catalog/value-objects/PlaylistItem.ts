/**
 * PlaylistItem Value Object
 * Represents an item in a playlist with position and metadata
 */

import { MusicError } from '../../../application/errors';

export interface PlaylistItemProps {
  trackId: string;
  position: number;
  addedDate: Date;
  addedBy?: string;
}

export class PlaylistItem {
  private constructor(
    private readonly _trackId: string,
    private readonly _position: number,
    private readonly _addedDate: Date,
    private readonly _addedBy?: string
  ) {}

  static create(props: PlaylistItemProps): PlaylistItem {
    if (!props.trackId || props.trackId.trim().length === 0) {
      throw MusicError.validationError('trackId', 'cannot be empty');
    }

    if (props.position < 0) {
      throw MusicError.invalidPosition('must be non-negative');
    }

    if (props.addedDate > new Date()) {
      throw MusicError.validationError('addedDate', 'cannot be in the future');
    }

    return new PlaylistItem(props.trackId.trim(), props.position, props.addedDate, props.addedBy?.trim());
  }

  get trackId(): string {
    return this._trackId;
  }

  get position(): number {
    return this._position;
  }

  get addedDate(): Date {
    return this._addedDate;
  }

  get addedBy(): string | undefined {
    return this._addedBy;
  }

  /**
   * Business logic: Check if this item was recently added
   */
  isRecentlyAdded(): boolean {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return this._addedDate > oneWeekAgo;
  }

  /**
   * Business logic: Create a moved version with new position
   */
  withNewPosition(newPosition: number): PlaylistItem {
    if (newPosition < 0) {
      throw MusicError.invalidPosition('must be non-negative');
    }

    return new PlaylistItem(this._trackId, newPosition, this._addedDate, this._addedBy);
  }

  /**
   * Value Record<string, unknown> equality based on all properties
   */
  equals(other: PlaylistItem): boolean {
    return (
      this._trackId === other._trackId &&
      this._position === other._position &&
      this._addedDate.getTime() === other._addedDate.getTime() &&
      this._addedBy === other._addedBy
    );
  }

  toJSON(): PlaylistItemProps {
    return {
      trackId: this._trackId,
      position: this._position,
      addedDate: this._addedDate,
      addedBy: this._addedBy,
    };
  }
}
