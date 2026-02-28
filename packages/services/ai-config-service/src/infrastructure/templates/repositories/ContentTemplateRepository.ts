/**
 * Content Template Repository Adapter
 * Adapts the existing aic_prompt_templates table to the Template interface
 * Used by ExecutionService for template execution
 */

import { eq, and, like, or, sql } from 'drizzle-orm';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { Template } from '@domains/templates/application/types';

interface ContentTemplateRow {
  id: string;
  name: string;
  description: string | null;
  content_type: string;
  category: string;
  tags: string[] | null;
  system_prompt: string;
  user_prompt_structure: string;
  required_variables: string[] | null;
  optional_variables: string[] | null;
  configuration: Record<string, unknown> | null;
  context_analysis_rules: Record<string, unknown> | null;
  inference_rules: Record<string, unknown> | null;
  cultural_adaptations: Record<string, unknown> | null;
  llm_compatibility: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  is_public: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  defaultValue?: string | number | boolean | unknown[] | Record<string, unknown>;
}

export class ContentTemplateRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Get template by name from aic_prompt_templates
   */
  async getTemplateByName(name: string): Promise<Template | null> {
    const query = sql`
      SELECT id, name, description, content_type, category, tags, system_prompt, user_prompt_structure,
             required_variables, optional_variables, is_active, created_by, created_at, updated_at
      FROM aic_prompt_templates 
      WHERE name = ${name}
    `;

    const result = await this.db.execute(query);
    const rows = result.rows as unknown as ContentTemplateRow[];

    if (rows.length === 0) {
      return null;
    }

    return this.mapToTemplate(rows[0]);
  }

  /**
   * Create a new template in aic_prompt_templates
   */
  async createTemplate(template: {
    id: string;
    name: string;
    description?: string;
    category: string;
    systemPrompt: string;
    userPromptStructure?: string;
    isActive?: boolean;
  }): Promise<Template> {
    const query = sql`
      INSERT INTO aic_prompt_templates (id, name, description, category, system_prompt, user_prompt_structure, is_active, created_by, created_at, updated_at)
      VALUES (
        ${template.id},
        ${template.name},
        ${template.description || ''},
        ${template.category},
        ${template.systemPrompt},
        ${template.userPromptStructure || ''},
        ${template.isActive !== false},
        'system',
        NOW(),
        NOW()
      )
      RETURNING id, name, description, content_type, category, tags, system_prompt, user_prompt_structure,
                required_variables, optional_variables, is_active, created_by, created_at, updated_at
    `;

    const result = await this.db.execute(query);
    const rows = result.rows as unknown as ContentTemplateRow[];
    return this.mapToTemplate(rows[0]);
  }

  /**
   * Delete a template from aic_prompt_templates
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const query = sql`
      DELETE FROM aic_prompt_templates 
      WHERE id = ${id}
    `;

    const result = await this.db.execute(query);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get template by ID from aic_prompt_templates
   */
  async getTemplateById(id: string): Promise<Template | null> {
    const query = sql`
      SELECT id, name, description, content_type, category, tags, system_prompt, user_prompt_structure,
             required_variables, optional_variables, is_active, created_by, created_at, updated_at
      FROM aic_prompt_templates 
      WHERE id = ${id}
    `;

    const result = await this.db.execute(query);
    const rows = result.rows as unknown as ContentTemplateRow[];

    if (rows.length === 0) {
      return null;
    }

    return this.mapToTemplate(rows[0]);
  }

  /**
   * List templates with optional filtering from aic_prompt_templates
   * Uses parameterized queries to prevent SQL injection
   */
  async listTemplates(
    filters: { category?: string; isActive?: boolean; limit?: number; offset?: number } = {}
  ): Promise<{
    templates: Template[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }> {
    const limitVal = filters.limit || 100;
    const offsetVal = filters.offset || 0;

    let countQuery;
    let dataQuery;

    if (filters.category !== undefined && filters.isActive !== undefined) {
      countQuery = sql`
        SELECT COUNT(*) as count FROM aic_prompt_templates 
        WHERE category = ${filters.category} AND is_active = ${filters.isActive}
      `;
      dataQuery = sql`
        SELECT id, name, description, content_type, category, tags, system_prompt, user_prompt_structure,
               required_variables, optional_variables, is_active, created_by, created_at, updated_at
        FROM aic_prompt_templates 
        WHERE category = ${filters.category} AND is_active = ${filters.isActive}
        ORDER BY name ASC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `;
    } else if (filters.category !== undefined) {
      countQuery = sql`
        SELECT COUNT(*) as count FROM aic_prompt_templates 
        WHERE category = ${filters.category}
      `;
      dataQuery = sql`
        SELECT id, name, description, content_type, category, tags, system_prompt, user_prompt_structure,
               required_variables, optional_variables, is_active, created_by, created_at, updated_at
        FROM aic_prompt_templates 
        WHERE category = ${filters.category}
        ORDER BY name ASC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `;
    } else if (filters.isActive !== undefined) {
      countQuery = sql`
        SELECT COUNT(*) as count FROM aic_prompt_templates 
        WHERE is_active = ${filters.isActive}
      `;
      dataQuery = sql`
        SELECT id, name, description, content_type, category, tags, system_prompt, user_prompt_structure,
               required_variables, optional_variables, is_active, created_by, created_at, updated_at
        FROM aic_prompt_templates 
        WHERE is_active = ${filters.isActive}
        ORDER BY name ASC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `;
    } else {
      countQuery = sql`SELECT COUNT(*) as count FROM aic_prompt_templates`;
      dataQuery = sql`
        SELECT id, name, description, content_type, category, tags, system_prompt, user_prompt_structure,
               required_variables, optional_variables, is_active, created_by, created_at, updated_at
        FROM aic_prompt_templates 
        ORDER BY name ASC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `;
    }

    const countResult = await this.db.execute(countQuery);
    const total = parseInt((countResult.rows[0] as Record<string, unknown>).count as string, 10);

    const result = await this.db.execute(dataQuery);
    const rows = result.rows as unknown as ContentTemplateRow[];
    const templates = rows.map(row => this.mapToTemplate(row));

    return {
      templates,
      total,
      limit: limitVal,
      offset: offsetVal,
      hasMore: offsetVal + templates.length < total,
    };
  }

  /**
   * Get distinct categories from aic_prompt_templates
   */
  async getCategories(): Promise<string[]> {
    const query = sql`
      SELECT DISTINCT category 
      FROM aic_prompt_templates 
      WHERE is_active = true
      ORDER BY category ASC
    `;

    const result = await this.db.execute(query);
    return (result.rows as Array<{ category: string }>).map(row => row.category);
  }

  /**
   * Update template in aic_prompt_templates
   * Uses parameterized queries to prevent SQL injection
   * Note: content is computed from systemPrompt + userPromptStructure, not stored directly
   */
  async updateTemplate(
    id: string,
    updates: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      userPromptStructure?: string;
      category?: string;
    }
  ): Promise<Template | null> {
    const existing = await this.getTemplateById(id);
    if (!existing) {
      return null;
    }

    const newName = updates.name !== undefined ? updates.name : existing.name;
    const newDescription = updates.description !== undefined ? updates.description : existing.description || '';
    const newSystemPrompt = updates.systemPrompt !== undefined ? updates.systemPrompt : existing.systemPrompt || '';
    const newUserPromptStructure =
      updates.userPromptStructure !== undefined ? updates.userPromptStructure : existing.userPromptStructure || '';
    const newCategory = updates.category !== undefined ? updates.category : existing.category;

    const updateQuery = sql`
      UPDATE aic_prompt_templates 
      SET name = ${newName},
          description = ${newDescription},
          system_prompt = ${newSystemPrompt},
          user_prompt_structure = ${newUserPromptStructure},
          category = ${newCategory},
          updated_at = NOW()
      WHERE id = ${id}
    `;

    await this.db.execute(updateQuery);
    return this.getTemplateById(id);
  }

  private mapToTemplate(row: ContentTemplateRow): Template {
    // Combine system_prompt and user_prompt_structure into content
    const content = `${row.system_prompt}\n\n${row.user_prompt_structure}`;

    // Map required_variables and optional_variables to TemplateVariable[]
    const variables: TemplateVariable[] = [];

    if (row.required_variables) {
      row.required_variables.forEach(varName => {
        variables.push({
          name: varName,
          type: 'string',
          required: true,
        });
      });
    }

    if (row.optional_variables) {
      row.optional_variables.forEach(varName => {
        variables.push({
          name: varName,
          type: 'string',
          required: false,
        });
      });
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      category: row.category,
      tags: row.tags || [],
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      content, // Combined prompts
      systemPrompt: row.system_prompt, // Separate system prompt for LLM message structure
      userPrompt: row.user_prompt_structure, // Separate user prompt for LLM message structure
      userPromptStructure: row.user_prompt_structure,
      variables,
      version: '1.0',
    };
  }
}
