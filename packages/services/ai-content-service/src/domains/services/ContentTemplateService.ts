/**
 * Content Template Service - Database-driven ai prompts template management
 * Loads and manages content templates from aic_prompt_templates table
 * Uses Handlebars for template rendering with conditional logic support
 */

import Handlebars, { TemplateDelegate } from 'handlebars';
import { getLogger } from '../../config/service-urls';
import { contentTemplates, SelectContentTemplate } from '../../schema/content-schema';
import { eq, and } from 'drizzle-orm';
import { TEMPLATE_IDS } from '../constants/template-ids';
import { TemplateError } from '../../application/errors';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';
import type { ContentType } from '../entities/Content';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const logger = getLogger('content-template-service');

// System prompt template ID - prepended to all other templates
const SYSTEM_PROMPT_ID = TEMPLATE_IDS.SYSTEM_PROMPT;

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  description: string;
  defaultValue?: unknown;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options?: string[];
  };
}

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  contentType: 'article' | 'blog' | 'creative' | 'technical' | 'email' | 'social' | 'summary' | 'educational';
  category: string;
  systemPrompt: string;
  userPromptStructure: string;
  variables: TemplateVariable[];
  metadata: {
    author: string;
    version: string;
    createdAt: Date;
    lastModified: Date;
    usageCount: number;
    averageRating: number;
    tags: string[];
  };
  contextAnalysisRules: Array<{
    trigger: string;
    analysis: string;
    outputVariable: string;
    fallback?: string;
  }>;
  inferenceRules: Array<{
    condition: string;
    inference: string;
    outputVariable: string;
    confidence: number;
  }>;
  llmCompatibility: Array<{
    provider: string;
    models: string[];
    optimizations?: Record<string, unknown>;
  }>;
  isActive: boolean;
  visibility: ContentVisibility;
}

export interface TemplateProcessingOptions {
  validateVariables?: boolean;
  fallbackToDefaults?: boolean;
  strictMode?: boolean;
}

export interface TemplateProcessingResult {
  systemPrompt: string;
  userPrompt: string;
  processedVariables: Record<string, unknown>;
  warnings: string[];
  metadata: {
    templateId: string;
    templateVersion: string;
    processingTime: number;
    variableCount: number;
    llmCompatibility: Array<{
      provider: string;
      models: string[];
      optimizations?: Record<string, unknown>;
    }>;
    inferenceConfig: {
      rules: Array<{
        condition: string;
        inference: string;
        outputVariable: string;
        confidence: number;
      }>;
    };
  };
}

export class ContentTemplateService {
  private templates: Map<string, ContentTemplate> = new Map();
  private templatesByType: Map<string, ContentTemplate[]> = new Map();
  private db: NodePgDatabase<Record<string, unknown>>;

  constructor(db: NodePgDatabase<Record<string, unknown>>) {
    this.db = db;
    logger.debug('📝 ContentTemplateService initialized with database connection');
  }

  /**
   * Load all available templates from database
   */
  async loadTemplates(): Promise<ContentTemplate[]> {
    try {
      const dbTemplates = await this.db.select().from(contentTemplates).where(eq(contentTemplates.isActive, true));

      const templates = dbTemplates.map(t => this.mapDbTemplateToService(t as unknown as SelectContentTemplate));

      // Clear cache before repopulating to ensure stale/deactivated templates are removed
      this.templates.clear();
      this.templatesByType.clear();

      // Populate fresh cache
      templates.forEach(template => {
        this.templates.set(template.id, template);
        this.updateTemplatesByType(template);
      });

      logger.info('📚 Loaded {} templates from database', { data0: templates.length });

      return templates;
    } catch (error) {
      logger.error('Failed to load templates from database:', { error });
      return Array.from(this.templates.values());
    }
  }

  /**
   * Load a specific template by ID from database
   */
  async loadTemplate(id: string): Promise<ContentTemplate | null> {
    // Check cache first
    if (this.templates.has(id)) {
      return this.templates.get(id)!;
    }

    try {
      const dbTemplate = await this.db
        .select()
        .from(contentTemplates)
        .where(and(eq(contentTemplates.id, id), eq(contentTemplates.isActive, true)))
        .limit(1);

      if (dbTemplate.length === 0) {
        return null;
      }

      const template = this.mapDbTemplateToService(dbTemplate[0] as unknown as SelectContentTemplate);

      // Update cache
      this.templates.set(template.id, template);
      this.updateTemplatesByType(template);

      return template;
    } catch (error) {
      logger.error('Failed to load template from database:', { error, templateId: id });
      return this.templates.get(id) || null;
    }
  }

