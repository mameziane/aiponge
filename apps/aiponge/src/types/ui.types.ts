/**
 * UI Type Definitions
 * Shared types for UI components across the application
 */

import type { Ionicons } from '@expo/vector-icons';

/**
 * Type-safe icon names from Ionicons
 */
export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Standard icon props used across icon components
 */
export interface IconProps {
  name?: IconName;
  size?: number;
  color?: string;
}

/**
 * Loading state variants for feedback components
 */
export type LoadingVariant = 'fullscreen' | 'inline' | 'modal';

/**
 * Error state variants for feedback components
 */
export type ErrorVariant = 'fullscreen' | 'inline' | 'modal';

/**
 * Action button configuration for error states
 */
export interface ErrorAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}
