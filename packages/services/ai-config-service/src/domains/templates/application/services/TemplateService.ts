/**
 * Core Template Service
 * Handles all template CRUD operations with database persistence
 * Uses aic_prompt_templates as the single source of truth
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Template,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateSearchFilters,
  TemplateListResponse,
  TemplateNotFoundError,
  TemplateValidationError,
  TemplateValidationResult,
  ImportTemplatesRequest,
  ImportTemplatesResponse,
  ExportTemplatesRequest,
  ExportTemplatesResponse,
} from '../types';
import { IContentTemplateRepository } from '../ports/IContentTemplateRepository';
import { IConfigEventPublisher } from '../ports/IConfigEventPublisher';
import { getLogger } from '@config/service-urls';

const logger = getLogger('ai-config-service-templateservice');

export class TemplateService {
  private contentTemplateRepository: IContentTemplateRepository;
  private eventPublisher: IConfigEventPublisher;

  constructor(contentTemplateRepository: IContentTemplateRepository, eventPublisher: IConfigEventPublisher) {
    this.contentTemplateRepository = contentTemplateRepository;
    this.eventPublisher = eventPublisher;
  }

  /**
   * Create a new template in aic_prompt_templates
   */
  async createTemplate(request: CreateTemplateRequest): Promise<Template> {
    const validation = this.validateTemplate(request);
    if (!validation.isValid) {
      throw new TemplateValidationError('Template validation failed', validation.errors);
    }

    const existingTemplate = await this.contentTemplateRepository.getTemplateByName(request.name);
    if (existingTemplate) {
      throw new TemplateValidationError('Template name already exists', [
        `Template with name "${request.name}" already exists`,
      ]);
    }

    const template = await this.contentTemplateRepository.createTemplate({
      id: uuidv4(),
      name: request.name,
      description: request.description || '',
      category: request.category,
      systemPrompt: request.systemPrompt || request.content || '',
      userPromptStructure: request.userPromptStructure || '',
      isActive: true,
    });

    logger.info('Created template: {} ({})', { data0: template.name, data1: template.id });

    this.eventPublisher.templateCreated(template.id, template.name, template.category, '1.0.0');

    return template;
  }

  /**
   * Get template by ID from aic_prompt_templates
   */
  async getTemplate(id: string): Promise<Template> {
    const template = await this.contentTemplateRepository.getTemplateById(id);
    if (!template) {
      throw new TemplateNotFoundError(id);
    }
    return template;
  }

  /**
   * Update existing template in aic_prompt_templates
   */
  async updateTemplate(id: string, request: UpdateTemplateRequest): Promise<Template> {
    const existingTemplate = await this.contentTemplateRepository.getTemplateById(id);
    if (!existingTemplate) {
      throw new TemplateNotFoundError(id);
    }

    if (request.name && request.name !== existingTemplate.name) {
      const nameConflict = await this.contentTemplateRepository.getTemplateByName(request.name);
      if (nameConflict && nameConflict.id !== id) {
        throw new TemplateValidationError('Template name already exists', [
          `Template with name "${request.name}" already exists`,
        ]);
      }
    }

    const updatedTemplate = await this.contentTemplateRepository.updateTemplate(id, {
      name: request.name,
      description: request.description,
      systemPrompt: request.systemPrompt,
      userPromptStructure: request.userPromptStructure,
      category: request.category,
    });

    if (!updatedTemplate) {
      throw new TemplateNotFoundError(id);
    }

    logger.info('Updated template: {} ({})', { data0: updatedTemplate.name, data1: id });

    this.eventPublisher.templateUpdated(id, updatedTemplate.name, updatedTemplate.category);

    return updatedTemplate;
  }

  /**
   * Delete template from aic_prompt_templates
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const template = await this.contentTemplateRepository.getTemplateById(id);
    if (!template) {
      throw new TemplateNotFoundError(id);
    }

    const deleted = await this.contentTemplateRepository.deleteTemplate(id);
    if (deleted) {
      logger.info('Deleted template: {} ({})', { data0: template.name, data1: id });
      this.eventPublisher.templateDeleted(id, template.name);
    }

    return deleted;
  }

  /**
   * List templates with optional filtering from aic_prompt_templates
   */
  async listTemplates(filters: TemplateSearchFilters = {}): Promise<TemplateListResponse> {
    const result = await this.contentTemplateRepository.listTemplates({
      category: filters.category,
      isActive: filters.isActive,
      limit: filters.limit,
      offset: filters.offset,
    });

    return {
      templates: result.templates,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get distinct template categories from aic_prompt_templates
   */
  async getCategories(): Promise<string[]> {
    return this.contentTemplateRepository.getCategories();
  }

  /**
   * Import templates into aic_prompt_templates
   */
  async importTemplates(request: ImportTemplatesRequest): Promise<ImportTemplatesResponse> {
    const imported: Template[] = [];
    const errors: Array<{ templateName: string; error: string }> = [];

    for (const templateData of request.templates) {
      await this.importSingleTemplate(templateData, request.options, imported, errors);
    }

    logger.info('Imported {} templates, {} failed', { data0: imported.length, data1: errors.length });

    return {
      success: true,
      imported: imported.length,
      failed: errors.length,
      errors,
      importedTemplates: imported,
    };
  }

  private async importSingleTemplate(
    templateData: ImportTemplatesRequest['templates'][number],
    options: ImportTemplatesRequest['options'],
    imported: Template[],
    errors: Array<{ templateName: string; error: string }>
  ): Promise<void> {
    try {
      if (!options?.overwriteExisting) {
        const existing = await this.contentTemplateRepository.getTemplateByName(templateData.name);
        if (existing) {
          errors.push({
            templateName: templateData.name,
            error: 'Template already exists and overwrite is disabled',
          });
          return;
        }
      }

      const createRequest: CreateTemplateRequest = {
        name: templateData.name,
        description: templateData.description,
        category: templateData.category,
        content: templateData.content,
        systemPrompt: templateData.systemPrompt,
        userPromptStructure: templateData.userPromptStructure,
        variables: templateData.variables,
        tags: templateData.tags,
        createdBy: templateData.createdBy,
      };

      const template = await this.createTemplate(createRequest);
      imported.push(template);
    } catch (error) {
      if (options?.skipInvalid) {
        errors.push({
          templateName: templateData.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Export templates from aic_prompt_templates
   */
  async exportTemplates(request: ExportTemplatesRequest): Promise<ExportTemplatesResponse> {
    const templates = await this.resolveExportTemplates(request);

    const format = request.format || 'json';
    const data = this.formatExportData(templates, format);

    logger.info('Exported {} templates in {} format', { data0: templates.length, data1: format });

    return {
      success: true,
      format,
      data,
      templateCount: templates.length,
      exportedAt: new Date(),
    };
  }

  private async resolveExportTemplates(request: ExportTemplatesRequest): Promise<Template[]> {
    if (request.templateIds && request.templateIds.length > 0) {
      const templates: Template[] = [];
      for (const id of request.templateIds) {
        try {
          const template = await this.getTemplate(id);
          templates.push(template);
        } catch (error) {
          logger.warn('Template {} not found during export', { data0: id });
        }
      }
      return templates;
    }

    if (request.filters) {
      const listResponse = await this.listTemplates(request.filters);
      return listResponse.templates;
    }

    const allTemplatesResult = await this.listTemplates({ limit: 1000 });
    return allTemplatesResult.templates;
  }

  private formatExportData(
    templates: Template[],
    format: string
  ):
    | { templates: Template[] }
    | Array<{
        name: string;
        description?: string;
        category: string;
        content: string;
        variables: unknown[];
        tags?: string[];
      }> {
    if (format === 'yaml') {
      return templates.map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        content: t.content,
        variables: t.variables,
        tags: t.tags,
      }));
    }

    return { templates };
  }

  /**
   * Get template statistics from aic_prompt_templates
   */
  async getStats(): Promise<{
    totalTemplates: number;
    activeTemplates: number;
    categories: number;
    totalVariables: number;
  }> {
    const result = await this.listTemplates({ limit: 1000 });
    const categories = await this.getCategories();

    return {
      totalTemplates: result.total,
      activeTemplates: result.templates.filter(t => t.isActive).length,
      categories: categories.length,
      totalVariables: 0,
    };
  }

  /**
   * Validate template data
   */
  private validateTemplate(template: Partial<CreateTemplateRequest>): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.name || template.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!template.category || template.category.trim().length === 0) {
      errors.push('Template category is required');
    }

    const content = template.content || template.systemPrompt;
    if (!content || content.trim().length === 0) {
      errors.push('Template content or systemPrompt is required');
    }

    if (content && template.variables) {
      const contentVariables = this.extractVariablesFromContent(content);
      const definedVariables = new Set(template.variables.map(v => v.name));

      for (const variable of Array.from(contentVariables)) {
        if (!definedVariables.has(variable)) {
          warnings.push(`Variable '${variable}' used in content but not defined in variables`);
        }
      }

      for (const variable of template.variables) {
        if (!contentVariables.has(variable.name)) {
          warnings.push(`Variable '${variable.name}' defined but not used in content`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract variable names from template content
   */
  private extractVariablesFromContent(content: string): Set<string> {
    const variables = new Set<string>();
    const matches = content.match(/\{\{([^}]+)\}\}/g);

    if (matches) {
      for (const match of matches) {
        const variableName = match.replace(/\{\{|\}\}/g, '').trim();
        variables.add(variableName);
      }
    }

    return variables;
  }
}
