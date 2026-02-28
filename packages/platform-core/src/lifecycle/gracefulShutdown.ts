import { createLogger } from '../logging/logger.js';

const logger = createLogger('graceful-shutdown');

type ShutdownHook = () => Promise<void>;

export type ShutdownPhase = 'drain' | 'schedulers' | 'queues' | 'connections' | 'default';

const PHASE_ORDER: ShutdownPhase[] = ['drain', 'schedulers', 'queues', 'connections', 'default'];

interface PhasedHook {
  phase: ShutdownPhase;
  hook: ShutdownHook;
  label?: string;
}

const hooks: ShutdownHook[] = [];
const phasedHooks: PhasedHook[] = [];
let isShuttingDown = false;

export function registerShutdownHook(hook: ShutdownHook): void {
  hooks.push(hook);
}

export function registerPhasedShutdownHook(phase: ShutdownPhase, hook: ShutdownHook, label?: string): void {
  phasedHooks.push({ phase, hook, label });
  logger.debug('Registered phased shutdown hook', { phase, label });
}

export function setupGracefulShutdown(server?: { close: (callback: () => void) => void }, timeoutMs?: number): void {
  const timeout = timeoutMs || parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000');

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown (timeout: ${timeout}ms)`);

    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeout);

    try {
      if (server) {
        await new Promise<void>(resolve => server.close(() => resolve()));
        logger.info('HTTP server closed');
      }

      for (const phase of PHASE_ORDER) {
        const phaseHooks = phasedHooks.filter(h => h.phase === phase);
        if (phaseHooks.length > 0) {
          logger.info(`Executing shutdown phase: ${phase}`, { hookCount: phaseHooks.length });
          for (const { hook, label } of phaseHooks) {
            try {
              await hook();
              if (label) logger.debug(`Shutdown hook completed: ${label}`);
            } catch (e) {
              logger.error('Phased shutdown hook failed', { phase, label, error: e });
            }
          }
        }
      }

      for (const hook of hooks) {
        try {
          await hook();
        } catch (e) {
          logger.error('Shutdown hook failed', { error: e });
        }
      }

      logger.info('Graceful shutdown complete');
      clearTimeout(timer);
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      clearTimeout(timer);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}
