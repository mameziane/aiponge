import { pgTable, varchar, integer, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './user-schema';

export const SHARE_LINK_CONTENT_TYPE = {
  BOOK: 'book',
  PLAYLIST: 'playlist',
  ENTRY: 'entry',
} as const;

export type ShareLinkContentType = (typeof SHARE_LINK_CONTENT_TYPE)[keyof typeof SHARE_LINK_CONTENT_TYPE];

export const SHARE_LINK_CONTENT_TYPE_VALUES = Object.values(SHARE_LINK_CONTENT_TYPE) as [string, ...string[]];

export const shareLinks = pgTable(
  'usr_share_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contentId: uuid('content_id').notNull(),
    contentType: varchar('content_type', { length: 20 }).notNull(),
    token: varchar('token', { length: 64 }).notNull().unique(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at'),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  table => ({
    tokenIdx: index('usr_share_links_token_idx').on(table.token),
    contentIdx: index('usr_share_links_content_idx').on(table.contentId, table.contentType),
    createdByIdx: index('usr_share_links_created_by_idx').on(table.createdBy),
  })
);

export const insertShareLinkSchema = createInsertSchema(shareLinks, {
  contentType: z.enum(SHARE_LINK_CONTENT_TYPE_VALUES),
}).omit({
  id: true,
  useCount: true,
  createdAt: true,
});

export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type ShareLink = typeof shareLinks.$inferSelect;
