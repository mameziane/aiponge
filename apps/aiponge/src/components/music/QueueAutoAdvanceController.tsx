/**
 * Queue Auto-Advance Controller
 *
 * A component that registers the auto-advance handler for the playback queue.
 * This ensures that when a track finishes, the next track in the queue
 * automatically starts playing through the unified playback control.
 *
 * This component renders nothing - it only sets up the event subscription.
 */

import { useQueueAutoAdvance } from '../../hooks/music/useQueueAutoAdvance';

export function QueueAutoAdvanceController() {
  useQueueAutoAdvance();
  return null;
}
