/**
 * FilePermissions Value Object - Storage Service Domain Model
 * Represents immutable file access control permissions with role-based and attribute-based access control
 */

import { StorageError } from '../../application/errors';

export type PermissionAction = 'read' | 'write' | 'delete' | 'share' | 'admin';
export type PermissionSubject = 'owner' | 'group' | 'public' | 'authenticated' | 'role' | 'user';
export type AccessLevel = 'none' | 'read' | 'write' | 'full';

export interface PermissionRule {
  subject: PermissionSubject;
  subjectId?: string; // User ID, Role ID, or Group ID
  actions: PermissionAction[];
  conditions?: PermissionCondition[];
  expiresAt?: Date;
  grantedAt: Date;
  grantedBy: string;
}

export interface PermissionCondition {
  type: 'ip_range' | 'time_range' | 'location' | 'device' | 'mfa_required';
  value: string | { [key: string]: unknown };
}

export interface ShareableLink {
  id: string;
  token: string;
  actions: PermissionAction[];
  expiresAt?: Date;
  passwordProtected: boolean;
  downloadLimit?: number;
  downloadCount: number;
  createdAt: Date;
  createdBy: string;
}

export class FilePermissions {
  readonly userId: string;
  readonly userActions: PermissionAction[];
  readonly isPublic: boolean;
  readonly inheritFromParent: boolean;
  readonly rules: PermissionRule[];
  readonly shareableLinks: ShareableLink[];
  readonly defaultAccess: AccessLevel;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(
    userId: string,
    options: {
      userActions?: PermissionAction[];
      isPublic?: boolean;
      inheritFromParent?: boolean;
      rules?: PermissionRule[];
      shareableLinks?: ShareableLink[];
      defaultAccess?: AccessLevel;
      createdAt?: Date;
      updatedAt?: Date;
    } = {}
  ) {
    this.validateInputs(userId, options);

    this.userId = userId;
    this.userActions = options.userActions || ['read', 'write', 'delete', 'share', 'admin'];
    this.isPublic = options.isPublic || false;
    this.inheritFromParent = options.inheritFromParent || false;
    this.rules = options.rules || [];
    this.shareableLinks = options.shareableLinks || [];
    this.defaultAccess = options.defaultAccess || 'none';
    this.createdAt = options.createdAt || new Date();
    this.updatedAt = options.updatedAt || new Date();
  }

  private validateInputs(
    userId: string,
    options: {
      userActions?: PermissionAction[];
      rules?: PermissionRule[];
      shareableLinks?: ShareableLink[];
      defaultAccess?: AccessLevel;
    }
  ): void {
    if (!userId || userId.trim().length === 0) {
      throw StorageError.invalidPermission('userId cannot be empty');
    }

    // Validate user actions
    if (options.userActions) {
      const validActions: PermissionAction[] = ['read', 'write', 'delete', 'share', 'admin'];
      const invalidActions = options.userActions.filter(action => !validActions.includes(action));
      if (invalidActions.length > 0) {
        throw StorageError.invalidPermission(`invalid user actions: ${invalidActions.join(', ')}`);
      }
    }

    // Validate rules
    if (options.rules) {
      options.rules.forEach((rule, index) => this.validateRule(rule, index));
    }

    // Validate shareable links
    if (options.shareableLinks) {
      options.shareableLinks.forEach((link, index) => this.validateShareableLink(link, index));
    }

    // Validate default access
    if (options.defaultAccess) {
      const validAccessLevels: AccessLevel[] = ['none', 'read', 'write', 'full'];
      if (!validAccessLevels.includes(options.defaultAccess)) {
        throw StorageError.invalidPermission(`invalid defaultAccess: ${options.defaultAccess}`);
      }
    }
  }

  private validateRule(rule: PermissionRule, index: number): void {
    const validSubjects: PermissionSubject[] = ['owner', 'group', 'public', 'authenticated', 'role', 'user'];
    if (!validSubjects.includes(rule.subject)) {
      throw StorageError.invalidPermission(`invalid subject in rule ${index}: ${rule.subject}`);
    }

    if (['role', 'user', 'group'].includes(rule.subject) && !rule.subjectId) {
      throw StorageError.invalidPermission(`subjectId is required for subject '${rule.subject}' in rule ${index}`);
    }

    const validActions: PermissionAction[] = ['read', 'write', 'delete', 'share', 'admin'];
    const invalidActions = rule.actions.filter(action => !validActions.includes(action));
    if (invalidActions.length > 0) {
      throw StorageError.invalidPermission(`invalid actions in rule ${index}: ${invalidActions.join(', ')}`);
    }

    if (rule.expiresAt && rule.expiresAt <= rule.grantedAt) {
      throw StorageError.invalidPermission(`expiresAt must be after grantedAt in rule ${index}`);
    }

    if (!rule.grantedBy || rule.grantedBy.trim().length === 0) {
      throw StorageError.invalidPermission(`grantedBy cannot be empty in rule ${index}`);
    }
  }

