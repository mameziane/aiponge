export interface ITemplateClient {
  getProviderTestPrompt(
    providerType: 'llm' | 'image' | 'video' | 'music' | 'audio' | 'text',
    variables?: Record<string, unknown>
  ): Promise<string>;
}
