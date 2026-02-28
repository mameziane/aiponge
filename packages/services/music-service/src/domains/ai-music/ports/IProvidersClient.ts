export interface ModelConfiguration {
  model: string;
  fallbackModels?: string[];
  size?: string;
  providerType: 'llm' | 'image' | 'music' | 'audio';
}

export interface IProvidersClient {
  getModelConfiguration(
    providerType: 'llm' | 'image' | 'music' | 'audio',
    providerId?: string
  ): Promise<{
    success: boolean;
    config?: ModelConfiguration;
    error?: string;
  }>;
}
