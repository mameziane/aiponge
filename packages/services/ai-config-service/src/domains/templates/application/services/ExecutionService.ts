/**
 * Template Execution Service
 * Handles template execution with variable substitution using Handlebars
 * Supports conditionals, default values, and complex template patterns
 *
 * All templates automatically inherit from the aiponge Philosophy Base template,
 * which provides Delphi-inspired guiding principles (Know Thyself, Nothing in Excess, etc.)
 */

import Handlebars from 'handlebars';
import {
  ExecuteTemplateRequest,
  ExecuteTemplateResponse,
  BatchExecuteRequest,
  BatchExecuteResponse,
  TemplateExecutionError,
  Template,
} from '../types';
import { TemplateService } from './TemplateService';
import { getLogger } from '@config/service-urls';

const logger = getLogger('ai-config-service-executionservice');

// Create a Handlebars instance with custom helpers
const handlebars = Handlebars.create();

// Register 'default' helper: {{varname|default:"fallback"}} or {{default varname "fallback"}}
handlebars.registerHelper('default', function (value: unknown, defaultValue: string) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value;
});

// Register 'eq' helper for equality checks
handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
  return a === b;
});

// Register 'and' helper for logical AND
handlebars.registerHelper('and', function (...args: unknown[]) {
  const options = args.pop() as Handlebars.HelperOptions;
  return args.every(arg => Boolean(arg));
});

// Register 'or' helper for logical OR
handlebars.registerHelper('or', function (...args: unknown[]) {
  const options = args.pop() as Handlebars.HelperOptions;
  return args.some(arg => Boolean(arg));
});

export class ExecutionService {
  constructor(private templateService: TemplateService) {}

