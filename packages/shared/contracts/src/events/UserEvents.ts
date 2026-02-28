/**
 * User Service Event Contracts
 * Events for user account and library operations
 */

import { z } from 'zod';
import { baseEventSchema, generateEventId } from './BaseEvent.js';

export type UserEventType =
  | 'user.deleted'
  | 'user.library.entry.deleted'
  | 'user.library.chapter.deleted'
  | 'user.creator_member.followed'
  | 'user.creator_member.unfollowed';

export const userDeletedEventSchema = baseEventSchema.extend({
  type: z.literal('user.deleted'),
  data: z.object({
    userId: z.string().uuid(),
  }),
});

export const userLibraryEntryDeletedEventSchema = baseEventSchema.extend({
  type: z.literal('user.library.entry.deleted'),
  data: z.object({
    entryId: z.string().uuid(),
    userId: z.string().uuid(),
    chapterId: z.string().uuid().optional(),
    bookId: z.string().uuid().optional(),
  }),
});

export const userLibraryChapterDeletedEventSchema = baseEventSchema.extend({
  type: z.literal('user.library.chapter.deleted'),
  data: z.object({
    chapterId: z.string().uuid(),
    userId: z.string().uuid(),
    bookId: z.string().uuid().optional(),
  }),
});

export const userCreatorMemberFollowedEventSchema = baseEventSchema.extend({
  type: z.literal('user.creator_member.followed'),
  data: z.object({
    memberId: z.string().uuid(),
    creatorId: z.string().uuid(),
  }),
});

export const userCreatorMemberUnfollowedEventSchema = baseEventSchema.extend({
  type: z.literal('user.creator_member.unfollowed'),
  data: z.object({
    memberId: z.string().uuid(),
    creatorId: z.string().uuid(),
  }),
});

export const userEventSchema = z.discriminatedUnion('type', [
  userDeletedEventSchema,
  userLibraryEntryDeletedEventSchema,
  userLibraryChapterDeletedEventSchema,
  userCreatorMemberFollowedEventSchema,
  userCreatorMemberUnfollowedEventSchema,
]);

export type UserDeletedEvent = z.infer<typeof userDeletedEventSchema>;
export type UserLibraryEntryDeletedEvent = z.infer<typeof userLibraryEntryDeletedEventSchema>;
export type UserLibraryChapterDeletedEvent = z.infer<typeof userLibraryChapterDeletedEventSchema>;
export type UserCreatorMemberFollowedEvent = z.infer<typeof userCreatorMemberFollowedEventSchema>;
export type UserCreatorMemberUnfollowedEvent = z.infer<typeof userCreatorMemberUnfollowedEventSchema>;
export type UserEvent = z.infer<typeof userEventSchema>;

export function createUserEvent<T extends UserEvent['type']>(
  type: T,
  data: Extract<UserEvent, { type: T }>['data'],
  source: string = 'user-service',
  options?: { correlationId?: string }
): Extract<UserEvent, { type: T }> {
  return {
    eventId: generateEventId('usr'),
    correlationId: options?.correlationId || generateEventId('cor'),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<UserEvent, { type: T }>;
}

export function validateUserEvent(event: unknown): UserEvent {
  return userEventSchema.parse(event);
}
