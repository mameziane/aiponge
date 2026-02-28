export interface Template {
  id: string;
  name: string;
  description?: string;
  category: string;
  content: string;
  systemPrompt?: string;
  userPrompt?: string;
  userPromptStructure?: string;
  variables: TemplateVariable[];
  tags?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version?: string;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  defaultValue?: string | number | boolean | unknown[] | Record<string, unknown>;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category: string;
  content?: string;
  systemPrompt?: string;
  userPromptStructure?: string;
  variables?: TemplateVariable[];
  tags?: string[];
  createdBy?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: string;
  content?: string;
  systemPrompt?: string;
  userPromptStructure?: string;
  variables?: TemplateVariable[];
  tags?: string[];
}

export interface ExecuteTemplateRequest {
  templateId: string;
  variables: Record<string, unknown>;
  options?: {
    timeout?: number;
    maxRetries?: number;
  };
}

export interface ExecuteTemplateResponse {
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

export interface BatchExecuteRequest {
  executions: Array<{
    templateId: string;
    variables: Record<string, unknown>;
    executionId?: string;
  }>;
  options?: {
    timeout?: number;
    maxRetries?: number;
    stopOnFirstError?: boolean;
  };
}

export interface BatchExecuteResponse {
  success: boolean;
  results: Array<{
    executionId?: string;
    templateId: string;
    success: boolean;
    result?: string;
    error?: string;
    executionTime: number;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalExecutionTime: number;
  };
}

export interface TemplateSearchFilters {
  query?: string;
  category?: string;
  tags?: string[];
  isActive?: boolean;
  createdBy?: string;
  limit?: number;
  offset?: number;
}

export interface TemplateListResponse {
  templates: Template[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ImportTemplatesRequest {
  templates: Array<Omit<Template, 'id' | 'createdAt' | 'updatedAt'>>;
  options?: {
    overwriteExisting?: boolean;
    skipInvalid?: boolean;
  };
}

export interface ImportTemplatesResponse {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{
    templateName: string;
    error: string;
  }>;
  importedTemplates: Template[];
}

export interface ExportTemplatesRequest {
  templateIds?: string[];
  filters?: TemplateSearchFilters;
  format?: 'json' | 'yaml';
}

export interface ExportTemplatesResponse {
  success: boolean;
  format: string;
  data: unknown;
  templateCount: number;
  exportedAt: Date;
}

export interface TemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: Date;
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictions: number;
  totalSize: number;
}