  /**
   * Execute a single template with variable substitution
   * Processes system and user prompts separately for proper LLM message structure
   */
  async executeTemplate(request: ExecuteTemplateRequest): Promise<ExecuteTemplateResponse> {
    const startTime = Date.now();

    try {
      // Get template
      const template = await this.templateService.getTemplate(request.templateId);

      // Validate template is active
      if (!template.isActive) {
        throw new TemplateExecutionError(`Template is not active: ${request.templateId}`, request.templateId);
      }

      // Validate required variables
      this.validateRequiredVariables(template, request.variables);

      // Process template content
      const result = this.processTemplate(template.content, request.variables);

      // Process system and user prompts separately if available
      const systemPrompt = template.systemPrompt
        ? this.processTemplate(template.systemPrompt, request.variables)
        : undefined;

      const userPrompt = template.userPrompt ? this.processTemplate(template.userPrompt, request.variables) : undefined;

      // Create messages array for LLM APIs (OpenAI, Anthropic format)
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      if (userPrompt) {
        messages.push({ role: 'user', content: userPrompt });
      }

      const executionTime = Date.now() - startTime;

      logger.info('Executed template: {} ({}) in {}ms', {
        data0: template.name,
        data1: request.templateId,
        data2: executionTime,
      });

      return {
        success: true,
        result,
        systemPrompt,
        userPrompt,
        messages: messages.length > 0 ? messages : undefined,
        executionTime,
        templateUsed: {
          id: template.id,
          name: template.name,
          version: template.version,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';

      logger.error('Template execution failed: {} - {}', { data0: request.templateId, data1: errorMessage });

      return {
        success: false,
        error: errorMessage,
        executionTime,
        templateUsed: {
          id: request.templateId,
          name: 'Unknown',
          version: 'Unknown',
        },
      };
    }
  }

  /**
   * Execute multiple templates in batch
   */
  async batchExecute(request: BatchExecuteRequest): Promise<BatchExecuteResponse> {
    const startTime = Date.now();
    const results: BatchExecuteResponse['results'] = [];
    let successful = 0;
    let failed = 0;

    for (const execution of request.executions) {
      try {
        const execRequest: ExecuteTemplateRequest = {
          templateId: execution.templateId,
          variables: execution.variables,
          options: request.options,
        };

        const result = await this.executeTemplate(execRequest);

        results.push({
          executionId: execution.executionId,
          templateId: execution.templateId,
          success: result.success,
          result: result.result,
          error: result.error,
          executionTime: result.executionTime,
        });

        if (result.success) {
          successful++;
        } else {
          failed++;
          // Stop on first error if requested
          if (request.options?.stopOnFirstError) {
            break;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        results.push({
          executionId: execution.executionId,
          templateId: execution.templateId,
          success: false,
          error: errorMessage,
          executionTime: 0,
        });

        failed++;

        // Stop on first error if requested
        if (request.options?.stopOnFirstError) {
          break;
        }
      }
    }

    const totalExecutionTime = Date.now() - startTime;

    logger.info('Batch execution completed: {} successful, {} failed in {}ms', {
      data0: successful,
      data1: failed,
      data2: totalExecutionTime,
    });

    return {
      success: failed === 0,
      results,
      summary: {
        total: results.length,
        successful,
        failed,
        totalExecutionTime,
      },
    };
  }

  /**
   * Validate that all required variables are provided
   */
  private validateRequiredVariables(template: Template, variables: Record<string, unknown>): void {
    const missingVariables: string[] = [];

    for (const templateVar of template.variables) {
      if (templateVar.required && !(templateVar.name in variables)) {
        missingVariables.push(templateVar.name);
      }
    }

    if (missingVariables.length > 0) {
      throw new TemplateExecutionError(`Missing required variables: ${missingVariables.join(', ')}`, template.id);
    }
  }

  /**
   * Process template content with variable substitution using Handlebars
   * Supports conditionals, default values, and complex patterns
   */
  private processTemplate(content: string, variables: Record<string, unknown>): string {
    try {
      // First handle ${variable} syntax by converting to Handlebars syntax
      let processedContent = content.replace(/\$\{([^}]+)\}/g, '{{$1}}');

      // Convert custom default syntax: {{variable|default:"value"}} to {{default variable "value"}}
      processedContent = processedContent.replace(/\{\{(\w+)\|default:"([^"]+)"\}\}/g, '{{default $1 "$2"}}');

      // Also handle single quotes: {{variable|default:'value'}}
      processedContent = processedContent.replace(/\{\{(\w+)\|default:'([^']+)'\}\}/g, '{{default $1 "$2"}}');

      // Handle variable references without defaults in default syntax: {{var1|default:var2}}
      processedContent = processedContent.replace(/\{\{(\w+)\|default:(\w+)\}\}/g, '{{default $1 $2}}');

      // Compile and execute Handlebars template
      const compiledTemplate = handlebars.compile(processedContent, {
        noEscape: true, // Don't escape HTML entities in lyrics/content
        strict: false, // Don't throw on missing variables
      });

      const result = compiledTemplate(variables);

      // Clean up any remaining unresolved helpers (e.g., if a default helper wasn't matched)
      return result;
    } catch (error) {
      logger.warn('Handlebars template processing failed, falling back to simple substitution', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to simple substitution if Handlebars fails
      return this.simpleSubstitution(content, variables);
    }
  }

  /**
   * Simple variable substitution fallback
   */
  private simpleSubstitution(content: string, variables: Record<string, unknown>): string {
    let result = content;

    // Handle ${variable} syntax
    result = result.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const trimmed = varName.trim();
      return trimmed in variables ? this.formatVariableValue(variables[trimmed]) : match;
    });

    // Handle {{variable}} syntax (simple variables only, not Handlebars blocks)
    result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return varName in variables ? this.formatVariableValue(variables[varName]) : match;
    });

    return result;
  }

  /**
   * Format variable value based on type
   */
  private formatVariableValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    } else if (Array.isArray(value)) {
      return value.join(', ');
    } else if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    } else {
      return String(value);
    }
  }

  /**
   * Preview template execution without actually executing
   */
  async previewTemplate(
    templateId: string,
    variables: Record<string, unknown>
  ): Promise<{
    success: boolean;
    preview?: string;
    error?: string;
    missingVariables: string[];
    unusedVariables: string[];
  }> {
    try {
      const template = await this.templateService.getTemplate(templateId);

      // Check for missing required variables
      const missingVariables: string[] = [];
      for (const templateVar of template.variables) {
        if (templateVar.required && !(templateVar.name in variables)) {
          missingVariables.push(templateVar.name);
        }
      }

      // Check for unused provided variables
      const templateVariableNames = new Set(template.variables.map(v => v.name));
      const unusedVariables = Object.keys(variables).filter(varName => !templateVariableNames.has(varName));

      // Generate preview (even with missing variables)
      const preview = this.processTemplate(template.content, variables);

      return {
        success: missingVariables.length === 0,
        preview,
        missingVariables,
        unusedVariables,
      };
    } catch (error) {
      logger.warn('Template preview failed', {
        error: error instanceof Error ? error.message : String(error),
        templateId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        missingVariables: [],
        unusedVariables: [],
      };
    }
  }
}
