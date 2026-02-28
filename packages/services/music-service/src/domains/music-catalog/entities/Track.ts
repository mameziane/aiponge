/**
 * Track Domain Entity
 * Unified track entity for all music content (personal and shared)
 *
 * Uses visibility property to distinguish between personal tracks
 * and shared library tracks.
 *
 * Visibility levels:
 * - 'draft': Work in progress, not yet ready
 * - 'personal': User's private content (default for user-generated)
 * - 'shared': Public library content (librarian-managed)
 */

import { randomUUID } from 'crypto';
import {
  CONTENT_VISIBILITY,
  TRACK_LIFECYCLE,
  TRACK_TRANSITIONS,
  assertValidTransition,
  type ContentVisibility,
  type TrackLifecycleStatus,
} from '@aiponge/shared-contracts';
import { MusicError } from '../../../application/errors';

export type TrackVisibility = ContentVisibility;
export type TrackStatus = TrackLifecycleStatus;
export type TrackSourceType = 'generated' | 'uploaded' | 'imported';

export const TrackStatusEnum = TRACK_LIFECYCLE;

export interface TrackData {
  id?: string;
  userId: string;
  albumId?: string;
  trackNumber?: number;
  generationNumber?: number;
  title: string;
  fileUrl: string;
  artworkUrl?: string;
  duration?: number;
  fileSize?: number;
  mimeType?: string;
  quality?: string;
  status?: TrackStatus;
  visibility?: TrackVisibility;
  metadata?: Record<string, unknown>;
  sourceType?: TrackSourceType;
  generationRequestId?: string;
  generatedByUserId?: string;
  genres?: string[];
  language?: string;
  variantGroupId?: string;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
  playOnDate?: Date | null;
  playCount?: number;
  likeCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Track {
  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private _albumId: string | undefined,
    private _trackNumber: number | undefined,
    private readonly _generationNumber: number,
    private _title: string,
    private _fileUrl: string,
    private _artworkUrl: string | undefined,
    private readonly _duration: number | undefined,
    private readonly _fileSize: number | undefined,
    private readonly _mimeType: string,
    private readonly _quality: string,
    private _status: TrackStatus,
    private _visibility: TrackVisibility,
    private readonly _metadata: Record<string, unknown>,
    private readonly _sourceType: TrackSourceType,
    private readonly _generationRequestId: string | undefined,
    private readonly _generatedByUserId: string | undefined,
    private readonly _genres: string[],
    private readonly _language: string,
    private readonly _variantGroupId: string | undefined,
    private readonly _lyricsId: string | undefined,
    private readonly _hasSyncedLyrics: boolean,
    private _playOnDate: Date | null,
    private _playCount: number,
    private _likeCount: number,
    private readonly _createdAt: Date,
    private _updatedAt: Date
  ) {}

