/**
 * Playlist Entity - Core domain entity for music playlists
 * Represents things we track: mutable, shareable, has followers
 */

import { PlaylistItem } from '../value-objects/PlaylistItem';
import { Duration } from '../value-objects/Duration';
import { MusicError } from '../../../application/errors';
import {
  isContentPublic,
  PLAYLIST_LIFECYCLE,
  PLAYLIST_TRANSITIONS,
  assertValidTransition,
  type ContentVisibility,
  type PlaylistLifecycleStatus,
} from '@aiponge/shared-contracts';

export enum PlaylistType {
  USER_CREATED = 'user_created',
  COLLABORATIVE = 'collaborative',
  SMART = 'smart',
  SYSTEM = 'system',
}

export const PlaylistStatus = PLAYLIST_LIFECYCLE;
export type PlaylistStatus = PlaylistLifecycleStatus;

export interface SmartPlaylistRules {
  genre?: string[];
  creator?: string[];
  minDuration?: number;
  maxDuration?: number;
  minReleaseYear?: number;
  maxReleaseYear?: number;
  tags?: string[];
  maxTracks?: number;
  sortBy?: 'releaseDate' | 'playCount' | 'addedAt' | 'random';
  sortOrder?: 'asc' | 'desc';
}

export interface PlaylistEntityProps {
  id: string;
  name: string;
  description?: string;
  userId: string;
  type: PlaylistType;
  visibility: ContentVisibility;
  status: PlaylistStatus;
  items: PlaylistItem[];
  followers: string[];
  artworkUrl?: string;
  totalDuration: Duration;
  totalTracks: number;
  playCount: number;
  likeCount: number;
  shareCount: number;
  smartRules?: SmartPlaylistRules;
  version: number;
  lastModified: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class PlaylistEntity {
  constructor(private props: PlaylistEntityProps) {
    this.validatePlaylist();
  }

  static create(
    props: Omit<
      PlaylistEntityProps,
      | 'id'
      | 'items'
      | 'totalDuration'
      | 'totalTracks'
      | 'playCount'
      | 'likeCount'
      | 'shareCount'
      | 'version'
      | 'lastModified'
      | 'createdAt'
      | 'updatedAt'
    >
  ): PlaylistEntity {
    return new PlaylistEntity({
      ...props,
      id: crypto.randomUUID(),
      items: [],
      totalDuration: Duration.fromSeconds(0),
      totalTracks: 0,
      playCount: 0,
      likeCount: 0,
      shareCount: 0,
      version: 1,
      lastModified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get userId(): string {
    return this.props.userId;
  }
  get type(): PlaylistType {
    return this.props.type;
  }
  get visibility(): ContentVisibility {
    return this.props.visibility;
  }
  get status(): PlaylistStatus {
    return this.props.status;
  }
  get items(): PlaylistItem[] {
    return [...this.props.items];
  }
  get followers(): string[] {
    return [...this.props.followers];
  }
  get artworkUrl(): string | undefined {
    return this.props.artworkUrl;
  }
  get totalDuration(): Duration {
    return this.props.totalDuration;
  }
  get totalTracks(): number {
    return this.props.totalTracks;
  }
  get playCount(): number {
    return this.props.playCount;
  }
  get likeCount(): number {
    return this.props.likeCount;
  }
  get shareCount(): number {
    return this.props.shareCount;
  }
  get smartRules(): SmartPlaylistRules | undefined {
    return this.props.smartRules;
  }
  get version(): number {
    return this.props.version;
  }
  get lastModified(): Date {
    return this.props.lastModified;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // Business logic methods
  async updateInfo(name?: string, description?: string): Promise<void> {
    if (name) this.props.name = name;
    if (description !== undefined) this.props.description = description;
    await this.updateModificationTime();
  }

  async addTrack(trackId: string, addedBy: string, duration: Duration): Promise<void> {
    if (this.props.items.find(item => item.trackId === trackId)) {
      throw MusicError.duplicateEntry('track', trackId);
    }

    const playlistItem = PlaylistItem.create({
      trackId,
      position: this.props.items.length,
      addedDate: new Date(),
      addedBy,
    });

    this.props.items.push(playlistItem);
    this.props.totalTracks = this.props.items.length;
    this.props.totalDuration = this.props.totalDuration.add(duration);
    await this.updateModificationTime();
  }

  async removeTrack(trackId: string): Promise<void> {
    const index = this.props.items.findIndex(item => item.trackId === trackId);
    if (index === -1) {
      throw MusicError.trackNotFound(trackId);
    }

    this.props.items.splice(index, 1);

    // Reorder positions
    this.props.items = this.props.items.map((item, idx) => item.withNewPosition(idx));

    this.props.totalTracks = this.props.items.length;
    await this.updateModificationTime();
  }

  async reorderTracks(trackIds: string[]): Promise<void> {
    if (trackIds.length !== this.props.items.length) {
      throw MusicError.validationError('trackIds', 'Track count mismatch for reordering');
    }

    const newItems: PlaylistItem[] = [];
    trackIds.forEach((trackId, index) => {
      const item = this.props.items.find(item => item.trackId === trackId);
      if (!item) {
        throw MusicError.trackNotFound(trackId);
      }
      newItems.push(item.withNewPosition(index));
    });

    this.props.items = newItems;
    await this.updateModificationTime();
  }

  async setVisibility(visibility: ContentVisibility): Promise<void> {
    this.props.visibility = visibility;
    await this.updateModificationTime();
  }

  async setArtwork(artworkUrl: string): Promise<void> {
    this.props.artworkUrl = artworkUrl;
    await this.updateModificationTime();
  }

  incrementPlayCount(): Promise<void> {
    this.props.playCount++;
    this.props.updatedAt = new Date();
    return Promise.resolve();
  }

  async incrementLikeCount(): Promise<void> {
    this.props.likeCount++;
    await this.updateModificationTime();
  }

  async decrementLikeCount(): Promise<void> {
    this.props.likeCount = Math.max(0, this.props.likeCount - 1);
    await this.updateModificationTime();
  }

  async incrementShareCount(): Promise<void> {
    this.props.shareCount++;
    await this.updateModificationTime();
  }

  async setSmartRules(rules: SmartPlaylistRules): Promise<void> {
    if (this.props.type !== PlaylistType.SMART) {
      throw MusicError.invalidStateTransition(this.props.type, 'smart');
    }
    this.props.smartRules = rules;
    await this.updateModificationTime();
  }

  async archive(): Promise<void> {
    assertValidTransition(this.props.status, PlaylistStatus.ARCHIVED, PLAYLIST_TRANSITIONS, 'Playlist');
    this.props.status = PlaylistStatus.ARCHIVED;
    await this.updateModificationTime();
  }

  async delete(): Promise<void> {
    assertValidTransition(this.props.status, PlaylistStatus.DELETED, PLAYLIST_TRANSITIONS, 'Playlist');
    this.props.status = PlaylistStatus.DELETED;
    await this.updateModificationTime();
  }

  async restore(): Promise<void> {
    assertValidTransition(this.props.status, PlaylistStatus.ACTIVE, PLAYLIST_TRANSITIONS, 'Playlist');
    this.props.status = PlaylistStatus.ACTIVE;
    await this.updateModificationTime();
  }

  canUserEdit(checkUserId: string): boolean {
    return checkUserId === this.props.userId;
  }

  isPublic(): boolean {
    return isContentPublic(this.props.visibility);
  }

  isActive(): boolean {
    return this.props.status === PlaylistStatus.ACTIVE;
  }

  private async updateModificationTime(): Promise<void> {
    this.props.version++;
    this.props.lastModified = new Date();
    this.props.updatedAt = new Date();
    return Promise.resolve();
  }

  private validatePlaylist(): void {
    if (!this.props.name?.trim()) {
      throw MusicError.validationError('name', 'Playlist name is required');
    }
    if (!this.props.userId?.trim()) {
      throw MusicError.validationError('userId', 'User ID is required');
    }
    if (this.props.totalTracks < 0) {
      throw MusicError.validationError('totalTracks', 'Total tracks cannot be negative');
    }
    if (this.props.totalDuration.seconds < 0) {
      throw MusicError.invalidDuration('Total duration cannot be negative');
    }
  }

  toJSON(): PlaylistEntityProps {
    return { ...this.props };
  }
}
