export interface TemplateExecutionRequest {
  templateId: string;
  variables: Record<string, unknown>;
  options?: {
    timeout?: number;
    maxRetries?: number;
  };
}

export interface TemplateExecutionResponse {
  success: boolean;
  result?: string;
  systemPrompt?: string;
  userPrompt?: string;
  messages?: Array<{ role: 'system' | 'user'; content: string }>;
  error?: string;
  executionTime: number;
  templateUsed: {
    id: string;
    name: string;
    version?: string;
  };
}

export interface ITemplateClient {
  executeTemplate(request: TemplateExecutionRequest): Promise<TemplateExecutionResponse>;
}