  static create(data: TrackData): Track {
    if (!data.userId?.trim()) {
      throw MusicError.validationError('userId', 'User ID is required');
    }
    if (!data.title?.trim()) {
      throw MusicError.validationError('title', 'Title is required');
    }
    if (!data.fileUrl?.trim()) {
      throw MusicError.validationError('fileUrl', 'File URL is required');
    }

    return new Track(
      data.id || randomUUID(),
      data.userId.trim(),
      data.albumId,
      data.trackNumber,
      data.generationNumber ?? 1,
      data.title.trim(),
      data.fileUrl.trim(),
      data.artworkUrl,
      data.duration,
      data.fileSize,
      data.mimeType || 'audio/mpeg',
      data.quality || 'high',
      data.status || TRACK_LIFECYCLE.ACTIVE,
      data.visibility || CONTENT_VISIBILITY.PERSONAL,
      data.metadata || {},
      data.sourceType || 'generated',
      data.generationRequestId,
      data.generatedByUserId,
      data.genres || [],
      data.language || 'en',
      data.variantGroupId,
      data.lyricsId,
      data.hasSyncedLyrics || false,
      data.playOnDate || null,
      data.playCount || 0,
      data.likeCount || 0,
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
  get albumId(): string | undefined {
    return this._albumId;
  }
  get trackNumber(): number | undefined {
    return this._trackNumber;
  }
  get generationNumber(): number {
    return this._generationNumber;
  }
  get title(): string {
    return this._title;
  }
  get fileUrl(): string {
    return this._fileUrl;
  }
  get artworkUrl(): string | undefined {
    return this._artworkUrl;
  }
  get duration(): number | undefined {
    return this._duration;
  }
  get fileSize(): number | undefined {
    return this._fileSize;
  }
  get mimeType(): string {
    return this._mimeType;
  }
  get quality(): string {
    return this._quality;
  }
  get status(): TrackStatus {
    return this._status;
  }
  get visibility(): TrackVisibility {
    return this._visibility;
  }
  get metadata(): Record<string, unknown> {
    return this._metadata;
  }
  get sourceType(): TrackSourceType {
    return this._sourceType;
  }
  get generationRequestId(): string | undefined {
    return this._generationRequestId;
  }
  get generatedByUserId(): string | undefined {
    return this._generatedByUserId;
  }
  get genres(): string[] {
    return this._genres;
  }
  get language(): string {
    return this._language;
  }
  get variantGroupId(): string | undefined {
    return this._variantGroupId;
  }
  get lyricsId(): string | undefined {
    return this._lyricsId;
  }
  get hasSyncedLyrics(): boolean {
    return this._hasSyncedLyrics;
  }
  get playOnDate(): Date | null {
    return this._playOnDate;
  }
  get playCount(): number {
    return this._playCount;
  }
  get likeCount(): number {
    return this._likeCount;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  updateTitle(title: string): void {
    if (!title?.trim()) {
      throw MusicError.validationError('title', 'Title cannot be empty');
    }
    this._title = title.trim();
    this._updatedAt = new Date();
  }

  updateFileUrl(fileUrl: string): void {
    if (!fileUrl?.trim()) {
      throw MusicError.validationError('fileUrl', 'File URL cannot be empty');
    }
    this._fileUrl = fileUrl.trim();
    this._updatedAt = new Date();
  }

  updateStatus(status: TrackStatus): void {
    this._status = status;
    this._updatedAt = new Date();
  }

  updateVisibility(visibility: TrackVisibility): void {
    this._visibility = visibility;
    this._updatedAt = new Date();
  }

  updatePlayOnDate(date: Date | null): void {
    this._playOnDate = date;
    this._updatedAt = new Date();
  }

  incrementPlayCount(): void {
    this._playCount++;
    this._updatedAt = new Date();
  }

  incrementLikeCount(): void {
    this._likeCount++;
    this._updatedAt = new Date();
  }

  decrementLikeCount(): void {
    if (this._likeCount > 0) {
      this._likeCount--;
      this._updatedAt = new Date();
    }
  }

  publish(): void {
    assertValidTransition(this._status, TRACK_LIFECYCLE.PUBLISHED, TRACK_TRANSITIONS, 'Track');
    this._status = TRACK_LIFECYCLE.PUBLISHED;
    this._updatedAt = new Date();
  }

  archive(): void {
    assertValidTransition(this._status, TRACK_LIFECYCLE.ARCHIVED, TRACK_TRANSITIONS, 'Track');
    this._status = TRACK_LIFECYCLE.ARCHIVED;
    this._updatedAt = new Date();
  }

  isPopular(): boolean {
    return this._playCount > 1000 || this._likeCount > 100;
  }

  isRecentlyPlayed(): boolean {
    return false;
  }

  getEngagementRate(): number {
    if (this._playCount === 0) return 0;
    return (this._likeCount / this._playCount) * 100;
  }

  assignToAlbum(albumId: string, trackNumber: number): void {
    this._albumId = albumId;
    this._trackNumber = trackNumber;
    this._updatedAt = new Date();
  }

  removeFromAlbum(): void {
    this._albumId = undefined;
    this._trackNumber = undefined;
    this._updatedAt = new Date();
  }

  toJSON(): TrackData {
    return {
      id: this._id,
      userId: this._userId,
      albumId: this._albumId,
      trackNumber: this._trackNumber,
      generationNumber: this._generationNumber,
      title: this._title,
      fileUrl: this._fileUrl,
      artworkUrl: this._artworkUrl,
      duration: this._duration,
      fileSize: this._fileSize,
      mimeType: this._mimeType,
      quality: this._quality,
      status: this._status,
      visibility: this._visibility,
      metadata: this._metadata,
      sourceType: this._sourceType,
      generationRequestId: this._generationRequestId,
      generatedByUserId: this._generatedByUserId,
      genres: this._genres,
      language: this._language,
      variantGroupId: this._variantGroupId,
      lyricsId: this._lyricsId,
      hasSyncedLyrics: this._hasSyncedLyrics,
      playOnDate: this._playOnDate,
      playCount: this._playCount,
      likeCount: this._likeCount,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}

export { Track as TrackEntity };
export { Track as UserTrack };
export type { TrackData as UserTrackData };
export type { TrackData as TrackEntityProps };
