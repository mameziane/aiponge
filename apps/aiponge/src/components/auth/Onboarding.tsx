/**
 * Onboarding - Public API wrapper for the onboarding flow
 *
 * @description Thin wrapper that delegates to OnboardingFlow.
 * Provides a stable import path while allowing internal implementation changes.
 *
 * @see OnboardingFlow - The actual implementation with preference collection
 * @see OnboardingProfileCompletion - Post-registration setup (separate flow)
 */
import { OnboardingFlow } from './OnboardingFlow';

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  return <OnboardingFlow onComplete={onComplete} />;
}
