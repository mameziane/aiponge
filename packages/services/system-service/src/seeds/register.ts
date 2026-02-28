import { registerSeed } from '@aiponge/platform-core';
import { alertRulesSeed } from './modules/alert-rules.js';
import { healthChecksSeed } from './modules/health-checks.js';
import { serviceDependenciesSeed } from './modules/service-dependencies.js';
import { sysConfigSeed } from './modules/sys-config.js';

registerSeed(alertRulesSeed);
registerSeed(healthChecksSeed);
registerSeed(serviceDependenciesSeed);
registerSeed(sysConfigSeed);
