/**
 * Safety Repository Implementation
 * Handles risk flags and GDPR data requests for admin safety monitoring
 */

import { eq, desc, and, count, gte } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  usrRiskFlags,
  usrDataRequests,
  RiskFlag,
  DataRequest,
  RiskSeverity,
  DataRequestType,
  DataRequestStatus,
} from '../database/schemas/profile-schema';
import { users } from '../database/schemas/user-schema';
import { getLogger } from '../../config/service-urls';
import { DATA_REQUEST_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('safety-repository');

export interface RiskStatsResult {
  totalFlags: number;
  unresolvedFlags: number;
  bySeverity: Record<string, number>;
  last24Hours: number;
  last7Days: number;
}

export interface ComplianceStatsResult {
  totalRequests: number;
  pendingRequests: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  averageProcessingDays: number | null;
}

export interface RiskFlagWithUser extends RiskFlag {
  userEmail?: string;
}

export interface DataRequestWithUser extends DataRequest {
  userEmail?: string;
}

export class SafetyRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // =====================
  // RISK FLAGS
  // =====================

  async createRiskFlag(data: {
    userId: string;
    severity: RiskSeverity;
    type: string;
    description: string;
    sourceContent?: string;
    sourceType?: string;
    sourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RiskFlag> {
    const [flag] = await this.db
      .insert(usrRiskFlags)
      .values({
        userId: data.userId,
        severity: data.severity,
        type: data.type,
        description: data.description,
        sourceContent: data.sourceContent,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        metadata: data.metadata || {},
      })
      .returning();

    logger.info('Risk flag created', { flagId: flag.id, userId: data.userId, severity: data.severity });
    return flag;
  }

  async getRiskStats(): Promise<RiskStatsResult> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalResult] = await this.db.select({ count: count() }).from(usrRiskFlags);

    const [unresolvedResult] = await this.db
      .select({ count: count() })
      .from(usrRiskFlags)
      .where(eq(usrRiskFlags.resolved, false));

    const [last24HoursResult] = await this.db
      .select({ count: count() })
      .from(usrRiskFlags)
      .where(gte(usrRiskFlags.createdAt, yesterday));

    const [last7DaysResult] = await this.db
      .select({ count: count() })
      .from(usrRiskFlags)
      .where(gte(usrRiskFlags.createdAt, lastWeek));

    const severityCounts = await this.db
      .select({
        severity: usrRiskFlags.severity,
        count: count(),
      })
      .from(usrRiskFlags)
      .groupBy(usrRiskFlags.severity);

    const bySeverity: Record<string, number> = {};
    for (const row of severityCounts) {
      bySeverity[row.severity] = row.count;
    }

    return {
      totalFlags: totalResult.count,
      unresolvedFlags: unresolvedResult.count,
      bySeverity,
      last24Hours: last24HoursResult.count,
      last7Days: last7DaysResult.count,
    };
  }

  async getRiskFlags(options: {
    resolved?: boolean;
    severity?: RiskSeverity;
    limit?: number;
    offset?: number;
  }): Promise<RiskFlagWithUser[]> {
    const conditions = [];

    if (options.resolved !== undefined) {
      conditions.push(eq(usrRiskFlags.resolved, options.resolved));
    }

    if (options.severity) {
      conditions.push(eq(usrRiskFlags.severity, options.severity));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    let results;
    if (whereCondition) {
      results = await this.db
        .select({
          flag: usrRiskFlags,
          userEmail: users.email,
        })
        .from(usrRiskFlags)
        .leftJoin(users, eq(usrRiskFlags.userId, users.id))
        .where(whereCondition)
        .orderBy(desc(usrRiskFlags.createdAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);
    } else {
      results = await this.db
        .select({
          flag: usrRiskFlags,
          userEmail: users.email,
        })
        .from(usrRiskFlags)
        .leftJoin(users, eq(usrRiskFlags.userId, users.id))
        .orderBy(desc(usrRiskFlags.createdAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);
    }

    return results.map(r => ({
      ...r.flag,
      userEmail: r.userEmail ?? undefined,
    }));
  }

  async resolveRiskFlag(
    flagId: string,
    resolvedBy: string,
    resolution: string,
    notes?: string
  ): Promise<RiskFlag | null> {
    const [flag] = await this.db
      .update(usrRiskFlags)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        resolution,
        notes,
      })
      .where(eq(usrRiskFlags.id, flagId))
      .returning();

    if (flag) {
      logger.info('Risk flag resolved', { flagId, resolvedBy, resolution });
    }

    return flag || null;
  }

  async getRiskFlagById(flagId: string): Promise<RiskFlagWithUser | null> {
    const [result] = await this.db
      .select({
        flag: usrRiskFlags,
        userEmail: users.email,
      })
      .from(usrRiskFlags)
      .leftJoin(users, eq(usrRiskFlags.userId, users.id))
      .where(eq(usrRiskFlags.id, flagId));

    if (!result) return null;

    return {
      ...result.flag,
      userEmail: result.userEmail ?? undefined,
    };
  }

  // =====================
  // DATA REQUESTS (GDPR)
  // =====================

  async createDataRequest(data: {
    userId: string;
    type: DataRequestType;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<DataRequest> {
    const [request] = await this.db
      .insert(usrDataRequests)
      .values({
        userId: data.userId,
        type: data.type,
        reason: data.reason,
        metadata: data.metadata || {},
      })
      .returning();

    logger.info('Data request created', { requestId: request.id, userId: data.userId, type: data.type });
    return request;
  }

  async getComplianceStats(): Promise<ComplianceStatsResult> {
    const [totalResult] = await this.db.select({ count: count() }).from(usrDataRequests);

    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(usrDataRequests)
      .where(eq(usrDataRequests.status, DATA_REQUEST_STATUS.PENDING));

    const typeCounts = await this.db
      .select({
        type: usrDataRequests.type,
        count: count(),
      })
      .from(usrDataRequests)
      .groupBy(usrDataRequests.type);

    const statusCounts = await this.db
      .select({
        status: usrDataRequests.status,
        count: count(),
      })
      .from(usrDataRequests)
      .groupBy(usrDataRequests.status);

    const byType: Record<string, number> = {};
    for (const row of typeCounts) {
      byType[row.type] = row.count;
    }

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = row.count;
    }

    return {
      totalRequests: totalResult.count,
      pendingRequests: pendingResult.count,
      byType,
      byStatus,
      averageProcessingDays: null,
    };
  }

  async getDataRequests(options: {
    type?: DataRequestType;
    status?: DataRequestStatus;
    limit?: number;
    offset?: number;
  }): Promise<DataRequestWithUser[]> {
    const conditions = [];

    if (options.type) {
      conditions.push(eq(usrDataRequests.type, options.type));
    }

    if (options.status) {
      conditions.push(eq(usrDataRequests.status, options.status));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    let results;
    if (whereCondition) {
      results = await this.db
        .select({
          request: usrDataRequests,
          userEmail: users.email,
        })
        .from(usrDataRequests)
        .leftJoin(users, eq(usrDataRequests.userId, users.id))
        .where(whereCondition)
        .orderBy(desc(usrDataRequests.requestedAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);
    } else {
      results = await this.db
        .select({
          request: usrDataRequests,
          userEmail: users.email,
        })
        .from(usrDataRequests)
        .leftJoin(users, eq(usrDataRequests.userId, users.id))
        .orderBy(desc(usrDataRequests.requestedAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);
    }

    return results.map(r => ({
      ...r.request,
      userEmail: r.userEmail ?? undefined,
    }));
  }

  async updateDataRequestStatus(
    requestId: string,
    status: DataRequestStatus,
    processedBy: string,
    options?: {
      rejectionReason?: string;
      exportUrl?: string;
      exportExpiresAt?: Date;
      notes?: string;
    }
  ): Promise<DataRequest | null> {
    const updateData: Record<string, unknown> = {
      status,
      processedBy,
      processedAt: new Date(),
    };

    if (status === DATA_REQUEST_STATUS.COMPLETED) {
      updateData.completedAt = new Date();
    }

    if (options?.rejectionReason !== undefined) {
      updateData.rejectionReason = options.rejectionReason;
    }

    if (options?.exportUrl !== undefined) {
      updateData.exportUrl = options.exportUrl;
      updateData.exportExpiresAt = options.exportExpiresAt;
    }

    if (options?.notes !== undefined) {
      updateData.notes = options.notes;
    }

    const [request] = await this.db
      .update(usrDataRequests)
      .set(updateData)
      .where(eq(usrDataRequests.id, requestId))
      .returning();

    if (request) {
      logger.info('Data request status updated', { requestId, status, processedBy });
    }

    return request || null;
  }

  async getDataRequestById(requestId: string): Promise<DataRequestWithUser | null> {
    const [result] = await this.db
      .select({
        request: usrDataRequests,
        userEmail: users.email,
      })
      .from(usrDataRequests)
      .leftJoin(users, eq(usrDataRequests.userId, users.id))
      .where(eq(usrDataRequests.id, requestId));

    if (!result) return null;

    return {
      ...result.request,
      userEmail: result.userEmail ?? undefined,
    };
  }
}
