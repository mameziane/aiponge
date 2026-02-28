/**
 * Template Engine - Simple variable substitution for provider templates
 * Handles ${variable} syntax for dynamic request/response mapping
 */

export class TemplateEngine {
  /**
   * Render template string with variable substitution
   */
  render(template: string, context: Record<string, unknown>): string {
    let result = template;

    // Replace ${variable} patterns
    const variablePattern = /\$\{([^}]+)\}/g;

    result = result.replace(variablePattern, (match, variable) => {
      const value = this.resolveVariable(variable.trim(), context);
      return value !== undefined ? String(value) : match;
    });

    return result;
  }

  /**
   * Resolve variable from context with dot notation support
   */
  private resolveVariable(variable: string, context: Record<string, unknown>): unknown {
    const parts = variable.split('.');
    let current: unknown = context;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Check if template contains variables
   */
  hasVariables(template: string): boolean {
    return /\$\{[^}]+\}/.test(template);
  }

  /**
   * Extract all variable names from template
   */
  extractVariables(template: string): string[] {
    const matches = template.match(/\$\{([^}]+)\}/g) || [];
    return matches.map(match => match.slice(2, -1).trim());
  }
}
