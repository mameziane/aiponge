import { Template } from '../types';

export interface IContentTemplateRepository {
  getTemplateByName(name: string): Promise<Template | null>;
  getTemplateById(id: string): Promise<Template | null>;
  createTemplate(template: {
    id: string;
    name: string;
    description?: string;
    category: string;
    systemPrompt: string;
    userPromptStructure?: string;
    isActive?: boolean;
  }): Promise<Template>;
  updateTemplate(
    id: string,
    updates: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      userPromptStructure?: string;
      category?: string;
    }
  ): Promise<Template | null>;
  deleteTemplate(id: string): Promise<boolean>;
  listTemplates(filters?: { category?: string; isActive?: boolean; limit?: number; offset?: number }): Promise<{
    templates: Template[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>;
  getCategories(): Promise<string[]>;
}