  private validateShareableLink(link: ShareableLink, index: number): void {
    if (!link.id || link.id.trim().length === 0) {
      throw StorageError.invalidPermission(`shareable link id cannot be empty at index ${index}`);
    }

    if (!link.token || link.token.trim().length === 0) {
      throw StorageError.invalidPermission(`shareable link token cannot be empty at index ${index}`);
    }

    const validActions: PermissionAction[] = ['read', 'write', 'delete', 'share', 'admin'];
    const invalidActions = link.actions.filter(action => !validActions.includes(action));
    if (invalidActions.length > 0) {
      throw StorageError.invalidPermission(`invalid actions in shareable link ${index}: ${invalidActions.join(', ')}`);
    }

    if (link.expiresAt && link.expiresAt <= link.createdAt) {
      throw StorageError.invalidPermission(`expiresAt must be after createdAt in shareable link ${index}`);
    }

    if (link.downloadLimit !== undefined && link.downloadLimit < 0) {
      throw StorageError.invalidPermission(`downloadLimit cannot be negative in shareable link ${index}`);
    }

    if (link.downloadCount < 0) {
      throw StorageError.invalidPermission(`downloadCount cannot be negative in shareable link ${index}`);
    }
  }

  /**
   * Check if a user has permission to perform an action
   */
  hasPermission(
    checkUserId: string,
    action: PermissionAction,
    context: {
      userRoles?: string[];
      userGroups?: string[];
      ipAddress?: string;
      timestamp?: Date;
      location?: string;
      deviceId?: string;
      hasMFA?: boolean;
    } = {}
  ): boolean {
    const currentTime = context.timestamp || new Date();

    // File owner always has all permissions (unless explicitly restricted)
    if (checkUserId === this.userId && this.userActions.includes(action)) {
      return true;
    }

    // Check public access
    if (this.isPublic && this.getPublicPermissions().includes(action)) {
      return true;
    }

    // Check authenticated user default access
    if (checkUserId && this.defaultAccess !== 'none') {
      const allowedActions = this.getActionsForAccessLevel(this.defaultAccess);
      if (allowedActions.includes(action)) {
        return true;
      }
    }

    // Check specific rules
    for (const rule of this.rules) {
      if (
        this.doesRuleApply(rule, checkUserId, context) &&
        this.isRuleActive(rule, currentTime) &&
        rule.actions.includes(action)
      ) {
        // Check conditions
        if (this.checkConditions(rule.conditions || [], context)) {
          return true;
        }
      }
    }

    return false;
  }

  private doesRuleApply(
    rule: PermissionRule,
    checkUserId: string,
    context: {
      userRoles?: string[];
      userGroups?: string[];
    }
  ): boolean {
    switch (rule.subject) {
      case 'owner':
        return checkUserId === this.userId;
      case 'public':
        return true;
      case 'authenticated':
        return !!checkUserId;
      case 'user':
        return checkUserId === rule.subjectId;
      case 'role':
        return context.userRoles?.includes(rule.subjectId || '') || false;
      case 'group':
        return context.userGroups?.includes(rule.subjectId || '') || false;
      default:
        return false;
    }
  }

  private isRuleActive(rule: PermissionRule, currentTime: Date): boolean {
    return !rule.expiresAt || rule.expiresAt > currentTime;
  }

  private checkConditions(
    conditions: PermissionCondition[],
    context: {
      ipAddress?: string;
      timestamp?: Date;
      location?: string;
      deviceId?: string;
      hasMFA?: boolean;
    }
  ): boolean {
    return conditions.every(condition => this.checkCondition(condition, context));
  }

