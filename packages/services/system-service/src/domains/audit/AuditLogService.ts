import { eq, and, desc, between, sql } from 'drizzle-orm';
import { sysAuditLog, type NewAuditLogEntry, type AuditLogEntry } from '../../schema/system-schema';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('system-audit-log-service');

export type ActorType = 'user' | 'admin' | 'librarian' | 'system' | 'service';
export type SeverityLevel = 'info' | 'warn' | 'error' | 'critical';

export interface RecordAuditParams {
  actorId: string;
  actorType: ActorType;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  severity?: SeverityLevel;
}

export interface AuditQueryParams {
  actorId?: string;
  actorType?: ActorType;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  severity?: SeverityLevel;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditLogService {
  constructor(private readonly db: import('drizzle-orm/node-postgres').NodePgDatabase<Record<string, unknown>>) {}

  async recordAudit(params: RecordAuditParams): Promise<AuditLogEntry> {
    const [entry] = await this.db
      .insert(sysAuditLog)
      .values({
        actorId: params.actorId,
        actorType: params.actorType || 'user',
        action: params.action,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        metadata: params.metadata || {},
        correlationId: params.correlationId || null,
        severity: params.severity || 'info',
      })
      .returning();

    logger.debug('Audit entry recorded', {
      action: params.action,
      actorType: params.actorType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    });

    return entry;
  }

  async queryAuditLog(params: AuditQueryParams): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const conditions = [];

    if (params.actorId) conditions.push(eq(sysAuditLog.actorId, params.actorId));
    if (params.actorType) conditions.push(eq(sysAuditLog.actorType, params.actorType));
    if (params.resourceType) conditions.push(eq(sysAuditLog.resourceType, params.resourceType));
    if (params.resourceId) conditions.push(eq(sysAuditLog.resourceId, params.resourceId));
    if (params.action) conditions.push(eq(sysAuditLog.action, params.action));
    if (params.severity) conditions.push(eq(sysAuditLog.severity, params.severity));
    if (params.startDate && params.endDate) {
      conditions.push(between(sysAuditLog.createdAt, params.startDate, params.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [entries, countResult] = await Promise.all([
      this.db
        .select()
        .from(sysAuditLog)
        .where(whereClause)
        .orderBy(desc(sysAuditLog.createdAt))
        .limit(params.limit || 50)
        .offset(params.offset || 0),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(sysAuditLog)
        .where(whereClause),
    ]);

    return {
      entries,
      total: Number(countResult[0]?.count) || 0,
    };
  }

  async getResourceHistory(resourceType: string, resourceId: string, limit: number = 50): Promise<AuditLogEntry[]> {
    return this.db
      .select()
      .from(sysAuditLog)
      .where(and(eq(sysAuditLog.resourceType, resourceType), eq(sysAuditLog.resourceId, resourceId)))
      .orderBy(desc(sysAuditLog.createdAt))
      .limit(limit);
  }

  async getActorActivity(actorId: string, days: number = 30, limit: number = 100): Promise<AuditLogEntry[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.db
      .select()
      .from(sysAuditLog)
      .where(and(eq(sysAuditLog.actorId, actorId), between(sysAuditLog.createdAt, startDate, new Date())))
      .orderBy(desc(sysAuditLog.createdAt))
      .limit(limit);
  }
}
