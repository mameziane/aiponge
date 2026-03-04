/**
 * Template Engine - Variable substitution for provider templates
 * Handles BOTH ${variable} and {{variable}} syntax for dynamic request/response mapping.
 *
 * Supports dot notation for nested access: ${response.data.url} or {{response.data.url}}
 */

export class TemplateEngine {
  /**
   * Render template string with variable substitution.
   * Resolves both ${variable} and {{variable}} placeholders from context.
   */
  render(template: string, context: Record<string, unknown>): string {
    let result = template;

    // Replace ${variable} patterns
    const dollarPattern = /\$\{([^}]+)\}/g;
    result = result.replace(dollarPattern, (match, variable) => {
      const value = this.resolveVariable(variable.trim(), context);
      return value !== undefined ? String(value) : match;
    });

    // Replace {{variable}} patterns (Handlebars-style, simple non-conditional only)
    // Skip Handlebars block helpers like {{#if}}, {{/if}}, {{else}}, {{> partial}}
    const handlebarsPattern = /\{\{(?!#|\/|else|>)([^}]+)\}\}/g;
    result = result.replace(handlebarsPattern, (match, variable) => {
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
   * Check if template contains variables (either syntax)
   */
  hasVariables(template: string): boolean {
    return /\$\{[^}]+\}/.test(template) || /\{\{(?!#|\/|else|>)[^}]+\}\}/.test(template);
  }

  /**
   * Extract all variable names from template (both syntaxes)
   */
  extractVariables(template: string): string[] {
    const dollarMatches = template.match(/\$\{([^}]+)\}/g) || [];
    const handlebarsMatches = template.match(/\{\{(?!#|\/|else|>)([^}]+)\}\}/g) || [];

    const dollarVars = dollarMatches.map(match => match.slice(2, -1).trim());
    const handlebarsVars = handlebarsMatches.map(match => match.slice(2, -2).trim());

    // Deduplicate
    return [...new Set([...dollarVars, ...handlebarsVars])];
  }
}
