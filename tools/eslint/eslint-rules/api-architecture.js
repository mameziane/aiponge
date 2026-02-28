
const logger = {
  info: (...args) => console.log('[eslint-api-architecture]', ...args),
  warn: (...args) => console.warn('[eslint-api-architecture]', ...args),
  error: (...args) => console.error('[eslint-api-architecture]', ...args),
};

/**
 * ESLint Rules for API Architecture Compliance
 * Enforces the standardized API architecture patterns across all apps
 */

export default {
  rules: {
    // Prevent direct fetch usage in app code
    'no-direct-fetch': {
      meta: {
        hasSuggestions: true
      },
      create(context) {
        return {
          CallExpression(node) {
            const filename = context.getFilename();
            
            // Skip utility files that are allowed to use fetch directly
            const isUtilFile = /[\\/\\]utils[\\/\\]/.test(filename);
            const isLibFile = /[\\/\\]lib[\\/\\]/.test(filename);
            if (isUtilFile || isLibFile) {
              return;
            }

            // Ban direct fetch() calls (including window.fetch, globalThis.fetch)
            if (node.callee && node.callee.name === 'fetch') {
              context.report({
                node,
                message: 'Direct fetch() calls are not allowed. Use ApiClient or service layer methods instead.',
                suggest: [{
                  desc: 'Use ApiClient for API calls',
                  fix(fixer) {
                    return fixer.replaceText(node, '// TODO: Replace with ApiClient call');
                  }
                }]
              });
            }

            // Ban direct axios calls
            if (node.callee && node.callee.name === 'axios') {
              context.report({
                node,
                message: 'Direct axios calls are not allowed. Use ApiClient or service layer methods instead.',
              });
            }

            // Ban axios.create() calls
            if (node.callee && node.callee.type === 'MemberExpression' &&
                node.callee.object && node.callee.object.name === 'axios' &&
                node.callee.property && node.callee.property.name === 'create') {
              context.report({
                node,
                message: 'axios.create() calls are not allowed. Use ApiClient instead.',
              });
            }
          },

          MemberExpression(node) {
            const filename = context.getFilename();
            
            // Skip utility files that are allowed to use fetch directly
            const isUtilFile = /[\\/\\]utils[\\/\\]/.test(filename);
            const isLibFile = /[\\/\\]lib[\\/\\]/.test(filename);
            if (isUtilFile || isLibFile) {
              return;
            }

            // Ban axios.get, axios.post, etc.
            if (node.object && node.object.name === 'axios' && 
                ['get', 'post', 'put', 'patch', 'delete'].includes(node.property.name)) {
              context.report({
                node,
                message: `Direct axios.${node.property.name}() calls are not allowed. Use ApiClient or service layer methods instead.`,
              });
            }

            // Ban window.fetch and globalThis.fetch
            if ((node.object && node.object.name === 'window' && node.property && node.property.name === 'fetch') ||
                (node.object && node.object.name === 'globalThis' && node.property && node.property.name === 'fetch')) {
              context.report({
                node,
                message: 'Direct fetch() calls (including window.fetch) are not allowed. Use ApiClient or service layer methods instead.',
              });
            }
          }
        };
      }
    },

    // Enforce service layer usage in components
    'enforce-service-layer': {
      meta: {
        hasSuggestions: true
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            const filename = context.getFilename();
            
            // Skip if this is a service file itself (cross-platform path check)
            const isServiceFile = /[\\/\\]services[\\/\\]/.test(filename) || /[\\/\\]lib[\\/\\]/.test(filename);
            if (isServiceFile) {
              return;
            }

            // Check for forbidden direct imports in components
            if (node.source.value === '../lib/queryClient' || 
                node.source.value.includes('queryClient')) {
              // Allow useQuery, useMutation imports but not apiRequest directly
              const importedNames = node.specifiers
                .filter(spec => spec.type === 'ImportSpecifier')
                .map(spec => spec.imported.name);

              if (importedNames.includes('apiRequest')) {
                context.report({
                  node,
                  message: 'Direct apiRequest imports in components are not allowed. Use service layer hooks instead.',
                });
              }
            }

            // Ban direct ApiClient imports in components
            if (node.source.value.includes('/lib/apiClient') || node.source.value.includes('apiClient')) {
              context.report({
                node,
                message: 'Direct ApiClient imports in components are not allowed. Use service layer hooks instead.',
              });
            }

            // Ban direct service imports in components (components should only import hooks)
            if (node.source.value.includes('/services/')) {
              context.report({
                node,
                message: 'Direct service imports in components are not allowed. Use service layer hooks instead.',
              });
            }

            // Ban axios imports in components entirely
            if (node.source.value === 'axios') {
              context.report({
                node,
                message: 'axios imports in components are not allowed. Use ApiClient through service layer hooks instead.',
              });
            }
          },

          CallExpression(node) {
            const filename = context.getFilename();
            
            // Skip service files, hooks, and utils (cross-platform path check)
            const isServiceFile = /[\\/\\]services[\\/\\]/.test(filename);
            const isHookFile = /[\\/\\]hooks[\\/\\]/.test(filename);
            const isLibFile = /[\\/\\]lib[\\/\\]/.test(filename);
            const isUtilFile = /[\\/\\]utils[\\/\\]/.test(filename);
            
            if (isServiceFile || isHookFile || isLibFile || isUtilFile) {
              return;
            }

            // Ban direct apiRequest calls in components
            if (node.callee && node.callee.name === 'apiRequest') {
              context.report({
                node,
                message: 'Direct apiRequest calls in components are not allowed. Use service layer hooks instead.',
                suggest: [{
                  desc: 'Use a service layer hook',
                  fix(fixer) {
                    return fixer.replaceText(node, '// TODO: Replace with service hook call');
                  }
                }]
              });
            }

            // Ban direct ApiClient calls in components
            if (node.callee && node.callee.type === 'MemberExpression' &&
                node.callee.object && node.callee.object.name === 'ApiClient') {
              context.report({
                node,
                message: 'Direct ApiClient calls in components are not allowed. Use service layer hooks instead.',
              });
            }
          }
        };
      }
    },

    // Prevent UI imports in shared services
    'no-ui-in-services': {
      create(context) {
        return {
          ImportDeclaration(node) {
            const filename = context.getFilename();
            
            // Only apply to service files (cross-platform path check)
            const isServiceFile = /[\\/\\]services[\\/\\]/.test(filename);
            if (!isServiceFile) {
              return;
            }

            const importPath = node.source.value;
            
            // Ban UI component imports in services
            const forbiddenImports = [
              '@/components/',
              '../components/',
              'react-icons',
              'lucide-react',
              '@radix-ui/',
              '@/hooks/use-toast'
            ];

            for (const forbidden of forbiddenImports) {
              if (importPath.includes(forbidden)) {
                context.report({
                  node,
                  message: `UI imports (${forbidden}) are not allowed in service files. Services should be UI-agnostic.`,
                });
              }
            }
          }
        };
      }
    },

    // Enforce typed API responses
    'enforce-typed-responses': {
      create(context) {
        return {
          CallExpression(node) {
            const filename = context.getFilename();
            
            // Only apply to service files (cross-platform path check)
            const isServiceFile = /[\\/\\]services[\\/\\]/.test(filename);
            if (!isServiceFile) {
              return;
            }

            // Check for untyped ApiClient calls
            if (node.callee && 
                node.callee.type === 'MemberExpression' &&
                node.callee.object && 
                node.callee.object.name === 'ApiClient') {
              
              // Check if generic type is provided
              if (!node.typeParameters) {
                context.report({
                  node,
                  message: 'ApiClient calls should include type parameters for type safety. Example: ApiClient.admin.getProviders<ProviderConfig[]>()',
                });
              }
            }
          }
        };
      }
    },

    // Enforce hook naming conventions
    'hook-naming-convention': {
      create(context) {
        return {
          VariableDeclarator(node) {
            const filename = context.getFilename();
            
            // Only apply to hook files (cross-platform path check)
            const isHookFile = /[\\/\\]hooks[\\/\\]/.test(filename);
            if (!isHookFile) {
              return;
            }

            // Check function name starts with 'use' (including arrow functions)
            if (node.id && node.id.name && !node.id.name.startsWith('use') && 
                node.init && (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression')) {
              context.report({
                node,
                message: 'Hook functions must start with "use" prefix.',
              });
            }
          },

          FunctionDeclaration(node) {
            const filename = context.getFilename();
            
            // Only apply to hook files (cross-platform path check)
            const isHookFile = /[\\/\\]hooks[\\/\\]/.test(filename);
            if (!isHookFile) {
              return;
            }

            // Check function name starts with 'use'
            if (node.id && node.id.name && !node.id.name.startsWith('use')) {
              context.report({
                node,
                message: 'Hook functions must start with "use" prefix.',
              });
            }
          }
        };
      }
    }
  }
};