  private checkCondition(
    condition: PermissionCondition,
    context: {
      ipAddress?: string;
      timestamp?: Date;
      location?: string;
      deviceId?: string;
      hasMFA?: boolean;
    }
  ): boolean {
    switch (condition.type) {
      case 'ip_range':
        return this.checkIpRange(condition.value as string, context.ipAddress);
      case 'time_range':
        return this.checkTimeRange(condition.value as { start: string; end: string }, context.timestamp);
      case 'location':
        return this.checkLocation(condition.value as string, context.location);
      case 'device':
        return this.checkDevice(condition.value as string, context.deviceId);
      case 'mfa_required':
        return context.hasMFA === true;
      default:
        return true; // Unknown conditions default to allow
    }
  }

  private checkIpRange(allowedRange: string, userIp?: string): boolean {
    if (!userIp) return false;
    // Simplified IP range check - in real implementation, use proper CIDR checking
    return allowedRange === '*' || userIp.startsWith(allowedRange.split('/')[0]);
  }

  private checkTimeRange(timeRange: { start: string; end: string }, timestamp?: Date): boolean {
    if (!timestamp) return false;
    const currentHour = timestamp.getHours();
    const startHour = parseInt(timeRange.start.split(':')[0]);
    const endHour = parseInt(timeRange.end.split(':')[0]);
    return currentHour >= startHour && currentHour <= endHour;
  }

  private checkLocation(allowedLocation: string, userLocation?: string): boolean {
    if (!userLocation) return false;
    return allowedLocation === '*' || userLocation.toLowerCase().includes(allowedLocation.toLowerCase());
  }

  private checkDevice(allowedDevice: string, deviceId?: string): boolean {
    if (!deviceId) return false;
    return allowedDevice === '*' || deviceId === allowedDevice;
  }

  private getPublicPermissions(): PermissionAction[] {
    const publicRule = this.rules.find(rule => rule.subject === 'public');
    return publicRule ? publicRule.actions : [];
  }

  private getActionsForAccessLevel(level: AccessLevel): PermissionAction[] {
    switch (level) {
      case 'none':
        return [];
      case 'read':
        return ['read'];
      case 'write':
        return ['read', 'write'];
      case 'full':
        return ['read', 'write', 'delete', 'share'];
      default:
        return [];
    }
  }

  /**
   * Check if a shareable link is valid and has permission
   */
  hasShareableLinkPermission(
    token: string,
    action: PermissionAction,
    password?: string
  ): {
    allowed: boolean;
    reason?: string;
    link?: ShareableLink;
  } {
    const link = this.shareableLinks.find(l => l.token === token);

    if (!link) {
      return { allowed: false, reason: 'Invalid token' };
    }

    if (link.expiresAt && link.expiresAt <= new Date()) {
      return { allowed: false, reason: 'Link has expired', link };
    }

    if (link.passwordProtected && !password) {
      return { allowed: false, reason: 'Password required', link };
    }

    if (link.downloadLimit !== undefined && link.downloadCount >= link.downloadLimit) {
      return { allowed: false, reason: 'Download limit exceeded', link };
    }

    if (!link.actions.includes(action)) {
      return { allowed: false, reason: 'Action not permitted', link };
    }

    return { allowed: true, link };
  }

