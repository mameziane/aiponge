/**
 * Organization Schema
 * First-class entity for Practice/Studio tier organizations.
 *
 * Organizations own branding (display name, logo, colors, etc.) and
 * multiple coaches (users) can belong to the same organization.
 * Branding is stored as JSONB for future-proof extensibility.
 *
 * Key concepts:
 * - An organization is created by a Practice/Studio tier user (the owner)
 * - Multiple coaches can belong to one organization via usr_accounts.organization_id
 * - Branding resolution: user → organization → tier rules → default fallback
 * - Creator-member relationships handle content visibility; the org provides the branding umbrella
 */

import { pgTable, varchar, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './user-schema';

export const ORGANIZATION_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
} as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUS)[keyof typeof ORGANIZATION_STATUS];

export const ORGANIZATION_STATUS_VALUES = Object.values(ORGANIZATION_STATUS) as [string, ...string[]];

/**
 * Branding JSONB shape — future-proof structure.
 * Only organizationName and displayName are used initially;
 * remaining fields are anticipated for future iterations.
 */
export const BrandingSchema = z
  .object({
    organizationName: z.string().max(150).optional(),
    displayName: z.string().max(100).optional(),
    logoUrl: z.string().url().max(500).optional(),
    tagline: z.string().max(250).optional(),
    primaryColor: z.string().max(20).optional(),
    secondaryColor: z.string().max(20).optional(),
  })
  .strict();

export type Branding = z.infer<typeof BrandingSchema>;

export const usrOrganizations = pgTable(
  'usr_organizations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }),
    branding: jsonb('branding').notNull().default('{}').$type<Branding>(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default(ORGANIZATION_STATUS.ACTIVE),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    ownerIdx: index('usr_organizations_owner_user_id_idx').on(table.ownerUserId),
    statusIdx: index('usr_organizations_status_idx').on(table.status),
    slugIdx: index('usr_organizations_slug_idx').on(table.slug),
    activeIdx: index('idx_usr_organizations_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const insertOrganizationSchema = createInsertSchema(usrOrganizations, {
  status: z.enum(ORGANIZATION_STATUS_VALUES).default(ORGANIZATION_STATUS.ACTIVE),
  branding: BrandingSchema.default({}),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const updateOrganizationSchema = z.object({
  name: z.string().max(255).optional(),
  slug: z.string().max(100).optional(),
  branding: BrandingSchema.partial().optional(),
  status: z.enum(ORGANIZATION_STATUS_VALUES).optional(),
});

export const selectOrganizationSchema = createSelectSchema(usrOrganizations, {
  status: z.enum(ORGANIZATION_STATUS_VALUES),
  branding: BrandingSchema,
});

export type Organization = typeof usrOrganizations.$inferSelect;
export type NewOrganization = typeof usrOrganizations.$inferInsert;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
