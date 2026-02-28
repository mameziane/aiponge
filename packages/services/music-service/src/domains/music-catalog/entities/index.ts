/**
 * Music Service Domain Entities
 *
 * Track is the unified track entity with visibility property
 * Album is the unified album entity
 */

export { Track, TrackEntity, UserTrack, TrackStatusEnum } from './Track';
export type {
  TrackData,
  UserTrackData,
  TrackEntityProps,
  TrackVisibility,
  TrackStatus,
  TrackSourceType,
} from './Track';

export { Album, UserAlbum } from './Album';
export type { AlbumData, UserAlbumData, ChapterSnapshot, AlbumType, AlbumStatus } from './Album';

export { StreamSessionEntity } from './StreamSessionEntity';
export type { StreamSessionEntityProps } from './StreamSessionEntity';

export interface QueueItem {
  id: string;
  trackId: string;
  playlistId?: string;
  position: number;
  addedAt: Date;
  played: boolean;
}

export interface PlaybackQueue extends Array<QueueItem> {}
