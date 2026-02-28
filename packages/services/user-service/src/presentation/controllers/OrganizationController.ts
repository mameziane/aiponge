import { Request, Response } from 'express';
import { getLogger } from '@config/service-urls';
import { CreateOrganizationSchema, UpdateOrganizationSchema } from '@aiponge/shared-contracts';
import { OrganizationRepository } from '@infrastructure/repositories/OrganizationRepository';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers.js';
import { extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('organization-controller');

export class OrganizationController {
  private repo = createDrizzleRepository(OrganizationRepository);

  async createOrganization(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const parseResult = CreateOrganizationSchema.safeParse(req.body);
      if (!parseResult.success) {
        ServiceErrors.badRequest(res, 'Invalid request body', req);
        return;
      }

      const existing = await this.repo.findByOwnerUserId(userId);
      if (existing) {
        ServiceErrors.badRequest(res, 'User already owns an organization', req);
        return;
      }

      const result = await this.repo.create({
        ...parseResult.data,
        ownerUserId: userId,
      });

      logger.info('Organization created', { orgId: result.id, userId });
      sendCreated(res, result);
    } catch (error) {
      logger.error('Create organization error', { error });
      ServiceErrors.fromException(res, error, 'Failed to create organization', req);
    }
  }

  async getOrganization(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.params.organizationId as string;
      const result = await this.repo.findById(organizationId);

      if (!result) {
        ServiceErrors.notFound(res, 'Organization', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Get organization error', { error });
      ServiceErrors.fromException(res, error, 'Failed to get organization', req);
    }
  }

  async getMyOrganization(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const result = await this.repo.findByUserId(userId);

      if (!result) {
        const owned = await this.repo.findByOwnerUserId(userId);
        if (owned) {
          sendSuccess(res, owned);
          return;
        }
        ServiceErrors.notFound(res, 'Organization', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Get my organization error', { error });
      ServiceErrors.fromException(res, error, 'Failed to get organization', req);
    }
  }

  async updateOrganization(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const organizationId = req.params.organizationId as string;

      const parseResult = UpdateOrganizationSchema.safeParse(req.body);
      if (!parseResult.success) {
        ServiceErrors.badRequest(res, 'Invalid request body', req);
        return;
      }

      const org = await this.repo.findById(organizationId);
      if (!org) {
        ServiceErrors.notFound(res, 'Organization', req);
        return;
      }

      if (org.ownerUserId !== userId) {
        ServiceErrors.forbidden(res, 'Only the organization owner can update', req);
        return;
      }

      const result = await this.repo.update(organizationId, parseResult.data);

      logger.info('Organization updated', { orgId: organizationId, userId });
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Update organization error', { error });
      ServiceErrors.fromException(res, error, 'Failed to update organization', req);
    }
  }

  async addMember(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const organizationId = req.params.organizationId as string;
      const memberId = req.body.userId as string;

      if (!memberId) {
        ServiceErrors.badRequest(res, 'userId is required in request body', req);
        return;
      }

      const org = await this.repo.findById(organizationId);
      if (!org) {
        ServiceErrors.notFound(res, 'Organization', req);
        return;
      }

      if (org.ownerUserId !== userId) {
        ServiceErrors.forbidden(res, 'Only the organization owner can add members', req);
        return;
      }

      await this.repo.addMember(organizationId, memberId);

      logger.info('Member added to organization', { orgId: organizationId, memberId, by: userId });
      sendSuccess(res, { organizationId, userId: memberId });
    } catch (error) {
      logger.error('Add member error', { error });
      ServiceErrors.fromException(res, error, 'Failed to add member', req);
    }
  }

  async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const organizationId = req.params.organizationId as string;
      const memberId = req.body.userId as string;

      if (!memberId) {
        ServiceErrors.badRequest(res, 'userId is required in request body', req);
        return;
      }

      const org = await this.repo.findById(organizationId);
      if (!org) {
        ServiceErrors.notFound(res, 'Organization', req);
        return;
      }

      if (org.ownerUserId !== userId) {
        ServiceErrors.forbidden(res, 'Only the organization owner can remove members', req);
        return;
      }

      await this.repo.removeMember(memberId);

      logger.info('Member removed from organization', { orgId: organizationId, memberId, by: userId });
      sendSuccess(res, { organizationId, userId: memberId });
    } catch (error) {
      logger.error('Remove member error', { error });
      ServiceErrors.fromException(res, error, 'Failed to remove member', req);
    }
  }

  async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.params.organizationId as string;

      const org = await this.repo.findById(organizationId);
      if (!org) {
        ServiceErrors.notFound(res, 'Organization', req);
        return;
      }

      const members = await this.repo.getMembers(organizationId);

      sendSuccess(res, members);
    } catch (error) {
      logger.error('Get members error', { error });
      ServiceErrors.fromException(res, error, 'Failed to get members', req);
    }
  }
}
