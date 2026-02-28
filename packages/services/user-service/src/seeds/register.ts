import { registerSeed } from '@aiponge/platform-core';
import { systemUsersSeed } from './modules/system-users.js';
import { creditProductsSeed } from './modules/credit-products.js';
import { guestConversionPolicySeed } from './modules/guest-conversion-policy.js';
import { welcomeBooksSeed } from './modules/welcome-books.js';

registerSeed(systemUsersSeed);
registerSeed(creditProductsSeed);
registerSeed(guestConversionPolicySeed);
registerSeed(welcomeBooksSeed);
