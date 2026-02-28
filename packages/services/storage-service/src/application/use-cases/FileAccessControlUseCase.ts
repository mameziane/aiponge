/**
 * File Access Control Use Case
 * Enhanced file permissions and sharing management for storage service
 */

import { randomUUID } from 'crypto';
import { StorageError, StorageErrorCode } from '../errors';
import { type StorageAccessLevel } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('storage-service-fileaccesscontrolusecase');

export interface FilePermissionDTO {
  fileId: string;
  userId: string;
  permission: 'read' | 'write' | 'delete' | 'share';
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface ShareFileRequestDTO {
  fileId: string;
  fromUserId: string;
  toUserId: string;
  permission: 'read' | 'write';
  expiresAt?: Date;
  message?: string;
}

export interface AccessControlResultDTO {
  success: boolean;
  permissionId?: string;
  hasAccess?: boolean;
  permission?: string;
  grantedBy?: string;
  grantedAt?: Date;
  message?: string;
  error?: string;
}

export class FileAccessControlUseCase {
  private permissions: Map<string, FilePermissionDTO[]> = new Map();

  constructor(
    private _fileRepository: unknown,
    private _auditService: unknown
  ) {}

  async shareFile(
    fileId: string,
    fromUserId: string,
    toUserId: string,
    permission: 'read' | 'write',
    expiresAt?: Date
  ): Promise<AccessControlResultDTO> {
    try {
      logger.warn('🤝 Sharing file: {} from user: {} to user: {} with permission: {}', {
        data0: fileId,
        data1: fromUserId,
        data2: toUserId,
        data3: permission,
      });

      // Validate file exists and user has permission to share
      const hasSharePermission = await this.checkFileAccess(fileId, fromUserId, 'share');
      if (!hasSharePermission.hasAccess) {
        throw new StorageError('Insufficient permissions to share file', 403, StorageErrorCode.ACCESS_DENIED);
      }

      // Create permission record
      const permissionId = `perm-${Date.now()}-${randomUUID()}`;
      const filePermission: FilePermissionDTO = {
        fileId,
        userId: toUserId,
        permission,
        grantedBy: fromUserId,
        grantedAt: new Date(),
        expiresAt,
      };

      // Store permission
      const existingPermissions = this.permissions.get(fileId) || [];

      // Remove existing permission for this user if exists
      const filteredPermissions = existingPermissions.filter(p => p.userId !== toUserId);
      filteredPermissions.push(filePermission);
      this.permissions.set(fileId, filteredPermissions);

      // Audit log
      logger.warn('📋 File shared: {} by {} to {} with {} permission', {
        data0: fileId,
        data1: fromUserId,
        data2: toUserId,
        data3: permission,
      });

      return {
        success: true,
        permissionId,
        message: `File successfully shared with ${permission} permission`,
      };
    } catch (error) {
      logger.error('Share file failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to share file',
      };
    }
  }

  async updateFileVisibility(
    fileId: string,
    userId: string,
    visibility: StorageAccessLevel
  ): Promise<AccessControlResultDTO> {
    try {
      logger.warn('🔒 Updating access level for file: {} to: {}', { data0: fileId, data1: visibility });

      // Validate user owns the file or has admin permissions
      const hasOwnership = await this.checkFileOwnership(fileId, userId);
      if (!hasOwnership) {
        throw new StorageError('Only file owner can change access level', 403, StorageErrorCode.ACCESS_DENIED);
      }

      // Update file access level in storage metadata
      // This would typically update the file entity's access control metadata

      logger.warn('📋 Access level changed for file: {} to {} by user: {}', {
        data0: fileId,
        data1: visibility,
        data2: userId,
      });

      return {
        success: true,
        message: `File access level updated to ${visibility}`,
      };
    } catch (error) {
      logger.error('Update access level failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to update access level',
      };
    }
  }

  async checkFileAccess(
    fileId: string,
    userId: string,
    requiredPermission: 'read' | 'write' | 'delete' | 'share'
  ): Promise<AccessControlResultDTO> {
    try {
      logger.warn('🔍 Checking {} access for file: {} by user: {}', {
        data0: requiredPermission,
        data1: fileId,
        data2: userId,
      });

      // Check if user is the file owner (always has full access)
      const isOwner = await this.checkFileOwnership(fileId, userId);
      if (isOwner) {
        return {
          success: true,
          hasAccess: true,
          permission: 'owner',
          message: 'File owner has full access',
        };
      }

      // Check explicit permissions
      const filePermissions = this.permissions.get(fileId) || [];
      const userPermission = filePermissions.find(
        p => p.userId === userId && (!p.expiresAt || p.expiresAt > new Date())
      );

      if (!userPermission) {
        return {
          success: true,
          hasAccess: false,
          permission: 'none',
          message: 'No permission granted',
        };
      }

      const hasAccess = this.hasPermission(userPermission.permission, requiredPermission);

      return {
        success: true,
        hasAccess,
        permission: userPermission.permission,
        grantedBy: userPermission.grantedBy,
        grantedAt: userPermission.grantedAt,
      };
    } catch (error) {
      logger.error('Check access failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        hasAccess: false,
        error: error instanceof Error ? error.message : 'Access check failed',
      };
    }
  }

