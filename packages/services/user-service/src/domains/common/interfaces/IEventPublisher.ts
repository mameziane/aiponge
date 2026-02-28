/**
 * Event Publisher Interface
 * Common interface for event publishing across use cases
 */

export interface IEventPublisher {
  publish(event: string, data: Record<string, unknown>): Promise<void>;
}
