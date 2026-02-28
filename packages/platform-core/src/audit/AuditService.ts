import { sql } from 'drizzle-orm';
import { createLogger } from '../logging/logger.js';
import { createIntervalScheduler, type IntervalScheduler } from '../scheduling/IntervalScheduler.js';

const logger = createLogger('AuditService');

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'export' | 'login' | 'logout';

export interface AuditEntry {
  userId?: string;
  targetType: string;
  targetId?: string;
  action: AuditAction;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  serviceName: string;
  correlationId?: string;
}

export interface AuditPersister {
  insertBatch(entries: AuditEntry[]): Promise<void>;
}

export class AuditService {
  private buffer: AuditEntry[] = [];
  private flushScheduler: IntervalScheduler | null = null;
  private readonly maxBufferSize: number;
  private readonly flushIntervalMs: number;
  private persister: AuditPersister | null = null;

  constructor(options?: { maxBufferSize?: number; flushIntervalMs?: number }) {
    this.maxBufferSize = options?.maxBufferSize ?? 50;
    this.flushIntervalMs = options?.flushIntervalMs ?? 5000;
  }

  setPersister(persister: AuditPersister): void {
    this.persister = persister;
    if (!this.flushScheduler) {
      this.flushScheduler = createIntervalScheduler({
        name: 'audit-flush',
        serviceName: 'platform-core',
        intervalMs: this.flushIntervalMs,
        handler: () => this.flush(),
        register: false,
      });
      this.flushScheduler.start();
    }
  }

  log(entry: AuditEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
    }
  }

  logBatch(entries: AuditEntry[]): void {
    this.buffer.push(...entries);
    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.persister) return;

    const batch = this.buffer.splice(0);
    try {
      await this.persister.insertBatch(batch);
      logger.debug('Audit entries flushed', { count: batch.length });
    } catch (error) {
      logger.error('Failed to flush audit entries', { error: serializeError(error), count: batch.length });
      this.buffer.unshift(...batch);
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushScheduler) {
      this.flushScheduler.stop();
      this.flushScheduler = null;
    }
    await this.flush();
  }
}

interface DrizzleTx {
  execute(query: unknown): Promise<unknown>;
}

export async function logAuditInTransaction(tx: DrizzleTx, entry: AuditEntry): Promise<void> {
  await tx.execute(sql`
    INSERT INTO usr_audit_logs (id, user_id, target_type, target_id, action, changes, metadata, service_name, correlation_id, created_at)
    VALUES (
      gen_random_uuid(),
      ${entry.userId ?? null},
      ${entry.targetType},
      ${entry.targetId ?? null},
      ${entry.action},
      ${entry.changes ? JSON.stringify(entry.changes) : null}::jsonb,
      ${JSON.stringify(entry.metadata || {})}::jsonb,
      ${entry.serviceName},
      ${entry.correlationId ?? null},
      NOW()
    )
  `);
}

let globalAuditService: AuditService | null = null;

export function getAuditService(): AuditService {
  if (!globalAuditService) {
    globalAuditService = new AuditService();
  }
  return globalAuditService;
}

export function initAuditService(
  persister: AuditPersister,
  options?: { maxBufferSize?: number; flushIntervalMs?: number }
): AuditService {
  globalAuditService = new AuditService(options);
  globalAuditService.setPersister(persister);
  return globalAuditService;
}
