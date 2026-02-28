import type { Request, Response } from 'express';
import type express from 'express';
import { getSSEManager, serializeError } from '@aiponge/platform-core';
import type { GatewayAppContext } from './context';

export function setupSse(app: express.Application, ctx: GatewayAppContext): void {
  app.get('/api/v1/events', (req: Request, res: Response) => {
    const userId = (req as unknown as Record<string, unknown>).userId as string | undefined || ((req as unknown as Record<string, unknown>).user as Record<string, unknown> | undefined)?.id as string | undefined;
    const clientId = `${userId || 'anon'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sseManager = getSSEManager();
    sseManager.addClient(req, res, clientId, userId);
  });

  void (async () => {
    try {
      const { getSharedEventBusClient } = await import('@aiponge/platform-core');
      const eventBus = getSharedEventBusClient('api-gateway');

      const bridgeEvents = [
        'music.generation.completed',
        'music.generation.failed',
        'notification:new',
        'credits:updated',
      ];

      for (const eventType of bridgeEvents) {
        await eventBus.subscribe(eventType, async event => {
          if (event.data?.userId) {
            getSSEManager().sendToUser(event.data.userId as string, eventType, event.data);
          }
        });
      }

      ctx.logger.debug('SSE event bus bridge initialized', { events: bridgeEvents });
    } catch (error) {
      ctx.logger.warn('Failed to initialize SSE event bus bridge (non-critical)', {
        error: serializeError(error),
      });
    }
  })();
}