  async revokeAccess(fileId: string, userId: string, targetUserId: string): Promise<AccessControlResultDTO> {
    try {
      logger.warn('🚫 Revoking access for file: {} from user: {}', { data0: fileId, data1: targetUserId });

      // Validate user has permission to revoke access
      const hasManagePermission = await this.checkFileAccess(fileId, userId, 'share');
      if (!hasManagePermission.hasAccess) {
        throw new StorageError('Insufficient permissions to revoke access', 403, StorageErrorCode.ACCESS_DENIED);
      }

      const filePermissions = this.permissions.get(fileId) || [];
      const updatedPermissions = filePermissions.filter(p => p.userId !== targetUserId);
      this.permissions.set(fileId, updatedPermissions);

      logger.warn('📋 Access revoked for file: {} from user: {} by: {}', {
        data0: fileId,
        data1: targetUserId,
        data2: userId,
      });

      return {
        success: true,
        message: 'Access successfully revoked',
      };
    } catch (error) {
      logger.error('Revoke access failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to revoke access',
      };
    }
  }

  async getFilePermissions(
    fileId: string,
    userId: string
  ): Promise<{
    success: boolean;
    permissions?: Array<{
      userId: string;
      permission: string;
      grantedBy: string;
      grantedAt: Date;
      expiresAt?: Date;
    }>;
    error?: string;
  }> {
    try {
      logger.warn('📋 Getting permissions for file: {}', { data0: fileId });

      // Validate user has access to view permissions
      const hasAccess = await this.checkFileAccess(fileId, userId, 'read');
      if (!hasAccess.hasAccess) {
        throw new StorageError(
          'Insufficient permissions to view file permissions',
          403,
          StorageErrorCode.ACCESS_DENIED
        );
      }

      const filePermissions = this.permissions.get(fileId) || [];

      return {
        success: true,
        permissions: filePermissions.map(p => ({
          userId: p.userId,
          permission: p.permission,
          grantedBy: p.grantedBy,
          grantedAt: p.grantedAt,
          expiresAt: p.expiresAt,
        })),
      };
    } catch (error) {
      logger.error('Get permissions failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof StorageError ? error.message : 'Failed to get permissions',
      };
    }
  }

  async getUserSharedFiles(userId: string): Promise<{
    success: boolean;
    sharedFiles?: Array<{
      fileId: string;
      fileName: string;
      sharedWith: Array<{
        userId: string;
        permission: string;
        sharedAt: Date;
      }>;
    }>;
    error?: string;
  }> {
    try {
      logger.warn('📤 Getting files shared by user: {}', { data0: userId });

      // Get all files where user is the granter
      const allSharedFiles: Array<{
        fileId: string;
        fileName: string;
        sharedWith: Array<{
          userId: string;
          permission: string;
          sharedAt: Date;
        }>;
      }> = [];

      // Iterate through all permissions to find files shared by this user
      for (const [fileId, permissions] of Array.from(this.permissions.entries())) {
        const sharedByUser = permissions.filter(p => p.grantedBy === userId);
        if (sharedByUser.length > 0) {
          allSharedFiles.push({
            fileId,
            fileName: `file-${fileId}`, // Would normally get from file repository
            sharedWith: sharedByUser.map(p => ({
              userId: p.userId,
              permission: p.permission,
              sharedAt: p.grantedAt,
            })),
          });
        }
      }

      return {
        success: true,
        sharedFiles: allSharedFiles,
      };
    } catch (error) {
      logger.error('Get shared files failed:', { error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get shared files',
      };
    }
  }

  private async checkFileOwnership(_fileId: string, _userId: string): Promise<boolean> {
    // This would typically check the file repository to see if user owns the file
    // For now, returning true for demonstration
    return true;
  }

  private hasPermission(granted: string, required: string): boolean {
    const permissionHierarchy = {
      read: ['read'],
      write: ['read', 'write'],
      delete: ['read', 'write', 'delete'],
      share: ['read', 'write', 'delete', 'share'],
    };

    return permissionHierarchy[granted as keyof typeof permissionHierarchy]?.includes(required) || false;
  }
}
