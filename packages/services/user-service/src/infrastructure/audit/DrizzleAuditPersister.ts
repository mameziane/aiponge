import type { AuditPersister, AuditEntry } from '@aiponge/platform-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { usrAuditLogs } from '../database/schemas/audit-schema.js';

export class DrizzleAuditPersister implements AuditPersister {
  constructor(private db: NodePgDatabase<Record<string, unknown>>) {}

  async insertBatch(entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const rows = entries.map(e => ({
      userId: e.userId ?? null,
      targetType: e.targetType,
      targetId: e.targetId ?? null,
      action: e.action,
      changes: e.changes ?? null,
      metadata: e.metadata ?? {},
      serviceName: e.serviceName,
      correlationId: e.correlationId ?? null,
    }));

    await this.db.insert(usrAuditLogs).values(rows);
  }
}