  /**
   * Add a permission rule
   */
  addRule(rule: Omit<PermissionRule, 'grantedAt'>): FilePermissions {
    const newRule: PermissionRule = {
      ...rule,
      grantedAt: new Date(),
    };

    this.validateRule(newRule, this.rules.length);

    return new FilePermissions(this.userId, {
      userActions: this.userActions,
      isPublic: this.isPublic,
      inheritFromParent: this.inheritFromParent,
      rules: [...this.rules, newRule],
      shareableLinks: this.shareableLinks,
      defaultAccess: this.defaultAccess,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Remove a permission rule
   */
  removeRule(predicate: (_rule: PermissionRule) => boolean): FilePermissions {
    const filteredRules = this.rules.filter(rule => !predicate(rule));

    return new FilePermissions(this.userId, {
      userActions: this.userActions,
      isPublic: this.isPublic,
      inheritFromParent: this.inheritFromParent,
      rules: filteredRules,
      shareableLinks: this.shareableLinks,
      defaultAccess: this.defaultAccess,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Create a shareable link
   */
  createShareableLink(
    id: string,
    token: string,
    actions: PermissionAction[],
    createdBy: string,
    options: {
      expiresAt?: Date;
      passwordProtected?: boolean;
      downloadLimit?: number;
    } = {}
  ): FilePermissions {
    const newLink: ShareableLink = {
      id,
      token,
      actions,
      expiresAt: options.expiresAt,
      passwordProtected: options.passwordProtected || false,
      downloadLimit: options.downloadLimit,
      downloadCount: 0,
      createdAt: new Date(),
      createdBy,
    };

    this.validateShareableLink(newLink, this.shareableLinks.length);

    return new FilePermissions(this.userId, {
      userActions: this.userActions,
      isPublic: this.isPublic,
      inheritFromParent: this.inheritFromParent,
      rules: this.rules,
      shareableLinks: [...this.shareableLinks, newLink],
      defaultAccess: this.defaultAccess,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Remove a shareable link
   */
  removeShareableLink(linkId: string): FilePermissions {
    const filteredLinks = this.shareableLinks.filter(link => link.id !== linkId);

    return new FilePermissions(this.userId, {
      userActions: this.userActions,
      isPublic: this.isPublic,
      inheritFromParent: this.inheritFromParent,
      rules: this.rules,
      shareableLinks: filteredLinks,
      defaultAccess: this.defaultAccess,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Update public visibility
   */
  withPublicVisibility(isPublic: boolean): FilePermissions {
    return new FilePermissions(this.userId, {
      userActions: this.userActions,
      isPublic,
      inheritFromParent: this.inheritFromParent,
      rules: this.rules,
      shareableLinks: this.shareableLinks,
      defaultAccess: this.defaultAccess,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Update default access level
   */
  withDefaultAccess(defaultAccess: AccessLevel): FilePermissions {
    return new FilePermissions(this.userId, {
      userActions: this.userActions,
      isPublic: this.isPublic,
      inheritFromParent: this.inheritFromParent,
      rules: this.rules,
      shareableLinks: this.shareableLinks,
      defaultAccess,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Get all users with specific permission
   */
  getUsersWithPermission(action: PermissionAction): string[] {
    const users = new Set<string>();

    // Add file owner if they have the permission
    if (this.userActions.includes(action)) {
      users.add(this.userId);
    }

    // Add users from rules
    this.rules.forEach(rule => {
      if (rule.actions.includes(action) && rule.subject === 'user' && rule.subjectId) {
        const currentTime = new Date();
        if (this.isRuleActive(rule, currentTime)) {
          users.add(rule.subjectId);
        }
      }
    });

    return Array.from(users);
  }

  /**
   * Get permission summary
   */
  getSummary(): {
    userId: string;
    isPublic: boolean;
    defaultAccess: AccessLevel;
    rulesCount: number;
    shareableLinksCount: number;
    activeShareableLinksCount: number;
    expiredRulesCount: number;
  } {
    const currentTime = new Date();

    const expiredRules = this.rules.filter(rule => rule.expiresAt && rule.expiresAt <= currentTime);

    const activeLinks = this.shareableLinks.filter(link => !link.expiresAt || link.expiresAt > currentTime);

    return {
      userId: this.userId,
      isPublic: this.isPublic,
      defaultAccess: this.defaultAccess,
      rulesCount: this.rules.length,
      shareableLinksCount: this.shareableLinks.length,
      activeShareableLinksCount: activeLinks.length,
      expiredRulesCount: expiredRules.length,
    };
  }

  /**
   * Static factory methods
   */
  static createPrivate(userId: string): FilePermissions {
    return new FilePermissions(userId, {
      isPublic: false,
      defaultAccess: 'none',
    });
  }

  static createPublicRead(userId: string): FilePermissions {
    return new FilePermissions(userId, {
      isPublic: true,
      defaultAccess: 'read',
      rules: [
        {
          subject: 'public',
          actions: ['read'],
          grantedAt: new Date(),
          grantedBy: userId,
        },
      ],
    });
  }

  static createShared(fileUserId: string, sharedWithUserIds: string[]): FilePermissions {
    const rules: PermissionRule[] = sharedWithUserIds.map(sharedUserId => ({
      subject: 'user' as PermissionSubject,
      subjectId: sharedUserId,
      actions: ['read'] as PermissionAction[],
      grantedAt: new Date(),
      grantedBy: fileUserId,
    }));

    return new FilePermissions(fileUserId, {
      isPublic: false,
      defaultAccess: 'none',
      rules,
    });
  }

  /**
   * Equality comparison
   */
  equals(other: FilePermissions): boolean {
    return (
      this.userId === other.userId &&
      this.isPublic === other.isPublic &&
      this.defaultAccess === other.defaultAccess &&
      JSON.stringify(this.rules.sort()) === JSON.stringify(other.rules.sort()) &&
      JSON.stringify(this.shareableLinks.sort()) === JSON.stringify(other.shareableLinks.sort())
    );
  }
}
