import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { BatchRecordLifecycleEventsUseCase } from '../../application/use-cases/lifecycle/BatchRecordLifecycleEventsUseCase';
import type { RecordLifecycleEventUseCase } from '../../application/use-cases/lifecycle/RecordLifecycleEventUseCase';
import type { RecordLifecycleEventRequest } from '../../application/use-cases/lifecycle/RecordLifecycleEventUseCase';

function makeEvent(overrides: Partial<RecordLifecycleEventRequest> = {}): RecordLifecycleEventRequest {
  return {
    eventType: 'user.session_started',
    userId: 'user-001',
    tier: 'explorer',
    platform: 'ios',
    sessionId: 'sess-001',
    metadata: {},
    correlationId: 'cor-001',
    source: 'user-service',
    ...overrides,
  };
}

describe('BatchRecordLifecycleEventsUseCase', () => {
  let useCase: BatchRecordLifecycleEventsUseCase;
  let mockRecordUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRecordUseCase = {
      execute: vi.fn().mockResolvedValue({ eventId: 'evt-001', success: true }),
    };
    useCase = new BatchRecordLifecycleEventsUseCase(mockRecordUseCase as unknown as RecordLifecycleEventUseCase);
  });

  it('successfully processes batch of events (all succeed)', async () => {
    const events = [
      makeEvent({ userId: 'user-001', eventType: 'user.session_started' }),
      makeEvent({ userId: 'user-002', eventType: 'user.signed_up' }),
      makeEvent({ userId: 'user-003', eventType: 'user.content_generated' }),
    ];

    const result = await useCase.execute(events);

    expect(result.accepted).toBe(3);
    expect(result.rejected).toBe(0);
    expect(result.errors).toBeUndefined();
    expect(mockRecordUseCase.execute).toHaveBeenCalledTimes(3);
    expect(mockRecordUseCase.execute).toHaveBeenNthCalledWith(1, events[0]);
    expect(mockRecordUseCase.execute).toHaveBeenNthCalledWith(2, events[1]);
    expect(mockRecordUseCase.execute).toHaveBeenNthCalledWith(3, events[2]);
  });

  it('handles per-event failures gracefully (some succeed, some fail)', async () => {
    mockRecordUseCase.execute
      .mockResolvedValueOnce({ eventId: 'evt-001', success: true })
      .mockRejectedValueOnce(new Error('Database connection lost'))
      .mockResolvedValueOnce({ eventId: 'evt-003', success: true })
      .mockRejectedValueOnce('non-error rejection');

    const events = [
      makeEvent({ userId: 'user-001', eventType: 'user.session_started' }),
      makeEvent({ userId: 'user-002', eventType: 'user.tier_changed' }),
      makeEvent({ userId: 'user-003', eventType: 'user.content_generated' }),
      makeEvent({ userId: 'user-004', eventType: 'user.payment_succeeded' }),
    ];

    const result = await useCase.execute(events);

    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors![0]).toEqual({
      index: 1,
      eventType: 'user.tier_changed',
      error: 'Database connection lost',
    });
    expect(result.errors![1]).toEqual({
      index: 3,
      eventType: 'user.payment_succeeded',
      error: 'non-error rejection',
    });
  });

  it('empty batch returns empty results', async () => {
    const result = await useCase.execute([]);

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.errors).toBeUndefined();
    expect(mockRecordUseCase.execute).not.toHaveBeenCalled();
  });

  it('tracks success/failure counts correctly', async () => {
    mockRecordUseCase.execute
      .mockResolvedValueOnce({ eventId: 'evt-1', success: true })
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce({ eventId: 'evt-4', success: true })
      .mockRejectedValueOnce(new Error('fail-3'));

    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ userId: `user-${i}`, eventType: `user.event_${i}`, correlationId: `cor-${i}` })
    );

    const result = await useCase.execute(events);

    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(3);
    expect(result.accepted + result.rejected).toBe(events.length);
    expect(result.errors).toHaveLength(3);
    expect(result.errors!.map(e => e.index)).toEqual([1, 2, 4]);
  });
});
