export const FEATURE_FLAGS = {
  ENABLE_PROFESSIONAL_TIERS: false,
  ENABLE_STUDIO_TIER: false,
  SHOW_ANNUAL_PRICING: false,
} as const;

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag];
}
