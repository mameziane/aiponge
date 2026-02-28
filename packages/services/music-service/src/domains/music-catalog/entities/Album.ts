/**
 * Album Domain Entity
 * Represents an album in a user's music library, auto-created from book chapters
 * Schema aligned with mus_albums for consistency
 */

import { randomUUID } from 'crypto';
import { MusicError } from '../../../application/errors';
import {
  ALBUM_LIFECYCLE,
  ALBUM_TRANSITIONS,
  assertValidTransition,
  type AlbumLifecycleStatus,
} from '@aiponge/shared-contracts';

export interface ChapterSnapshot {
  id: string;
  title: string;
  bookId?: string;
  bookTitle?: string;
  dominantMood?: string;
  themes?: string[];
}

export type AlbumType = 'album' | 'single' | 'ep' | 'compilation';
export type AlbumStatus = AlbumLifecycleStatus;

export interface AlbumData {
  id?: string;
  userId: string;
  chapterId?: string;
  title: string;
  description?: string;
  artworkUrl?: string;
  totalTracks?: number;
  totalDuration?: number;
  type?: AlbumType;
  releaseDate?: Date;
  isExplicit?: boolean;
  playCount?: number;
  mood?: string;
  genres?: string[];
  status?: AlbumStatus;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Album {
  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private readonly _chapterId: string | undefined,
    private _title: string,
    private _description: string | undefined,
    private _artworkUrl: string | undefined,
    private _totalTracks: number,
    private _totalDuration: number,
    private _type: AlbumType,
    private _releaseDate: Date | undefined,
    private _isExplicit: boolean,
    private _playCount: number,
    private _mood: string | undefined,
    private _genres: string[],
    private _status: AlbumStatus,
    private _metadata: Record<string, unknown>,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {}

  static create(data: AlbumData): Album {
    if (!data.userId?.trim()) {
      throw MusicError.validationError('userId', 'is required');
    }
    if (!data.title?.trim()) {
      throw MusicError.validationError('title', 'is required');
    }

    return new Album(
      data.id || randomUUID(),
      data.userId.trim(),
      data.chapterId?.trim(),
      data.title.trim(),
      data.description,
      data.artworkUrl,
      data.totalTracks || 0,
      data.totalDuration || 0,
      data.type || 'album',
      data.releaseDate,
      data.isExplicit || false,
      data.playCount || 0,
      data.mood,
      data.genres || [],
      data.status || ALBUM_LIFECYCLE.DRAFT,
      data.metadata || {},
      data.createdAt || new Date(),
      data.updatedAt || new Date()
    );
  }

  get id(): string {
    return this._id;
  }
  get userId(): string {
    return this._userId;
  }
  get chapterId(): string | undefined {
    return this._chapterId;
  }
  get title(): string {
    return this._title;
  }
  get description(): string | undefined {
    return this._description;
  }
  get artworkUrl(): string | undefined {
    return this._artworkUrl;
  }
  get totalTracks(): number {
    return this._totalTracks;
  }
  get totalDuration(): number {
    return this._totalDuration;
  }
  get type(): AlbumType {
    return this._type;
  }
  get releaseDate(): Date | undefined {
    return this._releaseDate;
  }
  get isExplicit(): boolean {
    return this._isExplicit;
  }
  get playCount(): number {
    return this._playCount;
  }
  get mood(): string | undefined {
    return this._mood;
  }
  get genres(): string[] {
    return this._genres;
  }
  get status(): AlbumStatus {
    return this._status;
  }
  get metadata(): Record<string, unknown> {
    return this._metadata;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  updateTitle(title: string): void {
    if (!title?.trim()) {
      throw MusicError.validationError('title', 'cannot be empty');
    }
    this._title = title.trim();
    this._updatedAt = new Date();
  }

  updateArtwork(url: string | undefined): void {
    this._artworkUrl = url;
    this._updatedAt = new Date();
  }

  updateDescription(description: string | undefined): void {
    this._description = description;
    this._updatedAt = new Date();
  }

  updateType(type: AlbumType): void {
    this._type = type;
    this._updatedAt = new Date();
  }

  updateStatus(status: AlbumStatus): void {
    assertValidTransition(this._status, status, ALBUM_TRANSITIONS, 'Album');
    this._status = status;
    this._updatedAt = new Date();
  }

  incrementTrackCount(duration: number): void {
    this._totalTracks += 1;
    this._totalDuration += duration;
    this._updatedAt = new Date();
  }

  decrementTrackCount(duration: number): void {
    this._totalTracks = Math.max(0, this._totalTracks - 1);
    this._totalDuration = Math.max(0, this._totalDuration - duration);
    this._updatedAt = new Date();
  }

  incrementPlayCount(): void {
    this._playCount += 1;
    this._updatedAt = new Date();
  }

  setChapterSnapshot(snapshot: ChapterSnapshot): void {
    this._metadata = {
      ...this._metadata,
      chapterSnapshot: snapshot,
    };
    this._updatedAt = new Date();
  }

  toJSON(): AlbumData {
    return {
      id: this._id,
      userId: this._userId,
      chapterId: this._chapterId,
      title: this._title,
      description: this._description,
      artworkUrl: this._artworkUrl,
      totalTracks: this._totalTracks,
      totalDuration: this._totalDuration,
      type: this._type,
      releaseDate: this._releaseDate,
      isExplicit: this._isExplicit,
      playCount: this._playCount,
      mood: this._mood,
      genres: this._genres,
      status: this._status,
      metadata: this._metadata,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}

export { Album as UserAlbum };
export type { AlbumData as UserAlbumData };
