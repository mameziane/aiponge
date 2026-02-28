import { withResilience, usePreset } from '../resilience/index.js';

type PresetName = 'internal-service' | 'external-api' | 'ai-provider';

const configuredBreakers = new Map<string, PresetName>();

export function withServiceResilience<T>(
  targetService: string,
  operation: string,
  fn: () => Promise<T>,
  preset: PresetName = 'internal-service'
): Promise<T> {
  const breakerName = `${targetService}:${operation}`;

  const previousPreset = configuredBreakers.get(breakerName);
  if (previousPreset !== preset) {
    usePreset(breakerName, preset);
    configuredBreakers.set(breakerName, preset);
  }

  return withResilience(breakerName, fn);
}
