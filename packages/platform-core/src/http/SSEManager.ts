import type { Response, Request } from 'express';
import { createLogger } from '../logging/logger.js';
import { sendErrorResponse } from '../error-handling/errors.js';
import { createIntervalScheduler, type IntervalScheduler } from '../scheduling/IntervalScheduler.js';

const logger = createLogger('sse-manager');

export interface SSEClient {
  id: string;
  userId?: string;
  res: Response;
  connectedAt: Date;
}

const MAX_BUFFER_SIZE = 65536;

export class SSEManager {
  private clients = new Map<string, SSEClient>();
  private heartbeatScheduler: IntervalScheduler | null = null;
  private readonly heartbeatMs: number;
  private readonly maxClients: number;

  constructor(heartbeatMs?: number) {
    this.heartbeatMs = heartbeatMs || parseInt(process.env.SSE_HEARTBEAT_MS || '30000');
    this.maxClients = parseInt(process.env.SSE_MAX_CLIENTS || '10000');
    this.startHeartbeat();
  }

  addClient(req: Request, res: Response, clientId: string, userId?: string): SSEClient | null {
    if (this.clients.size >= this.maxClients) {
      sendErrorResponse(res, 503, 'Too many SSE connections');
      return null;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(':ok\n\n');

    const client: SSEClient = { id: clientId, userId, res, connectedAt: new Date() };
    this.clients.set(clientId, client);

    req.on('close', () => {
      this.clients.delete(clientId);
      logger.debug('SSE client disconnected', { clientId, userId });
    });

    logger.debug('SSE client connected', { clientId, userId, total: this.clients.size });
    return client;
  }

  sendToClient(clientId: string, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    if (client.res.writableLength > MAX_BUFFER_SIZE) {
      logger.warn('SSE client buffer overloaded, disconnecting', {
        clientId,
        userId: client.userId,
        bufferSize: client.res.writableLength,
      });
      this.removeClient(clientId);
      return false;
    }

    try {
      const ok = client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (!ok) {
        logger.debug('SSE backpressure on client', { clientId });
      }
      return true;
    } catch {
      this.removeClient(clientId);
      return false;
    }
  }

  sendToUser(userId: string, event: string, data: unknown): number {
    let sent = 0;
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        if (this.sendToClient(client.id, event, data)) sent++;
      }
    }
    return sent;
  }

  broadcast(event: string, data: unknown): number {
    let sent = 0;
    for (const client of this.clients.values()) {
      if (this.sendToClient(client.id, event, data)) sent++;
    }
    return sent;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getUserClients(userId: string): SSEClient[] {
    return Array.from(this.clients.values()).filter(c => c.userId === userId);
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.res.end();
      } catch {
        /* already closed */
      }
      this.clients.delete(clientId);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatScheduler = createIntervalScheduler({
      name: 'sse-heartbeat',
      serviceName: 'platform-core',
      intervalMs: this.heartbeatMs,
      handler: () => {
        const dead: string[] = [];
        for (const [id, client] of this.clients) {
          if (client.res.writableLength > MAX_BUFFER_SIZE) {
            dead.push(id);
            continue;
          }
          try {
            client.res.write(':heartbeat\n\n');
          } catch {
            dead.push(id);
          }
        }
        for (const id of dead) this.removeClient(id);
        if (dead.length > 0) {
          logger.debug('Cleaned dead SSE connections', { removed: dead.length, remaining: this.clients.size });
        }
      },
      register: false,
    });
    this.heartbeatScheduler.start();
  }

  shutdown(): void {
    if (this.heartbeatScheduler) {
      this.heartbeatScheduler.stop();
      this.heartbeatScheduler = null;
    }
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // Ignore errors when closing SSE client connections during shutdown
      }
    }
    this.clients.clear();
    logger.info('SSE manager shut down');
  }
}

let defaultManager: SSEManager | null = null;

export function getSSEManager(): SSEManager {
  if (!defaultManager) {
    defaultManager = new SSEManager();
  }
  return defaultManager;
}
