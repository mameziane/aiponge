#!/usr/bin/env tsx
import './register.js';
import { runSeeds } from '@aiponge/platform-core';

const args = process.argv.slice(2);

let only: string | undefined;
let force = false;
let dryRun = false;
let verbose = true;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--only' && args[i + 1]) {
    only = args[++i];
  } else if (arg === '--force') {
    force = true;
  } else if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg === '--quiet') {
    verbose = false;
  } else if (arg === '--help') {
    console.log(`
Usage: db:seed [options]

Options:
  --only <name>   Run only the specified seed (and its dependencies)
  --force         Re-run seeds even if version hasn't changed
  --dry-run       Preview what would run without making changes
  --quiet         Suppress detailed output
  --help          Show this help message
`);
    process.exit(0);
  }
}

runSeeds({ only, force, dryRun, verbose }).catch(err => {
  console.error('Seed runner failed:', err);
  process.exit(1);
});
