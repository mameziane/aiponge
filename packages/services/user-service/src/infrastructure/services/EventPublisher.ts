import {
  createEventBusClient,
  type IStandardizedEventBusClient,
  getServiceName,
  createEvent,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { IEventPublisher } from '../../domains/common/interfaces/IEventPublisher';

const logger = getLogger('user-service-event-publisher');

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('user-service'));
  }
  return eventBusClient;
}

export class EventPublisher implements IEventPublisher {
  async publish(event: string, data: Record<string, unknown>): Promise<void> {
    try {
      const eventPayload = createEvent(event, 'user-service', data);
      await getEventBusClient().publish(eventPayload);
      logger.debug('Published event: {}', { data0: event, eventId: eventPayload.eventId });
    } catch (error) {
      logger.warn('Failed to publish event (non-blocking): {}', {
        data0: event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
