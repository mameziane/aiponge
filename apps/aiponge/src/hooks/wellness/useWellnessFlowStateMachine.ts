/**
 * Wellness Flow State Machine
 * useReducer-based ephemeral state for the wellness flow modal.
 *
 * States: CAPTURE → PLANNING → REVIEW → GENERATING → PREVIEW → CONFIRMED
 */

import { useReducer, useCallback } from 'react';

export type WellnessFlowState = 'CAPTURE' | 'PLANNING' | 'REVIEW' | 'GENERATING' | 'PREVIEW' | 'CONFIRMED';

export type WellnessFlowAction =
  | { type: 'DONE' } // CAPTURE → PLANNING
  | { type: 'PLAN_READY' } // PLANNING → REVIEW
  | { type: 'PLAN_ERROR' } // PLANNING → CAPTURE (with error)
  | { type: 'GENERATE' } // REVIEW → GENERATING
  | { type: 'PREVIEW_READY' } // GENERATING → PREVIEW
  | { type: 'GENERATE_ERROR' } // GENERATING → REVIEW (with error)
  | { type: 'CONFIRM' } // PREVIEW → CONFIRMED
  | { type: 'BACK' } // Go back one step
  | { type: 'REGENERATE' } // PREVIEW → GENERATING
  | { type: 'REPLAN' } // REVIEW → PLANNING (recipient changed)
  | { type: 'CANCEL' }; // Any → close modal

interface FlowReducerState {
  state: WellnessFlowState;
  error: string | null;
}

function flowReducer(current: FlowReducerState, action: WellnessFlowAction): FlowReducerState {
  switch (action.type) {
    case 'DONE':
      if (current.state === 'CAPTURE') return { state: 'PLANNING', error: null };
      return current;

    case 'PLAN_READY':
      if (current.state === 'PLANNING') return { state: 'REVIEW', error: null };
      return current;

    case 'PLAN_ERROR':
      if (current.state === 'PLANNING') return { state: 'CAPTURE', error: 'Plan failed. Please try again.' };
      return current;

    case 'GENERATE':
      if (current.state === 'REVIEW') return { state: 'GENERATING', error: null };
      return current;

    case 'PREVIEW_READY':
      if (current.state === 'GENERATING') return { state: 'PREVIEW', error: null };
      return current;

    case 'GENERATE_ERROR':
      if (current.state === 'GENERATING') return { state: 'REVIEW', error: 'Generation failed. Please try again.' };
      return current;

    case 'CONFIRM':
      if (current.state === 'PREVIEW') return { state: 'CONFIRMED', error: null };
      return current;

    case 'BACK':
      switch (current.state) {
        case 'REVIEW':
          return { state: 'CAPTURE', error: null };
        case 'PREVIEW':
          return { state: 'REVIEW', error: null };
        default:
          return current;
      }

    case 'REGENERATE':
      if (current.state === 'PREVIEW') return { state: 'GENERATING', error: null };
      return current;

    case 'REPLAN':
      if (current.state === 'REVIEW') return { state: 'PLANNING', error: null };
      return current;

    case 'CANCEL':
      return { state: 'CAPTURE', error: null };

    default:
      return current;
  }
}

const INITIAL_STATE: FlowReducerState = { state: 'CAPTURE', error: null };

export function useWellnessFlowStateMachine() {
  const [current, dispatch] = useReducer(flowReducer, INITIAL_STATE);

  const canGoBack = current.state === 'REVIEW' || current.state === 'PREVIEW';
  const isTerminal = current.state === 'CONFIRMED';

  const resetFlow = useCallback(() => {
    dispatch({ type: 'CANCEL' });
  }, []);

  return {
    state: current.state,
    error: current.error,
    dispatch,
    canGoBack,
    isTerminal,
    resetFlow,
  };
}
