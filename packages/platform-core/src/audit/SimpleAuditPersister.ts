import { sql } from 'drizzle-orm';
import type { AuditEntry, AuditPersister } from './AuditService.js';

interface DrizzleDb {
  execute(query: unknown): Promise<unknown>;
}

export class SimpleAuditPersister implements AuditPersister {
  constructor(private db: DrizzleDb) {}

  async insertBatch(entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const values = entries.map(
      e =>
        sql`(gen_random_uuid(), ${e.userId ?? null}, ${e.targetType}, ${e.targetId ?? null}, ${e.action}, ${e.changes ? JSON.stringify(e.changes) : null}::jsonb, ${JSON.stringify(e.metadata || {})}::jsonb, ${e.serviceName}, ${e.correlationId ?? null}, NOW())`
    );

    await this.db.execute(sql`
      INSERT INTO usr_audit_logs (id, user_id, target_type, target_id, action, changes, metadata, service_name, correlation_id, created_at)
      VALUES ${sql.join(values, sql`, `)}
    `);
  }
}
