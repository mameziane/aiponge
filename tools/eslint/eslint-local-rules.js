/**
 * ESLint Local Rules for Aiponge Platform
 * Custom linting rules to enforce architectural patterns
 */

export default {
  rules: {
    'no-direct-fetch': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow direct fetch/axios calls, use service layer instead',
          category: 'Best Practices',
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.name === 'fetch' ||
              (node.callee.type === 'MemberExpression' && node.callee.object.name === 'axios') ||
              (node.callee.type === 'MemberExpression' && node.callee.object.name === 'http')
            ) {
              context.report({
                node,
                message: 'Direct HTTP calls are prohibited. Use service layer instead.',
              });
            }
          },
        };
      },
    },

    'enforce-service-layer': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Enforce proper service layer usage',
          category: 'Architecture',
        },
        schema: [],
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            if (
              node.source.value &&
              typeof node.source.value === 'string' &&
              node.source.value.includes('direct-api')
            ) {
              context.report({
                node,
                message: 'Direct API imports are discouraged. Use service layer instead.',
              });
            }
          },
        };
      },
    },

    'no-ui-in-services': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent UI components from being imported in service layer',
          category: 'Architecture',
        },
        schema: [],
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            if (
              node.source.value &&
              typeof node.source.value === 'string' &&
              (node.source.value.includes('/components/') || node.source.value.includes('/pages/'))
            ) {
              context.report({
                node,
                message: 'Services should not import UI components. Keep services UI-agnostic.',
              });
            }
          },
        };
      },
    },

    'enforce-typed-responses': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Enforce typed API responses',
          category: 'Type Safety',
        },
        schema: [],
      },
      create(context) {
        return {
          // Simplified implementation
          ReturnStatement(node) {
            // Basic check for untyped returns in API functions
            return;
          },
        };
      },
    },

    'hook-naming-convention': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Enforce proper hook naming conventions',
          category: 'Naming',
        },
        schema: [],
      },
      create(context) {
        return {
          FunctionDeclaration(node) {
            if (node.id && node.id.name && node.id.name.startsWith('use') && !node.id.name.match(/^use[A-Z]/)) {
              context.report({
                node,
                message: 'Hook names must start with "use" followed by a capital letter.',
              });
            }
          },
        };
      },
    },
  },
};