  /**
   * Load templates by content type from database
   */
  async loadTemplatesByType(contentType: string): Promise<ContentTemplate[]> {
    try {
      const dbTemplates = await this.db
        .select()
        .from(contentTemplates)
        .where(and(eq(contentTemplates.contentType, contentType), eq(contentTemplates.isActive, true)));

      const templates = dbTemplates.map(t => this.mapDbTemplateToService(t as unknown as SelectContentTemplate));

      // Update cache
      templates.forEach(template => {
        this.templates.set(template.id, template);
        this.updateTemplatesByType(template);
      });

      return templates;
    } catch (error) {
      logger.error('Failed to load templates by type from database:', { error, contentType });
      return this.templatesByType.get(contentType) || [];
    }
  }

  /**
   * Load templates by category from database
   */
  async loadTemplatesByCategory(category: string): Promise<ContentTemplate[]> {
    try {
      const dbTemplates = await this.db
        .select()
        .from(contentTemplates)
        .where(and(eq(contentTemplates.category, category), eq(contentTemplates.isActive, true)));

      const templates = dbTemplates.map(t => this.mapDbTemplateToService(t as unknown as SelectContentTemplate));

      // Update cache
      templates.forEach(template => {
        this.templates.set(template.id, template);
        this.updateTemplatesByType(template);
      });

      return templates;
    } catch (error) {
      logger.error('Failed to load templates by category from database:', { error, category });
      const allTemplates = await this.loadTemplates();
      return allTemplates.filter(template => template.category === category);
    }
  }

  /**
   * Load the system prompt template (cached after first load)
   * This template provides the unified aiponge identity and philosophical foundation for all AI generations
   */
  private systemPromptCache: ContentTemplate | null = null;

  private async getSystemPrompt(): Promise<string | null> {
    try {
      if (!this.systemPromptCache) {
        this.systemPromptCache = await this.loadTemplate(SYSTEM_PROMPT_ID);
        if (this.systemPromptCache) {
          logger.info('🏛️ Loaded system-prompt template for inheritance');
        }
      }
      return this.systemPromptCache?.systemPrompt || null;
    } catch (error) {
      logger.warn('Could not load system-prompt template:', { error });
      return null;
    }
  }

  /**
   * Process a template with provided variables
   * Automatically prepends the system-prompt template
   */
  async processTemplate(
    templateId: string,
    variables: Record<string, unknown>,
    options: TemplateProcessingOptions = {}
  ): Promise<TemplateProcessingResult> {
    const startTime = Date.now();

    logger.info('🔍 LOADING TEMPLATE', {
      templateId,
      variablesProvided: Object.keys(variables),
      options,
    });

    const template = await this.loadTemplate(templateId);

    if (!template) {
      logger.error('❌ TEMPLATE NOT FOUND', { templateId });
      throw TemplateError.templateNotFound(templateId);
    }

    logger.info('✅ TEMPLATE LOADED FROM DATABASE', {
      templateId: template.id,
      templateName: template.name,
      contentType: template.contentType,
      category: template.category,
      requiredVars: template.variables.filter(v => v.required).map(v => v.name),
      optionalVars: template.variables.filter(v => !v.required).map(v => v.name),
      systemPromptLength: template.systemPrompt.length,
      userPromptLength: template.userPromptStructure.length,
    });

    const warnings: string[] = [];
    const processedVariables = { ...variables };

    // Validate and process variables
    if (options.validateVariables !== false) {
      logger.info('🔍 VALIDATING TEMPLATE VARIABLES', {
        providedVars: Object.keys(processedVariables),
        requiredVars: template.variables.filter(v => v.required).map(v => v.name),
      });
      this.validateTemplateVariables(template, processedVariables, warnings, options);
    }

    // Load system prompt and prepend to template system prompt (except for the system-prompt template itself)
    let systemPromptBase = '';
    if (templateId !== SYSTEM_PROMPT_ID) {
      const baseSystemPrompt = await this.getSystemPrompt();
      if (baseSystemPrompt) {
        systemPromptBase = baseSystemPrompt + '\n\n';
        logger.debug('🏛️ Prepending system-prompt to template system prompt');
      }
    }

    // Process system prompt with system-prompt prepended
    const templateSystemPrompt = this.processPromptTemplate(template.systemPrompt, processedVariables);
    const systemPrompt = systemPromptBase + templateSystemPrompt;

    // Process user prompt structure
    const userPrompt = this.processPromptTemplate(template.userPromptStructure, processedVariables);

    const processingTime = Date.now() - startTime;

    logger.info('✅ TEMPLATE VARIABLES SUBSTITUTED', {
      templateId,
      hasSystemPromptBase: systemPromptBase.length > 0,
      finalSystemPromptLength: systemPrompt.length,
      finalUserPromptLength: userPrompt.length,
      systemPromptPreview: systemPrompt.substring(0, 150),
      userPromptPreview: userPrompt.substring(0, 150),
      warnings,
      processingTime,
    });

    return {
      systemPrompt,
      userPrompt,
      processedVariables,
      warnings,
      metadata: {
        templateId: template.id,
        templateVersion: template.metadata.version,
        processingTime,
        variableCount: Object.keys(processedVariables).length,
        llmCompatibility: template.llmCompatibility,
        inferenceConfig: {
          rules: template.inferenceRules,
        },
      },
    };
  }

