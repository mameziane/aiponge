import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import localRules from './tools/eslint/eslint-local-rules.js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly'
      }
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'max-len': ['warn', { 'code': 120, 'tabWidth': 2 }],
      'no-undef': 'error'
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        RequestInit: 'readonly',
        BodyInit: 'readonly',
        BufferEncoding: 'readonly',
        NextFunction: 'readonly',
        require: 'readonly',
        __DEV__: 'readonly',
        window: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'prettier': prettier,
      'local-rules': localRules,
      'sonarjs': sonarjs
    },
    rules: {
      'local-rules/no-direct-fetch': 'warn',
      'local-rules/enforce-service-layer': 'warn',
      'local-rules/no-ui-in-services': 'warn',
      'local-rules/enforce-typed-responses': 'warn',
      'local-rules/hook-naming-convention': 'warn',
      
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      
      'sonarjs/cognitive-complexity': ['warn', 15],
      
      'no-debugger': 'error',
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-imports': 'error',
      'no-var': 'error',
      
      'no-console': 'off',
      'no-unused-expressions': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-condition': 'warn',
      'no-useless-catch': 'warn',
      'prefer-const': 'warn',
      
      'max-len': ['warn', { 'code': 120, 'tabWidth': 2 }],
      'complexity': ['warn', 15],
      'max-lines-per-function': ['warn', { 'max': 100, 'skipComments': true }],
      'max-params': ['warn', 6],
      
      'prettier/prettier': [
        'warn',
        {
          'semi': true,
          'trailingComma': 'es5',
          'singleQuote': true,
          'printWidth': 120,
          'tabWidth': 2,
          'useTabs': false
        }
      ]
    },
  },
  {
    files: ['client/**/*.ts', 'client/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        React: 'readonly',
        JSX: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'prettier': prettier,
      'local-rules': localRules
    },
    rules: {
      'local-rules/no-direct-fetch': 'warn',
      'local-rules/enforce-service-layer': 'warn',
      'local-rules/hook-naming-convention': 'warn',
      
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      
      'no-debugger': 'error',
      'no-undef': 'error',
      'no-duplicate-imports': 'error',
      'no-var': 'error',
      
      'no-console': 'off',
      'no-unused-expressions': 'warn',
      'no-case-declarations': 'warn',
      'prefer-const': 'warn',
      
      'max-len': ['warn', { 'code': 120, 'tabWidth': 2 }],
      'complexity': ['warn', 15],
      'max-lines-per-function': ['warn', { 'max': 100, 'skipComments': true }],
      'max-params': ['warn', 6],
      
      'prettier/prettier': [
        'warn',
        {
          'semi': true,
          'trailingComma': 'es5',
          'singleQuote': true,
          'printWidth': 120,
          'tabWidth': 2,
          'useTabs': false
        }
      ]
    }
  },
  {
    files: ['packages/services/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../../../services/*', '../../*/src/**', '../*/src/**'],
              message: 'Cross-service imports are not allowed. Use @aiponge/shared-* packages instead.'
            },
            {
              group: ['**/system-service/src/**', 
                      '**/user-service/src/**', 
                      '**/storage-service/src/**', 
                      '**/api-gateway/src/**', 
                      '**/ai-analysis-service/src/**', 
                      '**/ai-content-service/src/**', 
                      '**/ai-config-service/src/**',
                      '**/music-service/src/**'],
              message: 'Direct imports from other service internals are not allowed. Use @aiponge/shared-* packages for cross-service dependencies.'
            }
          ]
        }
      ],
    },
  },
  {
    files: ['packages/services/**/*.test.ts', 'packages/services/**/tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '*.config.js',
      '*.config.ts',
      '**/dist/',
      '**/build/',
      '**/drizzle.config.ts',
      '**/tests/',
      '**/scripts/',
      'client/dist/',
      'client/**/dist/',
      'client/**/build/',
      'server/dist/',
      '**/_archived/',
      '**/_archived/**',
      '**/ProductionStorageRepository.ts',
      '**/ProductionFileRepository.ts',
      'packages/services/**/__tests__/',
      'packages/services/**/__mocks__/',
      'packages/platform-core/src/__tests__/'
    ]
  }
];
