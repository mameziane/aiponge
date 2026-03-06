/**
 * Orchestration Session Repository
 * Handles CRUD operations for aic_orchestration_sessions.
 * Supports atomic JSONB merges for outputs tracking.
 */

import { eq, and, isNull, desc } from 'drizzle-orm';
import { getLogger } from '../../../config/service-urls';
import { orchestrationSessions } from '../../../schema/orchestration-session-schema';
import type {
  InsertOrchestrationSession,
  SelectOrchestrationSession,
} from '../../../schema/orchestration-session-schema';
import type { DatabaseConnection } from '../DatabaseConnectionFactory';

const logger = getLogger('orchestration-session-repository');

export class OrchestrationSessionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async create(data: InsertOrchestrationSession): Promise<SelectOrchestrationSession> {
    const [session] = await this.db.insert(orchestrationSessions).values(data).returning();
    logger.info('Orchestration session created', { sessionId: session.id, flowType: session.flowType });
    return session;
  }

  async getById(id: string): Promise<SelectOrchestrationSession | null> {
    const [session] = await this.db
      .select()
      .from(orchestrationSessions)
      .where(and(eq(orchestrationSessions.id, id), isNull(orchestrationSessions.deletedAt)));
    return session || null;
  }

  async getByIdAndCreator(id: string, creatorId: string): Promise<SelectOrchestrationSession | null> {
    const [session] = await this.db
      .select()
      .from(orchestrationSessions)
      .where(
        and(
          eq(orchestrationSessions.id, id),
          eq(orchestrationSessions.creatorId, creatorId),
          isNull(orchestrationSessions.deletedAt)
        )
      );
    return session || null;
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: Partial<InsertOrchestrationSession>
  ): Promise<SelectOrchestrationSession | null> {
    const [session] = await this.db
      .update(orchestrationSessions)
      .set({
        status,
        updatedAt: new Date(),
        ...extra,
      })
      .where(and(eq(orchestrationSessions.id, id), isNull(orchestrationSessions.deletedAt)))
      .returning();
    return session || null;
  }

  /**
   * Atomic JSONB merge for outputs — updates specific fields without overwriting others.
   */
  async updateOutputs(id: string, outputUpdates: Record<string, unknown>): Promise<SelectOrchestrationSession | null> {
    const session = await this.getById(id);
    if (!session) return null;

    const currentOutputs = (session.outputs as Record<string, unknown>) || {};
    const mergedOutputs = { ...currentOutputs, ...outputUpdates };

    const [updated] = await this.db
      .update(orchestrationSessions)
      .set({
        outputs: mergedOutputs as SelectOrchestrationSession['outputs'],
        updatedAt: new Date(),
      })
      .where(and(eq(orchestrationSessions.id, id), isNull(orchestrationSessions.deletedAt)))
      .returning();
    return updated || null;
  }

  async setPreviewTrackId(id: string, previewTrackId: string): Promise<void> {
    await this.db
      .update(orchestrationSessions)
      .set({ previewTrackId, updatedAt: new Date() })
      .where(and(eq(orchestrationSessions.id, id), isNull(orchestrationSessions.deletedAt)));
  }

  /**
   * Check for active sessions (one active session per creator)
   */
  async getActiveForCreator(creatorId: string): Promise<SelectOrchestrationSession | null> {
    const [session] = await this.db
      .select()
      .from(orchestrationSessions)
      .where(and(eq(orchestrationSessions.creatorId, creatorId), isNull(orchestrationSessions.deletedAt)))
      .orderBy(desc(orchestrationSessions.createdAt))
      .limit(1);

    // Only return if in an active (non-terminal) state
    if (session && !['confirmed', 'cancelled', 'failed'].includes(session.status)) {
      return session;
    }
    return null;
  }
}