  /**
   * Create a new template
   */
  async createTemplate(templateData: Omit<ContentTemplate, 'id' | 'metadata' | 'isActive'>): Promise<ContentTemplate> {
    const template: ContentTemplate = {
      ...templateData,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        createdAt: new Date(),
        lastModified: new Date(),
        usageCount: 0,
        averageRating: 0,
        version: '1.0.0',
        author: 'system',
        tags: [],
      },
      isActive: true,
    };

    this.templates.set(template.id, template);
    this.updateTemplatesByType(template);

    return template;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(templateId: string, updates: Partial<ContentTemplate>): Promise<ContentTemplate> {
    const existingTemplate = this.templates.get(templateId);
    if (!existingTemplate) {
      throw TemplateError.templateNotFound(templateId);
    }

    const updatedTemplate: ContentTemplate = {
      ...existingTemplate,
      ...updates,
      id: templateId, // Preserve ID
      metadata: {
        ...existingTemplate.metadata,
        ...updates.metadata,
        lastModified: new Date(),
      },
    };

    this.templates.set(templateId, updatedTemplate);
    this.updateTemplatesByType(updatedTemplate);

    return updatedTemplate;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const template = this.templates.get(templateId);
    if (!template) {
      return false;
    }

    this.templates.delete(templateId);
    this.removeFromTemplatesByType(template);

    return true;
  }

  /**
   * Get template usage statistics
   */
  async getTemplateStats(templateId: string): Promise<{
    usageCount: number;
    averageRating: number;
    lastUsed?: Date;
    popularVariables: string[];
  } | null> {
    const template = await this.loadTemplate(templateId);
    if (!template) return null;

    return {
      usageCount: template.metadata.usageCount,
      averageRating: template.metadata.averageRating,
      lastUsed: undefined, // Would be tracked in database
      popularVariables: template.variables.filter(v => v.required).map(v => v.name),
    };
  }

