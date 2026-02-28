/**
 * Feature Flag Utilities
 *
 * Centralized utilities for checking feature flags across services.
 * Delegates to config-client for flag evaluation which supports:
 * - Environment variable overrides: FLAG_<key>=true (config-client normalizes to lowercase with dots)
 * - Remote configuration from config-service
 * - Percentage rollouts and user targeting
 *
 * Flag Key Format: snake_case (e.g., 'use_new_feature')
 * Env Override Format: FLAG_<SNAKE_CASE_KEY>=true (e.g., FLAG_USE_NEW_FEATURE=true)
 */

import { FEATURE_FLAGS, type FeatureFlagKey } from '@aiponge/shared-contracts/common';
import { isFeatureEnabled as clientIsFeatureEnabled, type FlagEvaluationContext } from './config-client.js';

export interface FeatureFlagContext extends FlagEvaluationContext {
  userId?: string;
  sessionId?: string;
}

/**
 * Check if a feature flag is enabled
 * Delegates to config-client which handles ENV overrides and remote config
 */
export function isFeatureEnabled(flagKey: FeatureFlagKey, context?: FeatureFlagContext): boolean {
  return clientIsFeatureEnabled(flagKey, context);
}

/**
 * Get all feature flag statuses for diagnostics
 */
export function getFeatureFlagStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {};

  for (const [_key, value] of Object.entries(FEATURE_FLAGS)) {
    status[value as string] = isFeatureEnabled(value as FeatureFlagKey);
  }

  return status;
}

export { FEATURE_FLAGS };
