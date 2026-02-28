import { registerSeed } from '@aiponge/platform-core';
import { bookTypesSeed } from './modules/book-types.js';
import { promptTemplatesSeed } from './modules/prompt-templates.js';
import { welcomeBooksSeed } from './modules/welcome-books.js';

registerSeed(bookTypesSeed);
registerSeed(promptTemplatesSeed);
registerSeed(welcomeBooksSeed);