  /**
   * Search templates by criteria
   */
  async searchTemplates(criteria: {
    contentType?: string;
    category?: string;
    tags?: string[];
    query?: string;
    visibility?: ContentVisibility;
  }): Promise<ContentTemplate[]> {
    let templates = await this.loadTemplates();

    if (criteria.contentType) {
      templates = templates.filter(t => t.contentType === criteria.contentType);
    }

    if (criteria.category) {
      templates = templates.filter(t => t.category === criteria.category);
    }

    if (criteria.visibility !== undefined) {
      templates = templates.filter(t => t.visibility === criteria.visibility);
    }

    if (criteria.tags && criteria.tags.length > 0) {
      templates = templates.filter(t => criteria.tags!.some(tag => t.metadata.tags.includes(tag)));
    }

    if (criteria.query) {
      const query = criteria.query.toLowerCase();
      templates = templates.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.metadata.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return templates;
  }

  // ===== PRIVATE METHODS =====

  /**
   * Map database template to service template interface
   */
  private mapDbTemplateToService(dbTemplate: SelectContentTemplate): ContentTemplate {
    // Handle array types properly
    const requiredVariables = Array.isArray(dbTemplate.requiredVariables) ? dbTemplate.requiredVariables : [];
    const optionalVariables = Array.isArray(dbTemplate.optionalVariables) ? dbTemplate.optionalVariables : [];
    const tags = Array.isArray(dbTemplate.tags) ? dbTemplate.tags : [];

    // Convert database required/optional variables to TemplateVariable objects
    const requiredVars = requiredVariables.map((name: string) => ({
      name,
      type: 'string' as const,
      required: true,
      description: `Required variable: ${name}`,
    }));

    const optionalVars = optionalVariables.map((name: string) => ({
      name,
      type: 'string' as const,
      required: false,
      description: `Optional variable: ${name}`,
    }));

    const allVariables = [...requiredVars, ...optionalVars];

    // Extract metadata with proper type casting
    const metadata = (dbTemplate.metadata as Record<string, unknown>) || {};

    return {
      id: dbTemplate.id,
      name: dbTemplate.name,
      description: dbTemplate.description || '',
      contentType: dbTemplate.contentType as ContentTemplate['contentType'],
      category: dbTemplate.category,
      systemPrompt: dbTemplate.systemPrompt,
      userPromptStructure: dbTemplate.userPromptStructure,
      variables: allVariables,
      metadata: {
        author: (metadata.author as string) || 'system',
        version: (metadata.version as string) || '1.0.0',
        createdAt: (dbTemplate.createdAt as Date) || new Date(),
        lastModified: new Date(String(metadata.lastModified || dbTemplate.updatedAt || new Date())),
        usageCount: (metadata.usageCount as number) || 0,
        averageRating: (metadata.averageRating as number) || 0,
        tags,
      },
      contextAnalysisRules: Array.isArray(dbTemplate.contextAnalysisRules)
        ? (dbTemplate.contextAnalysisRules as ContentTemplate['contextAnalysisRules'])
        : [],
      inferenceRules: Array.isArray(dbTemplate.inferenceRules)
        ? (dbTemplate.inferenceRules as ContentTemplate['inferenceRules'])
        : [],
      llmCompatibility: Array.isArray(dbTemplate.llmCompatibility)
        ? (dbTemplate.llmCompatibility as ContentTemplate['llmCompatibility'])
        : [],
      isActive: Boolean(dbTemplate.isActive),
      visibility: (dbTemplate.visibility as ContentVisibility) ?? CONTENT_VISIBILITY.PERSONAL,
    };
  }

  // Cache for compiled Handlebars templates - uses full template string as key for guaranteed uniqueness
  private compiledTemplateCache: Map<string, TemplateDelegate> = new Map();

  private processPromptTemplate(template: string, variables: Record<string, unknown>): string {
    try {
      // Check if template uses Handlebars conditionals ({{#if}}, {{#unless}}, {{#each}})
      const usesHandlebars = /\{\{#(if|unless|each|with)\s/.test(template);

      if (usesHandlebars) {
        // Use Handlebars for templates with conditional logic
        // Use full template string as cache key - guaranteed collision-free
        let compiledTemplate = this.compiledTemplateCache.get(template);

        if (!compiledTemplate) {
          compiledTemplate = Handlebars.compile(template, { noEscape: true });
          this.compiledTemplateCache.set(template, compiledTemplate);
        }

        // Prepare variables for Handlebars - convert arrays to readable strings
        const preparedVars = { ...variables };
        Object.entries(preparedVars).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            // Keep array for {{#if}} checks, but also add string version for display
            preparedVars[`${key}_str`] = value.join(', ');
          }
        });

        return compiledTemplate(preparedVars);
      } else {
        // Simple variable substitution for templates without conditional logic
        let processed = template;

        // Replace variables in BOTH ${variable} and {{variable}} formats
        Object.entries(variables).forEach(([key, value]) => {
          const stringValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');

          // Support ${variable} format (used in database templates)
          const dollarPlaceholder = new RegExp(`\\$\\{${key}\\}`, 'g');
          processed = processed.replace(dollarPlaceholder, stringValue);

          // Support {{variable}} format (Handlebars-style alternative)
          const doubleBracePlaceholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          processed = processed.replace(doubleBracePlaceholder, stringValue);
        });

        return processed;
      }
    } catch (error) {
      logger.error('Template processing error, falling back to simple substitution', { error });
      // Fallback to simple substitution
      let processed = template;
      Object.entries(variables).forEach(([key, value]) => {
        const stringValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
        const dollarPlaceholder = new RegExp(`\\$\\{${key}\\}`, 'g');
        processed = processed.replace(dollarPlaceholder, stringValue);
        const doubleBracePlaceholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        processed = processed.replace(doubleBracePlaceholder, stringValue);
      });
      return processed;
    }
  }

