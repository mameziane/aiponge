import { vi } from 'vitest';

export function createMockLogger() {
  const logger: Record<string, unknown> = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
    child: vi.fn(() => logger),
    log: vi.fn(),
  };
  return logger;
}
