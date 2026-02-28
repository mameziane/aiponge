import { registerSeed } from '@aiponge/platform-core';
import { providerConfigsSeed } from './modules/provider-configs.js';
import { psychologicalFrameworksSeed } from './modules/psychological-frameworks.js';

registerSeed(providerConfigsSeed);
registerSeed(psychologicalFrameworksSeed);
