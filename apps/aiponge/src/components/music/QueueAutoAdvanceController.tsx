/**
 * Queue Auto-Advance Controller
 *
 * A component that registers the auto-advance handler for the playback queue.
 * This ensures that when a track finishes, the next track in the queue
 * automatically starts playing through the unified playback control.
 *
 * This component renders nothing - it only sets up the event subscription.
 */

import { useEffect } from 'react';
import { useQueueAutoAdvance } from '../../hooks/music/useQueueAutoAdvance';

export function QueueAutoAdvanceController() {
  console.log('[TRACE-QUEUE] QueueAutoAdvanceController render start');
  useEffect(() => {
    console.log('[TRACE-QUEUE] QueueAutoAdvanceController mounted (useEffect ran)');
    return () => { console.log('[TRACE-QUEUE] QueueAutoAdvanceController unmounted'); };
  }, []);
  useQueueAutoAdvance();
  console.log('[TRACE-QUEUE] useQueueAutoAdvance hook completed');
  return null;
}
