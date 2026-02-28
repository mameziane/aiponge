import type { LLMConfig, ImageConfig } from './types';

export function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString();
}

export function detectProviderFromConfig(config: LLMConfig | undefined, providerName: string): 'openai' | 'anthropic' {
  const endpoint = config?.endpoint?.toLowerCase() || '';
  if (endpoint.includes('anthropic.com')) return 'anthropic';
  if (endpoint.includes('openai.com')) return 'openai';
  const model = config?.requestTemplate?.model?.toLowerCase() || '';
  if (model.includes('claude')) return 'anthropic';
  if (model.includes('gpt')) return 'openai';
  const name = providerName.toLowerCase();
  if (name.includes('anthropic') || name.includes('claude')) return 'anthropic';
  return 'openai';
}

export function detectImageProviderFromConfig(config: ImageConfig | undefined, providerName: string): 'openai-image' {
  const endpoint = config?.endpoint?.toLowerCase() || '';
  if (endpoint.includes('openai.com')) return 'openai-image';
  const model = config?.requestTemplate?.model?.toLowerCase() || '';
  if (model.includes('dall-e')) return 'openai-image';
  const name = providerName.toLowerCase();
  if (name.includes('openai') || name.includes('dall-e') || name.includes('dalle')) return 'openai-image';
  return 'openai-image';
}
