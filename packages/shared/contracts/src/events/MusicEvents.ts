/**
 * Music-related event contracts for cross-service communication
 * Following existing event patterns for the platform
 */

import { z } from 'zod';
import { baseEventSchema } from './BaseEvent.js';
import { ContentVisibilityWithDefaultSchema } from '../common/index.js';

// Music Event Types
export type MusicEventType =
  | 'music.track.played'
  | 'music.track.added'
  | 'music.track.removed'
  | 'music.playlist.created'
  | 'music.playlist.updated'
  | 'music.album.created'
  | 'music.user.preference.updated'
  | 'music.generation.completed'
  | 'music.generation.failed';

// Music Track Events
export const musicTrackPlayedEventSchema = baseEventSchema.extend({
  type: z.literal('music.track.played'),
  data: z.object({
    trackId: z.string().uuid(),
    userId: z.string().uuid(),
    playDuration: z.number(),
    timestamp: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const musicTrackAddedEventSchema = baseEventSchema.extend({
  type: z.literal('music.track.added'),
  data: z.object({
    trackId: z.string().uuid(),
    title: z.string(),
    displayName: z.string(),
    album: z.string().optional(),
    duration: z.number(),
    addedBy: z.string().uuid(),
  }),
});

export const musicTrackRemovedEventSchema = baseEventSchema.extend({
  type: z.literal('music.track.removed'),
  data: z.object({
    trackId: z.string().uuid(),
    removedBy: z.string().uuid(),
    reason: z.string().optional(),
  }),
});

// Music Playlist Events
export const musicPlaylistCreatedEventSchema = baseEventSchema.extend({
  type: z.literal('music.playlist.created'),
  data: z.object({
    playlistId: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    createdBy: z.string().uuid(),
    visibility: ContentVisibilityWithDefaultSchema,
  }),
});

export const musicPlaylistUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal('music.playlist.updated'),
  data: z.object({
    playlistId: z.string().uuid(),
    changes: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      tracksAdded: z.array(z.string().uuid()).optional(),
      tracksRemoved: z.array(z.string().uuid()).optional(),
    }),
    updatedBy: z.string().uuid(),
  }),
});

// Music Album Events
export const musicAlbumCreatedEventSchema = baseEventSchema.extend({
  type: z.literal('music.album.created'),
  data: z.object({
    albumId: z.string().uuid(),
    title: z.string(),
    displayName: z.string(),
    releaseDate: z.string().optional(),
    trackCount: z.number(),
    createdBy: z.string().uuid(),
  }),
});

// User Preference Events
export const musicUserPreferenceUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal('music.user.preference.updated'),
  data: z.object({
    userId: z.string().uuid(),
    preferences: z.object({
      genres: z.array(z.string()).optional(),
      volume: z.number().optional(),
      repeat: z.enum(['none', 'track', 'playlist']).optional(),
      shuffle: z.boolean().optional(),
    }),
  }),
});

// Music Generation Events
export const musicGenerationCompletedEventSchema = baseEventSchema.extend({
  type: z.literal('music.generation.completed'),
  data: z.object({
    userId: z.string().uuid(),
    trackId: z.string().uuid().optional(),
    albumId: z.string().uuid().optional(),
    audioUrl: z.string().optional(),
    requestId: z.string(),
  }),
});

export const musicGenerationFailedEventSchema = baseEventSchema.extend({
  type: z.literal('music.generation.failed'),
  data: z.object({
    userId: z.string().uuid(),
    requestId: z.string(),
    error: z.string(),
    isLastAttempt: z.boolean().optional(),
  }),
});

// Union of all music event schemas
export const musicEventSchema = z.discriminatedUnion('type', [
  musicTrackPlayedEventSchema,
  musicTrackAddedEventSchema,
  musicTrackRemovedEventSchema,
  musicPlaylistCreatedEventSchema,
  musicPlaylistUpdatedEventSchema,
  musicAlbumCreatedEventSchema,
  musicUserPreferenceUpdatedEventSchema,
  musicGenerationCompletedEventSchema,
  musicGenerationFailedEventSchema,
]);

// TypeScript types
export type MusicTrackPlayedEvent = z.infer<typeof musicTrackPlayedEventSchema>;
export type MusicTrackAddedEvent = z.infer<typeof musicTrackAddedEventSchema>;
export type MusicTrackRemovedEvent = z.infer<typeof musicTrackRemovedEventSchema>;
export type MusicPlaylistCreatedEvent = z.infer<typeof musicPlaylistCreatedEventSchema>;
export type MusicPlaylistUpdatedEvent = z.infer<typeof musicPlaylistUpdatedEventSchema>;
export type MusicAlbumCreatedEvent = z.infer<typeof musicAlbumCreatedEventSchema>;
export type MusicUserPreferenceUpdatedEvent = z.infer<typeof musicUserPreferenceUpdatedEventSchema>;
export type MusicGenerationCompletedEvent = z.infer<typeof musicGenerationCompletedEventSchema>;
export type MusicGenerationFailedEvent = z.infer<typeof musicGenerationFailedEventSchema>;

// Union type for all music events
export type MusicEvent = z.infer<typeof musicEventSchema>;

// Helper functions for creating music events
export function createMusicEvent<T extends MusicEvent['type']>(
  type: T,
  data: Extract<MusicEvent, { type: T }>['data'],
  source: string = 'music-service',
  options?: { correlationId?: string }
): Extract<MusicEvent, { type: T }> {
  return {
    eventId: generateEventId(),
    correlationId: options?.correlationId || generateCorrelationId(),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<MusicEvent, { type: T }>;
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `music_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateCorrelationId(): string {
  return `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Event validation helper
export function validateMusicEvent(event: unknown): MusicEvent {
  return musicEventSchema.parse(event);
}

// Event type guards
export function isMusicTrackEvent(
  event: MusicEvent
): event is MusicTrackPlayedEvent | MusicTrackAddedEvent | MusicTrackRemovedEvent {
  return event.type.startsWith('music.track.');
}

export function isMusicPlaylistEvent(
  event: MusicEvent
): event is MusicPlaylistCreatedEvent | MusicPlaylistUpdatedEvent {
  return event.type.startsWith('music.playlist.');
}

export function isMusicAlbumEvent(event: MusicEvent): event is MusicAlbumCreatedEvent {
  return event.type.startsWith('music.album.');
}

export function isMusicUserPreferenceEvent(event: MusicEvent): event is MusicUserPreferenceUpdatedEvent {
  return event.type.startsWith('music.user.preference.');
}