  private validateTemplateVariables(
    template: ContentTemplate,
    variables: Record<string, unknown>,
    warnings: string[],
    options: TemplateProcessingOptions
  ): void {
    // Check required variables
    template.variables.forEach(variable => {
      if (variable.required && !(variable.name in variables)) {
        if (options.fallbackToDefaults && variable.defaultValue !== undefined) {
          variables[variable.name] = variable.defaultValue;
          warnings.push(`Using default value for required variable: ${variable.name}`);
        } else {
          throw TemplateError.missingVariables([variable.name]);
        }
      }
    });

    // Apply default values for optional variables
    template.variables.forEach(variable => {
      if (!variable.required && !(variable.name in variables) && variable.defaultValue !== undefined) {
        variables[variable.name] = variable.defaultValue;
      }
    });

    // Validate variable values
    template.variables.forEach(variable => {
      const value = variables[variable.name];
      if (value !== undefined && variable.validation) {
        this.validateVariableValue(variable, value, warnings, options.strictMode);
      }
    });
  }

  private validateVariableValue(
    variable: TemplateVariable,
    value: unknown,
    warnings: string[],
    strictMode?: boolean
  ): void {
    if (!variable.validation) return;

    if (variable.type === 'string' && typeof value === 'string') {
      this.validateStringVariable(variable, value, warnings, strictMode);
    }

    if (variable.type === 'number' && typeof value === 'number') {
      this.validateNumberVariable(variable, value, warnings, strictMode);
    }
  }

  private addValidationIssue(message: string, fieldName: string, warnings: string[], strictMode?: boolean): void {
    if (strictMode) throw TemplateError.validationError(fieldName, message);
    warnings.push(message);
  }

  private validateStringVariable(
    variable: TemplateVariable,
    value: string,
    warnings: string[],
    strictMode?: boolean
  ): void {
    const validation = variable.validation!;

    if (validation.minLength && value.length < validation.minLength) {
      this.addValidationIssue(
        `Variable ${variable.name} is too short (minimum: ${validation.minLength})`,
        variable.name,
        warnings,
        strictMode
      );
    }

    if (validation.maxLength && value.length > validation.maxLength) {
      this.addValidationIssue(
        `Variable ${variable.name} is too long (maximum: ${validation.maxLength})`,
        variable.name,
        warnings,
        strictMode
      );
    }

    if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
      this.addValidationIssue(
        `Variable ${variable.name} doesn't match required pattern`,
        variable.name,
        warnings,
        strictMode
      );
    }

    if (validation.options && !validation.options.includes(value)) {
      this.addValidationIssue(
        `Variable ${variable.name} must be one of: ${validation.options.join(', ')}`,
        variable.name,
        warnings,
        strictMode
      );
    }
  }

  private validateNumberVariable(
    variable: TemplateVariable,
    value: number,
    warnings: string[],
    strictMode?: boolean
  ): void {
    const validation = variable.validation!;

    if (validation.minLength && value < validation.minLength) {
      this.addValidationIssue(
        `Variable ${variable.name} is too small (minimum: ${validation.minLength})`,
        variable.name,
        warnings,
        strictMode
      );
    }

    if (validation.maxLength && value > validation.maxLength) {
      this.addValidationIssue(
        `Variable ${variable.name} is too large (maximum: ${validation.maxLength})`,
        variable.name,
        warnings,
        strictMode
      );
    }
  }

  private updateTemplatesByType(template: ContentTemplate): void {
    if (!this.templatesByType.has(template.contentType)) {
      this.templatesByType.set(template.contentType, []);
    }

    const typeTemplates = this.templatesByType.get(template.contentType)!;
    const existingIndex = typeTemplates.findIndex(t => t.id === template.id);

    if (existingIndex >= 0) {
      typeTemplates[existingIndex] = template;
    } else {
      typeTemplates.push(template);
    }
  }

  private removeFromTemplatesByType(template: ContentTemplate): void {
    const typeTemplates = this.templatesByType.get(template.contentType);
    if (typeTemplates) {
      const index = typeTemplates.findIndex(t => t.id === template.id);
      if (index >= 0) {
        typeTemplates.splice(index, 1);
      }
    }
  }
}
