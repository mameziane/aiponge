const logger = {
  info: (...args) => console.log('[eslint-rules]', ...args),
  warn: (...args) => console.warn('[eslint-rules]', ...args),
  error: (...args) => console.error('[eslint-rules]', ...args),
};

/**
 * Custom ESLint Rules Index
 * Exports all custom ESLint rules for the Aiponge platform
 */

import apiArchitectureRules from './api-architecture.js';

export default {
  rules: {
    ...apiArchitectureRules.rules,
  },
};
