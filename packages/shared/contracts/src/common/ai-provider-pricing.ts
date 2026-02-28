export type CostTier = 'low' | 'medium' | 'high' | 'premium';

export interface ModelPricing {
  id: string;
  name: string;
  costTier: CostTier;
  costPer1kTokens: number;
  description: string;
  recommended?: boolean;
}

export interface ImageModelPricing {
  id: string;
  name: string;
  costTier: CostTier;
  costPerImage: number;
  sizes: string[];
  description: string;
  recommended?: boolean;
}

export interface ProviderModels {
  providerId: string;
  providerName: string;
  models: ModelPricing[];
}

export const COST_TIER_LABELS: Record<CostTier, { label: string; color: string; icon: string }> = {
  low: { label: '$', color: '#22c55e', icon: 'leaf-outline' },
  medium: { label: '$$', color: '#eab308', icon: 'flash-outline' },
  high: { label: '$$$', color: '#f97316', icon: 'rocket-outline' },
  premium: { label: '$$$$', color: '#ef4444', icon: 'diamond-outline' },
};

export const OPENAI_MODELS: ModelPricing[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    costTier: 'high',
    costPer1kTokens: 0.005,
    description: 'Most capable model, best for complex tasks',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    costTier: 'low',
    costPer1kTokens: 0.00015,
    description: 'Fast and affordable, good for most tasks',
    recommended: true,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    costTier: 'high',
    costPer1kTokens: 0.01,
    description: 'Previous flagship model with vision',
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    costTier: 'low',
    costPer1kTokens: 0.0005,
    description: 'Fast and cost-effective for simple tasks',
  },
];

export const ANTHROPIC_MODELS: ModelPricing[] = [
  {
    id: 'claude-3-5-sonnet-latest',
    name: 'Claude 3.5 Sonnet',
    costTier: 'medium',
    costPer1kTokens: 0.003,
    description: 'Balanced performance and cost',
    recommended: true,
  },
  {
    id: 'claude-3-opus-latest',
    name: 'Claude 3 Opus',
    costTier: 'premium',
    costPer1kTokens: 0.015,
    description: 'Most capable Claude model',
  },
  {
    id: 'claude-3-haiku-latest',
    name: 'Claude 3 Haiku',
    costTier: 'low',
    costPer1kTokens: 0.00025,
    description: 'Fastest and most affordable Claude',
  },
];

export const OPENAI_IMAGE_MODELS: ImageModelPricing[] = [
  {
    id: 'dall-e-3',
    name: 'DALL-E 3',
    costTier: 'high',
    costPerImage: 0.04,
    sizes: ['1024x1024', '1024x1792', '1792x1024'],
    description: 'Highest quality image generation',
    recommended: true,
  },
  {
    id: 'dall-e-2',
    name: 'DALL-E 2',
    costTier: 'low',
    costPerImage: 0.02,
    sizes: ['256x256', '512x512', '1024x1024'],
    description: 'Fast and affordable image generation',
  },
];

export const PROVIDER_MODELS: Record<string, ModelPricing[]> = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
};

export const IMAGE_PROVIDER_MODELS: Record<string, ImageModelPricing[]> = {
  'openai-image': OPENAI_IMAGE_MODELS,
};

export function getModelPricing(providerId: string, modelId: string): ModelPricing | undefined {
  const models = PROVIDER_MODELS[providerId.toLowerCase()];
  return models?.find(m => m.id === modelId);
}

export function getProviderModels(providerId: string): ModelPricing[] {
  return PROVIDER_MODELS[providerId.toLowerCase()] || [];
}

export function getImageModelPricing(providerId: string, modelId: string): ImageModelPricing | undefined {
  const models = IMAGE_PROVIDER_MODELS[providerId.toLowerCase()];
  return models?.find(m => m.id === modelId);
}

export function getImageProviderModels(providerId: string): ImageModelPricing[] {
  return IMAGE_PROVIDER_MODELS[providerId.toLowerCase()] || [];
}

export function getCostTierInfo(tier: CostTier) {
  return COST_TIER_LABELS[tier];
}
