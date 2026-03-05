import { registerSeed } from '@aiponge/platform-core';
import { systemUsersSeed } from './modules/system-users.js';
import { welcomeBooksSeed } from './modules/welcome-books.js';

registerSeed(systemUsersSeed);
registerSeed(welcomeBooksSeed);
