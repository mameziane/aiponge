import { eq, sql, and, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  usrOrganizations,
  InsertOrganization,
  UpdateOrganization,
  Organization,
} from '../database/schemas/organization-schema';
import { users } from '../database/schemas/user-schema';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('organization-repository');

export class OrganizationRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async create(data: InsertOrganization): Promise<Organization> {
    const [org] = await this.db.insert(usrOrganizations).values(data as typeof usrOrganizations.$inferInsert).returning();

    logger.info('Organization created', { orgId: org.id, ownerUserId: data.ownerUserId });
    return org;
  }

  async findById(id: string): Promise<Organization | undefined> {
    const [org] = await this.db
      .select()
      .from(usrOrganizations)
      .where(and(eq(usrOrganizations.id, id), isNull(usrOrganizations.deletedAt)));

    return org;
  }

  async findByOwnerUserId(ownerUserId: string): Promise<Organization | undefined> {
    const [org] = await this.db
      .select()
      .from(usrOrganizations)
      .where(and(eq(usrOrganizations.ownerUserId, ownerUserId), isNull(usrOrganizations.deletedAt)));

    return org;
  }

  async findByUserId(userId: string): Promise<Organization | undefined> {
    const [user] = await this.db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.organizationId) {
      return undefined;
    }

    return this.findById(user.organizationId);
  }

  async update(id: string, data: UpdateOrganization): Promise<Organization | undefined> {
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updateFields.name = data.name;
    }
    if (data.slug !== undefined) {
      updateFields.slug = data.slug;
    }
    if (data.status !== undefined) {
      updateFields.status = data.status;
    }

    if (data.branding !== undefined) {
      updateFields.branding = sql`COALESCE(branding, '{}'::jsonb) || ${JSON.stringify(data.branding)}::jsonb`;
    }

    const [org] = await this.db
      .update(usrOrganizations)
      .set(updateFields)
      .where(and(eq(usrOrganizations.id, id), isNull(usrOrganizations.deletedAt)))
      .returning();

    if (org) {
      logger.info('Organization updated', { orgId: id });
    }

    return org;
  }

  async addMember(organizationId: string, userId: string): Promise<void> {
    await this.db.update(users).set({ organizationId }).where(eq(users.id, userId));

    logger.info('Member added to organization', { organizationId, userId });
  }

  async removeMember(userId: string): Promise<void> {
    await this.db.update(users).set({ organizationId: null }).where(eq(users.id, userId));

    logger.info('Member removed from organization', { userId });
  }

  async getMembers(organizationId: string): Promise<Array<{ id: string; email: string; role: string }>> {
    const members = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.organizationId, organizationId));

    return members;
  }
}
